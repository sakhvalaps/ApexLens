class ErrorInspector {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    let html = `<h3>Error Inspector</h3>
      <div style="margin-bottom: 20px;">
        <div class="card" style="padding: 16px; background: transparent; border: 1px solid #e53e3e; border-radius: 8px;">
          <h4 style="margin:0 0 8px 0; color: #e53e3e;">Total Errors / Exceptions</h4>
          <p style="margin:0; font-size: 1.5rem; font-weight: bold; color: #e53e3e;">${analysis.errors.length}</p>
        </div>
      </div>
      <h4>Exception Details</h4>
    `;

    if (analysis.errors.length === 0) {
      html += `<p style="padding: 16px; background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-color);">No exceptions found in log.</p>`;
    } else {
      analysis.errors.forEach(err => {
        html += `<div style="margin-bottom: 12px; padding: 12px; border: 1px solid #fc8181; border-radius: 4px; border-left: 4px solid #e53e3e; background: var(--bg-surface);">
          <div style="font-weight: bold; margin-bottom: 4px;">Line ${err.lineNumber} - ${err.time}</div>
          <div style="font-family: monospace; white-space: pre-wrap; font-size: 0.9em; overflow-x: auto;">${this.escapeHtml(err.details)}</div>
        </div>`;
      });
    }

    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
      return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.ErrorInspector = ErrorInspector;
