'use strict';

const EventEmitter = require('events');

/**
 * Polls Netatmo `/homestatus` and `/getevents` for a single home
 * and emits diff-events that devices subscribe to.
 *
 * Emits:
 *  - `status`   (homeStatus)           — raw home snapshot, every cycle
 *  - `device`   (deviceId, moduleData) — per-device state snapshot
 *  - `event`    (event)                — every *new* event seen
 *
 * Netatmo tokens live ~3h; `homey-oauth2app` refreshes automatically,
 * so we just re-use the injected `oAuth2Client`. All network errors
 * are caught and logged without killing the poll loop.
 */
class NetatmoHomePoller extends EventEmitter {

  /**
   * @param {object} args
   * @param {import('homey').App} args.app
   * @param {import('./NetatmoOAuth2Client')} args.oAuth2Client
   * @param {string} args.homeId
   * @param {number} [args.intervalMs=20000]
   */
  constructor({ app, oAuth2Client, homeId, intervalMs = 20000 }) {
    super();
    this.app = app;
    this.client = oAuth2Client;
    this.homeId = homeId;
    this.intervalMs = intervalMs;
    this._timer = null;
    this._lastEventIds = new Set();
    this._seedDone = false;
  }

  start() {
    if (this._timer) return;
    this._tick().catch((err) => this.app.error('Poller initial tick failed:', err));
    this._timer = this.app.homey.setInterval(
      () => this._tick().catch((err) => this.app.error('Poller tick failed:', err)),
      this.intervalMs,
    );
    this.app.log(`[Poller] Started for home ${this.homeId} @ ${this.intervalMs}ms`);
  }

  stop() {
    if (this._timer) {
      this.app.homey.clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _tick() {
    await Promise.all([
      this._pollStatus().catch((err) => this.app.error('[Poller] homestatus:', err.message || err)),
      this._pollEvents().catch((err) => this.app.error('[Poller] getevents:', err.message || err)),
    ]);
  }

  async _pollStatus() {
    const status = await this.client.getHomeStatus({ homeId: this.homeId });
    const home = status?.body?.home;
    if (!home) return;

    this.emit('status', home);

    // Iterate modules and emit per-device snapshots.
    const modules = home.modules ?? [];
    for (const m of modules) {
      this.emit('device', m.id, m);
    }
  }

  async _pollEvents() {
    const data = await this.client.getEvents({ homeId: this.homeId, size: 20 });
    const events = data?.body?.home?.events ?? [];

    if (!this._seedDone) {
      // First run: remember what already exists, don't fire triggers
      // for historic events from before the app started.
      for (const ev of events) this._lastEventIds.add(ev.id);
      this._seedDone = true;
      this.app.log(`[Poller] Seeded with ${events.length} existing events.`);
      return;
    }

    // Events come newest-first; iterate oldest-first so triggers fire chronologically.
    const fresh = events.filter((ev) => !this._lastEventIds.has(ev.id)).reverse();
    for (const ev of fresh) {
      this._lastEventIds.add(ev.id);
      this.emit('event', ev);
    }

    // Keep the dedupe set bounded.
    if (this._lastEventIds.size > 200) {
      const keep = new Set([...this._lastEventIds].slice(-100));
      this._lastEventIds = keep;
    }
  }

}

module.exports = NetatmoHomePoller;
