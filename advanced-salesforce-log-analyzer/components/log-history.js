/**
 * LogHistory — persists the last N analyzed logs in chrome.storage.local.
 *
 * Storage layout:
 *   logHistory  →  Array<HistoryEntry>  (metadata index, max MAX_LOGS entries)
 *   logtext_<logId>  →  raw log text (one key per log)
 *
 * The raw text is stored under a key derived from the Salesforce log ID so
 * reloading the same log ID overwrites the previous copy automatically.
 */
class LogHistory {
  static MAX_LOGS    = 5;
  static INDEX_KEY   = 'logHistory';
  static TEXT_PREFIX = 'logtext_';

  constructor() {
    this._panel          = null;
    this._overlay        = null;
    this._onLoadCallback = null;
  }

  /** Register a callback invoked when the user clicks "Load" on a history card. */
  onLoad(cb) { this._onLoadCallback = cb; }

  // ── Storage operations ───────────────────────────────────────────────────

  /**
   * Save a log to history.  Silently skips demo / non-Salesforce logs.
   */
  async save(logId, rawText, orgUrl, analysis, execMs) {
    // Only save real Salesforce debug log IDs (start with 07L)
    if (!logId || !logId.startsWith('07L')) return;

    const textKey = LogHistory.TEXT_PREFIX + logId;
    const entry = {
      logId,
      textKey,
      orgUrl:     orgUrl || '',
      timestamp:  Date.now(),
      soqlCount:  (analysis && analysis.soqlCount)  || 0,
      dmlCount:   (analysis && analysis.dmlCount)   || 0,
      errorCount: (analysis && (analysis.errors || []).length) || 0,
      execMs:     execMs  || 0,
      sizeBytes:  rawText ? rawText.length : 0,
    };

    return new Promise(resolve => {
      chrome.storage.local.get([LogHistory.INDEX_KEY], result => {
        let index = Array.isArray(result[LogHistory.INDEX_KEY])
          ? result[LogHistory.INDEX_KEY] : [];

        // Remove any existing entry for the same logId (dedup)
        index = index.filter(e => e.logId !== logId);

        // Insert new entry at the front (most-recent first)
        index.unshift(entry);

        // Evict oldest entries beyond the cap
        const evicted = index.splice(LogHistory.MAX_LOGS);

        const updates = {
          [LogHistory.INDEX_KEY]: index,
          [textKey]: rawText || '',
        };

        chrome.storage.local.set(updates, () => {
          // Clean up evicted log texts
          if (evicted.length > 0) {
            const keysToRemove = evicted.map(e => e.textKey || (LogHistory.TEXT_PREFIX + e.logId));
            chrome.storage.local.remove(keysToRemove);
          }
          resolve();
        });
      });
    });
  }

  /** Return raw log text for a history entry (null if not found). */
  async loadText(textKey) {
    return new Promise(resolve => {
      chrome.storage.local.get([textKey], result => {
        resolve(result[textKey] || null);
      });
    });
  }

  /** Remove a single history entry (both index record and raw text). */
  async delete(textKey, logId) {
    return new Promise(resolve => {
      chrome.storage.local.get([LogHistory.INDEX_KEY], result => {
        const index = (result[LogHistory.INDEX_KEY] || [])
          .filter(e => e.logId !== logId);
        chrome.storage.local.set({ [LogHistory.INDEX_KEY]: index }, () => {
          chrome.storage.local.remove([textKey], resolve);
        });
      });
    });
  }

