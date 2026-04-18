'use strict';

const { OAuth2Device } = require('homey-oauth2app');

/**
 * Shared base for camera-like Netatmo devices.
 *
 * Subscribes itself to the app-level poller (`app.getPollerForHome`)
 * and routes `status` / `event` updates into device-specific handlers.
 *
 * Subclasses override:
 *  - `onHomeStatusUpdate(module)` — called each poll cycle with the
 *    module's current `/homestatus` row.
 *  - `onNetatmoEvent(event)` — called for every *new* home-level event
 *    whose `device_id`/`camera_id`/`module_id` matches this device.
 */
class NetatmoBaseDevice extends OAuth2Device {

  static REQUEST_TIMEOUT_MS = 15 * 1000;

  async onOAuth2Init() {
    this.log(`${this.getName()} initialised.`);
    this._boundStatus = (_moduleId, mod) => {
      if (_moduleId !== this.getData().id) return;
      this.onHomeStatusUpdate(mod).catch((err) =>
        this.error('onHomeStatusUpdate failed:', err));
    };
    this._boundEvent = (ev) => {
      const id = this.getData().id;
      if (ev.device_id === id || ev.camera_id === id || ev.module_id === id) {
        this.onNetatmoEvent(ev).catch((err) =>
          this.error('onNetatmoEvent failed:', err));
      }
    };

    await this._subscribeToPoller();
  }

  async onOAuth2Uninit() {
    this._unsubscribeFromPoller();
  }

  async onOAuth2Deleted() {
    this._unsubscribeFromPoller();
  }

  async _subscribeToPoller() {
    const homeId = this.getStoreValue('homeId');
    if (!homeId) {
      this.error('Missing homeId — re-pair this device.');
      return;
    }
    // The app may not be fully ready yet when devices init; retry briefly.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const app = this.homey.app;
      if (app && typeof app.getPollerForHome === 'function') {
        const poller = await app.getPollerForHome(homeId, this.oAuth2Client);
        if (poller) {
          poller.on('device', this._boundStatus);
          poller.on('event', this._boundEvent);
          this._poller = poller;
          return;
        }
      }
      await new Promise((r) => this.homey.setTimeout(r, 500));
    }
    this.error('Could not attach to home poller.');
  }

  _unsubscribeFromPoller() {
    if (this._poller) {
      this._poller.off('device', this._boundStatus);
      this._poller.off('event', this._boundEvent);
      this._poller = null;
    }
  }

  // ─── hooks for subclasses ──────────────────────────────────────────

  async onHomeStatusUpdate(/* module */) { /* override */ }
  async onNetatmoEvent(/* event */) { /* override */ }

  // ─── helpers ───────────────────────────────────────────────────────

  get homeId() {
    return this.getStoreValue('homeId');
  }

  _withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = this.homey.setTimeout(() => {
        const err = new Error(`Timeout after ${ms}ms while calling ${label}`);
        err.code = 'ETIMEDOUT';
        reject(err);
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) this.homey.clearTimeout(timer);
    });
  }

  async safeSetCapability(cap, value) {
    if (!this.hasCapability(cap)) return;
    const current = this.getCapabilityValue(cap);
    if (current === value) return;
    try {
      await this.setCapabilityValue(cap, value);
    } catch (err) {
      this.error(`setCapabilityValue(${cap}) failed:`, err.message);
    }
  }

  /** Auto-reset a boolean alarm capability back to false after N ms. */
  pulseAlarm(cap, ms = 20000) {
    if (!this.hasCapability(cap)) return;
    this.setCapabilityValue(cap, true).catch(() => {});
    if (this._alarmTimers?.[cap]) this.homey.clearTimeout(this._alarmTimers[cap]);
    this._alarmTimers = this._alarmTimers || {};
    this._alarmTimers[cap] = this.homey.setTimeout(() => {
      this.setCapabilityValue(cap, false).catch(() => {});
    }, ms);
  }

}

module.exports = NetatmoBaseDevice;
