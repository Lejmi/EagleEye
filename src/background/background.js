// EagleEye Background Service Worker v1.1.0
// Handles URL monitoring and Google Safe Browsing API integration

console.log("EagleEye background service worker loaded - v1.1.0");

// Google Safe Browsing API Configuration
// TODO: Replace with your actual API key from Google Cloud Console
// Get your key at: https://console.cloud.google.com/apis/credentials
const SAFE_BROWSING_API_KEY = 'YOUR_API_KEY_HERE';
const API_ENDPOINT = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;

// Cache for URL check results to minimize API calls
// Structure: { url: { safe: boolean, threats: array, timestamp: number } }
let urlCheckCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('EagleEye installed - Safe Browsing protection active');
  // Initialize storage with empty excluded domains list
  chrome.storage.local.set({ excludedDomains: [] });
});

// Monitor tab updates and check URLs automatically
// This runs every time a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only check when page is fully loaded and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    // Skip chrome:// and extension pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }
    console.log('Tab updated, checking URL:', tab.url);
    checkURL(tab.url, tabId);
  }
});

/**
 * Main function to check URL safety using Google Safe Browsing API
 * @param {string} url - The URL to check
 * @param {number} tabId - The tab ID where the URL is loaded
 * @returns {Promise<Object>} Result object with safety status
 */
async function checkURL(url, tabId) {
  try {
    // Check if URL is in cache and still valid
    if (urlCheckCache[url]) {
      const cached = urlCheckCache[url];
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_DURATION) {
        console.log('Using cached result for:', url);
        return cached;
      }
    }

    // Prepare request body for Google Safe Browsing API
    // API checks for multiple threat types
    const requestBody = {
      client: {
        clientId: "eagleeye-extension",
        clientVersion: "1.1.0"
      },
      threatInfo: {
        // Threat types to check for
        threatTypes: [
          "MALWARE",                              // Malicious software
          "SOCIAL_ENGINEERING",                    // Phishing/deceptive sites
          "UNWANTED_SOFTWARE",                     // Unwanted programs
          "POTENTIALLY_HARMFUL_APPLICATION"        // Harmful apps
        ],
        platformTypes: ["ANY_PLATFORM"],          // Check all platforms
        threatEntryTypes: ["URL"],                 // We're checking URLs
        threatEntries: [{ url: url }]              // The URL to check
      }
    };

    console.log('Checking URL with Safe Browsing API:', url);

    // Make API request
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    console.log('API Response:', data);

    // Determine if URL is safe
    // If no matches found, URL is safe
    const isSafe = !data.matches || data.matches.length === 0;
    
    const result = {
      safe: isSafe,
      threats: data.matches || [],
      url: url,
      timestamp: Date.now()
    };

    // Cache the result
    urlCheckCache[url] = result;
    // Auto-clear cache entry after duration
    setTimeout(() => delete urlCheckCache[url], CACHE_DURATION);

    // If unsafe, show warning notification
    if (!isSafe) {
      showThreatNotification(url, data.matches);
    }

    return result;

  } catch (error) {
    console.error('Error checking URL:', error);
    // On error, assume safe to avoid blocking user
    return { safe: true, error: true, message: error.message };
  }
}

/**
 * Display a notification when a threat is detected
 * @param {string} url - The dangerous URL
 * @param {Array} threats - Array of threat objects from API
 */
function showThreatNotification(url, threats) {
  // Extract threat types for display
  const threatTypes = threats.map(t => t.threatType).join(', ');
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'images/EagleEye_logo.png',
    title: '⚠️ Dangerous Website Detected!',
    message: `This site may contain: ${threatTypes}\n\nBe careful proceeding to: ${url}`,
    priority: 2,
    requireInteraction: true  // Keeps notification visible until dismissed
  });
}

/**
 * Handle messages from popup and other extension components
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  // Handle URL check request from popup
  if (request.action === 'checkURL') {
    checkURL(request.url, request.tabId).then(result => {
      sendResponse(result);
    });
    return true; // Required for async sendResponse
  }
});

console.log('EagleEye background service worker initialized');
