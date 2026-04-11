/**
 * RawLogView — Log Explorer tab with virtual scrolling.
 *
 * Key improvements over the original:
 *  - Virtual scroll: only the rows visible in the viewport (+ an overscan
 *    buffer) are in the DOM at any time. For a 100 000-line log this means
 *    ~60 DOM nodes instead of 100 000 — the tab opens instantly.
 *  - All colours reference CSS variables from common.css / themes.css so the
 *    component respects whichever theme is active (no more hard-coded hex).
 *  - Event listeners are re-registered on every render call so there are no
 *    stale-closure leaks.
 *  - Export still works — it serialises the raw text array rather than cloning
 *    partial DOM.
 *  - Minimap is redrawn only when the filter or search changes, not on every
 *    scroll frame.
 */
class RawLogView {
  static ROW_H    = 22;   // px — fixed row height for virtual scroll maths
  static OVERSCAN = 30;   // extra rows rendered above and below the viewport

  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._logs            = [];        // all parsed log entries
    this._filteredIndices = [];        // indices into _logs for the current filter
    this._searchMatches   = [];        // indices into _filteredIndices that match the search
    this._searchActive    = -1;        // which match is highlighted
    this._activeFilter    = 'ALL';
    this._searchTerm      = '';
    this._rafPending      = false;     // rAF dedup flag for scroll handler
  }

  // ── Public entry point ────────────────────────────────────────────────────

  render(logs) {
    if (!this.container) return;
    this._logs = logs || [];
    this._filteredIndices = this._logs.map((_, i) => i); // start = show all
    this._activeFilter    = 'ALL';
    this._searchTerm      = '';
    this._searchMatches   = [];
    this._searchActive    = -1;

    this._buildSkeleton();
    this._applyFilter();
  }

  // ── DOM skeleton (built once per render call) ─────────────────────────────

  _buildSkeleton() {
    this.container.innerHTML = `
      <style>
        #raw-log-outer::-webkit-scrollbar { width: 8px; }
        #raw-log-outer::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
        #raw-log-outer::-webkit-scrollbar-track { background: transparent; }
        .rl-row {
          display: flex;
          white-space: nowrap;
          height: ${RawLogView.ROW_H}px;
          line-height: ${RawLogView.ROW_H}px;
          font-family: var(--font-mono);
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-subtle);
          overflow: hidden;
        }
        .rl-row:hover { background: var(--bg-sunken); }
        .rl-row.rl-search-match  { background: var(--syntax-search-match)  !important; }
        .rl-row.rl-search-active { background: var(--syntax-search-active) !important;
          outline: 2px solid var(--syntax-search-border); outline-offset: -2px; }
        .rl-gutter {
          width: 52px; flex-shrink: 0;
          text-align: right; padding-right: 8px;
          color: var(--text-disabled);
          background: var(--bg-gutter);
          border-right: 1px solid var(--border-gutter);
          margin-right: 8px;
          user-select: none;
          font-size: var(--font-size-xs);
        }
        .rl-cell { padding: 0 4px; flex: 1; overflow: hidden; text-overflow: ellipsis; }
        .chip-active { background: var(--brand-primary) !important; color: var(--brand-primary-text) !important; border-color: var(--brand-primary) !important; }
      </style>

      <!-- Controls bar -->
      <div style="margin-bottom:10px;display:flex;flex-direction:column;gap:8px;">

        <!-- Filter chips -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="rl-chip chip-active" data-filter="ALL"
            style="padding:5px 12px;border:1px solid var(--border-default);border-radius:var(--radius-full);background:transparent;color:var(--text-primary);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);transition:all 0.15s;white-space:nowrap;">
            All Events
          </button>
          <button class="rl-chip" data-filter="ERROR,EXCEPTION,FATAL"
            style="padding:5px 12px;border:1px solid var(--border-default);border-radius:var(--radius-full);background:transparent;color:var(--text-primary);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);transition:all 0.15s;white-space:nowrap;">
            Errors
          </button>
          <button class="rl-chip" data-filter="SOQL"
            style="padding:5px 12px;border:1px solid var(--border-default);border-radius:var(--radius-full);background:transparent;color:var(--text-primary);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);transition:all 0.15s;white-space:nowrap;">
            SOQL
          </button>
          <button class="rl-chip" data-filter="DML"
            style="padding:5px 12px;border:1px solid var(--border-default);border-radius:var(--radius-full);background:transparent;color:var(--text-primary);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);transition:all 0.15s;white-space:nowrap;">
            DML
          </button>
          <button class="rl-chip" data-filter="CALLOUT"
            style="padding:5px 12px;border:1px solid var(--border-default);border-radius:var(--radius-full);background:transparent;color:var(--text-primary);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);transition:all 0.15s;white-space:nowrap;">
            Callouts
          </button>
          <button class="rl-chip" data-filter="USER_DEBUG"
            style="padding:5px 12px;border:1px solid var(--border-default);border-radius:var(--radius-full);background:transparent;color:var(--text-primary);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);transition:all 0.15s;white-space:nowrap;">
            Debug
          </button>
          <div style="flex:1;"></div>
          <button id="rl-export-btn"
            style="padding:5px 12px;border:1px solid var(--status-success-border);border-radius:var(--radius-full);background:transparent;color:var(--status-success);cursor:pointer;font-size:var(--font-size-xs);font-weight:var(--font-weight-bold);white-space:nowrap;">
            Export HTML
          </button>
        </div>

        <!-- Search bar -->
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="rl-search" type="text" placeholder="Find in logs…"
            style="flex:1;padding:7px 10px;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);font-size:var(--font-size-base);outline:none;"/>
          <span id="rl-match-count"
            style="min-width:56px;text-align:center;font-size:var(--font-size-sm);color:var(--text-muted);">0/0</span>
          <button id="rl-prev"
            style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);cursor:pointer;font-size:15px;font-weight:bold;padding:0;">↑</button>
          <button id="rl-next"
            style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-default);border-radius:var(--radius-md);background:var(--bg-surface);color:var(--text-primary);cursor:pointer;font-size:15px;font-weight:bold;padding:0;">↓</button>
        </div>
      </div>

      <!-- Virtual scroll area + minimap -->
      <div style="position:relative;height:73vh;">
        <div id="raw-log-outer"
          style="height:100%;overflow-y:auto;background:var(--bg-code);position:relative;">
          <!-- inner spacer whose total height = filteredCount * ROW_H -->
          <div id="raw-log-inner" style="position:relative;width:100%;"></div>
        </div>
        <canvas id="raw-log-minimap" width="12" height="2000"
          style="position:absolute;right:0;top:0;width:12px;height:100%;border-left:1px solid var(--border-default);background:rgba(0,0,0,0.02);pointer-events:none;z-index:10;"></canvas>
      </div>
    `;

    this._outer   = document.getElementById('raw-log-outer');
    this._inner   = document.getElementById('raw-log-inner');
    this._minimap = document.getElementById('raw-log-minimap');

    this._wireControls();
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  _wireControls() {
    // Filter chips
    this.container.querySelectorAll('.rl-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.rl-chip').forEach(b => b.classList.remove('chip-active'));
        btn.classList.add('chip-active');
        this._activeFilter = btn.dataset.filter;
        this._applyFilter();
      });
    });

    // Search
    let debounce;
    document.getElementById('rl-search').addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this._searchTerm   = e.target.value.toLowerCase();
        this._searchActive = -1;
        this._computeSearchMatches();
        this._renderVisible();
        this._drawMinimap();
        if (this._searchMatches.length > 0) this._activateMatch(0);
      }, 150);
    });
    document.getElementById('rl-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('rl-next').click(); }
    });

    document.getElementById('rl-next').addEventListener('click', () => {
      if (!this._searchMatches.length) return;
      const next = (this._searchActive + 1) % this._searchMatches.length;
      this._activateMatch(next);
    });
    document.getElementById('rl-prev').addEventListener('click', () => {
      if (!this._searchMatches.length) return;
      const prev = (this._searchActive - 1 + this._searchMatches.length) % this._searchMatches.length;
      this._activateMatch(prev);
    });

    // Scroll → rAF-throttled virtual render
    this._outer.addEventListener('scroll', () => {
      if (this._rafPending) return;
      this._rafPending = true;
      requestAnimationFrame(() => {
        this._rafPending = false;
        this._renderVisible();
      });
    }, { passive: true });

    // Export
    document.getElementById('rl-export-btn').addEventListener('click', () => this._exportHtml());
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  _applyFilter() {
    const filter = this._activeFilter;
    if (filter === 'ALL') {
      this._filteredIndices = this._logs.map((_, i) => i);
    } else {
      const parts = filter.split(',');
      this._filteredIndices = [];
      for (let i = 0; i < this._logs.length; i++) {
        const ev = this._logs[i].event || '';
        if (parts.some(p => ev.includes(p))) this._filteredIndices.push(i);
      }
    }

    // Update the total height of the inner spacer so scrollbar is accurate
    this._inner.style.height = (this._filteredIndices.length * RawLogView.ROW_H) + 'px';

    this._searchTerm   = document.getElementById('rl-search')?.value?.toLowerCase() || '';
    this._searchActive = -1;
    this._computeSearchMatches();
    this._outer.scrollTop = 0;
    this._renderVisible();
    this._drawMinimap();
  }

  // ── Virtual scroll render ─────────────────────────────────────────────────

  _renderVisible() {
    const scrollTop    = this._outer.scrollTop;
    const viewH        = this._outer.clientHeight;
    const ROW_H        = RawLogView.ROW_H;
    const OVERSCAN     = RawLogView.OVERSCAN;
    const total        = this._filteredIndices.length;

    const firstVis = Math.floor(scrollTop / ROW_H);
    const lastVis  = Math.ceil((scrollTop + viewH) / ROW_H);
    const start    = Math.max(0, firstVis - OVERSCAN);
    const end      = Math.min(total - 1, lastVis + OVERSCAN);

    // Build a Set of active search-match positions in _filteredIndices for O(1) lookup
    const matchSet  = new Set(this._searchMatches);
    const activePos = this._searchActive >= 0
      ? this._searchMatches[this._searchActive]
      : -1;

    let html = '';
    for (let pos = start; pos <= end; pos++) {
      const logIdx = this._filteredIndices[pos];
      const log    = this._logs[logIdx];
      const isMatch  = matchSet.has(pos);
      const isActive = pos === activePos;

      let rowClass = 'rl-row';
      if (isActive)      rowClass += ' rl-search-active';
      else if (isMatch)  rowClass += ' rl-search-match';

      html += `<div class="${rowClass}" data-pos="${pos}" style="position:absolute;left:0;right:12px;top:${pos * ROW_H}px;">`;
      html += `<div class="rl-gutter">${log.lineNumber}</div>`;
      html += `<div class="rl-cell">${this._formatRow(log)}</div>`;
      html += `</div>`;
    }

    this._inner.innerHTML = html;
  }

  // ── Row formatter ─────────────────────────────────────────────────────────

  _formatRow(log) {
    if (log.event === 'HEADER') {
      if (log.raw.includes('Execute Anonymous:')) {
        return `<span style="color:var(--syntax-comment);">${this._esc(log.raw)}</span>`;
      }
      return `<span style="color:var(--text-muted);">${this._esc(log.raw)}</span>`;
    }

    let details = this._esc(log.details);

    // SOQL keyword highlighting
    if (log.event.includes('SOQL')) {
      details = details.replace(
        /\b(SELECT|FROM|WHERE|LIMIT|AND|OR|ORDER BY|GROUP BY|HAVING|IN|NOT IN|LIKE)\b/gi,
        `<span style="color:var(--syntax-soql-kw);font-weight:var(--font-weight-bold);">$1</span>`
      );
    }

    // Error styling
    if (log.event.match(/ERROR|EXCEPTION|FATAL/)) {
      details = `<span style="color:var(--status-error);font-weight:var(--font-weight-semibold);">${details}</span>`;
    }

    // [TOKEN] brackets
    details = details.replace(
      /\[([a-zA-Z0-9_\-]+)\]/g,
      `[<span style="color:var(--syntax-bracket);">$1</span>]`
    );

    // Numeric values after colon  (Rows:5, Bytes:1024)
    details = details.replace(
      /:(\d+)\b/g,
      `:<span style="color:var(--syntax-number);">$1</span>`
    );

    return (
      `<span style="color:var(--syntax-time);">${this._esc(log.time)}</span>` +
      `<span style="color:var(--text-muted);"> (${log.nanos || ''})</span>|` +
      `<span style="color:var(--syntax-event);font-weight:var(--font-weight-semibold);">${this._esc(log.event)}</span>|` +
      `${details}`
    );
  }

  // ── Search ────────────────────────────────────────────────────────────────

  _computeSearchMatches() {
    this._searchMatches = [];
    if (!this._searchTerm) {
      document.getElementById('rl-match-count').textContent = '0/0';
      return;
    }
    const term = this._searchTerm;
    for (let pos = 0; pos < this._filteredIndices.length; pos++) {
      const log = this._logs[this._filteredIndices[pos]];
      const text = (log.time + '|' + log.event + '|' + log.details).toLowerCase();
      if (text.includes(term)) this._searchMatches.push(pos);
    }
    this._updateMatchCount();
  }

  _activateMatch(idx) {
    this._searchActive = idx;
    this._updateMatchCount();
    // Scroll to the match position
    const pos       = this._searchMatches[idx];
    const targetTop = pos * RawLogView.ROW_H;
    const viewH     = this._outer.clientHeight;
    const scrollTop = this._outer.scrollTop;
    if (targetTop < scrollTop || targetTop + RawLogView.ROW_H > scrollTop + viewH) {
      this._outer.scrollTop = Math.max(0, targetTop - viewH / 2);
    }
    this._renderVisible();
  }

  _updateMatchCount() {
    const el = document.getElementById('rl-match-count');
    if (!el) return;
    if (!this._searchMatches.length) {
      el.textContent = '0/0';
    } else {
      el.textContent = `${this._searchActive + 1}/${this._searchMatches.length}`;
    }
  }

  // ── Minimap ───────────────────────────────────────────────────────────────

  _drawMinimap() {
    const canvas = this._minimap;
    if (!canvas) return;
    const ctx   = canvas.getContext('2d');
    const total = this._filteredIndices.length;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (total === 0) return;

    for (let pos = 0; pos < total; pos++) {
      const log = this._logs[this._filteredIndices[pos]];
      const ev  = log.event || '';
      let color = null;
      if (ev.match(/ERROR|EXCEPTION|FATAL/)) color = 'rgba(220,38,38,0.75)';
      else if (ev.includes('SOQL'))          color = 'rgba(59,130,246,0.75)';
      else if (ev.includes('DML'))           color = 'rgba(34,197,94,0.75)';
      if (!color) continue;

      const y = Math.floor((pos / total) * canvas.height);
      ctx.fillStyle = color;
      ctx.fillRect(0, y - 1, canvas.width, 3);
    }

    // Search matches in orange on top
    if (this._searchMatches.length > 0) {
      ctx.fillStyle = 'rgba(249,115,22,0.9)';
      for (const pos of this._searchMatches) {
        const y = Math.floor((pos / total) * canvas.height);
        ctx.fillRect(0, y - 1, canvas.width, 3);
      }
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  _exportHtml() {
    const rows = this._filteredIndices.map(i => {
      const log = this._logs[i];
      const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<div style="display:flex;white-space:pre;border-bottom:1px solid #f0f0f0;font-family:Consolas,monospace;font-size:12px;line-height:20px;">` +
        `<span style="width:52px;text-align:right;padding-right:8px;color:#999;background:#f5f5f5;border-right:1px solid #ddd;margin-right:8px;flex-shrink:0;">${log.lineNumber}</span>` +
        `<span>${esc(log.raw)}</span>` +
        `</div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Salesforce Log Export</title></head>` +
      `<body style="margin:0;padding:20px;background:#fff;"><h2 style="font-family:sans-serif;">Salesforce Apex Debug Log</h2>` +
      `<div>${rows}</div></body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a   = Object.assign(document.createElement('a'), { href: url, download: `apex-log-${Date.now()}.html` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

window.RawLogView = RawLogView;
