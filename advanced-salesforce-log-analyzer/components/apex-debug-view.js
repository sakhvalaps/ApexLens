class ApexDebugView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(logs) {
    if (!this.container) return;
    
    const debugLogs = logs.filter(l => l.event === 'USER_DEBUG' || l.event === 'SYSTEM_LOG');
    
    if (debugLogs.length === 0) {
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 75vh; text-align: center; padding: 40px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
            <path d="m18 16 4-4-4-4"></path>
            <path d="m6 8-4 4 4 4"></path>
            <path d="m14.5 4-5 16"></path>
          </svg>
          <h3 style="font-size: 18px; font-weight: 600; color: var(--text-main); margin: 0 0 8px 0;">No Debug Logs Available</h3>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 280px; margin: 0 0 24px 0; line-height: 1.6;">No USER_DEBUG or SYSTEM_LOG entries were found in this log.</p>
        </div>
      `;
      return;
    }
    
    let html = '<h2>Apex Debug Logs</h2><div style="margin-top: 16px;">';
    debugLogs.forEach(log => {
      const ms = (log.nanos / 1000000).toFixed(2);
      html += `<div style="padding: 8px 12px; margin-bottom: 6px; background: #f9fafb; border-left: 3px solid #0176d3; border-radius: 4px; font-family: monospace; font-size: 12px;">
        <span style="color: #6b7280;">[${ms}ms]</span> ${this.escapeHtml(log.details || '')}
      </div>`;
    });
    html += '</div>';
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.ApexDebugView = ApexDebugView;
