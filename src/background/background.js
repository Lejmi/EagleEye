// EagleEye Background Service Worker v1.4.0
// Handles URL monitoring and Google Safe Browsing API integration

console.log("EagleEye background service worker loaded - v1.4.0");

// Import configuration
importScripts('config.js');

// Google Safe Browsing API Configuration
const SAFE_BROWSING_API_KEY = CONFIG.SAFE_BROWSING_API_KEY;
const API_ENDPOINT = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;

// Cache for URL check results to minimize API calls
// Structure: { url: { safe: boolean, threats: array, timestamp: number } }
let urlCheckCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Excluded domains list - sites that won't be checked
let excludedDomains = [];

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('EagleEye installed - Safe Browsing protection active');
  // Initialize storage with empty excluded domains list
  chrome.storage.local.set({ excludedDomains: [] });
});

// Load excluded domains from storage on startup
chrome.storage.local.get(['excludedDomains'], (result) => {
  excludedDomains = result.excludedDomains || [];
  console.log('Loaded excluded domains:', excludedDomains);
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
 * Extract domain from URL
 * @param {string} url - The URL to extract domain from
 * @returns {string|null} The domain or null if invalid
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Main function to check URL safety using Google Safe Browsing API
 * @param {string} url - The URL to check
 * @param {number} tabId - The tab ID where the URL is loaded
 * @returns {Promise<Object>} Result object with safety status
 */
async function checkURL(url, tabId) {
  try {
    // Skip chrome:// pages, extension pages, and data URLs
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('about:') || url.startsWith('data:')) {
      return { safe: true, internal: true };
    }

    // Check if domain is in exclusion list
    const domain = extractDomain(url);
    if (domain && excludedDomains.includes(domain)) {
      console.log('Domain excluded from checks:', domain);
      return { safe: true, excluded: true, domain: domain };
    }

    // Check if URL is in cache and still valid
    if (urlCheckCache[url]) {
      const cached = urlCheckCache[url];
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_DURATION) {
        console.log('Using cached result for:', url);
        if (!cached.safe && tabId) {
          blockMaliciousPage(tabId, url, cached.threats || []);
        } else if (cached.safe && tabId) {
          clearPageBlocker(tabId);
        }
        return cached;
      }
    }

    // Prepare request body for Google Safe Browsing API
    // API checks for multiple threat types
    const requestBody = {
      client: {
        clientId: "eagleeye-extension",
        clientVersion: "1.4.0"
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

    // If unsafe, notify and block page; if safe, ensure blocker cleared
    if (!isSafe) {
      showThreatNotification(url, data.matches);
      if (tabId) {
        blockMaliciousPage(tabId, url, data.matches);
      }
    } else if (tabId) {
      clearPageBlocker(tabId);
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
    iconUrl: '/images/EagleEye_logo.png',
    title: '⚠️ Dangerous Website Detected!',
    message: `This site may contain: ${threatTypes}\n\nBe careful proceeding to: ${url}`,
    priority: 2,
    requireInteraction: true  // Keeps notification visible until dismissed
  });
}

/**
 * Inject a blocking overlay into the page to prevent access when malicious
 * @param {number} tabId - The tab to block
 * @param {string} url - The malicious URL
 * @param {Array} threats - Threat data from Safe Browsing
 */
async function blockMaliciousPage(tabId, url, threats) {
  if (!tabId) return;

  const threatTypes = (threats || []).map(t => t.threatType).join(', ');

  try {
    // Check if tab is still valid and not showing an error
    const tab = await chrome.tabs.get(tabId);
    
    // Don't inject into error pages, internal pages, or if tab doesn't exist
    if (!tab || !tab.url || 
        tab.url.startsWith('chrome-error://') || 
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('chrome-extension://')) {
      console.log('Cannot inject into this page type, skipping overlay');
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: injectEagleEyeBlocker,
      args: [url, threatTypes],
      world: 'MAIN'
    });
    console.log('Blocker overlay injected for:', url);
  } catch (err) {
    // Silently handle injection failures - page might have navigated away
    // or be in a state that doesn't allow injection
    console.log('Could not inject blocker (page may be gone or restricted):', err.message);
  }
}

/**
 * Clear the blocking overlay if present
 * @param {number} tabId - The tab to clear
 */
async function clearPageBlocker(tabId) {
  if (!tabId) return;

  try {
    // Check if tab exists and is not an error page
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.url.startsWith('chrome-error://') || 
        tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: removeEagleEyeBlocker,
      world: 'MAIN'
    });
    console.log('Blocker overlay cleared for tab:', tabId);
  } catch (err) {
    // Silently fail - overlay might not exist or tab gone
    console.log('No blocker to clear or failed:', err.message);
  }
}

