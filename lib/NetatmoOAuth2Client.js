'use strict';

const { OAuth2Client } = require('homey-oauth2app');

/**
 * Netatmo Connect API client.
 *
 * All state changes go through `POST /api/setstate`. Supported fields
 * per https://dev.netatmo.com/apidocumentation/security#setstate:
 *   monitoring, floodlight, led_on_live, notify_unknowns,
 *   record_when_unknown, smart_notifs, siren_status (NOC only,
 *   requires write_presence).
 */
class NetatmoOAuth2Client extends OAuth2Client {

  // NOTE: API_URL / TOKEN_URL are deliberately NOT defined as static
  // class fields. `OAuth2App.onInit` would otherwise auto-invoke
  // `setOAuth2Config()` before credentials are loaded from settings
  // and throw "Invalid Client ID". Endpoint URLs are exported as
  // module constants instead (see bottom of file).

  /**
   * Every Security-related scope actually offered by the Netatmo
   * developer console (Security category). Grouped by product:
   *
   *   Smart Indoor Camera     → read_camera / write_camera / access_camera
   *   Smart Video Doorbell    → read_doorbell / access_doorbell
   *   Smart Outdoor Camera    → read_presence / write_presence / access_presence
   *
   * Note: `write_doorbell` does not exist in Netatmo's scope list.
   * `access_*` scopes are requested so the user can consent to full
   * device visibility (some accounts only surface a doorbell in
   * `/homesdata` once `access_doorbell` is consented to).
   */
  static SCOPES = [
    'read_camera',
    'write_camera',
    'access_camera',
    'read_doorbell',
    'access_doorbell',
    'read_presence',
    'write_presence',
    'access_presence',
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

  /**
   * GET /api/gethomedata — legacy topology endpoint. Still populated
   * for some Welcome/Presence/Doorbell accounts where `/homesdata`
   * omits certain devices. We merge this into `homesdata` results.
   */
  async getHomeData() {
    try {
      return await this.get({ path: '/api/gethomedata' });
    } catch (err) {
      return null;
    }
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

  /**
   * Generic module-level setstate for fields documented on
   * https://dev.netatmo.com/apidocumentation/security#setstate
   * (monitoring, floodlight, led_on_live, notify_unknowns,
   *  record_when_unknown, smart_notifs, …).
   */
  async setModuleState({ homeId, moduleId, patch }) {
    return this.post({
      path: '/api/setstate',
      json: {
        home: {
          id: homeId,
          modules: [{ id: moduleId, ...patch }],
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

  // ─── Token refresh trigger ─────────────────────────────────────────

  /**
   * `homey-oauth2app` only auto-refreshes on HTTP 401, but Netatmo
   * signals an expired / invalid access token with HTTP **403** plus
   * an error code in the JSON body:
   *
   *   code 2  → "Invalid access token"
   *   code 3  → "Access token expired"
   *
   * (See https://dev.netatmo.com/apidocumentation/general#error-codes)
   *
   * Without this override the library never triggers a refresh, the
   * access token stays dead after its ~3h lifetime, and every
   * subsequent call fails with "403 Forbidden — Access token expired
   * (code 3)" until the app is restarted. The response body is only
   * readable once, so we peek via `response.clone()` to avoid
   * breaking the downstream `onHandleResponse` JSON parse.
   */
  async onShouldRefreshToken(response) {
    if (!response) return false;
    if (response.status === 401) return true;
    if (response.status !== 403) return false;

    const contentType = response.headers?.get?.('Content-Type') || '';
    if (!contentType.startsWith('application/json')) return false;

    try {
      const peek = await response.clone().json();
      const code = peek?.error?.code;
      // 2 = invalid access token, 3 = access token expired
      return code === 2 || code === 3;
    } catch (_) {
      return false;
    }
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
