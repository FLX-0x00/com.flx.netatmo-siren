'use strict';

const { OAuth2Device } = require('homey-oauth2app');

/**
 * Shared base device for all Netatmo siren-capable devices.
 *
 * Handles:
 *  - `onoff` capability listener (maps to Netatmo siren_status sound/no_sound)
 *  - request timeouts + graceful error reporting
 *  - optional periodic state polling
 */
class NetatmoBaseDevice extends OAuth2Device {

  /** Polling interval for external state changes (ms). Set to 0 to disable. */
  static POLL_INTERVAL_MS = 60 * 1000;

  /** Per-request timeout guard (ms). */
  static REQUEST_TIMEOUT_MS = 15 * 1000;

  async onOAuth2Init() {
    this.registerCapabilityListener('onoff', (value) => this._onCapabilityOnoff(value));

    if (this.constructor.POLL_INTERVAL_MS > 0) {
      this._pollTimer = this.homey.setInterval(
        () => this._pollState().catch((err) => this.error('Poll failed:', err)),
        this.constructor.POLL_INTERVAL_MS,
      );
      // First poll shortly after init
      this.homey.setTimeout(() => this._pollState().catch(() => {}), 2500);
    }

    this.log(`${this.getName()} initialised.`);
  }

  async onOAuth2Deleted() {
    if (this._pollTimer) this.homey.clearInterval(this._pollTimer);
  }

  async onOAuth2Uninit() {
    if (this._pollTimer) this.homey.clearInterval(this._pollTimer);
  }

  /**
   * Capability handler: switch the siren on/off.
   * @param {boolean} value
   */
  async _onCapabilityOnoff(value) {
    const sirenStatus = value ? 'sound' : 'no_sound';
    const { id: moduleId } = this.getData();
    const homeId = this.getStoreValue('homeId');

    if (!homeId) {
      throw new Error('Device is missing homeId — re-pair the device.');
    }

    try {
      await this._withTimeout(
        this.oAuth2Client.setSirenState({ homeId, moduleId, sirenStatus }),
        this.constructor.REQUEST_TIMEOUT_MS,
        'setSirenState',
      );
      this.log(`Siren state set to ${sirenStatus}.`);
    } catch (err) {
      this.error(`Failed to set siren state to ${sirenStatus}:`, err);
      throw new Error(
        err?.code === 'ETIMEDOUT'
          ? 'Netatmo did not respond in time. Please try again.'
          : 'Could not change siren state.',
      );
    }
  }

  /**
   * Stub for polling the current siren state from Netatmo.
   * Concrete subclasses may override for driver-specific endpoints
   * (`/api/homestatus` gives current runtime state).
   */
  async _pollState() {
    // Intentionally left as a stub; see homestatus documentation at
    // https://dev.netatmo.com/apidocumentation/security
  }

  /**
   * Wraps a promise with a timeout.
   * @template T
   * @param {Promise<T>} promise
   * @param {number} ms
   * @param {string} label
   * @returns {Promise<T>}
   */
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

}

module.exports = NetatmoBaseDevice;
