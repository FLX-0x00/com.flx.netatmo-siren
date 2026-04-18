'use strict';

const { OAuth2App } = require('homey-oauth2app');
const NetatmoOAuth2Client = require('./lib/NetatmoOAuth2Client');
const NetatmoHomePoller = require('./lib/NetatmoHomePoller');
const {
  NETATMO_API_URL,
  NETATMO_TOKEN_URL,
  NETATMO_AUTHORIZATION_URL,
} = NetatmoOAuth2Client;

const SETTING_CLIENT_ID = 'netatmo_client_id';
const SETTING_CLIENT_SECRET = 'netatmo_client_secret';
const SETTING_POLL_INTERVAL = 'netatmo_poll_interval_sec';
const DEFAULT_POLL_INTERVAL_SEC = 20;

/**
 * Netatmo Community — Homey Pro App (SDK v3).
 *
 * Focus: make every documented Netatmo Security event actionable in
 * Homey Flow, for users who do NOT have Netatmo's `access_*` scope
 * whitelist. That excludes siren control and live video, but includes:
 *
 *   - Indoor Camera (NACamera): monitoring on/off, motion & person events
 *   - Outdoor Camera (NOC): monitoring, floodlight on/off/auto, humans/
 *     vehicles/animals, siren-sounding webhook events (read-only)
 *   - Doorbell (NDB): rang / accepted / missed
 *
 * Realtime model: we poll `/homestatus` + `/getevents` every N seconds
 * (default 20s) and dispatch diffs to devices. No webhook registration
 * is required.
 */
class NetatmoCommunityApp extends OAuth2App {

  static OAUTH2_CLIENT = NetatmoOAuth2Client;
  static OAUTH2_DEBUG = false;
  static OAUTH2_MULTI_SESSION = false;

  async onOAuth2Init() {
    this._pollers = new Map(); // homeId -> NetatmoHomePoller

    // React to credential changes made in settings.
    this.homey.settings.on('set', (key) => {
      if (key === SETTING_CLIENT_ID || key === SETTING_CLIENT_SECRET) {
        this.log(`Setting "${key}" changed — restarting app.`);
        this.homey.setTimeout(() => process.exit(0), 250);
      }
    });

    const clientId = this.homey.settings.get(SETTING_CLIENT_ID);
    const clientSecret = this.homey.settings.get(SETTING_CLIENT_SECRET);

    if (!clientId || !clientSecret) {
      this.log('Credentials not configured — open the app settings.');
      return;
    }

    this.setOAuth2Config({
      client: NetatmoOAuth2Client,
      apiUrl: NETATMO_API_URL,
      tokenUrl: NETATMO_TOKEN_URL,
      authorizationUrl: NETATMO_AUTHORIZATION_URL,
      scopes: NetatmoOAuth2Client.SCOPES,
      clientId,
      clientSecret,
    });

    this._registerFlowListeners();
    this.log('Netatmo Community ready.');
  }

  async onOAuth2Uninit() {
    for (const p of this._pollers.values()) p.stop();
    this._pollers.clear();
  }

  /**
   * Devices call this during init to attach to the poller for their home.
   * One poller is created per home, shared across all devices of that home.
   *
   * @param {string} homeId
   * @param {import('./lib/NetatmoOAuth2Client')} oAuth2Client
   * @returns {NetatmoHomePoller}
   */
  async getPollerForHome(homeId, oAuth2Client) {
    if (this._pollers.has(homeId)) return this._pollers.get(homeId);
    const intervalSec = Number(this.homey.settings.get(SETTING_POLL_INTERVAL))
      || DEFAULT_POLL_INTERVAL_SEC;
    const poller = new NetatmoHomePoller({
      app: this,
      oAuth2Client,
      homeId,
      intervalMs: Math.max(10, intervalSec) * 1000,
    });
    this._pollers.set(homeId, poller);
    poller.start();
    return poller;
  }

