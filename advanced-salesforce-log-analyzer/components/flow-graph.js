class FlowGraph {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.searchTerm = '';
    this.matchedIds = new Set();
    this.highlightedIds = new Set();
    this.matchedList = [];
    this.currentMatchIndex = -1;
    this._filteredRoot = null;
    this._injectStyles();
  }

  _injectStyles() {
    if (document.getElementById('flow-graph-styles')) return;
    const style = document.createElement('style');
    style.id = 'flow-graph-styles';
    style.textContent = `
      @keyframes floatingDash {
        0%   { outline-offset: 3px; outline-color: rgba(234, 179, 8, 1); box-shadow: 0 0 0 6px rgba(234,179,8,0.2), 0 0 25px rgba(234,179,8,0.4); }
        50%  { outline-offset: 7px; outline-color: rgba(234, 179, 8, 0.4);  box-shadow: 0 0 0 10px rgba(234,179,8,0.05), 0 0 45px rgba(234,179,8,0.2); }
        100% { outline-offset: 3px; outline-color: rgba(234, 179, 8, 1); box-shadow: 0 0 0 6px rgba(234,179,8,0.2), 0 0 25px rgba(234,179,8,0.4); }
      }
      @keyframes matchPulse {
        0%   { outline-offset: 2px; box-shadow: 0 0 0 4px rgba(202,138,4,0.25), 0 6px 15px rgba(0,0,0,0.15); }
        50%  { outline-offset: 5px; box-shadow: 0 0 0 7px rgba(202,138,4,0.12), 0 10px 25px rgba(0,0,0,0.18); }
        100% { outline-offset: 2px; box-shadow: 0 0 0 4px rgba(202,138,4,0.25), 0 6px 15px rgba(0,0,0,0.15); }
      }
      .flow-card-current-match {
        outline: 3px dashed #eab308 !important;
        outline-offset: 3px;
        animation: floatingDash 1.8s ease-in-out infinite !important;
        border-color: transparent !important;
        background: rgba(254, 252, 232, 0.95) !important;
        backdrop-filter: blur(8px);
        z-index: 100;
      }
      .flow-card-match {
        outline: 2.5px dashed rgba(202, 138, 4, 0.8) !important;
        outline-offset: 2px;
        animation: matchPulse 2.2s ease-in-out infinite !important;
        border-color: transparent !important;
        background: rgba(254, 249, 195, 0.9) !important;
        backdrop-filter: blur(6px);
      }
      .flow-card {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
      }
      .flow-card:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1) !important;
      }
      .flow-search-input {
        transition: all 0.2s ease;
      }
      .flow-search-input:focus-within {
        border-color: #0176d3 !important;
        box-shadow: 0 0 0 4px rgba(1, 118, 211, 0.15) !important;
        transform: scale(1.01);
      }
    `;
    document.head.appendChild(style);
  }

  render(treeData) {
    if (!this.container || !treeData || treeData.length === 0) {
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 75vh; text-align: center; padding: 40px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
          </svg>
          <h3 style="font-size: 18px; font-weight: 600; color: var(--text-main); margin: 0 0 8px 0;">No Method Execution Data</h3>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 280px; margin: 0 0 24px 0; line-height: 1.6;">No method calls were found in this log. Check the Execution Tree for raw event data.</p>
          <button id="go-to-exec-tree" style="font-size: 13px; padding: 10px 20px; background: var(--primary-color); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"></path><path d="m8 7 4-4 4 4"></path><path d="m8 17 4 4 4-4"></path></svg>
            View Execution Tree
          </button>
        </div>
      `;
      document.getElementById('go-to-exec-tree').addEventListener('click', () => {
        document.querySelector('.tab[data-target="raw-tree"]').click();
      });
      return;
    }
    
    this.container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; padding: 0 2px;">
        <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main); letter-spacing: -0.01em;">Execution Flow Graph</h2>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <div id="search-container" class="flow-search-input" style="display: flex; align-items: center; gap: 6px; background: #ffffff; border: 1.5px solid var(--border-color); border-radius: 10px; padding: 5px 10px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="flow-search" type="text" placeholder="Search method name…" style="font-size: 12px; padding: 2px 4px; border: none; background: transparent; outline: none; font-family: inherit; width: 170px; color: var(--text-main);" />
            <button id="flow-search-btn" style="font-size: 11px; padding: 3px 10px; background: #0176d3; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; letter-spacing: 0.02em;">Search</button>
            <span id="search-count" style="font-size: 11px; color: var(--text-muted); min-width: 52px; font-weight: 600; text-align: center;"></span>
            <button id="search-prev-btn" title="Previous match" style="font-size: 12px; padding: 2px 7px; display: none; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 5px; cursor: pointer; color: #374151; font-weight: 700;">↑</button>
            <button id="search-next-btn" title="Next match" style="font-size: 12px; padding: 2px 7px; display: none; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 5px; cursor: pointer; color: #374151; font-weight: 700;">↓</button>
            <button id="search-clear-btn" style="font-size: 11px; padding: 3px 10px; display: none; background: #fef2f2; border: 1px solid #fecaca; border-radius: 5px; color: #dc2626; cursor: pointer; font-weight: 700;">✕</button>
          </div>

          <button id="expand-all-btn" style="font-size: 12px; padding: 6px 13px; background: #f8fafc; border: 1.5px solid #e2e8f0; color: #374151; border-radius: 8px; font-weight: 600;">Expand All</button>
          <button id="collapse-all-btn" style="font-size: 12px; padding: 6px 13px; background: #f8fafc; border: 1.5px solid #e2e8f0; color: #374151; border-radius: 8px; font-weight: 600;">Collapse All</button>
          <span style="font-size: 11px; color: var(--text-muted); background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 10px; white-space: nowrap;">
            <b>Scroll</b> zoom &nbsp;·&nbsp; <b>Drag</b> pan &nbsp;·&nbsp; <b>Click</b> expand
          </span>
        </div>
      </div>
      <div id="flow-layout" style="display: flex; gap: 14px; height: 75vh;">
        <div id="d3-canvas" style="flex: 1; border: 1.5px solid var(--border-color); border-radius: 12px; overflow: hidden; background: #fdfdfd; position: relative;">
          <button id="reset-view-btn" style="position: absolute; top: 12px; right: 12px; z-index: 10; display: flex; align-items: center; gap: 6px; background: #fff; border: 1.5px solid var(--border-color); border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.08); font-family: inherit; color: var(--text-main); transition: all 0.2s; font-weight: 500;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            Reset View
          </button>
        </div>
      </div>
    `;


    this.bindSearch();

    document.getElementById('expand-all-btn').addEventListener('click', () => this.expandAll());
    document.getElementById('collapse-all-btn').addEventListener('click', () => this.collapseAll());
    document.getElementById('reset-view-btn').addEventListener('click', () => this.recenter());
    
    const rootData = treeData[0]; 
    
    const containerRect = document.getElementById("flow-layout").getBoundingClientRect();
    const width = containerRect.width || 800;
    const height = containerRect.height || 600;


    
    const svg = d3.select("#d3-canvas").append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    this.svgEl = svg;
    this.zoomGroup = svg.append("g");
    
    this.zoomBehavior = d3.zoom()
      .scaleExtent([0.15, 3])
      .on("zoom", (event) => {
        this.zoomGroup.attr("transform", event.transform);
      });
    
    this.svgEl.call(this.zoomBehavior);
    
    this.initialTransform = d3.zoomIdentity.translate(80, height / 2 - 50).scale(0.85);
    this.svgEl.call(this.zoomBehavior.transform, this.initialTransform);

    let i = 0;
    const duration = 450;
    
    this._treeData = treeData;
    this.root = d3.hierarchy(rootData, d => d.children);
    this.root.x0 = height / 2;
    this.root.y0 = 0;
    
    let idCounter = 0;
    this.root.each(d => { d._uid = ++idCounter; });
    
    const measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    
    // --- Spacing & sizing constants (generous breathing room) ---
    const NODE_PADDING_X = 38;
    const NODE_PADDING_Y = 28;
    const MAX_NODE_WIDTH = 400;
    const MIN_NODE_WIDTH = 240;
    const LINE_HEIGHT = 17;
    const TOP_ROW_HEIGHT = 22;
    const BOTTOM_ROW_HEIGHT = 18;
    const GAP_BETWEEN_ROWS = 8;
    // Extra vertical gap between sibling nodes
    const SIBLING_GAP = 36;
    // Extra horizontal gap between depth levels
    const DEPTH_GAP = 80;

    const computeNodeSize = (d) => {
      const displayName = d.data.name || d.data.event || "Unknown";
      ctx.font = '600 12px Inter, sans-serif';
      const textMetrics = ctx.measureText(displayName);
      const badgeWidth = 44;
      const neededWidth = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, textMetrics.width + badgeWidth + NODE_PADDING_X));
      
      const charsPerLine = Math.floor((neededWidth - badgeWidth - NODE_PADDING_X) / 7.2);
      const lines = Math.max(1, Math.ceil(displayName.length / charsPerLine));
      const nameBlockHeight = lines * LINE_HEIGHT;
      
      const neededHeight = TOP_ROW_HEIGHT + GAP_BETWEEN_ROWS + nameBlockHeight + GAP_BETWEEN_ROWS + BOTTOM_ROW_HEIGHT + NODE_PADDING_Y;
      
      d._nodeWidth = neededWidth;
      d._nodeHeight = Math.max(76, neededHeight);
    };

    this.root.each(computeNodeSize);
    
    const maxNodeWidth = Math.max(...this.root.descendants().map(d => d._nodeWidth));
    const maxNodeHeight = Math.max(...this.root.descendants().map(d => d._nodeHeight));
    
    // Generous spacing: add SIBLING_GAP between siblings, DEPTH_GAP between levels
    const horizontalSpacing = maxNodeWidth + DEPTH_GAP;
    const verticalSpacing = maxNodeHeight + SIBLING_GAP;

    const tree = d3.tree().nodeSize([verticalSpacing, horizontalSpacing]);

    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    // Show root + its direct children expanded; collapse only deeper levels.
    // This gives users an immediate readable overview without an empty canvas.
    const collapseDeep = (d, depth) => {
      if (depth >= 2) {
        collapse(d);
      } else if (d.children) {
        d.children.forEach(c => collapseDeep(c, depth + 1));
      }
    };
    collapseDeep(this.root, 0);

    const getEventBadge = (node) => {
      const evt = (node.data.event || '').toUpperCase();
      if (evt.includes('SOQL'))      return { label: 'SOQL',    color: '#dc2626', bg: '#fef2f2' };
      if (evt.includes('DML'))       return { label: 'DML',     color: '#7c3aed', bg: '#f5f3ff' };
      if (evt.includes('CALLOUT'))   return { label: 'CALLOUT', color: '#d97706', bg: '#fffbeb' };
      if (evt.includes('METHOD'))    return { label: 'METHOD',  color: '#0176d3', bg: '#eff6ff' };
      if (evt.includes('EXECUTION')) return { label: 'EXEC',    color: '#059669', bg: '#ecfdf5' };
      if (evt.includes('CODE_UNIT')) return { label: 'UNIT',    color: '#475569', bg: '#f8fafc' };
      return { label: evt.substring(0, 6), color: '#6b7280', bg: '#f9fafb' };
    };

    const getNodeStyle = (d) => {
      const ms = d.data.durationNs
        ? d.data.durationNs / 1000000
        : (d.data.durationNanos ? d.data.durationNanos / 1000000 : 0);
      
      if (d.depth === 0)  return { bg: "#0176d3", border: "#015ba7", text: "#ffffff", subtext: "#bfdbfe", btnBg: "#ffffff", btnText: "#0176d3" };
      if (ms > 200)       return { bg: "#fff5f5", border: "#ef4444", text: "#7f1d1d", subtext: "#991b1b", btnBg: "#ef4444", btnText: "#ffffff" };
      if (d.depth === 1)  return { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a", subtext: "#1d4ed8", btnBg: "#3b82f6", btnText: "#ffffff" };
      if (d.depth === 2)  return { bg: "#fffbeb", border: "#f59e0b", text: "#78350f", subtext: "#92400e", btnBg: "#f59e0b", btnText: "#ffffff" };
      if (d.depth === 3)  return { bg: "#f0fdf4", border: "#22c55e", text: "#14532d", subtext: "#166534", btnBg: "#22c55e", btnText: "#ffffff" };
      return { bg: "#f9fafb", border: "#94a3b8", text: "#1f2937", subtext: "#4b5563", btnBg: "#94a3b8", btnText: "#ffffff" };
    };

    const self = this;

    const toggleNode = (d) => {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else if (d._children) {
        d.children = d._children;
        d._children = null;
      }
      this.updateFn(d);
    };

    // Highlight only the matched portion of the method name
    const highlightText = (text, term) => {
      if (!term) return text;
      const lower = text.toLowerCase();
      const idx = lower.indexOf(term.toLowerCase());
      if (idx === -1) return text;
      const before = text.substring(0, idx);
      const match  = text.substring(idx, idx + term.length);
      const after  = text.substring(idx + term.length);
      return `${before}<mark style="background:#fde047;color:#713f12;border-radius:3px;padding:0 2px;font-weight:700;">${match}</mark>${after}`;
    };

    // Function to render/refresh a card's content
    const refreshCard = function(d) {
      const cardContainer = d3.select(this);
      cardContainer.selectAll("*").remove(); // Re-render from scratch to ensure highlights are fresh

      const style      = getNodeStyle(d);
      const msRaw      = d.data.durationNs ? d.data.durationNs / 1000000 : (d.data.durationNanos ? d.data.durationNanos / 1000000 : 0);
      const ms         = msRaw.toFixed(2);
      const pct        = d.data.durationNs && d.parent && d.parent.data.durationNs
        ? ((d.data.durationNs / d.parent.data.durationNs) * 100).toFixed(1)
        : (d.data.durationNanos && d.parent && d.parent.data.durationNanos
            ? ((d.data.durationNanos / d.parent.data.durationNanos) * 100).toFixed(1)
            : "0.0");
      const badge       = getEventBadge(d);
      const displayName = d.data.name || d.data.event || "Unknown";
      const hasChildren = d.children || d._children;

      const isCurrentMatch = self.currentMatchIndex >= 0 && self.matchedList && self.matchedList[self.currentMatchIndex] === d._uid;
      const isMatch        = self.matchedIds.has(d._uid);
      const isOnPath       = self.searchTerm && self.highlightedIds.has(d._uid) && !isMatch;
      const isDimmed       = self.searchTerm && !self.highlightedIds.has(d._uid);

      let extraClass = '';
      if (isCurrentMatch) extraClass = 'flow-card-current-match';
      else if (isMatch)   extraClass = 'flow-card-match';

      let cardBg     = style.bg;
      let cardBorder = style.border;
      let cardShadow = "0 2px 8px -1px rgba(0,0,0,0.08), 0 1px 4px -1px rgba(0,0,0,0.06)";
      let cardOpacity = 1;

      if (isDimmed) cardOpacity = 0;
      else if (isOnPath) {
        cardShadow = "0 4px 12px -2px rgba(0,0,0,0.12)";
        cardOpacity = 0.9;
      }

      const card = cardContainer.append("div")
        .attr("class", `flow-card ${extraClass}`)
        .style("width",           "100%")
        .style("height",          "100%")
        .style("background",      cardBg)
        .style("border",          (isMatch || isCurrentMatch) ? "none" : `1.5px solid ${cardBorder}`)
        .style("border-left",     (isMatch || isCurrentMatch) ? "none" : `4px solid ${badge.color}`)
        .style("border-radius",   "10px")
        .style("box-shadow",      cardShadow)
        .style("opacity",         cardOpacity)
        .style("display",         "flex")
        .style("flex-direction",  "column")
        .style("justify-content", "space-between")
        .style("padding",         "10px 12px")
        .style("box-sizing",      "border-box")
        .style("position",        "relative")
        .style("cursor",          hasChildren ? "pointer" : "default")
        .on("click", (event) => {
          event.stopPropagation();
          if (hasChildren) toggleNode(d);
        });

      const topRow = card.append("div")
        .style("display", "flex")
        .style("align-items", "flex-start")
        .style("gap", "8px")
        .style("width", "100%");

      topRow.append("span")
        .style("font-size", "9px")
        .style("font-weight", "700")
        .style("color", badge.color)
        .style("background", badge.bg)
        .style("border", `1px solid ${badge.color}33`)
        .style("border-radius", "5px")
        .style("padding", "2px 6px")
        .style("white-space", "nowrap")
        .style("flex-shrink", "0")
        .style("margin-top", "2px")
        .text(badge.label);

      const nameDiv = topRow.append("div")
        .style("font-weight", "600")
        .style("font-size", "12px")
        .style("color", (isMatch || isCurrentMatch) ? "#1c1917" : style.text)
        .style("white-space", "normal")
        .style("word-break", "break-word")
        .style("line-height", "1.4")
        .style("flex", "1");

      if (self.searchTerm && (isMatch || isCurrentMatch)) {
        nameDiv.html(highlightText(displayName, self.searchTerm));
      } else {
        nameDiv.text(displayName);
      }

      const bottomRow = card.append("div")
        .style("display", "flex")
        .style("justify-content", "space-between")
        .style("align-items", "center")
        .style("width", "100%")
        .style("margin-top", "6px")
        .style("padding-top", "6px")
        .style("border-top", d.depth === 0 ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(0,0,0,0.06)");

      bottomRow.append("span")
        .style("font-size", "11px")
        .style("color", d.depth === 0 ? "#bfdbfe" : style.subtext)
        .style("font-weight", "500")
        .html(`⏱ <b>${ms}ms</b> <span style="opacity:0.7">(${pct}%)</span>`);

      const callerName  = d.data.callerName || (d.parent ? (d.parent.data.name || d.parent.data.event || '—') : '—');
      const shortCaller = callerName.length > 24 ? callerName.substring(0, 24) + '…' : callerName;
      bottomRow.append("span")
        .style("font-size", "10px")
        .style("color", d.depth === 0 ? "#bfdbfe" : "#9ca3af")
        .style("font-style", "italic")
        .text(`← ${shortCaller}`);

      if (isMatch || isCurrentMatch) {
        const idx = self.matchedList.indexOf(d._uid);
        const isCurrent = idx === self.currentMatchIndex;
        card.append("div")
          .style("position", "absolute")
          .style("top", "-11px")
          .style("left", "-8px")
          .style("background", isCurrent ? "#eab308" : "#f59e0b")
          .style("color", "#fff")
          .style("font-size", "10px")
          .style("font-weight", "800")
          .style("border-radius", "10px")
          .style("padding", "2px 8px")
          .style("box-shadow", isCurrent ? "0 0 0 3px rgba(234,179,8,0.35), 0 2px 8px rgba(0,0,0,0.25)" : "0 1px 4px rgba(0,0,0,0.2)")
          .style("border", isCurrent ? "2px solid #fff" : "1.5px solid rgba(255,255,255,0.6)")
          .text(`#${idx + 1}`);
      }

      const toggleBtn = card.append("div")
        .attr("class", "toggle-btn")
        .style("position",       "absolute")
        .style("bottom",         "-12px")
        .style("right",          "10px")
        .style("width",          "24px")
        .style("height",         "24px")
        .style("border-radius",  "50%")
        .style("display",        (d.children || d._children) ? "flex" : "none")
        .style("justify-content","center")
        .style("align-items",    "center")
        .style("cursor",         "pointer")
        .style("font-weight",    "bold")
        .style("font-size",      "15px")
        .style("line-height",    "1")
        .style("box-shadow",     "0 2px 6px rgba(0,0,0,0.22)")
        .style("background",     style.btnBg)
        .style("color",          style.btnText)
        .style("border",         `1.5px solid ${style.border}`)
        .style("pointer-events", "auto")
        .text(d._children ? "+" : "−")
        .on("click", (event) => {
          event.stopPropagation();
          toggleNode(d);
        });
    };

    const update = (source) => {
      const treeData = tree(this.root);
      const nodes = treeData.descendants();
      const links = treeData.descendants().slice(1);

      nodes.forEach(d => { d.y = d.depth * horizontalSpacing; });

      const node = this.zoomGroup.selectAll("g.node")
        .data(nodes, d => d.id || (d.id = ++i));

      const nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${source.y0},${source.x0})`);

      const fo = nodeEnter.append("foreignObject")
        .attr("width",  d => d._nodeWidth + 80)
        .attr("height", d => d._nodeHeight + 80)
        .attr("x", -40)
        .attr("y", d => -(d._nodeHeight / 2) - 40)
        .style("overflow", "visible");

      const foDiv = fo.append("xhtml:div")
        .style("position", "relative")
        .style("width",  d => `${d._nodeWidth}px`)
        .style("height", d => `${d._nodeHeight}px`)
        .style("margin", "40px")
        .style("font-family", "var(--font-family, Inter, sans-serif)");

      foDiv.each(function(d) {
        const style      = getNodeStyle(d);
        const msRaw      = d.data.durationNs
          ? d.data.durationNs / 1000000
          : (d.data.durationNanos ? d.data.durationNanos / 1000000 : 0);
        const ms         = msRaw.toFixed(2);
        const pct        = d.data.durationNs && d.parent && d.parent.data.durationNs
          ? ((d.data.durationNs / d.parent.data.durationNs) * 100).toFixed(1)
          : (d.data.durationNanos && d.parent && d.parent.data.durationNanos
              ? ((d.data.durationNanos / d.parent.data.durationNanos) * 100).toFixed(1)
              : "0.0");
        const badge       = getEventBadge(d);
        const displayName = d.data.name || d.data.event || "Unknown";
        const hasChildren = d.children || d._children;

        const isCurrentMatch = self.currentMatchIndex >= 0 && self.matchedList &&
                               self.matchedList[self.currentMatchIndex] === d._uid;
        const isMatch        = self.matchedIds.has(d._uid);
        const isOnPath       = self.searchTerm && self.highlightedIds.has(d._uid) && !isMatch;
        const isDimmed       = self.searchTerm && !self.highlightedIds.has(d._uid);

        // Build CSS class list for the card
        let extraClass = '';
        if (isCurrentMatch) extraClass = 'flow-card-current-match';
        else if (isMatch)   extraClass = 'flow-card-match';

        // Card base styles
        let cardBg     = style.bg;
        let cardBorder = style.border;
        let cardShadow = "0 2px 8px -1px rgba(0,0,0,0.08), 0 1px 4px -1px rgba(0,0,0,0.06)";
        let cardOpacity = 1;

        if (isDimmed) cardOpacity = 0;
        else if (isOnPath) {
          cardShadow = "0 4px 12px -2px rgba(0,0,0,0.12)";
          cardOpacity = 0.88;
        }

        const card = d3.select(this).append("div")
          .attr("class", `flow-card ${extraClass}`)
          .style("width",           "100%")
          .style("height",          "100%")
          .style("background",      cardBg)
          .style("border",          (isMatch || isCurrentMatch) ? "none" : `1.5px solid ${cardBorder}`)
          .style("border-left",     (isMatch || isCurrentMatch) ? "none" : `4px solid ${badge.color}`)
          .style("border-radius",   "10px")
          .style("box-shadow",      cardShadow)
          .style("opacity",         cardOpacity)
          .style("display",         "flex")
          .style("flex-direction",  "column")
          .style("justify-content", "space-between")
          .style("padding",         "10px 12px")
          .style("box-sizing",      "border-box")
          .style("position",        "relative")
          .style("cursor",          hasChildren ? "pointer" : "default")
          .on("click", (event) => {
            event.stopPropagation();
            if (hasChildren) toggleNode(d);
          })
          .on("mouseenter", function() {
            if (!isCurrentMatch && !isMatch) {
              d3.select(this)
                .style("box-shadow", "0 8px 20px -4px rgba(0,0,0,0.16), 0 4px 8px -2px rgba(0,0,0,0.1)")
                .style("border-color", "#0176d3");
            }
          })
          .on("mouseleave", function() {
            if (!isCurrentMatch && !isMatch) {
              d3.select(this)
                .style("box-shadow", cardShadow)
                .style("border-color", cardBorder);
            }
          });

        // ── Top row: badge + method name ──────────────────────────────
        const topRow = card.append("div")
          .style("display",     "flex")
          .style("align-items", "flex-start")
          .style("gap",         "8px")
          .style("width",       "100%");

        topRow.append("span")
          .style("font-size",    "9px")
          .style("font-weight",  "700")
          .style("color",        badge.color)
          .style("background",   badge.bg)
          .style("border",       `1px solid ${badge.color}33`)
          .style("border-radius","5px")
          .style("padding",      "2px 6px")
          .style("letter-spacing","0.04em")
          .style("white-space",  "nowrap")
          .style("flex-shrink",  "0")
          .style("margin-top",   "2px")
          .text(badge.label);

        const nameDiv = topRow.append("div")
          .style("font-weight",   "600")
          .style("font-size",     "12px")
          .style("color",         (isMatch || isCurrentMatch) ? "#1c1917" : style.text)
          .style("white-space",   "normal")
          .style("word-break",    "break-word")
          .style("overflow-wrap", "break-word")
          .style("line-height",   "1.4")
          .style("flex",          "1");

        if (self.searchTerm && (isMatch || isCurrentMatch)) {
          nameDiv.html(highlightText(displayName, self.searchTerm));
        } else {
          nameDiv.text(displayName);
        }
        nameDiv.attr("title", displayName);

        // ── Bottom row: timing + caller ───────────────────────────────
        const bottomRow = card.append("div")
          .style("display",         "flex")
          .style("justify-content", "space-between")
          .style("align-items",     "center")
          .style("width",           "100%")
          .style("margin-top",      "6px")
          .style("padding-top",     "6px")
          .style("border-top",      d.depth === 0
            ? "1px solid rgba(255,255,255,0.2)"
            : "1px solid rgba(0,0,0,0.06)");

        bottomRow.append("span")
          .style("font-size", "11px")
          .style("color", d.depth === 0 ? "#bfdbfe" : style.subtext)
          .style("font-weight", "500")
          .html(`⏱ <b>${ms}ms</b> <span style="opacity:0.7">(${pct}%)</span>`);

        const callerName  = d.data.callerName || (d.parent ? (d.parent.data.name || d.parent.data.event || '—') : '—');
        const shortCaller = callerName.length > 24 ? callerName.substring(0, 24) + '…' : callerName;
        bottomRow.append("span")
          .style("font-size",  "10px")
          .style("color",      d.depth === 0 ? "#bfdbfe" : "#9ca3af")
          .style("font-style", "italic")
          .attr("title",       `Called by: ${callerName}`)
          .text(`← ${shortCaller}`);

        // ── Match index badge (top-left corner) ───────────────────────
        if (isMatch || isCurrentMatch) {
          const idx       = self.matchedList.indexOf(d._uid);
          const isCurrent = idx === self.currentMatchIndex;
          card.append("div")
            .style("position",     "absolute")
            .style("top",          "-11px")
            .style("left",         "-8px")
            .style("background",   isCurrent ? "#eab308" : "#f59e0b")
            .style("color",        "#fff")
            .style("font-size",    "10px")
            .style("font-weight",  "800")
            .style("border-radius","10px")
            .style("padding",      "2px 8px")
            .style("box-shadow",   isCurrent
              ? "0 0 0 3px rgba(234,179,8,0.35), 0 2px 8px rgba(0,0,0,0.25)"
              : "0 1px 4px rgba(0,0,0,0.2)")
            .style("border",       isCurrent ? "2px solid #fff" : "1.5px solid rgba(255,255,255,0.6)")
            .style("letter-spacing","0.02em")
            .text(`#${idx + 1}`);
        }

        // ── Toggle expand/collapse button ──────────────────────────────
        const toggleBtn = card.append("div")
          .attr("class", "toggle-btn")
          .style("position",       "absolute")
          .style("bottom",         "-12px")
          .style("right",          "10px")
          .style("width",          "24px")
          .style("height",         "24px")
          .style("border-radius",  "50%")
          .style("display",        (d.children || d._children) ? "flex" : "none")
          .style("justify-content","center")
          .style("align-items",    "center")
          .style("cursor",         "pointer")
          .style("font-weight",    "bold")
          .style("font-size",      "15px")
          .style("line-height",    "1")
          .style("box-shadow",     "0 2px 6px rgba(0,0,0,0.22)")
          .style("background",     style.btnBg)
          .style("color",          style.btnText)
          .style("border",         `1.5px solid ${style.border}`)
          .style("pointer-events", "auto")
          .text(d._children ? "+" : "−")
          .on("click", (event) => {
            event.stopPropagation();
            toggleNode(d);
          });
      });

      const nodeUpdate = nodeEnter.merge(node);

      nodeUpdate.transition()
        .duration(duration)
        .attr("transform", d => `translate(${d.y},${d.x})`);

      // ── REFRESH NODE CONTENT (Highlights, Opacity, etc.) ──
      // This is crucial: updateFn must refresh existing nodes, not just newly entered ones.
      nodeUpdate.select("foreignObject div").each(function(d) {
        refreshCard.call(this, d);
      });

      node.exit().transition()
        .duration(duration)
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .style("opacity", 0)
        .remove();

      // ── Links ──────────────────────────────────────────────────────
      const link = this.zoomGroup.selectAll("path.link")
        .data(links, d => d.id);

      const isVisibleLink = (d) => {
        if (!self.searchTerm) return true;
        // Link is only visible if BOTH parent and child are on the search path
        return self.highlightedIds.has(d._uid) && self.highlightedIds.has(d.parent._uid);
      };

      const linkEnter = link.enter().insert("path", "g")
        .attr("class", "link")
        .style("fill", "none")
        .style("stroke", d => isVisibleLink(d) ? (self.matchedIds.has(d._uid) || self.matchedIds.has(d.parent._uid) ? "#f59e0b" : "#cbd5e1") : "none")
        .style("stroke-width", d => isVisibleLink(d) ? "2px" : "0px")
        .style("opacity", d => isVisibleLink(d) ? 1 : 0)
        .attr("d", d => {
          const o = { x: source.x0, y: source.y0 + (source._nodeWidth || maxNodeWidth) / 2 };
          return diagonal(o, o);
        });

      const linkUpdate = linkEnter.merge(link);

      linkUpdate.transition()
        .duration(duration)
        .style("stroke", d => isVisibleLink(d) ? (self.matchedIds.has(d._uid) || self.matchedIds.has(d.parent._uid) ? "#f59e0b" : "#cbd5e1") : "none")
        .style("stroke-width", d => isVisibleLink(d) ? "2px" : "0px")
        .style("opacity", d => isVisibleLink(d) ? 1 : 0)
        .attr("d", d => {
          const s = { x: d.parent.x, y: d.parent.y + (d.parent._nodeWidth || maxNodeWidth) };
          const t = { x: d.x,        y: d.y };
          return diagonal(s, t);
        });

      link.exit().transition()
        .duration(duration)
        .style("opacity", 0)
        .remove();

      nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });

      function diagonal(s, d) {
        return `M ${s.y} ${s.x}
                C ${(s.y + d.y) / 2} ${s.x},
                  ${(s.y + d.y) / 2} ${d.x},
                  ${d.y} ${d.x}`;
      }
    };

    this.updateFn = update;
    update(this.root);
  }

  bindSearch() {
    const input   = document.getElementById('flow-search');
    const btn     = document.getElementById('flow-search-btn');
    const clearBtn = document.getElementById('search-clear-btn');
    const prevBtn  = document.getElementById('search-prev-btn');
    const nextBtn  = document.getElementById('search-next-btn');

    const findAllNodes = (node) => {
      const result = [node];
      const kids = node.children || node._children || [];
      for (const child of kids) result.push(...findAllNodes(child));
      return result;
    };

    const doSearch = () => {
      const term = input.value.trim().toLowerCase();
      if (!term || !this.root) {
        this.searchTerm = '';
        this.matchedIds = new Set();
        this.highlightedIds = new Set();
        this.matchedList = [];
        this.currentMatchIndex = -1;
        this._filteredRoot = null;
        this.updateSearchUI();
        if (this.updateFn) this.updateFn(this.root);
        return;
      }

      this.searchTerm = term;
      this.matchedIds = new Set();
      this.highlightedIds = new Set();
      this.matchedList = [];

      const allNodes = findAllNodes(this.root);

      // ── Search ONLY method/exec/unit names, NOT SOQL/CALLOUT/DML internal strings ──
      allNodes.forEach(d => {
        const evt = (d.data.event || '').toUpperCase();
        // Expert Filter: only match against real code blocks
        const isSearchableType = evt.includes('METHOD') || evt.includes('EXECUTION') || evt.includes('CODE_UNIT');
        
        const methodName = (d.data.name || '').toLowerCase();
        if (isSearchableType && methodName && methodName.includes(term)) {
          this.matchedIds.add(d._uid);
          this.matchedList.push(d._uid);
        }
      });

      // Highlight ancestors + descendants of matched nodes
      this.matchedIds.forEach(uid => {
        const matchNode = allNodes.find(d => d._uid === uid);
        if (!matchNode) return;
        matchNode.ancestors().forEach(a => this.highlightedIds.add(a._uid));
        findAllNodes(matchNode).forEach(d => this.highlightedIds.add(d._uid));
      });

      this.currentMatchIndex = this.matchedList.length > 0 ? 0 : -1;
      this.updateSearchUI();

      // Expand ancestors of matched nodes so they're visible
      if (this.matchedList.length > 0) {
        this.matchedList.forEach(uid => {
          const node = allNodes.find(d => d._uid === uid);
          if (node) {
            node.ancestors().forEach(a => {
              if (a._children) {
                a.children = a._children;
                a._children = null;
              }
            });
          }
        });
      }

      this.updateFn(this.root);

      if (this.matchedList.length > 0) {
        const expanded   = this.root.descendants();
        const firstMatch = expanded.find(d => d._uid === this.matchedList[0]);
        if (firstMatch) this.panToNode(firstMatch);
      }
    };

    const updateNav = () => {
      const hasResults = this.matchedList.length > 0;
      const hasTerm    = input.value.trim().length > 0;
      prevBtn.style.display  = hasResults ? 'inline-block' : 'none';
      nextBtn.style.display  = hasResults ? 'inline-block' : 'none';
      clearBtn.style.display = hasTerm    ? 'inline-block' : 'none';
    };

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const val = input.value.trim().toLowerCase();
        if (val === this.searchTerm && this.matchedList.length > 1) {
          // If already searching for this term, go to next result
          nextBtn.click();
        } else {
          // Otherwise trigger fresh search
          doSearch();
        }
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      this.searchTerm = '';
      this.matchedIds = new Set();
      this.highlightedIds = new Set();
      this.matchedList = [];
      this.currentMatchIndex = -1;
      this.updateSearchUI();
      this.render(this._treeData);
    });

    prevBtn.addEventListener('click', () => {
      if (this.matchedList.length === 0) return;
      const allNodes = findAllNodes(this.root);
      this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matchedList.length) % this.matchedList.length;
      this.updateSearchUI();
      this.updateFn(this.root);
      const node = allNodes.find(d => d._uid === this.matchedList[this.currentMatchIndex]);
      if (node) this.panToNode(node);
    });

    nextBtn.addEventListener('click', () => {
      if (this.matchedList.length === 0) return;
      const allNodes = findAllNodes(this.root);
      this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matchedList.length;
      this.updateSearchUI();
      this.updateFn(this.root);
      const node = allNodes.find(d => d._uid === this.matchedList[this.currentMatchIndex]);
      if (node) this.panToNode(node);
    });

    this.updateSearchUI = () => {
      const countEl = document.getElementById('search-count');
      if (this.matchedList.length > 0) {
        countEl.textContent = `${this.currentMatchIndex + 1} / ${this.matchedList.length}`;
        countEl.style.color = '#0176d3';
      } else if (this.searchTerm) {
        countEl.textContent = 'No results';
        countEl.style.color = '#dc2626';
      } else {
        countEl.textContent = '';
      }
      updateNav();
    };

    updateNav();
  }

  recenter() {
    if (!this.svgEl || !this.zoomBehavior || !this.initialTransform) return;
    this.svgEl.transition().duration(400).call(
      this.zoomBehavior.transform,
      this.initialTransform
    );
  }

  expandAll() {
    if (!this.root) return;
    const expand = (d) => {
      if (d._children) {
        d.children  = d._children;
        d._children = null;
      }
      if (d.children) d.children.forEach(expand);
    };
    expand(this.root);
    this.updateFn(this.root);
  }

  collapseAll() {
    if (!this.root) return;
    const collapse = (d) => {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    };
    if (this.root.children) {
      this.root.children.forEach(collapse);
    }
    this.updateFn(this.root);
  }

  panToNode(d) {
    const canvas = document.getElementById('d3-canvas');
    if (!canvas || !this.svgEl || !this.zoomBehavior) return;
    const rect = canvas.getBoundingClientRect();
    const tx   = rect.width  / 2 - d.y   - (d._nodeWidth  || 300) / 2;
    const ty   = rect.height / 2 - d.x;
    this.svgEl.transition().duration(500).call(
      this.zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(1)
    );
  }


}

window.FlowGraph = FlowGraph;
