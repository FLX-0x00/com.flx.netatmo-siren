'use strict';

const NetatmoBaseDevice = require('../../lib/NetatmoBaseDevice');

/**
 * Netatmo Smart Outdoor Camera with Siren (Presence, NOC).
 *
 * Actions: monitoring on/off, floodlight on/off/auto.
 * Read-only status: siren sounding (from webhook-style events).
 */
class OutdoorCameraDevice extends NetatmoBaseDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();

    this.registerCapabilityListener('onoff', async (value) => {
      await this._withTimeout(
        this.oAuth2Client.setMonitoring({
          homeId: this.homeId,
          cameraId: this.getData().id,
          on: value,
        }),
        this.constructor.REQUEST_TIMEOUT_MS,
        'setMonitoring',
      );
    });

    this.registerCapabilityListener('light_mode', async (value) => {
      await this._withTimeout(
        this.oAuth2Client.setFloodlightMode({
          homeId: this.homeId,
          cameraId: this.getData().id,
          mode: value,
        }),
        this.constructor.REQUEST_TIMEOUT_MS,
        'setFloodlightMode',
      );
    });
  }

  async onHomeStatusUpdate(m) {
    if (typeof m.monitoring === 'string') {
      await this.safeSetCapability('onoff', m.monitoring === 'on');
    }
    if (typeof m.floodlight === 'string') {
      const prev = this.getCapabilityValue('light_mode');
      await this.safeSetCapability('light_mode', m.floodlight);
      if (prev !== m.floodlight && prev != null) {
        await this.driver.triggerFloodlightChanged(this, { mode: m.floodlight });
      }
    }
    if (typeof m.siren_status === 'string') {
      // Read-only echo so the condition card has something to query.
      await this.setStoreValue('siren_status', m.siren_status).catch(() => {});
    }
    if (m.reachable === false) {
      await this.setUnavailable('Camera offline').catch(() => {});
    } else {
      await this.setAvailable().catch(() => {});
    }
  }

  async onNetatmoEvent(ev) {
    const driver = this.driver;
    const tokens = { message: ev.message || '', event_type: ev.type || '' };

    switch (ev.type) {
      case 'human':
        this.pulseAlarm('alarm_motion');
        await driver.triggerHuman(this, tokens);
        break;
      case 'vehicle':
        this.pulseAlarm('alarm_motion');
        await driver.triggerVehicle(this, tokens);
        break;
      case 'animal':
        this.pulseAlarm('alarm_motion');
        await driver.triggerAnimal(this, tokens);
        break;
      case 'outdoor':
      case 'movement':
        this.pulseAlarm('alarm_motion');
        await driver.triggerMotion(this, tokens);
        break;
      case 'siren_sounding': {
        // sub_type: 1 start, 0 stop (per Netatmo docs).
        const starting = ev.sub_type === 1;
        if (starting) await driver.triggerSirenStart(this, tokens);
        else await driver.triggerSirenStop(this, tokens);
        await this.setStoreValue('siren_status', starting ? 'sound' : 'no_sound').catch(() => {});
        break;
      }
      case 'connection':
        await driver.triggerCameraConnected(this, tokens);
        break;
      case 'disconnection':
        await driver.triggerCameraDisconnected(this, tokens);
        break;
      case 'on':
        await this.safeSetCapability('onoff', true);
        await driver.triggerMonitoringOn(this, tokens);
        break;
      case 'off':
        await this.safeSetCapability('onoff', false);
        await driver.triggerMonitoringOff(this, tokens);
        break;
      case 'daily_summary':
        await driver.triggerDailySummary(this, tokens);
        break;
      default:
        break;
    }
  }

}

module.exports = OutdoorCameraDevice;
