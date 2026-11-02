// Runtime configuration injected by the mini program host.
//
// The agents API base URL arrives through the WeChat ext config
// (`wx.getExtConfigSync()`), which a host deployment writes; it is never a
// hard-coded build value. The access token is set by the host after sign-in and
// is never stored in the bundle.
let accessToken = null;

function getAccessToken() {
  return accessToken;
}

function setAccessToken(value) {
  accessToken = typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readAgentsApiBaseUrl() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getExtConfigSync === 'function') {
      const ext = wx.getExtConfigSync() || {};
      if (typeof ext.agentsApiBaseUrl === 'string') return ext.agentsApiBaseUrl;
    }
  } catch (error) {
    // Ext config is optional; absence means the offline adapter.
  }
  return '';
}

module.exports = { getAccessToken, setAccessToken, readAgentsApiBaseUrl };
