'use strict';

const { OAuth2Client } = require('homey-oauth2app');

/**
 * Netatmo Connect API client.
 *
 * Covers the subset of the Security / Home API that can be used by
 * unprivileged third-party OAuth2 apps (no `access_*` scope whitelist
 * required). All state changes go through `POST /api/setstate`, which
 * ONLY supports the fields documented in the "Possible actions" table
 * at https://dev.netatmo.com/apidocumentation/security.
 */
class NetatmoOAuth2Client extends OAuth2Client {

  // NOTE: API_URL / TOKEN_URL are deliberately NOT defined as static
  // class fields. `OAuth2App.onInit` would otherwise auto-invoke
  // `setOAuth2Config()` before credentials are loaded from settings
  // and throw "Invalid Client ID". Endpoint URLs are exported as
  // module constants instead (see bottom of file).

  /**
   * Scopes actually needed for the features we expose:
   * - read_camera  / write_camera  — NACamera, NDB (doorbell is
   *   treated as a camera product and is readable with read_camera).
   * - read_presence / write_presence — NOC (outdoor camera, floodlight).
   *
   * `access_*` scopes are NOT requested because Netatmo only grants
   * them to whitelisted partners and they are not needed for anything
   * this app does.
   */
  static SCOPES = [
    'read_camera',
    'write_camera',
    'read_presence',
    'write_presence',
  ];

  // ─── Reads ─────────────────────────────────────────────────────────

  /** GET /api/homesdata — topology: homes, modules, persons. */
  async getHomesData() {
    const res = await this.get({ path: '/api/homesdata' });
    return res?.body ?? res;
  }

  /** GET /api/homestatus — live state of all devices in a home. */
  async getHomeStatus({ homeId }) {
    const res = await this.get({
      path: '/api/homestatus',
      query: { home_id: homeId },
    });
    return res?.body ?? res;
  }

  /** GET /api/getevents — last `size` events for a home. */
  async getEvents({ homeId, size = 30 }) {
    const res = await this.get({
      path: '/api/getevents',
      query: { home_id: homeId, size },
    });
    return res?.body ?? res;
  }

  // ─── Writes ────────────────────────────────────────────────────────

  /** Turn camera monitoring on/off (NACamera, NOC). */
  async setMonitoring({ homeId, cameraId, on }) {
    return this.post({
      path: '/api/setstate',
      json: {
        home: {
          id: homeId,
          modules: [{ id: cameraId, monitoring: on ? 'on' : 'off' }],
        },
      },
    });
  }

  /** Set the NOC floodlight mode. */
  async setFloodlightMode({ homeId, cameraId, mode }) {
    return this.post({
      path: '/api/setstate',
      json: {
        home: {
          id: homeId,
          modules: [{ id: cameraId, floodlight: mode }],
        },
      },
    });
  }

  /** Mark one or more persons as "home". */
  async setPersonsHome({ homeId, personIds }) {
    return this.post({
      path: '/api/setpersonshome',
      json: { home_id: homeId, person_ids: personIds },
    });
  }

  /** Mark a single person (or the whole home) as "away". */
  async setPersonAway({ homeId, personId }) {
    const json = { home_id: homeId };
    if (personId) json.person_id = personId;
    return this.post({ path: '/api/setpersonsaway', json });
  }

  // ─── Error surfacing ───────────────────────────────────────────────

  /** Surface Netatmo's error payload instead of a bare HTTP status. */
  async onHandleNotOK({ body, status, statusText }) {
    let detail = '';
    if (body && typeof body === 'object') {
      if (body.error && typeof body.error === 'object') {
        detail = body.error.message || body.error.reason || '';
        if (body.error.code) detail += ` (code ${body.error.code})`;
      } else if (typeof body.error === 'string') {
        detail = body.error;
      } else if (body.message) {
        detail = body.message;
      }
    } else if (typeof body === 'string' && body.length) {
      detail = body;
    }

    const message = detail
      ? `${status} ${statusText || 'Error'} — ${detail}`
      : `${status} ${statusText || 'Error'}`;

    const err = new Error(message);
    err.status = status;
    err.statusText = statusText;
    err.body = body;
    return err;
  }

}

