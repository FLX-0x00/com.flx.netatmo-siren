'use strict';

const NetatmoBaseDevice = require('../../lib/NetatmoBaseDevice');

/**
 * Netatmo Smart Video Doorbell (NDB).
 *
 * The doorbell is effectively read-only via the public Connect API
 * (no live stream without the `access_*` whitelist, no on/off). We
 * surface the incoming-call + motion events so they can drive flows.
 */
class DoorbellDevice extends NetatmoBaseDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();
  }

  async onHomeStatusUpdate(m) {
    if (m.reachable === false) {
      await this.setUnavailable('Doorbell offline').catch(() => {});
    } else {
      await this.setAvailable().catch(() => {});
    }
  }

  async onNetatmoEvent(ev) {
    const driver = this.driver;
    const tokens = { message: ev.message || '', event_type: ev.type || '' };

    switch (ev.type) {
      case 'incoming_call':
        this.pulseAlarm('alarm_generic', 10000);
        await driver.triggerRang(this, tokens);
        break;
      case 'accepted_call':
        await driver.triggerAccepted(this, tokens);
        break;
      case 'missed_call':
        await driver.triggerMissed(this, tokens);
        break;
      case 'movement':
      case 'human':
        await driver.triggerMotion(this, tokens);
        break;
      default:
        break;
    }
  }

}

module.exports = DoorbellDevice;
