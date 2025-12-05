# 🦅 EagleEye - Safe Browsing Extension

A Manifest V3 Chrome extension that protects users from phishing and unsafe websites in real-time using Google Safe Browsing API.

## Features

- 🛡️ **Real-time Protection** - Automatically checks URLs as you browse
- 🚫 **Page Blocking** - Blocks malicious sites with a full-page warning overlay
- ⚠️ **Threat Notifications** - Alerts you when dangerous sites are detected
- ✅ **Manual Checking** - Force check any site with one click
- 📋 **Exclusion List** - Whitelist trusted sites to skip checks
- 🎨 **Modern UI** - Clean interface with navy blue and gold color scheme

## Setup Instructions

### 1. Get a Google Safe Browsing API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Safe Browsing API**
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **API Key**
6. Copy your API key

### 2. Configure the Extension

1. Navigate to the `src` folder
2. Copy `config.template.js` to `config.js`:
   ```bash
   cp src/config.template.js src/config.js
   ```
3. Open `src/config.js` and replace `YOUR_API_KEY_HERE` with your actual API key:
   ```javascript
   const CONFIG = {
     SAFE_BROWSING_API_KEY: 'your-actual-api-key-here'
   };
   ```

### 3. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `EagleEye` folder
5. The extension is now active!

## Usage

- **Automatic Protection**: The extension automatically checks every page you visit
- **Manual Check**: Click the extension icon and use "Force Check This Site"
- **Exclude Sites**: Add trusted domains to the exclusion list
- **Blocked Pages**: If a malicious site is detected, you'll see a warning overlay with options to go back or leave

## Security Note

⚠️ **Never commit your `src/config.js` file to Git!** This file contains your API key and is automatically ignored by `.gitignore`.

## API Quota

The Safe Browsing API offers 10,000 requests per day for free, which is sufficient for personal use.

## Version History

- **v1.4.0** - Added page blocking overlay for malicious sites
- **v1.3.0** - Added exclusion list management
- **v1.2.0** - Added popup UI with status display
- **v1.1.0** - Initial Safe Browsing API integration
- **v1.0.0** - Basic extension structure

## License

See LICENSE file for details.

## Support

For issues or questions, please open an issue on GitHub.