  /** Wipe all history entries and their stored texts. */
  async clear() {
    return new Promise(resolve => {
      chrome.storage.local.get([LogHistory.INDEX_KEY], result => {
        const index   = result[LogHistory.INDEX_KEY] || [];
        const textKeys = index.map(e => e.textKey || (LogHistory.TEXT_PREFIX + e.logId));
        chrome.storage.local.remove([LogHistory.INDEX_KEY, ...textKeys], resolve);
      });
    });
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  /** Build and attach the slide-over panel + backdrop.  Call once on init. */
  init() {
    // Backdrop
    this._overlay = document.createElement('div');
    this._overlay.id = 'lh-overlay';
    Object.assign(this._overlay.style, {
      position:   'fixed',
      inset:      '0',
      zIndex:     '10000',
      background: 'rgba(0,0,0,0.38)',
      display:    'none',
      opacity:    '0',
      transition: 'opacity 0.25s ease',
    });
    this._overlay.addEventListener('click', () => this.hide());
    document.body.appendChild(this._overlay);

    // Panel
    this._panel = document.createElement('div');
    this._panel.id = 'lh-panel';
    Object.assign(this._panel.style, {
      position:   'fixed',
      top:        '0',
      right:      '0',
      bottom:     '0',
      width:      '340px',
      zIndex:     '10001',
      background: 'var(--bg-surface, #fff)',
      boxShadow:  '-4px 0 32px rgba(0,0,0,0.18)',
      display:    'flex',
      flexDirection: 'column',
      transform:  'translateX(100%)',
      transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      borderLeft: '1px solid var(--border-color, #e5e7eb)',
    });

    this._panel.innerHTML = `
      <!-- Header -->
      <div id="lh-header" style="
        padding:18px 16px 14px;
        border-bottom:1px solid var(--border-color,#e5e7eb);
        display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0;
      ">
        <div>
          <div style="font-weight:800;font-size:15px;color:var(--text-main,#111827);display:flex;align-items:center;gap:8px;">
            🕐 Log History
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Last ${LogHistory.MAX_LOGS} analyzed logs</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
          <button id="lh-clear-btn" style="
            background:#fff1f2;color:#be123c;border:1.5px solid #fecdd3;
            border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;
            cursor:pointer;box-shadow:none;
          ">Clear All</button>
          <button id="lh-close-btn" style="
            background:#f1f5f9;color:#334155;border:1.5px solid #e2e8f0;
            border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;
            cursor:pointer;box-shadow:none;
          ">✕</button>
        </div>
      </div>

      <!-- Storage note -->
      <div style="
        padding:7px 16px;font-size:10.5px;color:#94a3b8;
        background:var(--bg-main,#fafafa);border-bottom:1px solid var(--border-color,#e5e7eb);
        flex-shrink:0;line-height:1.5;
      ">
        Logs are stored locally in your browser. Only real Salesforce logs (07L…) are saved.
      </div>

      <!-- List -->
      <div id="lh-list" style="flex:1;overflow-y:auto;padding:12px 12px 20px;"></div>`;

    document.body.appendChild(this._panel);

    // Wire header buttons
    document.getElementById('lh-close-btn').addEventListener('click', () => this.hide());
    document.getElementById('lh-clear-btn').addEventListener('click', () => {
      if (window.confirm('Clear all log history? This cannot be undone.')) {
        this.clear().then(() => this._renderList());
      }
    });
  }

  /** Slide the panel in. */
  show() {
    if (!this._panel) return;
    this._renderList();
    this._overlay.style.display = 'block';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._overlay.style.opacity  = '1';
        this._panel.style.transform  = 'translateX(0)';
      });
    });
  }

  /** Slide the panel out. */
  hide() {
    if (!this._panel) return;
    this._overlay.style.opacity  = '0';
    this._panel.style.transform  = 'translateX(100%)';
    setTimeout(() => { this._overlay.style.display = 'none'; }, 290);
  }

  // ── List rendering ───────────────────────────────────────────────────────

  _renderList() {
    const listEl = document.getElementById('lh-list');
    if (!listEl) return;
    listEl.innerHTML = `
      <div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">
        Loading…
      </div>`;

    chrome.storage.local.get([LogHistory.INDEX_KEY], result => {
      const history = result[LogHistory.INDEX_KEY] || [];
      if (history.length === 0) {
        listEl.innerHTML = `
          <div style="text-align:center;padding:48px 16px;">
            <div style="font-size:36px;margin-bottom:12px;">📂</div>
            <div style="font-weight:700;font-size:13px;color:#64748b;margin-bottom:6px;">No logs saved yet</div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.6;max-width:230px;margin:0 auto;">
              Analyze a Salesforce log via the "Inspect with ApexLens" button and it will appear here.
            </div>
          </div>`;
        return;
      }

      listEl.innerHTML = '';
      history.forEach(entry => listEl.appendChild(this._makeCard(entry)));
    });
  }

  _makeCard(entry) {
    const card = document.createElement('div');
    card.style.cssText = [
      'background:var(--bg-surface,#fff)',
      'border:1.5px solid var(--border-color,#e2e8f0)',
      'border-radius:12px','padding:14px','margin-bottom:10px',
      'transition:border-color .18s,box-shadow .18s',
    ].join(';');

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#94a3b8';
      card.style.boxShadow   = '0 2px 12px rgba(0,0,0,0.07)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border-color,#e2e8f0)';
      card.style.boxShadow   = 'none';
    });

    const date    = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    const orgDisplay = entry.orgUrl
      ? entry.orgUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '').substring(0, 38)
      : 'Unknown Org';

    const execStr = entry.execMs > 0
      ? `${entry.execMs.toFixed(0)} ms`
      : '—';

    const sizeStr = entry.sizeBytes > 1024
      ? `${(entry.sizeBytes / 1024).toFixed(1)} KB`
      : `${entry.sizeBytes} B`;

    const errorBadge = entry.errorCount > 0
      ? `<span style="background:#fff1f2;color:#be123c;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">⚠ ${entry.errorCount} error${entry.errorCount > 1 ? 's' : ''}</span>`
      : '';

    card.innerHTML = `
      <!-- Row 1: Log ID + datetime -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;gap:8px;">
        <div style="overflow:hidden;min-width:0;">
          <div style="font-weight:700;font-size:11.5px;color:#0f172a;font-family:Consolas,monospace;word-break:break-all;">
            ${entry.logId}
          </div>
          <div style="font-size:10.5px;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
               title="${entry.orgUrl || ''}">
            ${orgDisplay}
          </div>
        </div>
        <div style="font-size:10px;color:#94a3b8;white-space:nowrap;text-align:right;flex-shrink:0;">
          <div>${dateStr}</div>
          <div>${timeStr}</div>
        </div>
      </div>

      <!-- Row 2: metric badges -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="background:#eff6ff;color:#1d4ed8;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">
          SOQL ${entry.soqlCount}
        </span>
        <span style="background:#faf5ff;color:#7e22ce;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">
          DML ${entry.dmlCount}
        </span>
        ${errorBadge}
        <span style="background:#f0fdf4;color:#15803d;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700;">
          ⏱ ${execStr}
        </span>
        <span style="background:#f8fafc;color:#64748b;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:600;">
          ${sizeStr}
        </span>
      </div>

      <!-- Row 3: actions -->
      <div style="display:flex;gap:7px;">
        <button class="lh-load-btn" style="
          flex:1;background:#0176d3;color:#fff;border:none;
          border-radius:8px;padding:7px 0;font-size:12px;font-weight:700;
          cursor:pointer;box-shadow:none;transition:background .15s;
        ">⬆ Load Log</button>
        <button class="lh-del-btn" title="Delete from history" style="
          background:#fff1f2;color:#be123c;border:1.5px solid #fecdd3;
          border-radius:8px;padding:7px 11px;font-size:13px;font-weight:700;
          cursor:pointer;box-shadow:none;
        ">🗑</button>
      </div>`;

    // Load
    card.querySelector('.lh-load-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.textContent = '⏳ Loading…';
      btn.disabled    = true;
      try {
        const textKey = entry.textKey || (LogHistory.TEXT_PREFIX + entry.logId);
        const text    = await this.loadText(textKey);
        if (text && this._onLoadCallback) {
          this.hide();
          this._onLoadCallback(text, entry.logId);
        } else {
          btn.textContent = '⚠ Not found';
          setTimeout(() => { btn.textContent = '⬆ Load Log'; btn.disabled = false; }, 2000);
        }
      } catch {
        btn.textContent = '⚠ Error';
        btn.disabled    = false;
      }
    });

    // Delete
    card.querySelector('.lh-del-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const textKey = entry.textKey || (LogHistory.TEXT_PREFIX + entry.logId);
      await this.delete(textKey, entry.logId);
      this._renderList();
    });

    return card;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LogHistory;
} else {
  window.LogHistory = LogHistory;
}
