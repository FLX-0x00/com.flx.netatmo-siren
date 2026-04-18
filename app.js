'use strict';

const { OAuth2App } = require('homey-oauth2app');
const NetatmoOAuth2Client = require('./lib/NetatmoOAuth2Client');

const SETTING_CLIENT_ID = 'netatmo_client_id';
const SETTING_CLIENT_SECRET = 'netatmo_client_secret';

/**
 * Netatmo Siren — Homey Pro App (SDK v3).
 *
 * Extends `OAuth2App` so token storage, refresh and client lifecycle
 * are delegated to the official `homey-oauth2app` helpers.
 *
 * Credentials (Client ID / Secret) are managed by the end-user in the
 * app's Settings page and persisted via `ManagerSettings`. Changes in
 * settings trigger a live re-configuration of the OAuth2 client.
 */
class NetatmoSirenApp extends OAuth2App {

  static OAUTH2_CLIENT = NetatmoOAuth2Client;
  static OAUTH2_DEBUG = true;          // turn off for production builds
  static OAUTH2_MULTI_SESSION = false; // one Netatmo account per Homey

  async onOAuth2Init() {
    // React to credential changes made in the settings UI.
    this.homey.settings.on('set', (key) => {
      if (key === SETTING_CLIENT_ID || key === SETTING_CLIENT_SECRET) {
        this.reconfigureOAuth2().catch((err) => this.error('Reconfigure failed:', err));
      }
    });

    await this._applyOAuth2Config();
    this.log('Netatmo Siren app initialised.');
  }

  /**
   * Public entry point used by `api.js` after the user saves settings.
   * Clears any existing session so the new credentials take effect.
   */
  async reconfigureOAuth2() {
    try {
      // Remove stored sessions tied to the previous client credentials.
      const sessions = this.getSavedOAuth2Sessions?.() ?? {};
      for (const sessionId of Object.keys(sessions)) {
        try {
          this.deleteOAuth2Client({ sessionId, configId: 'default' });
        } catch (err) {
          this.log(`Could not delete OAuth2 session ${sessionId}:`, err.message);
        }
      }
    } catch (err) {
      this.log('No previous sessions to clear:', err.message);
    }

    await this._applyOAuth2Config();
    this.log('OAuth2 client reconfigured from settings.');
  }

  /**
   * Reads credentials from settings and pushes them into `homey-oauth2app`.
   * If credentials are missing, the app stays initialised but pairing will
   * fail with a clear error until the user fills them in.
   */
  async _applyOAuth2Config() {
    const clientId = this.homey.settings.get(SETTING_CLIENT_ID);
    const clientSecret = this.homey.settings.get(SETTING_CLIENT_SECRET);

    if (!clientId || !clientSecret) {
      this.log('Netatmo credentials not configured yet — open the app settings to add them.');
      return;
    }

    this.setOAuth2Config({
      client: NetatmoOAuth2Client,
      apiUrl: NetatmoOAuth2Client.API_URL,
      tokenUrl: NetatmoOAuth2Client.TOKEN_URL,
      authorizationUrl: NetatmoOAuth2Client.AUTHORIZATION_URL,
      scopes: NetatmoOAuth2Client.SCOPES,
      clientId,
      clientSecret,
    });
  }

}

module.exports = NetatmoSirenApp;
