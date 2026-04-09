class SOQLAnalyzer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  // Static analysis tips for a single SOQL query string
  _getOptimizationTips(queryText) {
    const tips = [];
    const q = queryText.toLowerCase();
    if (!q.includes('where'))           tips.push({ icon: '⚠️', text: 'No WHERE clause — full table scan on every execution' });
    if (q.includes('select *') || q.match(/select\s+\*/)) tips.push({ icon: '⚠️', text: 'Avoid SELECT * — select only the fields you need' });
    if (q.includes('like \'%'))         tips.push({ icon: '⚠️', text: 'Leading wildcard LIKE disables index lookup' });
    if (!q.includes('limit'))           tips.push({ icon: '💡', text: 'Consider adding LIMIT to cap results and save heap' });
    return tips;
  }

  escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  render(analysis) {
    if (!this.container) return;

    const n1Patterns   = analysis.n1Patterns  || [];
    const objectCounts = {};
    const exactQueries = {};

    analysis.queries.forEach(q => {
      const match  = q.details.match(/FROM\s+([A-Za-z0-9_]+)/i);
      const objName = match ? match[1] : 'Unknown';
      objectCounts[objName] = (objectCounts[objName] || 0) + 1;

      // Extract the actual query text (strip prefix like "Aggregations:0|")
      const cleanStr = q.details.replace(/^[^|]*\|/, '').trim();
      exactQueries[cleanStr] = (exactQueries[cleanStr] || 0) + 1;
      q._parsed = { objName, cleanStr };
    });

    const repeatedCount = Object.values(exactQueries).filter(c => c > 1).length;

    // ── N+1 Warning Banner ──────────────────────────────────────────────────
    let n1Html = '';
    if (n1Patterns.length > 0) {
      const items = n1Patterns.map(p => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #fca5a533;">
          <span style="font-size:20px;flex-shrink:0;">🔄</span>
          <div>
            <div style="font-weight:700;font-size:13px;color:#7f1d1d;margin-bottom:4px;">
              Runs <span style="background:#fecaca;padding:1px 6px;border-radius:4px;">${p.occurrences}×</span>
              inside <code style="background:#fee2e2;padding:1px 6px;border-radius:4px;font-size:12px;">${this.escapeHtml(p.parentMethod)}</code>
            </div>
            <div style="font-family:monospace;font-size:11.5px;color:#991b1b;background:#fff5f5;padding:6px 10px;border-radius:6px;border:1px solid #fecaca;word-break:break-all;">
              ${this.escapeHtml(p.query)}${p.query.length >= 120 ? '…' : ''}
            </div>
            <div style="margin-top:6px;font-size:11px;color:#7f1d1d;">
              Lines: ${p.lineNumbers.join(', ')} &nbsp;·&nbsp; Fix: move query above loop and use a Map to match results
            </div>
          </div>
        </div>`).join('');

      n1Html = `
        <div style="background:#fff5f5;border:2px solid #ef4444;border-radius:12px;padding:20px;margin-bottom:28px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <span style="font-size:22px;">🚨</span>
            <div>
              <div style="font-weight:800;font-size:15px;color:#7f1d1d;">N+1 Query Pattern Detected (${n1Patterns.length} pattern${n1Patterns.length > 1 ? 's' : ''})</div>
              <div style="font-size:12px;color:#991b1b;margin-top:2px;">The same SOQL query fires multiple times from the same parent method — a classic Apex governor-limit risk.</div>
            </div>
          </div>
          ${items}
        </div>`;
    }

    // ── DML-in-loop companion warning for context ──────────────────────────
    const dmlLoops = analysis.dmlInLoops || [];
    let dmlLoopHint = dmlLoops.length > 0
      ? `<div style="background:#f5f3ff;border:1.5px solid #c4b5fd;border-radius:10px;padding:12px 16px;margin-bottom:24px;font-size:12.5px;color:#4c1d95;">
           <strong>Note:</strong> ${dmlLoops.length} DML-in-loop pattern${dmlLoops.length > 1 ? 's' : ''} also detected — see the <strong>DML</strong> tab for details.
         </div>`
      : '';

    let html = `
      <div style="padding:24px;">
        <h3 style="margin-top:0;font-size:1.5rem;color:var(--text-main);margin-bottom:24px;">SOQL Query Analyzer</h3>

        ${n1Html}
        ${dmlLoopHint}

        <div style="display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap;">
          <div style="flex:1;min-width:140px;padding:20px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;">
            <div style="font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Total Queries</div>
            <div style="font-size:2rem;font-weight:800;color:#1d4ed8;">${analysis.soqlCount}</div>
          </div>
          <div style="flex:1;min-width:140px;padding:20px;background:#faf5ff;border:1.5px solid #e9d5ff;border-radius:12px;">
            <div style="font-size:11px;font-weight:700;color:#581c87;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Limit Usage</div>
            <div style="font-size:2rem;font-weight:800;color:#7e22ce;">${analysis.limits.soql.used}<span style="font-size:1.1rem;color:#c084fc;"> / ${analysis.limits.soql.max}</span></div>
          </div>
          <div style="flex:1;min-width:140px;padding:20px;background:${repeatedCount > 0 ? '#fff1f2' : '#f0fdf4'};border:1.5px solid ${repeatedCount > 0 ? '#fecdd3' : '#bbf7d0'};border-radius:12px;">
            <div style="font-size:11px;font-weight:700;color:${repeatedCount > 0 ? '#881337' : '#166534'};text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Repeated Queries</div>
            <div style="font-size:2rem;font-weight:800;color:${repeatedCount > 0 ? '#be123c' : '#15803d'};">${repeatedCount}</div>
          </div>
          <div style="flex:1;min-width:140px;padding:20px;background:${n1Patterns.length > 0 ? '#fff5f5' : '#f8fafc'};border:1.5px solid ${n1Patterns.length > 0 ? '#ef4444' : '#e2e8f0'};border-radius:12px;">
            <div style="font-size:11px;font-weight:700;color:${n1Patterns.length > 0 ? '#7f1d1d' : '#475569'};text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">N+1 Patterns</div>
            <div style="font-size:2rem;font-weight:800;color:${n1Patterns.length > 0 ? '#ef4444' : '#94a3b8'};">${n1Patterns.length}</div>
          </div>
        </div>

        <div style="margin-bottom:32px;">
          <h4 style="margin:0 0 14px;font-size:1.05rem;color:var(--text-main);">Queries by Target Object</h4>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${Object.entries(objectCounts).sort((a,b)=>b[1]-a[1]).map(([obj,count])=>`
              <span style="background:#f8fafc;border:1.5px solid #e2e8f0;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:600;color:#334155;">
                ${this.escapeHtml(obj)}
                <span style="background:#cbd5e1;color:#0f172a;border-radius:10px;padding:2px 8px;margin-left:6px;font-size:11px;">${count}</span>
              </span>`).join('')}
          </div>
        </div>

        <h4 style="margin:0 0 14px;font-size:1.05rem;color:var(--text-main);">Detailed SOQL Statements</h4>
        <div style="overflow-x:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,.05);">
          <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px;">
            <thead>
              <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                <th style="padding:14px 16px;font-weight:600;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:.05em;">Line</th>
                <th style="padding:14px 16px;font-weight:600;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:.05em;">Time</th>
                <th style="padding:14px 16px;font-weight:600;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:.05em;">Object</th>
                <th style="padding:14px 16px;font-weight:600;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:.05em;">Query &amp; Tips</th>
              </tr>
            </thead>
            <tbody>`;

    analysis.queries.forEach((q, idx) => {
      const p   = q._parsed || { objName: 'Unknown', cleanStr: q.details };
      const tips = this._getOptimizationTips(p.cleanStr);
      const isN1 = n1Patterns.some(p2 => p2.lineNumbers.includes(q.lineNumber));
      const rowBg = isN1 ? '#fff5f5' : (idx % 2 === 0 ? '#fff' : '#f8fafc');

      const tipHtml = tips.length > 0
        ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">
             ${tips.map(t=>`<span style="font-size:11px;color:#92400e;">${t.icon} ${this.escapeHtml(t.text)}</span>`).join('')}
           </div>`
        : '';

      const n1Badge = isN1
        ? `<span style="font-size:10px;font-weight:700;background:#ef4444;color:#fff;border-radius:4px;padding:1px 6px;margin-right:6px;">N+1</span>`
        : '';

      html += `
        <tr style="border-bottom:1px solid #f1f5f9;background:${rowBg};">
          <td style="padding:12px 16px;color:#64748b;font-family:monospace;vertical-align:top;">${q.lineNumber}</td>
          <td style="padding:12px 16px;color:#64748b;white-space:nowrap;vertical-align:top;">${q.time}</td>
          <td style="padding:12px 16px;vertical-align:top;">
            <span style="background:#e0f2fe;color:#0369a1;padding:4px 8px;border-radius:6px;font-weight:700;font-size:12px;">${this.escapeHtml(p.objName)}</span>
          </td>
          <td style="padding:12px 16px;vertical-align:top;">
            ${n1Badge}
            <span style="font-family:Consolas,monospace;font-size:12.5px;color:#1e293b;line-height:1.5;word-break:break-all;">${this.escapeHtml(p.cleanStr)}</span>
            ${tipHtml}
          </td>
        </tr>`;
    });

    html += `</tbody></table></div></div>`;
    this.container.innerHTML = html;
  }
}

window.SOQLAnalyzer = SOQLAnalyzer;
