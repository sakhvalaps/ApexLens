/**
 * FlameGraph — Icicle-style flame graph for Salesforce Apex execution logs.
 *
 * Reads data from TreeBuilder.buildFullTree().
 * Each horizontal bar = one event/method, width ∝ total duration, colored by type.
 * Click any bar to zoom into its time range. Click the background to zoom out.
 */
class FlameGraph {
  static ROW_HEIGHT   = 26;
  static MIN_RENDER_W = 0.5;   // px — skip bars thinner than this
  static MIN_LABEL_W  = 52;    // px — skip labels in bars narrower than this
  static LABEL_CHAR_W = 6.4;   // approximate width per character in px (11px font)

  constructor(containerId) {
    this.container  = document.getElementById(containerId);
    this._data      = null;
    this._flatNodes = [];
    this._execStart = 0;
    this._totalDuration = 0;
    this._zoomStack     = [];        // [{start, end}]
    this._currentDomain = [0, 0];   // [relNsStart, relNsEnd]
    this._tooltip   = null;
    this._pendingData = null;
  }

  // ── Color by event type ──────────────────────────────────────────────────

  _colorForEvent(event) {
    const e = (event || '').toUpperCase();
    if (e === 'SOQL_EXECUTE')                         return '#ef4444';
    if (e === 'DML')                                   return '#f97316';
    if (e.includes('CALLOUT'))                         return '#10b981';
    if (e === 'METHOD')                                return '#3b82f6';
    if (e.includes('EXECUTION') || e === 'CODE_UNIT') return '#8b5cf6';
    if (e === 'USER_DEBUG')                            return '#64748b';
    return '#94a3b8';
  }

  // ── Label extraction ─────────────────────────────────────────────────────

  _label(node) {
    let s = node.details || '';
    // Strip pipe-delimited prefixes (e.g. "[5]|Aggregations:0|SELECT …")
    if (s.includes('|')) s = s.split('|').pop().trim();
    s = s || node.event || '';
    return s.length > 90 ? s.substring(0, 87) + '…' : s;
  }

  // ── Tree → flat array (DFS, skipping ROOT, normalising depth) ────────────

  _flatten(node, execStart, result = []) {
    if (!node) return result;

    if (node.event === 'ROOT') {
      for (const c of node.children || []) this._flatten(c, execStart, result);
      return result;
    }

    // Skip zero-duration leaf events (USER_DEBUG, LIMIT_USAGE, etc.)
    // — they appear as instant spikes with no meaningful width.
    if (node.durationNs > 0 || (node.children && node.children.length > 0)) {
      result.push({
        id:         node.id,
        event:      node.event || '',
        details:    node.details || '',
        depth:      node.depth - 1,          // ROOT=0 → EXECUTION shows at row 0
        relStart:   node.timeNs - execStart,
        durationNs: node.durationNs,
        selfTimeNs: node.selfTimeNs || 0,
        timeNs:     node.timeNs,
      });
    }

    for (const c of node.children || []) this._flatten(c, execStart, result);
    return result;
  }

  // ── Entry point ──────────────────────────────────────────────────────────

  render(fullTreeData) {
    if (!this.container) return;
    this._data      = fullTreeData;
    this._zoomStack = [];

    // Find the first child of ROOT that has actual duration (the EXECUTION node)
    const execNode = (fullTreeData.children || []).find(c => c.durationNs > 0)
                   || (fullTreeData.children || [])[0];

    if (!execNode || !execNode.durationNs) {
      this.container.innerHTML = `
        <div style="padding:70px 24px;text-align:center;">
          <div style="font-size:44px;margin-bottom:14px;">📊</div>
          <div style="font-size:15px;font-weight:700;color:#64748b;margin-bottom:6px;">No timing data available</div>
          <div style="font-size:13px;color:#94a3b8;line-height:1.6;max-width:300px;margin:0 auto;">
            Enable <strong>Apex Code</strong> profiling in your debug log levels to see<br>
            method-level flame graph data.
          </div>
        </div>`;
      return;
    }

    this._execStart     = execNode.timeNs;
    this._totalDuration = execNode.durationNs;
    this._flatNodes     = this._flatten(fullTreeData, this._execStart);
    this._currentDomain = [0, this._totalDuration];

    this._buildShell();
    this._drawBars();
  }

