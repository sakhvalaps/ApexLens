console.log('Advanced Salesforce Log Analyzer: Content script loaded');

function injectAnalyzeButtons() {
  // 1. Look for list views: find any links containing 07L
  const logLinks = document.querySelectorAll('a[href*="07L"], a[data-recordid*="07L"]');

  logLinks.forEach(link => {
    // Only inject next to specific action links to avoid clutter
    const text = (link.textContent || '').trim().toLowerCase();
    if (!text.includes('view') && !text.includes('download') && !link.getAttribute('data-recordid')) return;

    // Prevent duplicate injections per row
    const container = link.closest('td') || link.closest('tr') || link.parentNode;
    if (container.dataset.aslaInjected) return;
    container.dataset.aslaInjected = "true";

    let logId = null;
    const href = link.getAttribute('href') || '';
    const dataId = link.getAttribute('data-recordid') || '';
    const match = href.match(/(07L[a-zA-Z0-9]{12,15})/) || dataId.match(/(07L[a-zA-Z0-9]{12,15})/);

    if (match) logId = match[1];

    // If we couldn't find an ID, check parent rows for data attributes (common in lightning tables)
    if (!logId) {
      const row = link.closest('tr');
      if (row && row.innerHTML.match(/(07L[a-zA-Z0-9]{12,15})/)) {
        logId = row.innerHTML.match(/(07L[a-zA-Z0-9]{12,15})/)[1];
      }
    }

    if (!logId) return;

    link.dataset.aslaInjected = "true";
    createAndInjectButton(logId, link.parentNode, link.nextSibling, false);
  });

  // 2. Are we on a specific log detail page? (Classic or Lightning)
  // Check URL for 07L
  const urlMatch = window.location.href.match(/(07L[a-zA-Z0-9]{12,15})/);
  if (urlMatch) {
    const detailLogId = urlMatch[1];
    if (!document.getElementById('asla-floating-btn')) {
      const floatContainer = document.createElement('div');
      floatContainer.id = 'asla-floating-btn';
      floatContainer.style.position = 'fixed';
      floatContainer.style.bottom = '20px';
      floatContainer.style.right = '20px';
      floatContainer.style.zIndex = '999999';

      const btn = createAndInjectButton(detailLogId, floatContainer, null, true);

      document.body.appendChild(floatContainer);
    }
  }

  // 3. Are we in the Developer Console?
  if (window.location.href.includes('ApexCSIPage')) {
    injectDevConsoleIntegration();
  }
}

