class PerformanceDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    // Sort methods by duration descending
    const sortedMethods = (analysis.methods || []).sort((a, b) => b.durationNanos - a.durationNanos);
    
    let totalMethodTimeMs = 0;
    sortedMethods.forEach(m => {
      totalMethodTimeMs += (m.durationNanos / 1000000);
    });

    const top5 = sortedMethods.slice(0, 5);

    let html = `
      <div style="padding: 24px;">
        <h3 style="margin-top:0; font-size: 1.5rem; color: var(--text-main); margin-bottom: 24px;">Performance Profile</h3>
        
        <div class="summary-cards" style="display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap;">
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Log Lines Parsed</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #0f172a;">${analysis.totalLogs.toLocaleString()}</div>
          </div>
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #1e3a8a; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Tracked Methods</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #1d4ed8;">${analysis.methods ? analysis.methods.length.toLocaleString() : 0}</div>
          </div>
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #fff7ed; border: 1.5px solid #ffedd5; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #9a3412; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total Method Exec Time</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #c2410c;">${totalMethodTimeMs.toFixed(2)} ms</div>
          </div>
        </div>

        <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
           <span style="background: #fee2e2; color: #b91c1c; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800;">!</span>
           Top 5 Most Expensive Methods
        </h4>
        <div style="overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Rank</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Method Signature</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Line Num</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Duration (ms)</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">% of Total Time</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (top5.length === 0) {
      html += `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #64748b;">No method execution data found in this log.</td></tr>`;
    } else {
      top5.forEach((m, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const ms = (m.durationNanos / 1000000);
        const percent = totalMethodTimeMs > 0 ? ((ms / totalMethodTimeMs) * 100).toFixed(1) : 0;
        
        let signature = m.entry.details;
        // Clean up signature if it includes line data e.g. [12]|METHOD_ENTRY|[12]|MyClass.myMethod()
        signature = signature.replace(/^[\[\d\]\|]+METHOD_ENTRY[\[\d\]\|]+/, '').trim();

        html += `<tr style="border-bottom: 1px solid #f1f5f9; background: ${rowBg};">
          <td style="padding: 12px 16px; color: #64748b; font-weight: 800;">#${idx + 1}</td>
          <td style="padding: 12px 16px; font-family: 'Consolas', monospace; font-size: 12.5px; color: #1e293b; word-break: break-all;">${this.escapeHtml(signature)}</td>
          <td style="padding: 12px 16px; color: #64748b; font-family: monospace;">${m.entry.lineNumber}</td>
          <td style="padding: 12px 16px;"><span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 12px;">${ms.toFixed(3)} ms</span></td>
          <td style="padding: 12px 16px;">
             <div style="display: flex; align-items: center; gap: 8px;">
               <div style="width: 60px; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden;"><div style="height: 100%; width: ${percent}%; background: #ef4444;"></div></div>
               <span style="font-weight: 600; color: #475569; font-size: 11px;">${percent}%</span>
             </div>
          </td>
        </tr>`;
      });
    }

    html += `</tbody></table></div></div>`;
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
      return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.PerformanceDashboard = PerformanceDashboard;