  // ── Build container HTML ─────────────────────────────────────────────────

  _buildShell() {
    this.container.innerHTML = '';
    // Do NOT set display here — CSS classes (.panel / .panel.active) control visibility.
    // Setting display:flex inline would override display:none and leak into all tabs.
    this.container.style.position    = 'relative';
    this.container.style.height      = '100%';
    this.container.style.overflow    = 'hidden';
    // flex-direction is applied by #flame-graph.panel.active in sidepanel.css

    // ── Toolbar ──
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'padding:12px 16px 8px;display:flex;align-items:center;gap:10px;flex-shrink:0;border-bottom:1px solid var(--border-color,#e5e7eb);background:var(--bg-surface,#fff);';

    const title = document.createElement('span');
    title.style.cssText = 'font-weight:800;font-size:14px;color:var(--text-main,#111827);flex-shrink:0;';
    title.textContent = 'Flame Graph';
    toolbar.appendChild(title);

    const breadcrumb = document.createElement('div');
    breadcrumb.id = 'fg-breadcrumb';
    breadcrumb.style.cssText = 'flex:1;font-size:11.5px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    toolbar.appendChild(breadcrumb);

    const resetBtn = document.createElement('button');
    resetBtn.id = 'fg-reset';
    resetBtn.innerHTML = '↺&nbsp;Reset';
    resetBtn.style.cssText = [
      'background:#f1f5f9','color:#334155','border:1.5px solid #e2e8f0',
      'border-radius:7px','padding:4px 11px','font-size:11.5px','font-weight:700',
      'cursor:pointer','white-space:nowrap','flex-shrink:0','box-shadow:none',
    ].join(';');
    resetBtn.addEventListener('mouseenter', () => resetBtn.style.background = '#e2e8f0');
    resetBtn.addEventListener('mouseleave', () => resetBtn.style.background = '#f1f5f9');
    resetBtn.addEventListener('click', () => this._resetZoom());
    toolbar.appendChild(resetBtn);
    this.container.appendChild(toolbar);

    // ── Legend ──
    const legend = document.createElement('div');
    legend.style.cssText = 'padding:6px 16px;display:flex;gap:14px;flex-wrap:wrap;flex-shrink:0;background:var(--bg-surface,#fff);border-bottom:1px solid var(--border-color,#e5e7eb);';
    [
      { label: 'Execution / Code Unit', color: '#8b5cf6' },
      { label: 'Method',                color: '#3b82f6' },
      { label: 'SOQL',                  color: '#ef4444' },
      { label: 'DML',                   color: '#f97316' },
      { label: 'Callout',               color: '#10b981' },
      { label: 'Other',                 color: '#94a3b8' },
    ].forEach(({ label, color }) => {
      const item = document.createElement('span');
      item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:10.5px;color:#64748b;';
      item.innerHTML = `<span style="width:9px;height:9px;border-radius:2px;background:${color};flex-shrink:0;"></span>${label}`;
      legend.appendChild(item);
    });
    this.container.appendChild(legend);

    // ── Hint ──
    const hint = document.createElement('div');
    hint.style.cssText = 'padding:4px 16px;font-size:10.5px;color:#94a3b8;flex-shrink:0;background:var(--bg-surface,#fff);';
    hint.textContent = '💡 Click a bar to zoom in · click the background to zoom out · darker right edge = self-time';
    this.container.appendChild(hint);

    // ── SVG wrapper (scrollable) ──
    const wrapper = document.createElement('div');
    wrapper.id = 'fg-wrapper';
    wrapper.style.cssText = 'flex:1;overflow:auto;padding:8px 16px 20px;background:var(--bg-main,#fafafa);';
    this.container.appendChild(wrapper);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'fg-svg';
    svg.style.cssText = 'display:block;overflow:hidden;';
    wrapper.appendChild(svg);

    // ── Shared tooltip (appended to body so it escapes overflow clips) ──
    let tip = document.getElementById('fg-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'fg-tooltip';
      document.body.appendChild(tip);
    }
    tip.style.cssText = [
      'position:fixed','pointer-events:none','z-index:999999',
      'background:rgba(15,23,42,0.96)','color:#f8fafc',
      'border-radius:10px','padding:11px 15px','font-size:12px',
      'line-height:1.65','max-width:360px','word-break:break-word',
      'box-shadow:0 8px 28px rgba(0,0,0,0.38)',
      'display:none','font-family:inherit',
      'border:1px solid rgba(255,255,255,0.08)',
    ].join(';');
    this._tooltip = tip;
  }

