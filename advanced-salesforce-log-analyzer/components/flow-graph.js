class FlowGraph {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.searchTerm = '';
    this.matchedIds = new Set();
    this.highlightedIds = new Set();
    this.matchedList = [];
    this.currentMatchIndex = -1;
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
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <h2 style="margin: 0;">Execution Flow Graph</h2>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <div id="search-container" style="display: flex; align-items: center; gap: 6px; background: #f9fafb; border: 1px solid var(--border-color); border-radius: 8px; padding: 4px 8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="flow-search" type="text" placeholder="Search method..." style="font-size: 12px; padding: 4px 6px; border: none; background: transparent; outline: none; font-family: inherit; width: 160px;" />
            <button id="flow-search-btn" style="font-size: 11px; padding: 4px 10px; background: var(--primary-color); color: #fff; border: none; border-radius: 4px; cursor: pointer;">Go</button>
            <span id="search-count" style="font-size: 11px; color: var(--text-muted); min-width: 50px; font-weight: 500;"></span>
            <button id="search-prev-btn" style="font-size: 11px; padding: 3px 6px; display: none; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; cursor: pointer;">↑</button>
            <button id="search-next-btn" style="font-size: 11px; padding: 3px 6px; display: none; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; cursor: pointer;">↓</button>
            <button id="search-clear-btn" style="font-size: 11px; padding: 3px 10px; display: none; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; color: #dc2626; cursor: pointer; font-weight: 600;">Clear</button>
          </div>
          <button id="expand-all-btn" style="font-size: 12px; padding: 6px 12px;">Expand All</button>
          <button id="collapse-all-btn" style="font-size: 12px; padding: 6px 12px;">Collapse All</button>
          <span style="font-size: 12px; color: var(--text-muted);">
            <b>Scroll</b> zoom, <b>Drag</b> pan, <b>Click node</b> expand/collapse
          </span>
        </div>
      </div>
      <div id="flow-layout" style="display: flex; gap: 12px; height: 75vh;">
        <div id="d3-canvas" style="flex: 1; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; background: #fdfdfd; position: relative;">
          <button id="reset-view-btn" style="position: absolute; top: 12px; right: 12px; z-index: 10; display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.1); font-family: inherit; color: var(--text-main); transition: all 0.2s;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            Reset View
          </button>
        </div>
        <div id="legend-panel" style="width: 210px; flex-shrink: 0; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #fff; overflow-y: auto; padding: 0;"></div>
      </div>
    `;

    this.renderLegend();
    this.bindSearch();

    document.getElementById('expand-all-btn').addEventListener('click', () => this.expandAll());
    document.getElementById('collapse-all-btn').addEventListener('click', () => this.collapseAll());
    document.getElementById('reset-view-btn').addEventListener('click', () => this.recenter());
    
    const rootData = treeData[0]; 
    
    const containerRect = document.getElementById("d3-canvas").getBoundingClientRect();
    const width = containerRect.width || 800;
    const height = containerRect.height || 600;
    
    const svg = d3.select("#d3-canvas").append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    this.svgEl = svg;
    this.zoomGroup = svg.append("g");
    
    this.zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 3])
      .on("zoom", (event) => {
        this.zoomGroup.attr("transform", event.transform);
      });
    
    this.svgEl.call(this.zoomBehavior);
    
    this.initialTransform = d3.zoomIdentity.translate(80, height / 2 - 50).scale(0.9);
    this.svgEl.call(this.zoomBehavior.transform, this.initialTransform);

    let i = 0;
    const duration = 500;
    
    this._treeData = treeData;
    this.root = d3.hierarchy(rootData, d => d.children);
    this.root.x0 = height / 2;
    this.root.y0 = 0;
    
    let idCounter = 0;
    this.root.each(d => { d._uid = ++idCounter; });
    
    const measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    
    const NODE_PADDING_X = 36;
    const NODE_PADDING_Y = 30;
    const MAX_NODE_WIDTH = 420;
    const MIN_NODE_WIDTH = 260;
    const LINE_HEIGHT = 16;
    const TOP_ROW_HEIGHT = 20;
    const BOTTOM_ROW_HEIGHT = 18;
    const GAP_BETWEEN_ROWS = 6;

    const computeNodeSize = (d) => {
      const displayName = d.data.name || d.data.event || "Unknown";
      ctx.font = '600 12px Inter, sans-serif';
      const textMetrics = ctx.measureText(displayName);
      const badgeWidth = 40;
      const neededWidth = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, textMetrics.width + badgeWidth + NODE_PADDING_X));
      
      const charsPerLine = Math.floor((neededWidth - badgeWidth - NODE_PADDING_X) / 7.2);
      const lines = Math.max(1, Math.ceil(displayName.length / charsPerLine));
      const nameBlockHeight = lines * LINE_HEIGHT;
      
      const neededHeight = TOP_ROW_HEIGHT + GAP_BETWEEN_ROWS + nameBlockHeight + GAP_BETWEEN_ROWS + BOTTOM_ROW_HEIGHT + NODE_PADDING_Y;
      
      d._nodeWidth = neededWidth;
      d._nodeHeight = Math.max(70, neededHeight);
    };

    this.root.each(computeNodeSize);
    
    const maxNodeWidth = Math.max(...this.root.descendants().map(d => d._nodeWidth));
    const maxNodeHeight = Math.max(...this.root.descendants().map(d => d._nodeHeight));
    
    const horizontalSpacing = maxNodeWidth + 60;
    const verticalSpacing = maxNodeHeight + 20;

    const tree = d3.tree().nodeSize([verticalSpacing, horizontalSpacing]);

    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    if (this.root.children) {
      this.root.children.forEach(collapse);
    }

    const getEventBadge = (node) => {
      const evt = (node.data.event || '').toUpperCase();
      if (evt.includes('SOQL')) return { label: 'SOQL', color: '#dc2626', bg: '#fef2f2' };
      if (evt.includes('DML')) return { label: 'DML', color: '#7c3aed', bg: '#f5f3ff' };
      if (evt.includes('CALLOUT')) return { label: 'CALLOUT', color: '#d97706', bg: '#fffbeb' };
      if (evt.includes('METHOD')) return { label: 'METHOD', color: '#0176d3', bg: '#f0f8ff' };
      if (evt.includes('EXECUTION')) return { label: 'EXEC', color: '#059669', bg: '#ecfdf5' };
      if (evt.includes('CODE_UNIT')) return { label: 'UNIT', color: '#475569', bg: '#f8fafc' };
      return { label: evt.substring(0, 6), color: '#6b7280', bg: '#f9fafb' };
    };

    const getNodeStyle = (d) => {
      const ms = d.data.durationNs ? d.data.durationNs / 1000000 : (d.data.durationNanos ? d.data.durationNanos / 1000000 : 0);
      
      if (d.depth === 0) {
        return { bg: "#0176d3", border: "#015ba7", text: "#ffffff", subtext: "#e0f2fe", btnBg: "#ffffff", btnText: "#0176d3" };
      }
      if (ms > 200) {
        return { bg: "#fef2f2", border: "#ef4444", text: "#7f1d1d", subtext: "#991b1b", btnBg: "#ef4444", btnText: "#ffffff" };
      }
      if (d.depth === 1) {
        return { bg: "#f0f8ff", border: "#0176d3", text: "#00396b", subtext: "#015ba7", btnBg: "#0176d3", btnText: "#ffffff" };
      }
      if (d.depth === 2) {
        return { bg: "#fff7ed", border: "#f59e0b", text: "#78350f", subtext: "#92400e", btnBg: "#f59e0b", btnText: "#ffffff" };
      }
      return { bg: "#f9fafb", border: "#9ca3af", text: "#1f2937", subtext: "#4b5563", btnBg: "#9ca3af", btnText: "#ffffff" };
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

    const highlightText = (text, term) => {
      if (!term) return text;
      const lower = text.toLowerCase();
      const idx = lower.indexOf(term);
      if (idx === -1) return text;
      const before = text.substring(0, idx);
      const match = text.substring(idx, idx + term.length);
      const after = text.substring(idx + term.length);
      return `${before}<mark style="background:#fef08a;color:#854d0e;border-radius:2px;padding:0 1px;">${match}</mark>${after}`;
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
        .attr("width", d => d._nodeWidth + 20)
        .attr("height", d => d._nodeHeight + 20)
        .attr("x", 0)
        .attr("y", d => -(d._nodeHeight / 2));

      const foDiv = fo.append("xhtml:div")
        .style("position", "relative")
        .style("width", d => `${d._nodeWidth}px`)
        .style("height", d => `${d._nodeHeight}px`)
        .style("margin-top", "10px")
        .style("font-family", "var(--font-family, sans-serif)");

      foDiv.each(function(d) {
        const style = getNodeStyle(d);
        const ms = d.data.durationNs ? (d.data.durationNs / 1000000).toFixed(2) : (d.data.durationNanos ? (d.data.durationNanos / 1000000).toFixed(2) : "0.00");
        const pct = d.data.durationNs && d.data.parent ? ((d.data.durationNs / d.data.parent.data.durationNs) * 100).toFixed(1) : (d.data.durationNanos && d.data.parent ? ((d.data.durationNanos / d.data.parent.data.durationNanos) * 100).toFixed(1) : "0.0");
        const badge = getEventBadge(d);
        const displayName = d.data.name || d.data.event || "Unknown";
        const hasChildren = d.children || d._children;

        const isMatch = self.matchedIds.has(d._uid);
        const isAncestor = self.searchTerm && self.highlightedIds.has(d._uid) && !isMatch;
        const isDescendant = self.searchTerm && self.highlightedIds.has(d._uid) && !isMatch;
        const isOnPath = isAncestor || isDescendant;
        const isDimmed = self.searchTerm && !self.highlightedIds.has(d._uid);
        const isCurrentMatch = self.currentMatchIndex >= 0 && self.matchedList && self.matchedList[self.currentMatchIndex] === d._uid;

        let cardBg = style.bg;
        let cardBorder = style.border;
        let cardShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)";
        let cardOpacity = 1;
        let ringStyle = "none";

        if (isCurrentMatch) {
          cardBg = "#fefce8";
          cardBorder = "#eab308";
          cardShadow = "0 0 0 4px rgba(234,179,8,0.25), 0 8px 20px rgba(0,0,0,0.15)";
          ringStyle = "0 0 0 6px rgba(234,179,8,0.15)";
          cardOpacity = 1;
        } else if (isMatch) {
          cardBg = "#fef9c3";
          cardBorder = "#ca8a04";
          cardShadow = "0 0 0 3px rgba(234,179,8,0.2), 0 4px 10px rgba(0,0,0,0.1)";
          cardOpacity = 1;
        } else if (isOnPath) {
          cardBg = style.bg;
          cardBorder = style.border;
          cardShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)";
          cardOpacity = 0.85;
        } else if (isDimmed) {
          cardOpacity = 0.15;
        }

        const card = d3.select(this).append("div")
          .style("width", "100%")
          .style("height", "100%")
          .style("background", cardBg)
          .style("border", `2px solid ${cardBorder}`)
          .style("border-radius", "8px")
          .style("box-shadow", cardShadow)
          .style("opacity", cardOpacity)
          .style("display", "flex")
          .style("flex-direction", "column")
          .style("justify-content", "space-between")
          .style("padding", "8px 10px")
          .style("box-sizing", "border-box")
          .style("position", "relative")
          .style("cursor", hasChildren ? "pointer" : "default")
          .style("transition", "all 0.3s ease")
          .on("click", (event) => {
            event.stopPropagation();
            if (hasChildren) toggleNode(d);
          })
          .on("mouseenter", function() {
            if (!isCurrentMatch) {
              d3.select(this).style("box-shadow", "0 8px 16px -2px rgba(0,0,0,0.15), 0 4px 6px -2px rgba(0,0,0,0.1)").style("border-color", "#0176d3");
            }
          })
          .on("mouseleave", function() {
            if (!isCurrentMatch) {
              d3.select(this).style("box-shadow", cardShadow).style("border-color", cardBorder);
            }
          });

        const topRow = card.append("div")
          .style("display", "flex")
          .style("align-items", "flex-start")
          .style("gap", "6px")
          .style("width", "100%");

        topRow.append("span")
          .style("font-size", "9px")
          .style("font-weight", "700")
          .style("color", badge.color)
          .style("background", badge.bg)
          .style("border", `1px solid ${badge.color}33`)
          .style("border-radius", "4px")
          .style("padding", "1px 5px")
          .style("white-space", "nowrap")
          .style("flex-shrink", "0")
          .style("margin-top", "1px")
          .text(badge.label);

        const nameDiv = topRow.append("div")
          .style("font-weight", "600")
          .style("font-size", "12px")
          .style("color", style.text)
          .style("white-space", "normal")
          .style("word-break", "break-word")
          .style("overflow-wrap", "break-word")
          .style("line-height", "1.3")
          .style("flex", "1");

        if (self.searchTerm && isMatch) {
          nameDiv.html(highlightText(displayName, self.searchTerm));
        } else {
          nameDiv.text(displayName);
        }
        nameDiv.attr("title", displayName);

        const bottomRow = card.append("div")
          .style("display", "flex")
          .style("justify-content", "space-between")
          .style("align-items", "center")
          .style("width", "100%")
          .style("margin-top", "4px");

        bottomRow.append("span")
          .style("font-size", "11px")
          .style("color", style.subtext)
          .html(`⏱ <b>${ms}ms</b> (${pct}%)`);

        const callerName = d.data.callerName || (d.parent ? (d.parent.data.name || d.parent.data.event || '—') : '—');
        const shortCaller = callerName.length > 22 ? callerName.substring(0, 22) + '…' : callerName;
        bottomRow.append("span")
          .style("font-size", "10px")
          .style("color", "#9ca3af")
          .style("font-style", "italic")
          .attr("title", `Called by: ${callerName}`)
          .text(`← ${shortCaller}`);

        if (isMatch) {
          const idx = self.matchedList.indexOf(d._uid);
          const isCurrent = idx === self.currentMatchIndex;
          card.append("div")
            .style("position", "absolute")
            .style("top", "-10px")
            .style("left", "-10px")
            .style("background", isCurrent ? "#eab308" : "#f59e0b")
            .style("color", "#fff")
            .style("font-size", "10px")
            .style("font-weight", "700")
            .style("border-radius", "10px")
            .style("padding", "2px 8px")
            .style("box-shadow", isCurrent ? "0 0 0 3px rgba(234,179,8,0.3), 0 2px 6px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.2)")
            .style("border", isCurrent ? "2px solid #fff" : "none")
            .text(`#${idx + 1}`);
        }
      });

      const toggleBtn = foDiv.append("div")
        .attr("class", "toggle-btn")
        .style("position", "absolute")
        .style("top", "-10px")
        .style("right", "-10px")
        .style("width", "22px")
        .style("height", "22px")
        .style("border-radius", "50%")
        .style("display", d => (d.children || d._children) ? "flex" : "none")
        .style("justify-content", "center")
        .style("align-items", "center")
        .style("cursor", "pointer")
        .style("font-weight", "bold")
        .style("font-size", "14px")
        .style("line-height", "1")
        .style("box-shadow", "0 2px 4px rgba(0,0,0,0.2)")
        .style("pointer-events", "auto")
        .on("click", (event, d) => {
          event.stopPropagation();
          toggleNode(d);
        });

      const nodeUpdate = nodeEnter.merge(node);

      nodeUpdate.transition()
        .duration(duration)
        .attr("transform", d => `translate(${d.y},${d.x})`);

      nodeUpdate.select(".toggle-btn")
        .style("background", d => getNodeStyle(d).btnBg)
        .style("color", d => getNodeStyle(d).btnText)
        .style("border", d => `1px solid ${getNodeStyle(d).border}`)
        .text(d => d._children ? "+" : "-");

      node.exit().transition()
        .duration(duration)
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .style("opacity", 0)
        .remove();

      const link = this.zoomGroup.selectAll("path.link")
        .data(links, d => d.id);

      const linkEnter = link.enter().insert("path", "g")
        .attr("class", "link")
        .style("fill", "none")
        .style("stroke", d => {
          if (self.searchTerm && self.highlightedIds.has(d._uid) && self.highlightedIds.has(d.parent._uid)) {
            return "#f59e0b";
          }
          return "#cbd5e1";
        })
        .style("stroke-width", d => {
          if (self.searchTerm && self.highlightedIds.has(d._uid) && self.highlightedIds.has(d.parent._uid)) {
            return "3px";
          }
          return "2px";
        })
        .style("opacity", d => {
          if (self.searchTerm && !self.highlightedIds.has(d._uid)) {
            return 0.08;
          }
          return 1;
        })
        .attr("d", d => {
          const o = { x: source.x0, y: source.y0 + (source._nodeWidth || maxNodeWidth) / 2 };
          return diagonal(o, o);
        });

      const linkUpdate = linkEnter.merge(link);

      linkUpdate.transition()
        .duration(duration)
        .style("stroke", d => {
          if (self.searchTerm && self.highlightedIds.has(d._uid) && self.highlightedIds.has(d.parent._uid)) {
            return "#f59e0b";
          }
          return "#cbd5e1";
        })
        .style("stroke-width", d => {
          if (self.searchTerm && self.highlightedIds.has(d._uid) && self.highlightedIds.has(d.parent._uid)) {
            return "3px";
          }
          return "2px";
        })
        .style("opacity", d => {
          if (self.searchTerm && !self.highlightedIds.has(d._uid)) {
            return 0.08;
          }
          return 1;
        })
        .attr("d", d => {
          const s = { x: d.parent.x, y: d.parent.y + (d.parent._nodeWidth || maxNodeWidth) };
          const t = { x: d.x, y: d.y };
          return diagonal(s, t);
        });

      link.exit().transition()
        .duration(duration)
        .attr("d", d => {
          const o = { x: source.x, y: source.y + (source._nodeWidth || maxNodeWidth) / 2 };
          return diagonal(o, o);
        })
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
    const input = document.getElementById('flow-search');
    const btn = document.getElementById('flow-search-btn');
    const clearBtn = document.getElementById('search-clear-btn');
    const prevBtn = document.getElementById('search-prev-btn');
    const nextBtn = document.getElementById('search-next-btn');

    const findAllNodes = (node) => {
      const result = [node];
      const kids = node.children || node._children || [];
      for (const child of kids) {
        result.push(...findAllNodes(child));
      }
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
        this.updateSearchUI();
        if (this.updateFn) this.updateFn(this.root);
        return;
      }

      this.searchTerm = term;
      this.matchedIds = new Set();
      this.highlightedIds = new Set();
      this.matchedList = [];

      const allNodes = findAllNodes(this.root);
      allNodes.forEach(d => {
        const name = (d.data.name || d.data.event || '').toLowerCase();
        if (name.includes(term)) {
          this.matchedIds.add(d._uid);
          this.matchedList.push(d._uid);
        }
      });

      this.matchedIds.forEach(uid => {
        const matchNode = allNodes.find(d => d._uid === uid);
        if (!matchNode) return;
        matchNode.ancestors().forEach(a => this.highlightedIds.add(a._uid));
        findAllNodes(matchNode).forEach(d => this.highlightedIds.add(d._uid));
      });

      this.currentMatchIndex = this.matchedList.length > 0 ? 0 : -1;
      this.updateSearchUI();

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
        // Re-fetch descendants after expanding
        const expanded = this.root.descendants();
        const firstMatch = expanded.find(d => d._uid === this.matchedList[0]);
        if (firstMatch) this.panToNode(firstMatch);
      }
    };

    const updateNav = () => {
      const hasResults = this.matchedList.length > 0;
      const hasTerm = input.value.trim().length > 0;
      prevBtn.style.display = hasResults ? 'inline-block' : 'none';
      nextBtn.style.display = hasResults ? 'inline-block' : 'none';
      clearBtn.style.display = hasTerm ? 'inline-block' : 'none';
    };

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
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
      const allNodes = findAllNodes(this.root);
      this.currentMatchIndex = (this.currentMatchIndex + 1) % allNodes.length;
      this.updateSearchUI();
      this.updateFn(this.root);
      const node = allNodes.find(d => d._uid === this.matchedList[this.currentMatchIndex]);
      if (node) this.panToNode(node);
    });

    nextBtn.addEventListener('click', () => {
      const allNodes = findAllNodes(this.root);
      if (this.matchedList.length === 0) return;
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
      } else if (this.searchTerm) {
        countEl.textContent = 'No results';
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
        d.children = d._children;
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
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tx = rect.width / 2 - d.y - (d._nodeWidth || 300) / 2;
    const ty = rect.height / 2 - d.x;
    const svg = d3.select("#d3-canvas svg");
    svg.transition().duration(500).call(
      d3.zoom().transform,
      d3.zoomIdentity.translate(tx, ty).scale(1)
    );
  }

  renderLegend() {
    const legend = document.getElementById('legend-panel');
    if (!legend) return;

    const eventTypes = [
      { label: 'SOQL', color: '#dc2626', bg: '#fef2f2', desc: 'Database queries' },
      { label: 'DML', color: '#7c3aed', bg: '#f5f3ff', desc: 'Database operations' },
      { label: 'CALLOUT', color: '#d97706', bg: '#fffbeb', desc: 'External API calls' },
      { label: 'METHOD', color: '#0176d3', bg: '#f0f8ff', desc: 'Apex method calls' },
      { label: 'EXEC', color: '#059669', bg: '#ecfdf5', desc: 'Execution context' },
      { label: 'UNIT', color: '#475569', bg: '#f8fafc', desc: 'Code unit boundary' },
    ];

    const perfLevels = [
      { label: 'Critical (>200ms)', color: '#ef4444' },
      { label: 'Depth 1 (top-level)', color: '#0176d3' },
      { label: 'Depth 2 (nested)', color: '#f59e0b' },
      { label: 'Normal (deep)', color: '#9ca3af' },
    ];

    let html = `
      <div style="padding: 14px 14px 10px;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0176d3" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          <h3 style="font-size: 12px; font-weight: 700; color: var(--text-main); margin: 0; text-transform: uppercase; letter-spacing: 0.06em;">Legend</h3>
        </div>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Event Types</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            ${eventTypes.map(t => `
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 8px; font-weight: 700; color: ${t.color}; background: ${t.bg}; border: 1px solid ${t.color}33; border-radius: 3px; padding: 1px 4px; white-space: nowrap;">${t.label}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="background: #f9fafb; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Performance</div>
          ${perfLevels.map(p => `
            <div style="display: flex; align-items: center; gap: 8px; padding: 3px 0;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; flex-shrink: 0;"></span>
              <span style="font-size: 11px; color: #4b5563;">${p.label}</span>
            </div>
          `).join('')}
        </div>

        <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; font-weight: 600; color: #854d0e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Search Results</div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
            <span style="width: 14px; height: 14px; border-radius: 4px; background: #fef9c3; border: 2px solid #ca8a04; flex-shrink: 0;"></span>
            <span style="font-size: 11px; color: #4b5563;">Match found</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
            <span style="width: 14px; height: 14px; border-radius: 4px; background: #fefce8; border: 2px solid #eab308; box-shadow: 0 0 0 3px rgba(234,179,8,0.2); flex-shrink: 0;"></span>
            <span style="font-size: 11px; color: #4b5563;">Active match</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
            <span style="width: 14px; height: 14px; border-radius: 4px; background: #f3f4f6; border: 2px solid #e5e7eb; opacity: 0.3; flex-shrink: 0;"></span>
            <span style="font-size: 11px; color: #4b5563;">Dimmed (unrelated)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
            <span style="width: 14px; height: 3px; border-radius: 2px; background: #f59e0b; flex-shrink: 0;"></span>
            <span style="font-size: 11px; color: #4b5563;">Flow path</span>
          </div>
        </div>

        <div style="background: #f9fafb; border-radius: 8px; padding: 10px 12px;">
          <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Controls</div>
          <div style="font-size: 11px; color: #4b5563; line-height: 1.9;">
            <div><b style="color:#374151;">Click node</b> — Expand / Collapse</div>
            <div><b style="color:#374151;">Scroll</b> — Zoom in / out</div>
            <div><b style="color:#374151;">Drag</b> — Pan canvas</div>
            <div><b style="color:#374151;">↑ ↓</b> — Navigate matches</div>
          </div>
        </div>
      </div>
    `;

    legend.innerHTML = html;
  }

  expandAll() {
    if (!this.root) return;
    const expand = (d) => {
      if (d._children) {
        d.children = d._children;
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
}

window.FlowGraph = FlowGraph;
