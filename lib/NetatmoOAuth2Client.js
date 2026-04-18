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

  // Default endpoints (can be overridden per-instance via the OAuth2App registration).
  static API_URL = 'https://api.netatmo.com';
  static TOKEN_URL = 'https://api.netatmo.com/oauth2/token';
  static AUTHORIZATION_URL = 'https://api.netatmo.com/oauth2/authorize';
  static SCOPES = [
    'read_camera',
    'access_camera',
    'read_presence',
    'access_presence',
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
   * @param {string} homeId  The Netatmo home id the module belongs to.
   * @param {string} moduleId The module (siren/camera) id.
   * @param {'sound'|'no_sound'} sirenStatus The siren state to apply.
   * @returns {Promise<object>}
   */
  async setSirenState({ homeId, moduleId, sirenStatus }) {
    return this.post({
      path: '/api/setstate',
      json: {
        home: {
          id: homeId,
          modules: [
            {
              id: moduleId,
              siren_status: sirenStatus,
            },
          ],
        },
      },
    });
  }

}

module.exports = NetatmoOAuth2Client;