module.exports = NetatmoOAuth2Client;
module.exports.NETATMO_API_URL = 'https://api.netatmo.com';
module.exports.NETATMO_TOKEN_URL = 'https://api.netatmo.com/oauth2/token';
module.exports.NETATMO_AUTHORIZATION_URL = 'https://api.netatmo.com/oauth2/authorize';
'use strict';

const { OAuth2Client } = require('homey-oauth2app');

/**
 * Custom OAuth2 client for the Netatmo Connect API.
 *
 * Netatmo uses a standard OAuth2 Authorization-Code flow.
 * Tokens expire after ~3 hours; `homey-oauth2app` handles refresh automatically
 * as long as `this.getTokenByCode` / `this.onRequestToken` are implemented per spec.
 *
 * Docs: https://dev.netatmo.com/apidocumentation/oauth
 */
class NetatmoOAuth2Client extends OAuth2Client {

  // NOTE: API_URL / TOKEN_URL are intentionally NOT defined as static
  // class fields here. `OAuth2App.onInit` would otherwise auto-invoke
  // `setOAuth2Config()` before our credentials (loaded from settings)
  // are available, crashing the app with "Invalid Client ID".
  // The URLs are exported separately and passed explicitly by app.js.
  // Netatmo Connect OAuth2 scopes.
  // Required for siren control via `/api/setstate`:
  //   read_camera  + access_camera  + write_camera   (NIS / indoor siren)
  //   read_presence + access_presence + write_presence (NOC / outdoor camera)
  // `write_*` is mandatory for any state-changing POST — without it the
  // Netatmo API responds with HTTP 403 Forbidden.
  static SCOPES = [
    'read_camera',
    'access_camera',
    'write_camera',
    'read_presence',
    'access_presence',
    'write_presence',
  ];

  /**
   * Fetch all homes + modules the user has access to.
   * @returns {Promise<object>} Netatmo `homesdata` payload.
   */
  async getHomesData() {
    return this.get({
      path: '/api/homesdata',
    });
  }

  /**
   * Set the state of a Netatmo module (used to toggle the siren).
   *
   * Netatmo `/api/setstate` expects child-modules (like the NIS indoor
   * siren) to reference their parent camera via the `bridge` field.
   * Standalone modules (like the NOC outdoor camera) must NOT carry
   * a `bridge` field — the API returns 400 if one is sent redundantly.
   *
   * @param {object} args
   * @param {string} args.homeId    The Netatmo home id the module belongs to.
   * @param {string} args.moduleId  The module (siren/camera) id.
   * @param {string} [args.bridgeId] Optional parent-bridge id for sub-modules.
   * @param {'sound'|'no_sound'} args.sirenStatus  Desired siren state.
   * @returns {Promise<object>}
   */
  async setSirenState({ homeId, moduleId, bridgeId, sirenStatus }) {
    const mod = {
      id: moduleId,
      siren_status: sirenStatus,
    };
    if (bridgeId && bridgeId !== moduleId) {
      mod.bridge = bridgeId;
    }

    return this.post({
      path: '/api/setstate',
      json: {
        home: {
          id: homeId,
          modules: [mod],
        },
      },
    });
  }

  /**
   * Override: surface the Netatmo error payload so failures are actionable.
   * The default implementation discards the body; Netatmo returns useful
   * diagnostics such as `{ error: { code, message } }`.
   */
  async onHandleNotOK({ body, status, statusText }) {
    let detail = '';
    if (body && typeof body === 'object') {
      if (body.error && typeof body.error === 'object') {
        detail = body.error.message || body.error.reason || '';
        if (body.error.code) detail += ` (code ${body.error.code})`;
      } else if (typeof body.error === 'string') {
        detail = body.error;
      } else if (body.message) {
        detail = body.message;
      } else {
        detail = JSON.stringify(body);
      }
    } else if (typeof body === 'string' && body.length) {
      detail = body;
    }

    const message = detail
      ? `${status} ${statusText || 'Error'} — ${detail}`
      : `${status} ${statusText || 'Error'}`;

    const err = new Error(message);
    err.status = status;
    err.statusText = statusText;
    err.body = body;
    return err;
  }

}

module.exports = NetatmoOAuth2Client;
module.exports.NETATMO_API_URL = 'https://api.netatmo.com';
module.exports.NETATMO_TOKEN_URL = 'https://api.netatmo.com/oauth2/token';
module.exports.NETATMO_AUTHORIZATION_URL = 'https://api.netatmo.com/oauth2/authorize';
