document.getElementById('open-sidepanel').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.sidePanel.open({ tabId: tabs[0].id });
      window.close();
    }
  });
});