// This function runs in the context of the page to inject a blocking overlay
function injectEagleEyeBlocker(url, threatTypes) {
  try {
    // Remove any existing overlay
    const existing = document.getElementById('eagleeye-blocker');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'eagleeye-blocker-style';
    style.textContent = `
      #eagleeye-blocker {
        position: fixed;
        inset: 0;
        background: rgba(26, 35, 50, 0.92);
        color: #ffffff;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
      #eagleeye-blocker .card {
        background: #1f2937;
        border: 2px solid #d4af37;
        border-radius: 12px;
        padding: 24px;
        max-width: 520px;
        width: 90%;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        text-align: center;
      }
      #eagleeye-blocker h1 {
        font-size: 24px;
        margin-bottom: 10px;
      }
      #eagleeye-blocker p {
        margin: 8px 0;
        line-height: 1.5;
        color: #e5e7eb;
      }
      #eagleeye-blocker .threats {
        color: #f87171;
        font-weight: 700;
      }
      #eagleeye-blocker .url {
        word-break: break-all;
        font-family: 'Courier New', monospace;
        color: #eab308;
        margin: 8px 0 12px 0;
      }
      #eagleeye-blocker .actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      #eagleeye-blocker button {
        padding: 10px 16px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-weight: 700;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      #eagleeye-blocker .leave {
        background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
        color: #fff;
        box-shadow: 0 6px 12px rgba(239, 68, 68, 0.35);
      }
      #eagleeye-blocker .leave:hover { transform: translateY(-2px); }
      #eagleeye-blocker .leave:active { transform: translateY(0); }
      #eagleeye-blocker .back {
        background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
        color: #0f172a;
        box-shadow: 0 6px 12px rgba(212, 175, 55, 0.3);
      }
      #eagleeye-blocker .back:hover { transform: translateY(-2px); }
      #eagleeye-blocker .back:active { transform: translateY(0); }
    `;

    const overlay = document.createElement('div');
    overlay.id = 'eagleeye-blocker';
    overlay.innerHTML = `
      <div class="card">
        <h1>🚫 Dangerous site blocked</h1>
        <p>This page was blocked by EagleEye to keep you safe.</p>
        <p class="threats">Detected: ${threatTypes || 'Unknown threat'}</p>
        <p class="url">${url}</p>
        <div class="actions">
          <button class="back" id="eagleeye-back">Go Back</button>
          <button class="leave" id="eagleeye-leave">Leave Site</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(overlay);

    // Prevent scrolling/interactions behind overlay
    document.documentElement.style.overflow = 'hidden';
    document.body && (document.body.style.overflow = 'hidden');

    // Button handlers
    const backBtn = document.getElementById('eagleeye-back');
    const leaveBtn = document.getElementById('eagleeye-leave');

    if (backBtn) {
      backBtn.onclick = () => {
        try { history.back(); } catch (e) { console.error(e); }
      };
    }

    if (leaveBtn) {
      leaveBtn.onclick = () => {
        try {
          window.stop();
          location.href = 'about:blank';
        } catch (e) {
          console.error(e);
        }
      };
    }
  } catch (err) {
    console.error('Failed to inject blocker overlay (content script):', err);
  }
}

// Removes the injected overlay from the page
function removeEagleEyeBlocker() {
  const overlay = document.getElementById('eagleeye-blocker');
  const style = document.getElementById('eagleeye-blocker-style');
  if (overlay) overlay.remove();
  if (style) style.remove();
  // Restore scroll
  document.documentElement.style.overflow = '';
  if (document.body) document.body.style.overflow = '';
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
  
  // Handle add domain to exclusion list
  if (request.action === 'excludeDomain') {
    const domain = extractDomain(request.url);
    if (domain && !excludedDomains.includes(domain)) {
      excludedDomains.push(domain);
      // Save to storage
      chrome.storage.local.set({ excludedDomains }, () => {
        console.log('Domain added to exclusion list:', domain);
        sendResponse({ success: true, domain: domain });
      });
    } else if (domain && excludedDomains.includes(domain)) {
      sendResponse({ success: false, message: 'Domain already excluded' });
    } else {
      sendResponse({ success: false, message: 'Invalid domain' });
    }
    return true;
  }
  
  // Handle remove domain from exclusion list
  if (request.action === 'removeExclusion') {
    excludedDomains = excludedDomains.filter(d => d !== request.domain);
    // Save to storage
    chrome.storage.local.set({ excludedDomains }, () => {
      console.log('Domain removed from exclusion list:', request.domain);
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Handle get excluded domains list
  if (request.action === 'getExcluded') {
    sendResponse({ domains: excludedDomains });
    return true;
  }
});

console.log('EagleEye background service worker initialized');
