'use strict';

const NetatmoBaseDriver = require('../../lib/NetatmoBaseDriver');

const TRIGGERS = [
  'doorbell_rang',
  'doorbell_call_accepted',
  'doorbell_call_missed',
  'motion_detected',
];

class DoorbellDriver extends NetatmoBaseDriver {
  get netatmoTypes() { return ['NDB']; }
  get triggerIds() { return TRIGGERS; }

  triggerRang(d, t)     { return this._fire('doorbell_rang', d, t); }
  triggerAccepted(d, t) { return this._fire('doorbell_call_accepted', d, t); }
  triggerMissed(d, t)   { return this._fire('doorbell_call_missed', d, t); }
  triggerMotion(d, t)   { return this._fire('motion_detected', d, t); }
}

module.exports = DoorbellDriver;
