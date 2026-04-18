'use strict';

const NetatmoBaseDevice = require('../../lib/NetatmoBaseDevice');

/**
 * Netatmo Smart Indoor Camera (Welcome, NACamera).
 *
 * Actions: monitoring on/off.
 * Triggers (via events): motion, person (known/unknown), person away,
 * camera connected/disconnected, monitoring on/off, boot.
 */
class IndoorCameraDevice extends NetatmoBaseDevice {

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
  }

  async onHomeStatusUpdate(m) {
    if (typeof m.monitoring === 'string') {
      await this.safeSetCapability('onoff', m.monitoring === 'on');
    }
    if (m.reachable === false) {
      await this.setUnavailable(this.homey.__('device.offline') || 'Camera offline').catch(() => {});
    } else {
      await this.setAvailable().catch(() => {});
    }
  }

  async onNetatmoEvent(ev) {
    const driver = this.driver;
    const tokens = { message: ev.message || '', event_type: ev.type || '' };

    switch (ev.type) {
      case 'movement':
        this.pulseAlarm('alarm_motion');
        await driver.triggerMotion(this, tokens);
        break;

      case 'person': {
        this.pulseAlarm('alarm_motion');
        const persons = ev.persons || [];
        for (const p of persons) {
          if (p.is_known) {
            await driver.triggerPersonDetected(this, {
              person_name: p.pseudo || '',
              ...tokens,
            }, { personId: p.id });
          } else {
            await driver.triggerUnknownPerson(this, tokens);
          }
        }
        if (!persons.length) await driver.triggerUnknownPerson(this, tokens);
        break;
      }

      case 'person_away': {
        const personId = (ev.persons && ev.persons[0] && ev.persons[0].id) || ev.person_id;
        const personName = (ev.persons && ev.persons[0] && ev.persons[0].pseudo) || '';
        await driver.triggerPersonLeft(this,
          { person_name: personName, ...tokens },
          { personId });
        break;
      }

      case 'person_home': // not always emitted, but handle defensively
      case 'new_module': {
        // ignore
        break;
      }

      case 'connection':
        await driver.triggerCameraConnected(this, tokens);
        await this.setAvailable().catch(() => {});
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

      default:
        break;
    }
  }

}

module.exports = IndoorCameraDevice;
