'use strict';

const { OAuth2Driver } = require('homey-oauth2app');

/**
 * Shared base driver for all Netatmo siren-capable devices.
 * Concrete drivers only need to declare the Netatmo module `type`
 * they are interested in (e.g. `NIS` or `NOC`).
 */
class NetatmoBaseDriver extends OAuth2Driver {

  /**
   * Override in subclasses. Must return one of `NIS`, `NOC`, ...
   */
  get netatmoType() {
    throw new Error('netatmoType getter must be implemented by subclass.');
  }

  async onOAuth2Init() {
    this.log(`${this.constructor.name} initialised (type=${this.netatmoType}).`);
  }

  /**
   * Called by the `list_devices` pairing view.
   * Queries `/api/homesdata` and returns matching modules.
   */
  async onPairListDevices({ oAuth2Client }) {
    let response;
    try {
      response = await oAuth2Client.getHomesData();
    } catch (err) {
      this.error('Failed to fetch homesdata during pairing:', err);
      throw new Error('Could not reach Netatmo servers. Please try again.');
    }

    const homes = response?.body?.homes ?? [];
    const devices = [];

    for (const home of homes) {
      const modules = home.modules ?? [];
      for (const module of modules) {
        if (module.type !== this.netatmoType) continue;

        devices.push({
          name: module.name || `${this.netatmoType} ${module.id}`,
          data: {
            id: module.id,
          },
          store: {
            homeId: home.id,
            type: module.type,
          },
        });
      }
    }

    return devices;
  }

}

module.exports = NetatmoBaseDriver;
