chrome.runtime.onInstalled.addListener(() => {
  console.log('Advanced Salesforce Log Analyzer installed');
});

// Listen for messages from the content script.
// When a button is clicked on a Salesforce page, open the side panel
// attached to that tab rather than creating a separate browser tab.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAnalyzerTab') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      chrome.sidePanel.open({ tabId })
        .then(() => sendResponse({ success: true }))
        .catch(err => {
          console.warn('sidePanel.open failed, falling back to tab:', err);
          chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html') });
          sendResponse({ success: false });
        });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html') });
      sendResponse({ success: false });
    }
    return true; // keep message channel open for async sendResponse
  }
});
