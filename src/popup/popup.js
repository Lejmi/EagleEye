// EagleEye Popup Script v1.3.0

console.log('EagleEye popup loaded - v1.3.0');

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
      document.getElementById('excludeBtn').disabled = true;
      return;
    }
    
    // Automatically check the current site
    checkCurrentSite();
    
    // Load excluded domains list
    loadExcludedDomains();
    
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
        if (response.excluded) {
          updateStatus('excluded', 'ℹ️', `Site excluded from checks (${response.domain})`);
        } else if (response.error) {
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
 * @param {string} statusClass - CSS class for status (safe/danger/checking/error/excluded)
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
 * Load and display excluded domains list
 */
function loadExcludedDomains() {
  chrome.runtime.sendMessage({ action: 'getExcluded' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading excluded domains:', chrome.runtime.lastError);
      return;
    }
    
    const listEl = document.getElementById('excludedList');
    const countEl = document.getElementById('excludedCount');
    const domains = response.domains || [];
    
    // Update count badge
    countEl.textContent = domains.length;
    
    // Display list or empty state
    if (domains.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No excluded sites</p>';
      return;
    }
    
    // Create list items for each excluded domain
    listEl.innerHTML = domains.map(domain => `
      <div class="excluded-item">
        <span class="domain-name">${domain}</span>
        <button class="remove-btn" data-domain="${domain}" title="Remove from exclusion list">
          ×
        </button>
      </div>
    `).join('');
    
    // Add remove button listeners
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const domain = e.target.dataset.domain;
        removeDomainFromExclusion(domain);
      });
    });
  });
}

/**
 * Remove a domain from the exclusion list
 * @param {string} domain - The domain to remove
 */
function removeDomainFromExclusion(domain) {
  chrome.runtime.sendMessage(
    { action: 'removeExclusion', domain: domain },
    (response) => {
      if (response && response.success) {
        console.log('Domain removed from exclusion list:', domain);
        // Reload the list
        loadExcludedDomains();
        // Re-check current site if it matches the removed domain
        const currentDomain = extractDomainFromUrl(currentTab.url);
        if (currentDomain === domain) {
          checkCurrentSite();
        }
      }
    }
  );
}

/**
 * Extract domain from URL
 * @param {string} url - The URL to extract domain from
 * @returns {string|null} The domain or null if invalid
 */
function extractDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
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
  
  // Exclude button - add current site to exclusion list
  const excludeBtn = document.getElementById('excludeBtn');
  
  if (excludeBtn) {
    excludeBtn.addEventListener('click', () => {
      console.log('Exclude button clicked');
      
      if (!currentTab) {
        alert('No active tab');
        return;
      }
      
      const domain = extractDomainFromUrl(currentTab.url);
      
      if (!domain) {
        alert('Unable to extract domain from URL');
        return;
      }
      
      // Confirm exclusion
      if (confirm(`Add "${domain}" to exclusion list?\n\nThis site will no longer be checked for threats.`)) {
        chrome.runtime.sendMessage(
          { action: 'excludeDomain', url: currentTab.url },
          (response) => {
            if (response && response.success) {
              console.log('Domain excluded:', response.domain);
              // Update status and reload exclusion list
              updateStatus('excluded', 'ℹ️', `Site excluded from checks (${response.domain})`);
              loadExcludedDomains();
            } else {
              alert(response.message || 'Failed to exclude domain');
            }
          }
        );
      }
    });
  }
}

console.log('EagleEye popup script initialized');
