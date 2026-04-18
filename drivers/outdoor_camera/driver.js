'use strict';

const NetatmoBaseDriver = require('../../lib/NetatmoBaseDriver');

const TRIGGERS = [
  'motion_detected',
  'human_detected',
  'vehicle_detected',
  'animal_detected',
  'siren_started',
  'siren_stopped',
  'floodlight_changed',
  'camera_connected',
  'camera_disconnected',
  'monitoring_turned_on',
  'monitoring_turned_off',
  'daily_summary_ready',
];

class OutdoorCameraDriver extends NetatmoBaseDriver {
  get netatmoTypes() { return ['NOC']; }
  get triggerIds() { return TRIGGERS; }

  triggerMotion(d, t)             { return this._fire('motion_detected', d, t); }
  triggerHuman(d, t)              { return this._fire('human_detected', d, t); }
  triggerVehicle(d, t)            { return this._fire('vehicle_detected', d, t); }
  triggerAnimal(d, t)             { return this._fire('animal_detected', d, t); }
  triggerSirenStart(d, t)         { return this._fire('siren_started', d, t); }
  triggerSirenStop(d, t)          { return this._fire('siren_stopped', d, t); }
  triggerFloodlightChanged(d, t)  { return this._fire('floodlight_changed', d, t); }
  triggerCameraConnected(d, t)    { return this._fire('camera_connected', d, t); }
  triggerCameraDisconnected(d, t) { return this._fire('camera_disconnected', d, t); }
  triggerMonitoringOn(d, t)       { return this._fire('monitoring_turned_on', d, t); }
  triggerMonitoringOff(d, t)      { return this._fire('monitoring_turned_off', d, t); }
  triggerDailySummary(d, t)       { return this._fire('daily_summary_ready', d, t); }
}

module.exports = OutdoorCameraDriver;
