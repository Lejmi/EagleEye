// EagleEye Popup Script v1.2.0
// Handles user interface interactions and status display

console.log('EagleEye popup loaded - v1.2.0');

// Store current tab information
let currentTab = null;

/**
 * Initialize popup when DOM is loaded
 * Gets current tab and checks its safety status
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initializing...');
  
  try {
    // Get the active tab in the current window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      updateStatus('error', '⚠️', 'Unable to get current tab');
      return;
    }
    
    currentTab = tab;
    
    // Display the current URL (truncate if too long)
    const displayUrl = tab.url.length > 60 ? tab.url.substring(0, 60) + '...' : tab.url;
    document.getElementById('currentUrl').textContent = displayUrl;
    document.getElementById('currentUrl').title = tab.url; // Full URL on hover
    
    // Check if this is a chrome:// or extension page
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      updateStatus('info', 'ℹ️', 'Chrome internal pages are not checked');
      document.getElementById('forceCheckBtn').disabled = true;
      return;
    }
    
    // Automatically check the current site
    checkCurrentSite();
    
  } catch (error) {
    console.error('Error initializing popup:', error);
    updateStatus('error', '⚠️', 'Error loading extension');
  }
  
  // Setup event listeners
  setupEventListeners();
});

/**
 * Check the safety of the current site
 * Sends message to background script to perform API check
 */
async function checkCurrentSite() {
  if (!currentTab) {
    console.error('No current tab available');
    return;
  }
  
  // Update UI to show checking status
  updateStatus('checking', '⏳', 'Checking site safety...');
  
  try {
    // Send message to background script to check URL
    chrome.runtime.sendMessage(
      { 
        action: 'checkURL', 
        url: currentTab.url, 
        tabId: currentTab.id 
      },
      (response) => {
        // Handle response from background script
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          updateStatus('error', '⚠️', 'Error communicating with background script');
          return;
        }
        
        if (!response) {
          updateStatus('error', '⚠️', 'No response from background script');
          return;
        }
        
        console.log('Check result:', response);
        
        // Display result based on response
        if (response.error) {
          updateStatus('error', '⚠️', `Error: ${response.message || 'Unable to check site'}`);
        } else if (response.safe) {
          updateStatus('safe', '✅', 'Site appears safe - No threats detected');
        } else {
          // Site is dangerous - show threat types
          const threatTypes = response.threats.map(t => t.threatType).join(', ');
          updateStatus('danger', '🚨', `DANGER: ${threatTypes}`);
        }
      }
    );
  } catch (error) {
    console.error('Error checking site:', error);
    updateStatus('error', '⚠️', 'Error checking site');
  }
}

/**
 * Update the status indicator display
 * @param {string} statusClass - CSS class for status (safe/danger/checking/error)
 * @param {string} icon - Emoji icon to display
 * @param {string} text - Status text message
 */
function updateStatus(statusClass, icon, text) {
  const indicator = document.getElementById('statusIndicator');
  const iconEl = document.getElementById('statusIcon');
  const textEl = document.getElementById('statusText');
  
  if (!indicator || !iconEl || !textEl) {
    console.error('Status elements not found in DOM');
    return;
  }
  
  // Remove all status classes
  indicator.className = 'status-indicator';
  
  // Add new status class (controls background color)
  indicator.classList.add(statusClass);
  
  // Update icon and text
  iconEl.textContent = icon;
  textEl.textContent = text;
  
  console.log(`Status updated: ${statusClass} - ${text}`);
}

/**
 * Setup event listeners for buttons
 */
function setupEventListeners() {
  // Force check button - manually trigger a site check
  const forceCheckBtn = document.getElementById('forceCheckBtn');
  
  if (forceCheckBtn) {
    forceCheckBtn.addEventListener('click', () => {
      console.log('Force check button clicked');
      checkCurrentSite();
    });
  }
}

console.log('EagleEye popup script initialized');
