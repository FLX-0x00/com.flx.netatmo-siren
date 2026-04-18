'use strict';

const NetatmoBaseDevice = require('../../lib/NetatmoBaseDevice');

/**
 * Device implementation for the Netatmo Smart Indoor Siren (NIS).
 *
 * All shared logic (capability listener, API call, timeout handling)
 * lives in `NetatmoBaseDevice`. Override hooks here if NIS-specific
 * behaviour is ever required (e.g. battery level, firmware checks).
 */
class StandaloneSirenDevice extends NetatmoBaseDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();
    // NIS-specific initialisation can go here.
  }

}

module.exports = StandaloneSirenDevice;
