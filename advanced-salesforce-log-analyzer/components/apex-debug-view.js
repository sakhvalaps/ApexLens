class ApexDebugView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(logs) {
    if (!this.container) return;
    
    // Filter only USER_DEBUG and related Apex events
    const debugLogs = logs.filter(log => 
        log.event === 'USER_DEBUG' || 
        log.event === 'FATAL_ERROR' || 
        log.event === 'EXCEPTION_THROWN' ||
        log.event === 'SYSTEM_METHOD_ENTRY' ||
        log.event === 'SYSTEM_METHOD_EXIT'
    );

    let html = '<div class="raw-log-controls" style="margin-bottom: 12px; display: flex; gap: 8px;">';
    html += '<input type="text" placeholder="Search apex debug..." style="padding: 8px; flex: 1; border: 1px solid var(--border-color); border-radius: 4px;"/>';
    html += '<button style="padding: 8px 16px;">Search</button>';
    html += '</div>';
    
    html += '<div class="raw-log-lines" style="background: var(--bg-surface); border: 1px solid var(--border-color); overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.4; display: flex; flex-direction: column; padding-bottom: 20px;">';
    
    if (debugLogs.length === 0) {
        html += '<div style="padding: 12px; color: #888;">No Apex debug statements found in this log.</div>';
    }

    debugLogs.forEach(log => {
      html += `<div class="log-line" style="display: flex; white-space: pre; border-bottom: 1px solid #f0f0f0;">`;
      
      // Gutter (line numbers)
      html += `<div style="width: 50px; flex-shrink: 0; text-align: right; padding-right: 8px; color: #888; background: #f8f9fa; border-right: 1px solid #ddd; user-select: none; margin-right: 8px;">${log.lineNumber}</div>`;
      
      // Content
      let detailsHtml = this.escapeHtml(log.details);
      if (log.event.includes('ERROR') || log.event.includes('EXCEPTION') || log.event.includes('FATAL')) {
          detailsHtml = `<span style="color: #e53e3e; font-weight: bold;">${detailsHtml}</span>`;
      } else if (log.event === 'USER_DEBUG') {
          // Highlight USER_DEBUG text in bold blue/green
          detailsHtml = `<span style="color: #0b7a75; font-weight: 500;">${detailsHtml}</span>`;
      }

      html += `<div style="padding: 2px 4px;">` +
        `<span style="color: #2e8b57;">${log.time}</span>|` +
        `<span style="color: #0000ff;">${this.escapeHtml(log.event)}</span>|` +
        `<span>${detailsHtml}</span>` +
      `</div>`;
      
      html += `</div>`;
    });
    
    html += '</div>';
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.ApexDebugView = ApexDebugView;
