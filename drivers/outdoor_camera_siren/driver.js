'use strict';

const NetatmoBaseDriver = require('../../lib/NetatmoBaseDriver');

/**
 * Driver for the Netatmo Smart Outdoor Camera with integrated siren (type: `NOC`).
 */
class OutdoorCameraSirenDriver extends NetatmoBaseDriver {

  get netatmoType() {
    return 'NOC';
  }

}

module.exports = OutdoorCameraSirenDriver;
