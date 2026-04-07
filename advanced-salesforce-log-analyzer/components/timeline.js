class TimelineVisualization {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.rootData = null;
    this.isDrawn = false;
    this.cleanupTooltip = null;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // When width becomes > 0 (meaning the tab was activated), and it's not drawn yet, draw it!
        if (entry.contentRect.width > 0 && !this.isDrawn && this.rootData) {
          this.drawChart();
        }
      }
    });
  }

  render(root) {
    if (!this.container) return;
    this.rootData = root;
    this.isDrawn = false;

    // Use full width/height bypassing parent padding without overriding display: none
    this.container.innerHTML = `
      <style>
      #${this.container.id}.panel.active {
        margin: -24px;
        width: calc(100% + 48px);
        height: calc(100% + 48px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .timeline-tooltip {
        position: fixed;
        background: rgba(30, 30, 30, 0.95);
        color: #fff;
        padding: 10px 14px;
        border-radius: 6px;
        font-family: inherit;
        font-size: 12px;
        line-height: 1.5;
        pointer-events: none;
        box-shadow: 0 8px 16px rgba(0,0,0,0.15);
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.1s ease;
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(4px);
      }
      .legend-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 700;
        color: var(--text-main);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 2px;
      }
      #timeline-chart-area {
        cursor: grab;
      }
      #timeline-chart-area:active {
        cursor: grabbing;
      }
      .zoom-controls {
        position: absolute;
        bottom: 16px;
        right: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
      }
      .zoom-btn {
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        color: #374151;
        font-weight: bold;
        transition: all 0.2s;
      }
      .zoom-btn:hover {
        background: #f3f4f6;
      }
      </style>
      <div style="display: flex; flex-direction: column; height: 100%;">
        <div id="timeline-chart-area" style="flex: 1; position: relative; background: #fff; overflow: hidden;">
           <div class="zoom-controls">
             <button id="timeline-zoom-in" class="zoom-btn" title="Zoom In">＋</button>
             <button id="timeline-zoom-out" class="zoom-btn" title="Zoom Out">－</button>
             <button id="timeline-zoom-reset" class="zoom-btn" title="Reset View">▣</button>
           </div>
        </div>
        <div style="height: 40px; background: #fdfdfd; border-top: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; padding: 0 10px; gap: 16px; flex-shrink: 0; flex-wrap: wrap; z-index: 10;">
           <div class="legend-chip"><div class="legend-color" style="background:#0ea5e9;"></div>Code Unit</div>
           <div class="legend-chip"><div class="legend-color" style="background:#22c55e;"></div>Method</div>
           <div class="legend-chip"><div class="legend-color" style="background:#a855f7;"></div>Flow</div>
           <div class="legend-chip"><div class="legend-color" style="background:#f59e0b;"></div>DML</div>
           <div class="legend-chip"><div class="legend-color" style="background:#1d4ed8;"></div>SOQL</div>
           <div class="legend-chip"><div class="legend-color" style="background:#78350f;"></div>System Method</div>
           <div class="legend-chip"><div class="legend-color" style="background:#fbcfe8;"></div>Error Flag</div>
        </div>
      </div>
    `;

    const chartArea = document.getElementById('timeline-chart-area');
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(chartArea);

    // If already visible, draw immediately
    if (chartArea.clientWidth > 0) {
      this.drawChart();
    }
  }

  drawChart() {
    const chartArea = document.getElementById('timeline-chart-area');
    if (!chartArea || chartArea.clientWidth === 0) return;

    this.isDrawn = true;
    
    // Clear any previous SVG
    d3.select(chartArea).selectAll("svg").remove();
    if (this.cleanupTooltip) this.cleanupTooltip();

    const data = this.flattenTree(this.rootData);
    if (!data || data.length === 0) {
      chartArea.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">No timing data available.</div>`;
      return;
    }

    const minTime = d3.min(data, d => d.startMs);
    const maxTime = d3.max(data, d => d.endMs);
    const maxDepth = d3.max(data, d => d.depth);

    const width = chartArea.clientWidth;
    const height = chartArea.clientHeight;
    
    const margin = {top: 50, right: 30, bottom: 20, left: 30};
    const barHeight = 16;
    
    const contentHeight = Math.max(height, margin.top + ((maxDepth + 1) * barHeight) + margin.bottom);

    const svg = d3.select(chartArea).insert("svg", ":first-child")
                  .attr("width", width)
                  .attr("height", height)
                  .style("display", "block");

    const x = d3.scaleLinear()
                .domain([minTime, maxTime])
                .range([margin.left, width - margin.right]);

    const xAxis = d3.axisTop(x)
                    .tickFormat(d => d.toFixed(1) + 'ms')
                    .ticks(Math.max(2, Math.floor(width / 100)));
    
    const xAxisGroup = svg.append("g")
       .attr("transform", `translate(0, ${margin.top})`)
       .call(xAxis);
    
    const styleAxis = (g) => {
       g.select(".domain").attr("stroke", "#ddd");
       g.selectAll(".tick line")
         .attr("y2", contentHeight)
         .attr("stroke-opacity", 0.1)
         .attr("stroke", "#000");
       g.selectAll(".tick text")
         .attr("fill", "#6b7280")
         .attr("font-weight", "600");
    };
    xAxisGroup.call(styleAxis);

    const binsCount = Math.max(10, Math.floor(width / 4));
    const binSize = (maxTime - minTime) / binsCount;
    const density = Array(binsCount).fill(0).map((_, i) => ({x: minTime + i*binSize, y:0}));
    data.forEach(d => {
       if (binSize <= 0) return;
       let startIdx = Math.max(0, Math.floor((d.startMs - minTime)/binSize));
       let endIdx = Math.min(binsCount-1, Math.floor((d.endMs - minTime)/binSize));
       for(let i=startIdx; i<=endIdx; i++) density[i].y += 1;
    });

    const sparkY = d3.scaleLinear().domain([0, d3.max(density, d=>d.y)]).range([margin.top - 5, 10]);
    const area = d3.area()
                   .x(d => x(d.x))
                   .y0(margin.top - 5)
                   .y1(d => Math.max(10, sparkY(d.y)))
                   .curve(d3.curveBasis);

    const sparklinePath = svg.append("path")
       .datum(density)
       .attr("fill", "#cbd5e1")
       .attr("opacity", 0.6)
       .attr("d", area);

    svg.append("defs").append("clipPath")
       .attr("id", "clip-bars")
       .append("rect")
       .attr("x", margin.left)
       .attr("y", 0)
       .attr("width", Math.max(0, width - margin.left - margin.right))
       .attr("height", contentHeight);

    const barsGroupWrapper = svg.append("g")
                                .attr("clip-path", "url(#clip-bars)");

    const tooltip = d3.select("body").append("div").attr("class", "timeline-tooltip");

    const bars = barsGroupWrapper.selectAll(".bar")
       .data(data)
       .enter().append("rect")
       .attr("class", "bar")
       .attr("x", d => x(d.startMs))
       .attr("y", d => margin.top + (d.depth - 1) * barHeight + 4)
       .attr("width", d => Math.max(2, x(d.endMs) - x(d.startMs)))
       .attr("height", Math.max(2, barHeight - 2))
       .attr("fill", d => d.color)
       .attr("rx", 2)
       .style("cursor", "pointer")
       .on("mouseover", (event, d) => {
         const tstart = d.startMs.toFixed(3);
         const tend = d.endMs.toFixed(3);
         const displayName = d.details ? d.details.split('|').pop().trim() : d.event;
         
         tooltip.style("opacity", 1)
                .html(`
                  <div style="font-weight: 700; color: #a3e635; margin-bottom: 4px;">${d.event}</div>
                  <div style="margin-bottom: 8px; word-break: break-all; max-width: 350px;">${displayName}</div>
                  <div style="display: grid; grid-template-columns: auto auto; gap: 4px 12px; color: #d1d5db;">
                    <span>Timestamp:</span> <span style="color: #fff;">${tstart} &rarr; ${tend} ms</span>
                    <span>Total ms:</span> <span style="color: #fff;">${d.durMs.toFixed(3)} ms</span>
                    <span>Self ms:</span> <span style="color: #fff;">${d.selfMs.toFixed(3)} ms</span>
                  </div>
                `);

         d3.select(event.currentTarget).attr("stroke", "#1f2937").attr("stroke-width", 2).attr("filter", "brightness(1.1)");
       })
       .on("mousemove", (event) => {
         const tt = tooltip.node();
         let left = event.pageX + 15;
         let top = event.pageY + 15;
         if (left + tt.offsetWidth > window.innerWidth) left = event.pageX - tt.offsetWidth - 10;
         if (top + tt.offsetHeight > window.innerHeight) top = event.pageY - tt.offsetHeight - 10;
         
         tooltip.style("left", left + "px").style("top", top + "px");
       })
       .on("mouseout", (event) => {
         tooltip.style("opacity", 0);
         d3.select(event.currentTarget).attr("stroke", "none").attr("filter", "none");
       });

    const zoomExtents = d3.zoom()
        .scaleExtent([1, 100])
        .translateExtent([[margin.left, 0], [width - margin.right, height]])
        .extent([[margin.left, 0], [width - margin.right, height]])
        .on("zoom", (event) => {
           const newX = event.transform.rescaleX(x);
           xAxisGroup.call(xAxis.scale(newX));
           xAxisGroup.call(styleAxis);

           area.x(d => newX(d.x));
           sparklinePath.attr("d", area);

           bars.attr("x", d => newX(d.startMs))
               .attr("width", d => Math.max(1.5, newX(d.endMs) - newX(d.startMs)));
        });

    svg.call(zoomExtents);

    d3.select('#timeline-zoom-in').on('click', () => {
      svg.transition().duration(300).call(zoomExtents.scaleBy, 1.5);
    });
    d3.select('#timeline-zoom-out').on('click', () => {
      svg.transition().duration(300).call(zoomExtents.scaleBy, 1/1.5);
    });
    d3.select('#timeline-zoom-reset').on('click', () => {
      svg.transition().duration(500).call(zoomExtents.transform, d3.zoomIdentity);
    });

    this.cleanupTooltip = () => {
      d3.selectAll(".timeline-tooltip").remove();
    };
  }

  flattenTree(node) {
    let list = [];
    if (node.event !== 'ROOT' && node.durationNs > 0) {
      let type = 'System Method'; 
      let color = '#78350f';      
      
      const evt = (node.event || '').toUpperCase();
      if (evt.includes('CODE_UNIT')) { type = 'Code Unit'; color = '#0ea5e9'; }
      else if (evt.includes('DML')) { type = 'DML'; color = '#f59e0b'; }
      else if (evt.includes('SOQL')) { type = 'SOQL'; color = '#1d4ed8'; }
      else if (evt.includes('METHOD')) { type = 'Method'; color = '#22c55e'; }
      else if (evt.includes('FLOW')) { type = 'Flow'; color = '#a855f7'; }
      else if (evt.includes('ERROR') || evt.includes('EXCEPTION') || evt.includes('FATAL')) { type = 'Error Flag'; color = '#fbcfe8'; }

      const startMs = (node.timeNs||0) / 1000000;
      const durMs = (node.durationNs||0) / 1000000;
      
      if (durMs > 0.001) {
        list.push({
            startMs,
            endMs: startMs + durMs,
            durMs,
            type,
            color,
            event: evt,
            details: node.details || '',
            depth: node.depth || 1,
            selfMs: (node.selfTimeNs || 0) / 1000000
        });
      }
    }
    for (let c of (node.children || [])) {
      list = list.concat(this.flattenTree(c));
    }
    return list;
  }
}

window.TimelineVisualization = TimelineVisualization;
