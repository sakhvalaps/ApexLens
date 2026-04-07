class SOQLAnalyzer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    const objectCounts = {};
    const exactQueries = {};
    
    analysis.queries.forEach(q => {
      const match = q.details.match(/FROM\s+([A-Za-z0-9_]+)/i);
      const objName = match ? match[1] : 'Unknown';
      objectCounts[objName] = (objectCounts[objName] || 0) + 1;
      
      const cleanString = q.details.replace(/^[\[\d\]\|]+SOQL_EXECUTE_BEGIN[\[\d\]\|]+/, '').trim(); 
      exactQueries[cleanString] = (exactQueries[cleanString] || 0) + 1;
      
      q._parsed = { objName, cleanString };
    });

    const RepeatedCount = Object.values(exactQueries).filter(count => count > 1).length;

    let html = `
      <div style="padding: 24px;">
        <h3 style="margin-top:0; font-size: 1.5rem; color: var(--text-main); margin-bottom: 24px;">SOQL Query Analyzer</h3>
        
        <div class="summary-cards" style="display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap;">
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #1e3a8a; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total Queries</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #1d4ed8;">${analysis.soqlCount}</div>
          </div>
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #faf5ff; border: 1.5px solid #e9d5ff; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #581c87; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Limit Usage</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #7e22ce;">${analysis.limits.soql.used} <span style="font-size: 1.1rem; color: #c084fc;">/ ${analysis.limits.soql.max}</span></div>
          </div>
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #fff1f2; border: 1.5px solid #fecdd3; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #881337; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Repeated Queries</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #be123c;">${RepeatedCount}</div>
          </div>
        </div>

        <div style="display: flex; gap: 24px; margin-bottom: 32px;">
           <div style="flex: 1;">
             <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main);">Queries by Target Object</h4>
             <div style="display: flex; flex-wrap: wrap; gap: 10px;">
               ${Object.entries(objectCounts).sort((a,b)=>b[1]-a[1]).map(([obj, count]) => `
                 <span style="background: #f8fafc; border: 1.5px solid #e2e8f0; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                   ${obj} <span style="background: #cbd5e1; color: #0f172a; border-radius: 10px; padding: 2px 8px; margin-left: 6px; font-size: 11px;">${count}</span>
                 </span>
               `).join('')}
             </div>
           </div>
        </div>
        
        <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main);">Detailed SOQL Statements</h4>
        <div style="overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Line</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Time</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Object</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Query Details</th>
              </tr>
            </thead>
            <tbody>
    `;

    analysis.queries.forEach((q, idx) => {
      const p = q._parsed || { objName: 'Unknown', cleanString: q.details };
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

      html += `<tr style="border-bottom: 1px solid #f1f5f9; background: ${rowBg};">
        <td style="padding: 12px 16px; color: #64748b; font-family: monospace; vertical-align: top;">${q.lineNumber}</td>
        <td style="padding: 12px 16px; color: #64748b; white-space: nowrap; vertical-align: top;">${q.time}</td>
        <td style="padding: 12px 16px; vertical-align: top;"><span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 12px;">${p.objName}</span></td>
        <td style="padding: 12px 16px; font-family: 'Consolas', monospace; font-size: 12.5px; color: #1e293b; line-height: 1.5; word-break: break-all;">${this.escapeHtml(p.cleanString)}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`;
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
      return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
window.SOQLAnalyzer = SOQLAnalyzer;
