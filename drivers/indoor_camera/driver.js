'use strict';

const NetatmoBaseDriver = require('../../lib/NetatmoBaseDriver');

const TRIGGERS = [
  'motion_detected',
  'person_detected',
  'unknown_person_detected',
  'person_left',
  'person_came_home',
  'camera_connected',
  'camera_disconnected',
  'monitoring_turned_on',
  'monitoring_turned_off',
];

class IndoorCameraDriver extends NetatmoBaseDriver {
  get netatmoTypes() { return ['NACamera']; }
  get triggerIds() { return TRIGGERS; }

  triggerMotion(d, t)            { return this._fire('motion_detected', d, t); }
  triggerPersonDetected(d, t, s) { return this._fire('person_detected', d, t, s); }
  triggerUnknownPerson(d, t)     { return this._fire('unknown_person_detected', d, t); }
  triggerPersonLeft(d, t, s)     { return this._fire('person_left', d, t, s); }
  triggerPersonCame(d, t, s)     { return this._fire('person_came_home', d, t, s); }
  triggerCameraConnected(d, t)   { return this._fire('camera_connected', d, t); }
  triggerCameraDisconnected(d,t) { return this._fire('camera_disconnected', d, t); }
  triggerMonitoringOn(d, t)      { return this._fire('monitoring_turned_on', d, t); }
  triggerMonitoringOff(d, t)     { return this._fire('monitoring_turned_off', d, t); }
}

module.exports = IndoorCameraDriver;
