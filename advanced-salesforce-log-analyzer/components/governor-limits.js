class GovernorLimitsTracker {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    // Assess overall system health
    let healthRisk = 'Safe Limits';
    let healthColor = '#10b981';
    let maxPercent = 0;

    const gaugesData = [];

    for (const [key, limit] of Object.entries(analysis.limits)) {
      const percentage = limit.max > 0 ? (limit.used / limit.max) * 100 : 0;
      if (percentage > maxPercent) maxPercent = percentage;

      let color = '#10b981'; // Green
      if (percentage > 80) color = '#ef4444'; // Red
      else if (percentage > 60) color = '#f59e0b'; // Orange

      gaugesData.push({
        key: key.toUpperCase(),
        used: limit.used,
        max: limit.max,
        percent: percentage,
        color: color
      });
    }

    if (maxPercent > 80) {
      healthRisk = 'Critical Risk';
      healthColor = '#ef4444';
    } else if (maxPercent > 60) {
      healthRisk = 'Warning Active';
      healthColor = '#f59e0b';
    }

    let html = `
      <div style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
           <h3 style="margin:0; font-size: 1.5rem; color: var(--text-main);">Governor Limits Analysis</h3>
           <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; padding: 10px 20px; border-radius: 20px; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
              <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">System Health:</span>
              <span style="display: flex; align-items: center; gap: 8px; color: ${healthColor}; font-weight: 800; font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em;">
                 <span style="width: 12px; height: 12px; border-radius: 50%; background: ${healthColor}; box-shadow: 0 0 0 3px ${healthColor}33; animation: pulse 2s infinite;"></span>
                 ${healthRisk}
              </span>
           </div>
        </div>
        
        <div id="limits-gauge-container" style="display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 32px;">
        </div>
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px;">
           <p style="margin:0; font-size: 13px; color: #475569; display: flex; align-items: center; gap: 8px;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #64748b;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
             <strong>Note:</strong> Limits are tracked as actively logged in the transaction. Unrecorded final limits might differ slightly depending on log levels.
           </p>
        </div>
      </div>
    `;

    this.container.innerHTML = html;

    const gaugeContainer = document.getElementById('limits-gauge-container');

    gaugesData.forEach(g => {
       const box = document.createElement('div');
       box.style.cssText = `flex: 1; min-width: 250px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px 20px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);`;
       gaugeContainer.appendChild(box);

       const title = document.createElement('div');
       title.style.cssText = `font-size: 14px; font-weight: 800; color: #475569; letter-spacing: 0.05em; margin-bottom: 24px; text-transform: uppercase;`;
       title.innerText = g.key;
       box.appendChild(title);

       const svgDiv = document.createElement('div');
       box.appendChild(svgDiv);

       const formatNumber = num => num.toLocaleString();

       const details = document.createElement('div');
       details.style.cssText = `margin-top: 24px; font-size: 15px; font-weight: 600; color: #64748b; background: #f8fafc; padding: 8px 16px; border-radius: 8px; border: 1px solid #f1f5f9;`;
       details.innerHTML = `<span style="color: ${g.color}; font-weight: 800; font-size: 18px;">${formatNumber(g.used)}</span> / ${formatNumber(g.max)}`;
       box.appendChild(details);

       // D3 Arc Render
       const width = 160, height = 160;
       const radius = Math.min(width, height) / 2;
       
       const svg = d3.select(svgDiv).append("svg")
         .attr("width", width)
         .attr("height", height)
         .append("g")
         .attr("transform", `translate(${width/2},${height/2})`);

       const arc = d3.arc()
         .innerRadius(radius - 14)
         .outerRadius(radius)
         .startAngle(0);

       // Background empty Arc
       svg.append("path")
         .datum({endAngle: 2 * Math.PI})
         .style("fill", "#f1f5f9")
         .attr("d", arc);

       // Foreground active Arc
       const angle = Math.min(g.percent / 100, 1) * 2 * Math.PI;
       const path = svg.append("path")
         .datum({endAngle: 0})
         .style("fill", g.color)
         .attr("d", arc);
         
       // Add rounded caps to arcs
       path.transition()
         .duration(1200)
         .ease(d3.easeCubicOut)
         .attrTween("d", function(d) {
            const i = d3.interpolate(d.endAngle, angle);
            return function(t) {
              d.endAngle = i(t);
              return arc(d);
            }
         });

       // Text in the middle of Gauge
       svg.append("text")
         .attr("text-anchor", "middle")
         .attr("dy", "0.35em")
         .style("font-size", "28px")
         .style("font-weight", "800")
         .style("fill", "#0f172a")
         .text("0%")
         .transition()
         .duration(1200)
         .ease(d3.easeCubicOut)
         .tween("text", function() {
            const i = d3.interpolate(0, g.percent);
            return function(t) {
              this.textContent = Math.round(i(t)) + "%";
            };
         });
    });
  }
}

window.GovernorLimitsTracker = GovernorLimitsTracker;
