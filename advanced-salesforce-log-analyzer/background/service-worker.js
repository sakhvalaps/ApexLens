chrome.runtime.onInstalled.addListener(() => {
  console.log('Advanced Salesforce Log Analyzer installed');
});

// Listener for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAnalyzerTab') {
    // Open the sidepanel UI as a full new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html') });
  }
});