  // ── Render bars for current domain ──────────────────────────────────────

  _drawBars() {
    const wrapper = document.getElementById('fg-wrapper');
    const svg     = document.getElementById('fg-svg');
    if (!wrapper || !svg) return;

    const [domStart, domEnd] = this._currentDomain;
    const domainNs = domEnd - domStart;
    if (domainNs <= 0) return;

    const containerW = wrapper.clientWidth  || 580;
    const svgWidth   = Math.max(containerW - 4, 400);

    // Nodes that overlap the current zoom window
    const visible = this._flatNodes.filter(n => {
      const nEnd = n.relStart + n.durationNs;
      return (n.durationNs > 0)
          && (nEnd    > domStart)
          && (n.relStart < domEnd);
    });

    const maxDepth = visible.reduce((m, n) => Math.max(m, n.depth), 0);
    const ROW      = FlameGraph.ROW_HEIGHT;
    const svgH     = (maxDepth + 1) * ROW + 8;

    svg.setAttribute('width',  svgWidth);
    svg.setAttribute('height', svgH);
    svg.innerHTML = '';

    // ── Scale helpers ──
    const xScale = ns  => ((ns - domStart) / domainNs) * svgWidth;
    const wScale = dur => (dur / domainNs) * svgWidth;

    const self = this;

    // ── Draw transparent click-background for zoom-out ──
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', 0);
    bg.setAttribute('y', 0);
    bg.setAttribute('width',  svgWidth);
    bg.setAttribute('height', svgH);
    bg.setAttribute('fill', 'transparent');
    bg.style.cursor = this._zoomStack.length > 0 ? 'zoom-out' : 'default';
    bg.addEventListener('click', () => {
      if (self._zoomStack.length > 0) self._zoomOut();
    });
    svg.appendChild(bg);

    // ── Draw each visible bar ──
    visible.forEach(n => {
      const rawX = xScale(n.relStart);
      const rawW = wScale(n.durationNs);

      // Clamp to SVG boundaries
      const x = Math.max(0, rawX);
      const w = Math.min(rawW, svgWidth - x);

      if (w < FlameGraph.MIN_RENDER_W) return;

      const y    = n.depth * ROW;
      const fill = self._colorForEvent(n.event);

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.cursor = n.durationNs > 0 ? 'zoom-in' : 'default';

      // ── Main rect ──
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x',      x);
      rect.setAttribute('y',      y + 1);
      rect.setAttribute('width',  w);
      rect.setAttribute('height', ROW - 2);
      rect.setAttribute('rx',     '3');
      rect.setAttribute('fill',   fill);
      rect.setAttribute('opacity','0.86');
      g.appendChild(rect);

      // ── Self-time overlay (darker right segment) ──
      if (n.selfTimeNs > 0 && n.durationNs > 0) {
        const selfFrac = Math.min(1, n.selfTimeNs / n.durationNs);
        const selfW    = selfFrac * w;
        if (selfW >= 1.5) {
          const sr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          sr.setAttribute('x',      x + w - selfW);
          sr.setAttribute('y',      y + 1);
          sr.setAttribute('width',  selfW);
          sr.setAttribute('height', ROW - 2);
          sr.setAttribute('rx',     '3');
          sr.setAttribute('fill',   '#000');
          sr.setAttribute('opacity','0.18');
          g.appendChild(sr);
        }
      }

      // ── Text label ──
      if (w >= FlameGraph.MIN_LABEL_W) {
        const rawLabel = self._label(n);
        const maxChars = Math.max(0, Math.floor((w - 10) / FlameGraph.LABEL_CHAR_W));
        const label    = maxChars >= 4
          ? (rawLabel.length > maxChars ? rawLabel.substring(0, maxChars - 1) + '…' : rawLabel)
          : '';

        if (label) {
          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x',            x + 5);
          txt.setAttribute('y',            y + ROW / 2 + 4);
          txt.setAttribute('font-size',    '11');
          txt.setAttribute('fill',         '#fff');
          txt.setAttribute('font-family',  'Inter, -apple-system, sans-serif');
          txt.setAttribute('pointer-events','none');
          txt.textContent = label;
          g.appendChild(txt);
        }
      }

      // ── Interactions ──
      g.addEventListener('mouseenter', e => {
        rect.setAttribute('opacity', '1');
        self._showTooltip(e, n);
      });
      g.addEventListener('mousemove',  e => self._moveTooltip(e));
      g.addEventListener('mouseleave', () => {
        rect.setAttribute('opacity', '0.86');
        self._hideTooltip();
      });
      g.addEventListener('click', e => {
        e.stopPropagation();
        if (n.durationNs > 0) self._zoomTo(n);
      });

      svg.appendChild(g);
    });

    this._updateBreadcrumb();
  }

