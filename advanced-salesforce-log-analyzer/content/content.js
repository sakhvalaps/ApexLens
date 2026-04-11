console.log('Advanced Salesforce Log Analyzer: Content script loaded');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively search shadow roots for elements matching a CSS selector.
 * Salesforce Lightning Web Components use shadow DOM heavily; this ensures
 * we find log links even when they are rendered inside shadow roots.
 *
 * Improvements:
 *  - maxDepth guard: stops traversal after 5 levels of nesting (Salesforce
 *    Lightning log links never appear deeper than ~3 levels) so a pathological
 *    page cannot cause infinite recursion or a multi-second freeze.
 *  - Results are capped at 200 to avoid processing an unreasonable number of
 *    candidate links on extremely large list views.
 */
function queryShadowDeep(selector, root = document, depth = 0, results = []) {
  if (depth > 5 || results.length >= 200) return results;

  // Collect direct matches in this root
  for (const el of root.querySelectorAll(selector)) {
    results.push(el);
    if (results.length >= 200) return results;
  }

  // Descend into shadow roots (only elements that actually have one)
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      queryShadowDeep(selector, el.shadowRoot, depth + 1, results);
      if (results.length >= 200) return results;
    }
  }

  return results;
}

/**
 * Extract the first Salesforce ApexDebugLog ID (07L…) found in a string.
 */
function extractLogId(text) {
  const m = text.match(/(07L[a-zA-Z0-9]{12,15})/);
  return m ? m[1] : null;
}

// ── Button injection ──────────────────────────────────────────────────────────

function injectAnalyzeButtons() {
  // 1. Log list views: find links whose href or data-recordid carries a log ID.
  //    Try both regular DOM and shadow DOM (Lightning LWC).
  const logLinks = [
    ...document.querySelectorAll('a[href*="07L"], a[data-recordid*="07L"]'),
    ...queryShadowDeep('a[href*="07L"], a[data-recordid*="07L"]')
  ];

  // De-duplicate (same element may appear in both queries)
  const seen = new Set();
  for (const link of logLinks) {
    if (seen.has(link)) continue;
    seen.add(link);

    const text = (link.textContent || '').trim().toLowerCase();
    if (!text.includes('view') && !text.includes('download') && !link.getAttribute('data-recordid')) continue;

    const container = link.closest('td') || link.closest('tr') || link.parentNode;
    if (!container || container.dataset.aslaInjected) continue;
    container.dataset.aslaInjected = 'true';

    const href   = link.getAttribute('href')          || '';
    const dataId = link.getAttribute('data-recordid') || '';
    let logId = extractLogId(href) || extractLogId(dataId);

    if (!logId) {
      const row = link.closest('tr');
      if (row) logId = extractLogId(row.innerHTML);
    }

    if (!logId) continue;
    createAndInjectButton(logId, link.parentNode, link.nextSibling, false);
  }

  // 2. Detail page: if the current URL contains a log ID, add a floating pill button.
  const urlLogId = extractLogId(window.location.href);
  if (urlLogId) {
    let floatBtn = document.getElementById('asla-floating-btn');

    if (!floatBtn) {
      // First visit to this log page
      const floatContainer = document.createElement('div');
      floatContainer.id = 'asla-floating-btn';
      floatContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;';
      createAndInjectButton(urlLogId, floatContainer, null, true);
      document.body.appendChild(floatContainer);
    } else {
      // Lightning SPA: user navigated to a DIFFERENT log — update the stored ID
      const existing = floatBtn.querySelector('button[data-log-id]');
      if (existing && existing.dataset.logId !== urlLogId) {
        floatBtn.innerHTML = '';
        createAndInjectButton(urlLogId, floatBtn, null, true);
      }
    }
  } else {
    // Navigated away from a log detail page — remove the floating button
    const floatBtn = document.getElementById('asla-floating-btn');
    if (floatBtn) floatBtn.remove();
  }

  // 3. Apex Developer Console
  if (window.location.href.includes('ApexCSIPage')) {
    injectDevConsoleIntegration();
  }
}

