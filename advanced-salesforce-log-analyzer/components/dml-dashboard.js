class DMLDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    let html = `<h3>DML Operations</h3>
      <div class="summary-cards" style="display: flex; gap: 16px; margin-bottom: 20px;">
        <div class="card" style="padding: 16px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px;">
          <h4 style="margin:0 0 8px 0;">Total DMLs</h4>
          <p style="margin:0; font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">${analysis.dmlCount}</p>
        </div>
        <div class="card" style="padding: 16px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px;">
          <h4 style="margin:0 0 8px 0;">Limit Usage</h4>
          <p style="margin:0; font-size: 1.5rem; font-weight: bold;">${analysis.limits.dml.used} / ${analysis.limits.dml.max}</p>
        </div>
      </div>
      <h4>Detailed DML Statements</h4>
      <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border-color);">
            <th style="padding: 8px;">Line</th>
            <th style="padding: 8px;">Time</th>
            <th style="padding: 8px;">Details</th>
          </tr>
        </thead>
        <tbody>
    `;

    analysis.dmls.forEach(dml => {
      html += `<tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 8px;">${dml.lineNumber}</td>
        <td style="padding: 8px;">${dml.time}</td>
        <td style="padding: 8px; font-family: monospace; font-size: 0.9em;">${this.escapeHtml(dml.details)}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
      return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.DMLDashboard = DMLDashboard;
