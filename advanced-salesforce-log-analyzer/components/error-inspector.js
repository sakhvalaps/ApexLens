class ErrorInspector {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    const errorCategories = {};
    
    analysis.errors.forEach(err => {
      const match = err.details.match(/([a-zA-Z0-9_\.]+(?:Exception|Error|FAULT))/i);
      const type = match ? match[1] : 'UnhandledException';
      errorCategories[type] = (errorCategories[type] || 0) + 1;
      
      err._parsed = { type };
    });

    let html = `
      <div style="padding: 24px;">
        <h3 style="margin-top:0; font-size: 1.5rem; color: var(--text-main); margin-bottom: 24px;">Smart Error Inspector</h3>
        
        <div class="summary-cards" style="display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap;">
          <div class="card" style="flex:1; min-width: 150px; padding: 20px; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="margin:0 0 8px 0; color: #991b1b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total Exceptions Caught</div>
            <div style="margin:0; font-size: 2.5rem; font-weight: 800; color: #b91c1c;">${analysis.errors.length}</div>
          </div>
          <div class="card" style="flex:3; min-width: 300px; padding: 20px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
             <div style="margin:0 0 12px 0; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Exception Types Breakdown</div>
             <div style="display: flex; flex-wrap: wrap; gap: 10px;">
               ${Object.keys(errorCategories).length === 0 ? '<span style="color: #64748b; font-size: 13px; font-weight: 600;">No errors detected.</span>' : ''}
               ${Object.entries(errorCategories).sort((a,b)=>b[1]-a[1]).map(([type, count]) => `
                 <span style="background: #fee2e2; border: 1px solid #fca5a5; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #991b1b; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                   ${type} <span style="background: #f87171; color: #fff; border-radius: 10px; padding: 2px 8px; margin-left: 8px; font-size: 12px;">${count}</span>
                 </span>
               `).join('')}
             </div>
          </div>
        </div>
        
        <h4 style="margin:0 0 16px 0; font-size: 1.1rem; color: var(--text-main);">Detailed Stack Traces</h4>
    `;

    if (analysis.errors.length === 0) {
      html += `<div style="padding: 32px; background: #f8fafc; border-radius: 12px; border: 2px dashed #cbd5e1; text-align: center; color: #64748b; font-weight: 600; font-size: 15px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <br/>No exceptions or fatal errors found in this log. All good!
      </div>`;
    } else {
      html += `<div style="display: flex; flex-direction: column; gap: 20px;">`;
      analysis.errors.forEach(err => {
        const raw = err.details || '';
        let cleaned = raw.replace(/^[\[\d\]\|]+EXCEPTION_THROWN[\[\d\]\|]+/, '').trim();
        cleaned = cleaned.replace(/^[\[\d\]\|]+FATAL_ERROR[\[\d\]\|]+/, '').trim();

        // Try to split on \n if it exists, else treat whole block
        let lines = cleaned.includes('\\n') ? cleaned.split('\\n') : cleaned.split('\n');
        
        let errorMsg = lines[0] || 'Unknown Error';
        let stackFrameHTML = '';
        
        if (lines.length > 1) {
           const frames = lines.slice(1).map(l => l.trim()).filter(l => l);
           stackFrameHTML = `<div style="margin-top: 16px; padding: 16px; background: #0f172a; border-radius: 8px; font-family: 'Consolas', monospace; font-size: 12.5px; color: #cbd5e1; line-height: 1.6; overflow-x: auto;">`;
           frames.forEach((f, i) => {
              let styledFrame = this.escapeHtml(f);
              // Regex highlights for Class/Trigger, Lines
              styledFrame = styledFrame.replace(/(Class\.[a-zA-Z0-9_\.]+)/, '<span style="color: #60a5fa; font-weight: 700;">$1</span>');
              styledFrame = styledFrame.replace(/(Trigger\.[a-zA-Z0-9_\.]+)/, '<span style="color: #34d399; font-weight: 700;">$1</span>');
              styledFrame = styledFrame.replace(/(line \d+)/, '<span style="color: #f472b6; font-weight: 700;">$1</span>');
              styledFrame = styledFrame.replace(/(column \d+)/, '<span style="color: #fb923c;">$1</span>');
              
              stackFrameHTML += `<div style="padding: 2px 0;"><span style="color: #64748b; margin-right: 12px; display: inline-block; width: 20px; text-align: right; user-select: none;">${i+1}</span> ${styledFrame}</div>`;
           });
           stackFrameHTML += `</div>`;
        } else {
           stackFrameHTML = `<div style="margin-top: 16px; padding: 16px; background: #0f172a; border-radius: 8px; font-family: 'Consolas', monospace; font-size: 13px; color: #fca5a5; line-height: 1.6; overflow-x: auto; white-space: pre-wrap;">${this.escapeHtml(cleaned)}</div>`;
        }

        html += `
        <div style="background: #fff; border: 1.5px solid #fecaca; border-left: 6px solid #ef4444; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 12px;">
             <div>
               <div style="display: inline-block; background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; text-transform: uppercase; margin-bottom: 12px;">
                 Logged at Line ${err.lineNumber}
               </div>
               <div style="font-weight: 800; color: #0f172a; font-size: 16px; line-height: 1.4;">${this.escapeHtml(errorMsg)}</div>
             </div>
             <div style="color: #64748b; font-size: 13px; font-weight: 600; white-space: nowrap; background: #f8fafc; padding: 4px 12px; border-radius: 20px; border: 1px solid #e2e8f0;">
                Timestamp: ${err.time}
             </div>
          </div>
          ${stackFrameHTML}
        </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
      return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.ErrorInspector = ErrorInspector;
