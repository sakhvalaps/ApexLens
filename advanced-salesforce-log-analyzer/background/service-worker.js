chrome.runtime.onInstalled.addListener(() => {
  console.log('Advanced Salesforce Log Analyzer installed');
});

// When "Inspect with ApexLens" is clicked on a Salesforce page,
// open the analyzer in a new browser tab (or focus/reload an existing one).
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAnalyzerTab') {
    const analyzerUrl = chrome.runtime.getURL('sidepanel/sidepanel.html');

    chrome.tabs.query({ url: analyzerUrl }, existingTabs => {
      if (existingTabs && existingTabs.length > 0) {
        // Reuse the already-open analyzer tab: focus + reload so it picks up new log
        const tab = existingTabs[0];
        chrome.tabs.update(tab.id, { active: true }, () => chrome.tabs.reload(tab.id));
        chrome.windows.update(tab.windowId, { focused: true });
        sendResponse({ success: true });
      } else {
        chrome.tabs.create({ url: analyzerUrl });
        sendResponse({ success: true });
      }
    });

    return true; // keep channel open for async sendResponse
  }
});

// NOTE: The extension toolbar popup button (popup.js) still opens the side panel
// via chrome.sidePanel.open() directly — that path is unchanged.
