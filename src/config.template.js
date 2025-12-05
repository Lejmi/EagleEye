// EagleEye Configuration Template
// Copy this file to config.js and add your actual API key

const CONFIG = {
  // Get your Google Safe Browsing API key from:
  // https://console.cloud.google.com/apis/credentials
  SAFE_BROWSING_API_KEY: 'YOUR_API_KEY_HERE'
};

// For service worker compatibility
if (typeof self !== 'undefined' && self.CONFIG === undefined) {
  self.CONFIG = CONFIG;
}