function injectDevConsoleIntegration() {
    if (document.getElementById('asla-devconsole-btn')) return;

    // We append a button to the top right of the Dev Console or floating at the bottom right
    const btn = document.createElement('button');
    btn.id = 'asla-devconsole-btn';
    btn.innerHTML = '🚀 <b>Analyze Selected Log</b>';
    btn.setAttribute('style', `
        position: fixed !important;
        bottom: 25px !important;
        right: 25px !important;
        z-index: 9999999 !important;
        background: #0176D3 !important;
        background-color: #0176D3 !important;
        color: #ffffff !important;
        border: 1px solid #0176D3 !important;
        border-radius: 24px !important;
        padding: 12px 20px !important;
        font-size: 14px !important;
        font-weight: bold !important;
        font-family: "Salesforce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        cursor: pointer !important;
        box-shadow: 0 4px 12px rgba(1, 118, 211, 0.4) !important;
        transition: all 0.2s ease !important;
        display: flex !important;
        align-items: center !important;
    `);
    
    btn.addEventListener('mouseenter', () => {
        btn.style.setProperty('transform', 'translateY(-2px)', 'important');
        btn.style.setProperty('box-shadow', '0 6px 16px rgba(1, 118, 211, 0.5)', 'important');
        btn.style.setProperty('background-color', '#014486', 'important');
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.setProperty('transform', 'translateY(0)', 'important');
        btn.style.setProperty('box-shadow', '0 4px 12px rgba(1, 118, 211, 0.4)', 'important');
        btn.style.setProperty('background-color', '#0176D3', 'important');
    });

    btn.addEventListener('click', async () => {
        // Attempt to find selected log in ExtJS grid
        const selectedRow = document.querySelector('.x-grid3-row-selected, .x-grid-item-selected, .x-grid-row-selected');
        let logId = null;
        
        if (selectedRow) {
            const match = selectedRow.textContent.match(/(07L[a-zA-Z0-9]{12,15})/);
            if (match) logId = match[1];
        }

        // Fallback: Search the entire DOM for the most recent log ID (07L...)
        if (!logId) {
            const allCells = Array.from(document.querySelectorAll('.x-grid3-cell-inner, .x-grid-cell-inner'));
            for (const cell of allCells) {
                const match = cell.textContent.match(/(07L[a-zA-Z0-9]{12,15})/);
                if (match) {
                    logId = match[1];
                    break;
                }
            }
        }

        if (!logId) {
            alert('Please select a log row in the "Logs" tab first!');
            return;
        }

        const originalHtml = btn.innerHTML;
        btn.innerHTML = '⏳ <b>Loading Log...</b>';
        btn.disabled = true;

        try {
            const response = await fetch(`/servlet/servlet.FileDownload?file=${logId}`);
            if (!response.ok) throw new Error('Failed to fetch log');

            const rawLogText = await response.text();

            await chrome.storage.local.set({
                currentLogId: logId,
                currentLogText: rawLogText
            });

            chrome.runtime.sendMessage({ action: 'openAnalyzerTab' });
        } catch (err) {
            console.error('Error fetching log:', err);
            alert('Failed to download log. Check network and session.');
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    });

    document.body.appendChild(btn);
}

function createAndInjectButton(logId, parentNode, insertBeforeNode, isFloating = false) {
  const isInline = !isFloating;

  const btn = document.createElement(isInline ? 'a' : 'button');
  btn.className = 'asla-analyze-btn actionLink';
  btn.textContent = isInline ? 'Inspect Log' : '🔍 Inspect with Advanced Analyzer';
  btn.title = 'Open in Advanced Salesforce Log Analyzer';

  if (isInline) {
    btn.href = 'javascript:void(0)';
    btn.style.display = 'inline-block';
    btn.style.marginLeft = '4px';
    btn.style.marginRight = '4px';
    btn.style.color = '#015ba7'; // Salesforce standard blue link
    btn.style.textDecoration = 'none';
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.padding = '0';
    btn.style.fontFamily = 'inherit';
    btn.style.fontSize = 'inherit';

    btn.addEventListener('mouseover', () => btn.style.textDecoration = 'underline');
    btn.addEventListener('mouseout', () => btn.style.textDecoration = 'none');
  } else {
    btn.style.display = 'block';
    btn.style.margin = '0 auto';
    btn.style.padding = '14px 28px';
    btn.style.fontSize = '16px';
    btn.style.cursor = 'pointer';
    btn.style.backgroundColor = '#0176D3'; // Vibrant Salesforce Blue
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '50px'; // Rounded pill button
    btn.style.boxShadow = '0 4px 12px rgba(1,118,211,0.4)'; // Colorized shadow
    btn.style.fontWeight = 'bold';
  }

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const originalText = btn.textContent;
    btn.textContent = '⏳ Loading...';
    btn.disabled = true;

    try {
      const downloadUrl = `/servlet/servlet.FileDownload?file=${logId}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to fetch log');

      const rawLogText = await response.text();

      await chrome.storage.local.set({
        currentLogId: logId,
        currentLogText: rawLogText
      });

      chrome.runtime.sendMessage({ action: 'openAnalyzerTab' });
    } catch (err) {
      console.error('Error fetching log:', err);
      alert('Failed to download log. Check network and session.');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  if (isInline) {
    const separator = document.createTextNode(' | ');
    // Find existing text color for separator
    const sepSpan = document.createElement('span');
    sepSpan.textContent = ' | ';
    sepSpan.style.color = '#333';

    if (insertBeforeNode) {
      parentNode.insertBefore(sepSpan, insertBeforeNode);
      parentNode.insertBefore(btn, insertBeforeNode);
    } else {
      parentNode.appendChild(sepSpan);
      parentNode.appendChild(btn);
    }
  } else {
    if (insertBeforeNode) {
      parentNode.insertBefore(btn, insertBeforeNode);
    } else {
      parentNode.appendChild(btn);
    }
  }
  return btn;
}

// Initial injection
setTimeout(injectAnalyzeButtons, 1500);

// Observe DOM for dynamically loaded logs (e.g., in Lightning)
const observer = new MutationObserver((mutations) => {
  let shouldInject = false;
  for (const m of mutations) {
    if (m.addedNodes.length > 0) {
      shouldInject = true;
      break;
    }
  }
  if (shouldInject) {
    injectAnalyzeButtons();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