  // ── Zoom actions ─────────────────────────────────────────────────────────

  _zoomTo(node) {
    const [cs, ce] = this._currentDomain;
    this._zoomStack.push({ start: cs, end: ce });
    this._currentDomain = [node.relStart, node.relStart + node.durationNs];
    this._drawBars();
  }

  _zoomOut() {
    if (this._zoomStack.length === 0) return;
    const prev = this._zoomStack.pop();
    this._currentDomain = [prev.start, prev.end];
    this._drawBars();
  }

  _resetZoom() {
    this._zoomStack     = [];
    this._currentDomain = [0, this._totalDuration];
    this._drawBars();
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────

  _updateBreadcrumb() {
    const bc = document.getElementById('fg-breadcrumb');
    if (!bc) return;

    const [cs, ce]  = this._currentDomain;
    const totalMs   = (this._totalDuration / 1e6).toFixed(2);
    const shownMs   = ((ce - cs) / 1e6).toFixed(2);
    const pct       = this._totalDuration > 0
      ? (((ce - cs) / this._totalDuration) * 100).toFixed(0)
      : 100;
    const depth     = this._zoomStack.length;

    bc.textContent = depth === 0
      ? `Total: ${totalMs} ms`
      : `Showing ${shownMs} ms of ${totalMs} ms (${pct}%) · ${depth} level${depth > 1 ? 's' : ''} deep`;
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────

  _showTooltip(e, n) {
    if (!this._tooltip) return;

    const durMs   = (n.durationNs  / 1e6).toFixed(3);
    const selfMs  = (n.selfTimeNs  / 1e6).toFixed(3);
    const childMs = ((n.durationNs - n.selfTimeNs) / 1e6).toFixed(3);
    const pct     = this._totalDuration > 0
      ? ((n.durationNs / this._totalDuration) * 100).toFixed(1) : '0';

    const label = this._label(n);
    const color = this._colorForEvent(n.event);

    this._tooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:10px;height:10px;border-radius:2px;background:${color};flex-shrink:0;"></span>
        <span style="font-weight:700;font-size:12px;color:#f1f5f9;word-break:break-all;">${label || n.event}</span>
      </div>
      <div style="font-size:10.5px;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em;">${n.event}</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 18px;font-size:11.5px;">
        <span style="color:#94a3b8;">Total</span>      <span style="font-weight:700;color:#38bdf8;">${durMs} ms</span>
        <span style="color:#94a3b8;">Self</span>       <span style="font-weight:700;color:#a78bfa;">${selfMs} ms</span>
        <span style="color:#94a3b8;">Children</span>   <span style="font-weight:700;color:#fb923c;">${childMs} ms</span>
        <span style="color:#94a3b8;">% of exec</span> <span style="font-weight:700;color:#34d399;">${pct}%</span>
      </div>`;

    this._tooltip.style.display = 'block';
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    if (!this._tooltip) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let  tx  = e.clientX + 16, ty = e.clientY - 12;
    if (tx + 375 > vw) tx = e.clientX - 380;
    if (ty + 160 > vh) ty = e.clientY - 170;
    this._tooltip.style.left = tx + 'px';
    this._tooltip.style.top  = ty + 'px';
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = 'none';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlameGraph;
} else {
  window.FlameGraph = FlameGraph;
}
