'use strict';

module.exports = {
  async reconfigure({ homey }) {
    const app = homey.app;
    if (typeof app.reconfigureOAuth2 !== 'function') {
      throw new Error('App does not support reconfiguration.');
    }
    await app.reconfigureOAuth2();
    return { ok: true };
  },
};