// ── Developer Console integration ─────────────────────────────────────────────

function injectDevConsoleIntegration() {
  if (document.getElementById('asla-devconsole-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'asla-devconsole-btn';
  btn.innerHTML = '&#x1F680; <b>Analyze Selected Log</b>';
  btn.setAttribute('style', [
    'position:fixed!important',
    'bottom:25px!important',
    'right:25px!important',
    'z-index:9999999!important',
    'background:#0176D3!important',
    'color:#ffffff!important',
    'border:none!important',
    'border-radius:24px!important',
    'padding:12px 22px!important',
    'font-size:14px!important',
    'font-weight:700!important',
    'font-family:"Salesforce Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important',
    'cursor:pointer!important',
    'box-shadow:0 4px 16px rgba(1,118,211,0.45)!important',
    'transition:all 0.2s ease!important',
    'display:flex!important',
    'align-items:center!important',
    'gap:8px!important',
  ].join(';'));

  btn.addEventListener('mouseenter', () => {
    btn.style.setProperty('transform',   'translateY(-2px)', 'important');
    btn.style.setProperty('box-shadow',  '0 6px 20px rgba(1,118,211,0.55)', 'important');
    btn.style.setProperty('background',  '#014486', 'important');
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.setProperty('transform',   'translateY(0)', 'important');
    btn.style.setProperty('box-shadow',  '0 4px 16px rgba(1,118,211,0.45)', 'important');
    btn.style.setProperty('background',  '#0176D3', 'important');
  });

  btn.addEventListener('click', async () => {
    // Try selected row first, then any visible cell
    const selectedRow = document.querySelector(
      '.x-grid3-row-selected, .x-grid-item-selected, .x-grid-row-selected'
    );
    let logId = null;
    if (selectedRow) logId = extractLogId(selectedRow.textContent);

    if (!logId) {
      const cells = Array.from(document.querySelectorAll('.x-grid3-cell-inner, .x-grid-cell-inner'));
      for (const cell of cells) {
        logId = extractLogId(cell.textContent);
        if (logId) break;
      }
    }

    if (!logId) {
      alert('Please select a log row in the "Logs" tab first!');
      return;
    }

    await fetchAndOpenLog(logId, btn, '&#x1F680; <b>Analyze Selected Log</b>');
  });

  document.body.appendChild(btn);
}

// ── Shared fetch-and-open logic ───────────────────────────────────────────────

async function fetchAndOpenLog(logId, btn, originalHtml) {
  const prevHtml      = btn.innerHTML;
  const restoreHtml   = originalHtml !== undefined ? originalHtml : prevHtml;

  btn.innerHTML  = '&#x23F3; <b>Loading…</b>';
  btn.disabled   = true;
  btn.style.setProperty && btn.style.setProperty('opacity', '0.8', 'important');

  try {
    const response = await fetch(`/servlet/servlet.FileDownload?file=${logId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawLogText = await response.text();

    await chrome.storage.local.set({ currentLogId: logId, currentLogText: rawLogText, currentOrgUrl: window.location.origin });
    chrome.runtime.sendMessage({ action: 'openAnalyzerTab' });
  } catch (err) {
    console.error('[ApexLens] Error fetching log:', err);
    alert('Failed to download log. Check your network connection and that you are logged in to Salesforce.');
  } finally {
    btn.innerHTML = restoreHtml;
    btn.disabled  = false;
    btn.style.setProperty && btn.style.setProperty('opacity', '1', 'important');
  }
}

// ── Button factory ────────────────────────────────────────────────────────────

function createAndInjectButton(logId, parentNode, insertBeforeNode, isFloating = false) {
  if (isFloating) {
    const btn = document.createElement('button');
    btn.dataset.logId = logId;
    btn.title  = 'Open in ApexLens – Advanced Salesforce Log Analyzer';
    btn.innerHTML = '&#x1F50D; Inspect with ApexLens';
    btn.style.cssText = [
      'display:block',
      'padding:13px 26px',
      'font-size:15px',
      'font-weight:700',
      'cursor:pointer',
      'background:#0176D3',
      'color:#fff',
      'border:none',
      'border-radius:50px',
      'box-shadow:0 4px 16px rgba(1,118,211,0.45)',
      'font-family:"Salesforce Sans",-apple-system,sans-serif',
      'transition:all 0.2s ease',
      'letter-spacing:0.01em',
      'white-space:nowrap',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.transform  = 'translateY(-2px)';
      btn.style.boxShadow  = '0 8px 24px rgba(1,118,211,0.55)';
      btn.style.background = '#014486';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform  = 'translateY(0)';
      btn.style.boxShadow  = '0 4px 16px rgba(1,118,211,0.45)';
      btn.style.background = '#0176D3';
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      fetchAndOpenLog(logId, btn);
    });

    parentNode.appendChild(btn);
    return btn;
  }

  // Inline anchor link for list views
  const btn = document.createElement('a');
  btn.className = 'asla-analyze-btn';
  btn.href      = 'javascript:void(0)';
  btn.textContent = 'Inspect Log';
  btn.title     = 'Open in ApexLens';
  btn.style.cssText = [
    'display:inline-block',
    'margin:0 4px',
    'color:#0176D3',
    'text-decoration:none',
    'background:transparent',
    'border:none',
    'padding:0',
    'font-family:inherit',
    'font-size:inherit',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');

  btn.addEventListener('mouseover', () => { btn.style.textDecoration = 'underline'; });
  btn.addEventListener('mouseout',  () => { btn.style.textDecoration = 'none'; });

  let _running = false;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_running) return;
    _running = true;
    const orig = btn.textContent;
    btn.textContent = '⏳ Loading…';
    btn.style.opacity = '0.6';
    try {
      const response = await fetch(`/servlet/servlet.FileDownload?file=${logId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rawLogText = await response.text();
      await chrome.storage.local.set({ currentLogId: logId, currentLogText: rawLogText, currentOrgUrl: window.location.origin });
      chrome.runtime.sendMessage({ action: 'openAnalyzerTab' });
    } catch (err) {
      console.error('[ApexLens] Error fetching log:', err);
      alert('Failed to download log. Check your network connection and Salesforce session.');
    } finally {
      btn.textContent   = orig;
      btn.style.opacity = '1';
      _running = false;
    }
  });

  const sep  = document.createElement('span');
  sep.textContent = ' | ';
  sep.style.color = '#555';

  if (insertBeforeNode) {
    parentNode.insertBefore(sep, insertBeforeNode);
    parentNode.insertBefore(btn, insertBeforeNode);
  } else {
    parentNode.appendChild(sep);
    parentNode.appendChild(btn);
  }
  return btn;
}

// ── Initialization ────────────────────────────────────────────────────────────

// Initial injection after DOM is ready
setTimeout(injectAnalyzeButtons, 1500);

// Debounced MutationObserver: prevents hundreds of calls per second in
// Lightning Experience where the DOM updates extremely frequently.
let _injectDebounce = null;
let _lastUrl = location.href;

const observer = new MutationObserver(() => {
  // Detect Lightning SPA navigation (URL changes without page reload)
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    // Give the new page time to render before injecting
    if (_injectDebounce) clearTimeout(_injectDebounce);
    _injectDebounce = setTimeout(injectAnalyzeButtons, 1500);
    return;
  }

  if (_injectDebounce) clearTimeout(_injectDebounce);
  _injectDebounce = setTimeout(injectAnalyzeButtons, 500);
});

observer.observe(document.body, { childList: true, subtree: true });
