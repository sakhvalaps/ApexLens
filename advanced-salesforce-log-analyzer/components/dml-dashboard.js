class DMLDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    const objectCounts = {};
    const opCounts = {};
    let totalRows = 0;
    
    analysis.dmls.forEach(dml => {
      const typeMatch = dml.details.match(/Type:([A-Za-z0-9_]+)/i);
      const opMatch = dml.details.match(/Op:([A-Za-z]+)/i);
      const rowsMatch = dml.details.match(/Rows:(\d+)/i);

      let objName = typeMatch ? typeMatch[1] : 'Unknown';
      let opName = opMatch ? opMatch[1] : 'Unknown';
      let rows = rowsMatch ? parseInt(rowsMatch[1], 10) : 0;

      if (!typeMatch && !opMatch) {
         if (dml.details.includes('Insert')) opName = 'Insert';
         if (dml.details.includes('Update')) opName = 'Update';
         if (dml.details.includes('Delete')) opName = 'Delete';
      }

      objectCounts[objName] = (objectCounts[objName] || 0) + 1;
      opCounts[opName] = (opCounts[opName] || 0) + 1;
      totalRows += rows;
      
      dml._parsed = { objName, opName, rows };
    });

    let html = `
      <div style="padding: 24px;">
        <h3 style="margin-top:0; font-size: 1.5rem; color: var(--text-main); margin-bottom: 24px;">DML Operations Dashboard</h3>
        
        <div class="summary-cards" style="display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap;">
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #fff7ed; border: 1.5px solid #ffedd5; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #9a3412; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total DML Statements</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #d97706;">${analysis.dmlCount}</div>
          </div>
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #faf5ff; border: 1.5px solid #e9d5ff; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #581c87; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Limit Usage</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #7e22ce;">${analysis.limits.dml.used} <span style="font-size: 1.1rem; color: #c084fc;">/ ${analysis.limits.dml.max}</span></div>
          </div>
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #ecfdf5; border: 1.5px solid #d1fae5; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #065f46; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total Rows Affected</div>
            <div style="margin:0; font-size: 2rem; font-weight: 800; color: #059669;">${totalRows}</div>
          </div>
        </div>

        <div style="display: flex; gap: 32px; margin-bottom: 32px; flex-wrap: wrap;">
           <div style="flex: 1; min-width: 250px;">
             <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main);">Operations by Target Object</h4>
             <div style="display: flex; flex-wrap: wrap; gap: 10px;">
               ${Object.entries(objectCounts).sort((a,b)=>b[1]-a[1]).map(([obj, count]) => `
                 <span style="background: #f8fafc; border: 1.5px solid #e2e8f0; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                   ${obj} <span style="background: #cbd5e1; color: #0f172a; border-radius: 10px; padding: 2px 8px; margin-left: 6px; font-size: 11px;">${count}</span>
                 </span>
               `).join('')}
             </div>
           </div>
           
           <div style="flex: 1; min-width: 250px;">
             <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main);">Operations by Type</h4>
             <div style="display: flex; flex-wrap: wrap; gap: 10px;">
               ${Object.entries(opCounts).sort((a,b)=>b[1]-a[1]).map(([op, count]) => {
                 let bg = '#f8fafc', color = '#475569';
                 if (op === 'Insert') { bg = '#dcfce7'; color = '#15803d'; }
                 if (op === 'Update') { bg = '#e0f2fe'; color = '#0369a1'; }
                 if (op === 'Delete') { bg = '#fee2e2'; color = '#b91c1c'; }
                 return `
                 <span style="background: ${bg}; border: 1.5px solid ${bg}; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; color: ${color}; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                   ${op} <span style="background: rgba(0,0,0,0.1); color: ${color}; border-radius: 10px; padding: 2px 8px; margin-left: 6px; font-size: 11px;">${count}</span>
                 </span>
                 `;
               }).join('')}
             </div>
           </div>
        </div>
        
        <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main);">Detailed DML Statements</h4>
        <div style="overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Line</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Time</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Operation</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Target Object</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Rows Affected</th>
                <th style="padding: 14px 16px; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Raw Details</th>
              </tr>
            </thead>
            <tbody>
    `;

    analysis.dmls.forEach((dml, idx) => {
      const p = dml._parsed || { opName: 'Unknown', objName: 'Unknown', rows: 0 };
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      
      let opBg = '#f1f5f9', opColor = '#475569';
      if (p.opName === 'Insert') { opBg = '#dcfce7'; opColor = '#15803d'; }
      if (p.opName === 'Update') { opBg = '#e0f2fe'; opColor = '#0369a1'; }
      if (p.opName === 'Delete') { opBg = '#fee2e2'; opColor = '#b91c1c'; }

      const cleanDetails = dml.details.replace(/^[\[\d\]\|]+DML_BEGIN[\[\d\]\|]+/, '').trim();

      html += `<tr style="border-bottom: 1px solid #f1f5f9; background: ${rowBg};">
        <td style="padding: 12px 16px; color: #64748b; font-family: monospace; vertical-align: middle;">${dml.lineNumber}</td>
        <td style="padding: 12px 16px; color: #64748b; white-space: nowrap; vertical-align: middle;">${dml.time}</td>
        <td style="padding: 12px 16px; vertical-align: middle;"><span style="background: ${opBg}; color: ${opColor}; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 12px;">${p.opName}</span></td>
        <td style="padding: 12px 16px; vertical-align: middle;"><span style="background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 12px;">${p.objName}</span></td>
        <td style="padding: 12px 16px; font-weight: 700; color: #0f172a; vertical-align: middle;">${p.rows}</td>
        <td style="padding: 12px 16px; font-family: 'Consolas', monospace; font-size: 12px; color: #475569; line-height: 1.5; word-break: break-all;">${this.escapeHtml(cleanDetails)}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`;
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
      return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
window.DMLDashboard = DMLDashboard;
