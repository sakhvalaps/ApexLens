class OverviewDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  // ── Health Score ──────────────────────────────────────────────────────────

  _computeHealth(analysis, execMs) {
    let score  = 100;
    const issues = [];

    // Governor limits
    for (const [key, limit] of Object.entries(analysis.limits)) {
      const pct = limit.max > 0 ? (limit.used / limit.max) * 100 : 0;
      if (pct > 85) {
        score -= 22;
        issues.push({
          sev: 'critical', tab: 'limits',
          text: `${key.toUpperCase()} limit at ${pct.toFixed(0)}% (${limit.used} / ${limit.max}) — critically high`,
          icon: '🔴'
        });
      } else if (pct > 65) {
        score -= 8;
        issues.push({
          sev: 'warning', tab: 'limits',
          text: `${key.toUpperCase()} limit at ${pct.toFixed(0)}% (${limit.used} / ${limit.max})`,
          icon: '🟡'
        });
      }
    }

    // N+1 SOQL patterns
    for (const p of (analysis.n1Patterns || [])) {
      score -= 15;
      const shortQ = p.query.length > 55 ? p.query.substring(0, 55) + '…' : p.query;
      issues.push({
        sev: 'critical', tab: 'soql-analyzer',
        text: `N+1 SOQL: "${shortQ}" fires ${p.occurrences}× inside ${p.parentMethod}`,
        icon: '🔴'
      });
    }

    // DML in loops
    for (const d of (analysis.dmlInLoops || [])) {
      score -= 15;
      issues.push({
        sev: 'critical', tab: 'dml-dashboard',
        text: `DML in loop: ${d.operation} runs ${d.occurrences}× inside ${d.parentMethod}`,
        icon: '🔴'
      });
    }

    // Exceptions
    if (analysis.errors.length > 0) {
      score -= Math.min(20, analysis.errors.length * 10);
      issues.push({
        sev: 'critical', tab: 'errors',
        text: `${analysis.errors.length} exception${analysis.errors.length > 1 ? 's' : ''} thrown during execution`,
        icon: '🔴'
      });
    }

    // Slow methods (>300ms)
    const slowMethods = (analysis.methods || []).filter(m => m.durationNanos > 300_000_000);
    if (slowMethods.length > 0) {
      score -= Math.min(15, slowMethods.length * 5);
      issues.push({
        sev: 'warning', tab: 'perf-dashboard',
        text: `${slowMethods.length} method${slowMethods.length > 1 ? 's' : ''} took over 300ms`,
        icon: '🟡'
      });
    }

    // Execution time
    if (execMs > 8000) {
      score -= 10;
      issues.push({ sev: 'warning', tab: 'perf-dashboard', text: `Total execution time ${execMs.toFixed(0)}ms — approaching 10s CPU limit`, icon: '🟡' });
    }

    score = Math.max(0, score);

    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    const gradeColor = score >= 90 ? '#059669' : score >= 75 ? '#0176d3' : score >= 60 ? '#d97706' : score >= 40 ? '#ea580c' : '#ef4444';
    const gradeBg    = score >= 90 ? '#ecfdf5' : score >= 75 ? '#eff6ff' : score >= 60 ? '#fffbeb' : score >= 40 ? '#fff7ed' : '#fff1f2';
    const gradeLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : score >= 40 ? 'Poor' : 'Critical';

    return { score, grade, gradeColor, gradeBg, gradeLabel, issues };
  }

  render(analysis, fullTreeData, switchTab) {
    if (!this.container) return;

    // Total execution time from the first EXECUTION child of ROOT
    const execNode = fullTreeData && fullTreeData.children &&
      fullTreeData.children.find(c => c.durationNs > 0);
    const execMs = execNode ? execNode.durationNs / 1_000_000 : 0;

    const health = this._computeHealth(analysis, execMs);

    // Top 5 methods by duration for the "Top Consumers" table
    const topMethods = [...(analysis.methods || [])]
      .sort((a, b) => b.durationNanos - a.durationNanos)
      .slice(0, 5);

    const totalMethodMs = topMethods.reduce((s, m) => s + m.durationNanos / 1_000_000, 0);

    const getMethodName = (m) => {
      let s = m.entry.details || '';
      if (s.includes('|')) s = s.split('|').pop().trim();
      return s || 'Unknown';
    };

    // ── Issues section ───────────────────────────────────────────────────────
    const issueRows = health.issues.length > 0
      ? health.issues.map(issue => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-left:3px solid ${issue.sev === 'critical' ? '#ef4444' : '#f59e0b'};background:${issue.sev === 'critical' ? '#fff5f5' : '#fffbeb'};border-radius:0 8px 8px 0;cursor:pointer;"
               data-tab="${issue.tab}" class="overview-issue-row">
            <span style="font-size:16px;flex-shrink:0;">${issue.icon}</span>
            <span style="font-size:13px;color:${issue.sev === 'critical' ? '#7f1d1d' : '#78350f'};flex:1;font-weight:500;">${issue.text}</span>
            <span style="font-size:11px;color:#94a3b8;white-space:nowrap;font-weight:600;">View →</span>
          </div>`).join('')
      : `<div style="display:flex;align-items:center;gap:12px;padding:16px;background:#f0fdf4;border-radius:10px;color:#166534;">
           <span style="font-size:22px;">✅</span>
           <span style="font-weight:600;font-size:14px;">No critical issues detected — this transaction looks healthy!</span>
         </div>`;

    // ── Top consumers table ──────────────────────────────────────────────────
    const topRows = topMethods.length > 0
      ? topMethods.map((m, i) => {
          const ms  = (m.durationNanos / 1_000_000).toFixed(2);
          const pct = totalMethodMs > 0 ? ((m.durationNanos / 1_000_000 / totalMethodMs) * 100).toFixed(1) : '0.0';
          const name = getMethodName(m);
          const isSlow = m.durationNanos > 300_000_000;
          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 16px;color:#94a3b8;font-weight:700;font-size:12px;">#${i+1}</td>
              <td style="padding:10px 16px;font-family:Consolas,monospace;font-size:12px;color:#1e293b;word-break:break-all;">${name}</td>
              <td style="padding:10px 16px;white-space:nowrap;">
                <span style="background:${isSlow ? '#fee2e2' : '#f1f5f9'};color:${isSlow ? '#991b1b' : '#475569'};padding:3px 8px;border-radius:5px;font-weight:700;font-size:12px;">${ms} ms</span>
              </td>
              <td style="padding:10px 16px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:80px;height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${isSlow ? '#ef4444' : '#0176d3'};border-radius:3px;"></div>
                  </div>
                  <span style="font-size:11px;color:#64748b;font-weight:600;">${pct}%</span>
                </div>
              </td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="padding:20px;text-align:center;color:#64748b;font-size:13px;">No METHOD_ENTRY/EXIT events in this log — enable Apex Code debug level for method tracking.</td></tr>`;

    // ── Render ───────────────────────────────────────────────────────────────
    this.container.innerHTML = `
      <div style="padding:24px;max-width:100%;">

        <!-- Header -->
        <h3 style="margin:0 0 24px;font-size:1.5rem;font-weight:800;color:var(--text-main);">Transaction Health Overview</h3>

        <!-- Score + Quick Stats -->
        <div style="display:flex;gap:20px;margin-bottom:28px;flex-wrap:wrap;align-items:stretch;">

          <!-- Grade circle -->
          <div style="background:${health.gradeBg};border:2px solid ${health.gradeColor}33;border-radius:16px;padding:24px 28px;display:flex;align-items:center;gap:24px;min-width:240px;">
            <div style="width:90px;height:90px;border-radius:50%;background:${health.gradeColor}18;border:4px solid ${health.gradeColor};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="font-size:34px;font-weight:900;color:${health.gradeColor};line-height:1;">${health.grade}</span>
              <span style="font-size:13px;font-weight:600;color:${health.gradeColor}bb;">${health.score}</span>
            </div>
            <div>
              <div style="font-size:18px;font-weight:800;color:${health.gradeColor};">${health.gradeLabel}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5;">
                ${health.issues.length === 0 ? 'No issues found' : `${health.issues.filter(i=>i.sev==='critical').length} critical, ${health.issues.filter(i=>i.sev==='warning').length} warnings`}
              </div>
            </div>
          </div>

          <!-- Quick metric cards -->
          <div style="display:flex;gap:12px;flex:1;flex-wrap:wrap;align-items:stretch;">
            <div style="flex:1;min-width:110px;padding:16px;background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;">
              <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Exec Time</div>
              <div style="font-size:1.6rem;font-weight:800;color:#0f172a;">${execMs > 0 ? execMs.toFixed(1) : '—'}<span style="font-size:12px;color:#94a3b8;font-weight:500;"> ms</span></div>
            </div>
            <div style="flex:1;min-width:110px;padding:16px;background:#fff;border:1.5px solid ${analysis.soqlCount > 50 ? '#ef4444' : '#e2e8f0'};border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;">
              <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">SOQL</div>
              <div style="font-size:1.6rem;font-weight:800;color:${analysis.soqlCount > 50 ? '#ef4444' : '#1d4ed8'};">${analysis.soqlCount}<span style="font-size:11px;color:#94a3b8;font-weight:400;"> / 100</span></div>
            </div>
            <div style="flex:1;min-width:110px;padding:16px;background:#fff;border:1.5px solid ${analysis.dmlCount > 100 ? '#ef4444' : '#e2e8f0'};border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;">
              <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">DML</div>
              <div style="font-size:1.6rem;font-weight:800;color:${analysis.dmlCount > 100 ? '#ef4444' : '#7c3aed'};">${analysis.dmlCount}<span style="font-size:11px;color:#94a3b8;font-weight:400;"> / 150</span></div>
            </div>
            <div style="flex:1;min-width:110px;padding:16px;background:#fff;border:1.5px solid ${analysis.errors.length > 0 ? '#ef4444' : '#e2e8f0'};border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;">
              <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Errors</div>
              <div style="font-size:1.6rem;font-weight:800;color:${analysis.errors.length > 0 ? '#ef4444' : '#059669'};">${analysis.errors.length}</div>
            </div>
            <div style="flex:1;min-width:110px;padding:16px;background:#fff;border:1.5px solid ${(analysis.n1Patterns||[]).length > 0 ? '#ef4444' : '#e2e8f0'};border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;">
              <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">N+1 Patterns</div>
              <div style="font-size:1.6rem;font-weight:800;color:${(analysis.n1Patterns||[]).length > 0 ? '#ef4444' : '#94a3b8'};">${(analysis.n1Patterns||[]).length}</div>
            </div>
          </div>
        </div>

        <!-- Issues to Address -->
        <div style="margin-bottom:28px;">
          <h4 style="margin:0 0 12px;font-size:1rem;font-weight:700;color:var(--text-main);display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            Issues to Address
          </h4>
          <div style="display:flex;flex-direction:column;gap:6px;">${issueRows}</div>
        </div>

        <!-- Top Consumers -->
        <div>
          <h4 style="margin:0 0 12px;font-size:1rem;font-weight:700;color:var(--text-main);display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0176d3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            Top Method Consumers
          </h4>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.04);">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                  <th style="padding:12px 16px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;">Rank</th>
                  <th style="padding:12px 16px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;">Method</th>
                  <th style="padding:12px 16px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;">Duration</th>
                  <th style="padding:12px 16px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;">Share</th>
                </tr>
              </thead>
              <tbody>${topRows}</tbody>
            </table>
          </div>
        </div>

      </div>`;

    // Wire up "View →" issue rows to switch tabs
    this.container.querySelectorAll('.overview-issue-row[data-tab]').forEach(row => {
      row.addEventListener('click', () => {
        if (typeof switchTab === 'function') switchTab(row.dataset.tab);
      });
    });
  }
}

window.OverviewDashboard = OverviewDashboard;
