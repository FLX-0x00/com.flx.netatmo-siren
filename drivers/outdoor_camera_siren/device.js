'use strict';

const NetatmoBaseDevice = require('../../lib/NetatmoBaseDevice');

/**
 * Device implementation for the Netatmo Smart Outdoor Camera with
 * integrated siren (NOC). Reuses all logic from `NetatmoBaseDevice`.
 */
class OutdoorCameraSirenDevice extends NetatmoBaseDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();
    // NOC-specific initialisation can go here (e.g. camera live-feed URLs).
  }

}

module.exports = OutdoorCameraSirenDevice;