  /**
   * Registers app-wide flow-card run listeners that apply to multiple
   * drivers (person autocomplete triggers/conditions/actions).
   */
  _registerFlowListeners() {
    // Person autocomplete: pull from homesdata each time the UI opens.
    const personAutocomplete = async (query, args) => {
      const device = args.device;
      if (!device) return [];
      try {
        const data = await device.oAuth2Client.getHomesData();
        const home = (data?.body?.homes ?? []).find((h) => h.id === device.homeId);
        const persons = (home?.persons ?? [])
          .filter((p) => p.pseudo)
          .map((p) => ({ id: p.id, name: p.pseudo }));
        if (!query) return persons;
        const q = query.toLowerCase();
        return persons.filter((p) => p.name.toLowerCase().includes(q));
      } catch (err) {
        this.error('person autocomplete failed:', err.message);
        return [];
      }
    };

    // Triggers
    const personDetected = this.homey.flow.getDeviceTriggerCard('person_detected');
    personDetected.registerArgumentAutocompleteListener('person', personAutocomplete);
    personDetected.registerRunListener(async (args, state) => args.person.id === state.personId);

    const personCame = this.homey.flow.getDeviceTriggerCard('person_came_home');
    personCame.registerArgumentAutocompleteListener('person', personAutocomplete);
    personCame.registerRunListener(async (args, state) => args.person.id === state.personId);

    const personLeft = this.homey.flow.getDeviceTriggerCard('person_left');
    personLeft.registerArgumentAutocompleteListener('person', personAutocomplete);
    personLeft.registerRunListener(async (args, state) => args.person.id === state.personId);

    // Condition
    const isPersonHome = this.homey.flow.getConditionCard('is_person_home');
    isPersonHome.registerArgumentAutocompleteListener('person', personAutocomplete);
    isPersonHome.registerRunListener(async (args) => {
      const device = args.device;
      try {
        const data = await device.oAuth2Client.getHomesData();
        const home = (data?.body?.homes ?? []).find((h) => h.id === device.homeId);
        const person = (home?.persons ?? []).find((p) => p.id === args.person.id);
        // Netatmo returns `out_of_sight: true` when away.
        return person ? !person.out_of_sight : false;
      } catch (err) {
        this.error('is_person_home failed:', err.message);
        return false;
      }
    });

    // Actions: persons home/away + home empty
    const setHome = this.homey.flow.getActionCard('set_person_home');
    setHome.registerArgumentAutocompleteListener('person', personAutocomplete);
    setHome.registerRunListener(async (args) => {
      await args.device.oAuth2Client.setPersonsHome({
        homeId: args.device.homeId,
        personIds: [args.person.id],
      });
    });

    const setAway = this.homey.flow.getActionCard('set_person_away');
    setAway.registerArgumentAutocompleteListener('person', personAutocomplete);
    setAway.registerRunListener(async (args) => {
      await args.device.oAuth2Client.setPersonAway({
        homeId: args.device.homeId,
        personId: args.person.id,
      });
    });

    const setEmpty = this.homey.flow.getActionCard('set_home_empty');
    setEmpty.registerRunListener(async (args) => {
      await args.device.oAuth2Client.setPersonAway({ homeId: args.device.homeId });
    });

    // ─── Monitoring / Floodlight / Siren ──────────────────────────
    this.homey.flow.getConditionCard('is_monitoring_on')
      .registerRunListener(async (args) => args.device.getCapabilityValue('onoff') === true);

    this.homey.flow.getConditionCard('is_floodlight')
      .registerRunListener(async (args) => args.device.getCapabilityValue('light_mode') === args.mode);

    this.homey.flow.getConditionCard('is_siren_sounding')
      .registerRunListener(async (args) => args.device.getStoreValue('siren_status') === 'sound');

    this.homey.flow.getActionCard('turn_monitoring_on')
      .registerRunListener(async (args) => args.device.triggerCapabilityListener('onoff', true));

    this.homey.flow.getActionCard('turn_monitoring_off')
      .registerRunListener(async (args) => args.device.triggerCapabilityListener('onoff', false));

    this.homey.flow.getActionCard('set_floodlight_mode')
      .registerRunListener(async (args) => args.device.triggerCapabilityListener('light_mode', args.mode));

    // ─── Extended /setstate actions ──────────────────────────────
    // All three are documented under
    // https://dev.netatmo.com/apidocumentation/security#setstate
    const toBool = (s) => s === 'on';

    this.homey.flow.getActionCard('set_led_status')
      .registerRunListener(async (args) => {
        await args.device.oAuth2Client.setModuleState({
          homeId: args.device.homeId,
          moduleId: args.device.getData().id,
          patch: { led_on_live: toBool(args.state) },
        });
      });

    this.homey.flow.getActionCard('set_notify_unknowns')
      .registerRunListener(async (args) => {
        await args.device.oAuth2Client.setModuleState({
          homeId: args.device.homeId,
          moduleId: args.device.getData().id,
          patch: { notify_unknowns: toBool(args.state) },
        });
      });

    this.homey.flow.getActionCard('set_record_when_unknown')
      .registerRunListener(async (args) => {
        await args.device.oAuth2Client.setModuleState({
          homeId: args.device.homeId,
          moduleId: args.device.getData().id,
          patch: { record_when_unknown: toBool(args.state) },
        });
      });
  }

}

module.exports = NetatmoCommunityApp;
