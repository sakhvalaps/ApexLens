class GovernorLimitsTracker {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(analysis) {
    if (!this.container) return;
    
    let html = `<h3>Governor Limits</h3>
      <div style="display: flex; flex-direction: column; gap: 16px;">
    `;
    
    for (const [key, limit] of Object.entries(analysis.limits)) {
      const percentage = limit.max > 0 ? (limit.used / limit.max) * 100 : 0;
      const progressColor = percentage > 80 ? '#e53e3e' : (percentage > 50 ? '#dd6b20' : '#38a169');
      
      html += `
        <div class="limit-bar-container" style="background: var(--bg-surface); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong style="text-transform: uppercase;">${key}</strong>
            <span>${limit.used} / ${limit.max} (${percentage.toFixed(1)}%)</span>
          </div>
          <div style="background: var(--bg-main); height: 12px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color);">
            <div style="background: ${progressColor}; height: 100%; width: ${Math.min(percentage, 100)}%; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    this.container.innerHTML = html;
  }
}

window.GovernorLimitsTracker = GovernorLimitsTracker;
