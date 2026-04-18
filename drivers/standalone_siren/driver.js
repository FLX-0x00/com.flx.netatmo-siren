'use strict';

const NetatmoBaseDriver = require('../../lib/NetatmoBaseDriver');

/**
 * Driver for the Netatmo Smart Indoor Siren (type: `NIS`).
 *
 * Uses the shared OAuth2-based pairing flow: the user logs in once,
 * `homey-oauth2app` stores/refreshes the tokens, and `onPairListDevices`
 * filters `homesdata` modules by the `NIS` type.
 */
class StandaloneSirenDriver extends NetatmoBaseDriver {

  get netatmoType() {
    return 'NIS';
  }

}

module.exports = StandaloneSirenDriver;
