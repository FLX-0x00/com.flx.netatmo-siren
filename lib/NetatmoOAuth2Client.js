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

  /**
   * Note: `homey-oauth2app` already unwraps the HTTP response for us.
   * `this.get()` returns Netatmo's raw JSON envelope `{ body, status }`,
   * so callers should access `.body.homes`, `.body.home`, etc.
   */

  /** GET /api/homesdata — topology: homes, modules, persons. */
  async getHomesData() {
    return this.get({ path: '/api/homesdata' });
  }

  /** GET /api/homestatus — live state of all devices in a home. */
  async getHomeStatus({ homeId }) {
    return this.get({
      path: '/api/homestatus',
      query: { home_id: homeId },
    });
  }

  /** GET /api/getevents — last `size` events for a home. */
  async getEvents({ homeId, size = 30 }) {
    return this.get({
      path: '/api/getevents',
      query: { home_id: homeId, size },
    });
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
