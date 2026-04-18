'use strict';

const { OAuth2Driver } = require('homey-oauth2app');

/**
 * Shared pairing/discovery for camera-like Netatmo devices.
 * Subclasses declare one or more Netatmo module types they handle.
 */
class NetatmoBaseDriver extends OAuth2Driver {

  /** Override in subclass — array of Netatmo module types, e.g. ['NOC']. */
  get netatmoTypes() {
    throw new Error('netatmoTypes must be implemented');
  }

  async onOAuth2Init() {
    this.log(`${this.constructor.name} initialised (types=${this.netatmoTypes.join(',')}).`);
    this._triggers = {};
    for (const id of this.triggerIds || []) {
      this._triggers[id] = this.homey.flow.getDeviceTriggerCard(id);
    }
  }

  /** Override in subclass — list of trigger card IDs this driver owns. */
  get triggerIds() { return []; }

  /**
   * Fire a device trigger by id. `state` is only needed for triggers
   * whose run listener filters on argument (e.g. person_detected).
   */
  async _fire(id, device, tokens = {}, state = {}) {
    const card = this._triggers?.[id];
    if (!card) return;
    try {
      await card.trigger(device, tokens, state);
    } catch (err) {
      this.error(`trigger ${id} failed:`, err.message || err);
    }
  }

  async onPairListDevices({ oAuth2Client }) {
    let data;
    let legacy;
    try {
      [data, legacy] = await Promise.all([
        oAuth2Client.getHomesData(),
        oAuth2Client.getHomeData(),
      ]);
    } catch (err) {
      this.error('homesdata failed:', err);
      throw new Error('Could not reach Netatmo. Please try again.');
    }

    const homes = data?.body?.homes ?? [];
    const legacyHomes = legacy?.body?.homes ?? [];

    const devices = [];
    const accepted = new Set(this.netatmoTypes);

    const seenTypes = new Set();
    const seenIds = new Set(); // dedupe between modules[] and cameras[]

    const pushFrom = (home, list) => {
      for (const module of list || []) {
        if (!module?.id) continue;
        seenTypes.add(module.type);
        if (!accepted.has(module.type)) continue;
        if (seenIds.has(module.id)) continue;
        seenIds.add(module.id);
        devices.push({
          name: module.name || `${module.type} ${module.id}`,
          data: { id: module.id },
          store: {
            homeId: home.id,
            type: module.type,
            bridgeId: module.bridge || null,
          },
        });
      }
    };

    for (const home of homes) {
      pushFrom(home, home.modules);
      pushFrom(home, home.cameras);
    }
    for (const home of legacyHomes) {
      pushFrom(home, home.cameras);
      pushFrom(home, home.modules);
    }

    this.log(
      `Pairing scan: homesdata=${homes.length} legacy=${legacyHomes.length} `
      + `types seen=[${[...seenTypes].join(',') || 'none'}], `
      + `matched ${devices.length} of [${[...accepted].join(',')}]`,
    );

    return devices;
  }

}

module.exports = NetatmoBaseDriver;
