class LogAnalyzer {
  constructor(parser) {
    this.logs = parser.logs;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _getMethodLabel(log) {
    if (!log) return 'Root';
    const d = log.details || '';
    // METHOD_ENTRY details: "[line]|ClassName.method()" — take the last segment
    if (d.includes('|')) return d.split('|').pop().trim();
    return d.trim() || 'Unknown';
  }

  _normalizeQuery(rawDetails) {
    // rawDetails may start with "Aggregations:0|SELECT ..." — strip the prefix
    let q = (rawDetails || '').replace(/^[^|]*\|/, '').trim();
    // Remove line references like [5]|
    q = q.replace(/^\[\d+\]\|?/, '').trim();
    return q.replace(/\s+/g, ' ').toLowerCase();
  }

  // ── N+1 SOQL Detection ───────────────────────────────────────────────────

  _detectN1(soqlsWithContext) {
    const groups = {};
    for (const item of soqlsWithContext) {
      const key = this._normalizeQuery(item.log.details).substring(0, 200);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    const patterns = [];
    for (const [query, items] of Object.entries(groups)) {
      if (items.length < 2) continue;

      // Group by immediate parent method — same parent executing same query N times = N+1
      const byParent = {};
      for (const item of items) {
        const parent = this._getMethodLabel(item.parentMethod);
        if (!byParent[parent]) byParent[parent] = [];
        byParent[parent].push(item);
      }

      for (const [parentMethod, instances] of Object.entries(byParent)) {
        if (instances.length >= 2) {
          patterns.push({
            query: query.substring(0, 120),
            occurrences: instances.length,
            parentMethod,
            lineNumbers: instances.map(i => i.log.lineNumber),
            times: instances.map(i => i.log.time)
          });
        }
      }
    }
    return patterns;
  }

  // ── DML-in-Loop Detection ─────────────────────────────────────────────────

  _detectDmlInLoops(dmlsWithContext) {
    const byParent = {};
    for (const item of dmlsWithContext) {
      const parent = this._getMethodLabel(item.parentMethod);
      if (!byParent[parent]) byParent[parent] = [];
      byParent[parent].push(item);
    }

    const patterns = [];
    for (const [parentMethod, instances] of Object.entries(byParent)) {
      if (instances.length < 2) continue;

      // Further group by operation+object so "Insert Account × 3" is one pattern
      const opGroups = {};
      for (const inst of instances) {
        const opMatch  = inst.log.details.match(/Op:([^|]+)/);
        const typeMatch = inst.log.details.match(/Type:([^|]+)/);
        const key = `${(opMatch?.[1] || '').trim()} ${(typeMatch?.[1] || '').trim()}`.trim() || 'DML';
        if (!opGroups[key]) opGroups[key] = [];
        opGroups[key].push(inst);
      }

      for (const [operation, opInstances] of Object.entries(opGroups)) {
        if (opInstances.length >= 2) {
          patterns.push({
            operation,
            occurrences: opInstances.length,
            parentMethod,
            lineNumbers: opInstances.map(i => i.log.lineNumber),
            times: opInstances.map(i => i.log.time)
          });
        }
      }
    }
    return patterns;
  }

  // ── Main Analysis ─────────────────────────────────────────────────────────

  analyze() {
    let dmlCount  = 0;
    let soqlCount = 0;
    const errors  = [];
    const queries = [];
    const dmls    = [];
    const methodStack = [];
    const methods = [];

    const limits = {
      soql: { used: 0, max: 100 },
      dml:  { used: 0, max: 150 },
      cpu:  { used: 0, max: 10000 },
      heap: { used: 0, max: 6000000 }
    };

    // Context arrays for pattern detection
    const soqlsWithContext = [];
    const dmlsWithContext  = [];

    for (const log of this.logs) {
      // ── DML ───────────────────────────────────────────────────────────────
      if (log.event.includes('DML_BEGIN')) {
        dmlCount++;
        dmls.push(log);
        dmlsWithContext.push({
          log,
          parentMethod: methodStack.length > 0 ? methodStack[methodStack.length - 1] : null
        });
      }

      // ── SOQL ──────────────────────────────────────────────────────────────
      if (log.event.includes('SOQL_EXECUTE_BEGIN')) {
        soqlCount++;
        queries.push(log);
        soqlsWithContext.push({
          log,
          parentMethod: methodStack.length > 0 ? methodStack[methodStack.length - 1] : null
        });
      }

      // ── Errors ────────────────────────────────────────────────────────────
      if (log.event === 'EXCEPTION_THROWN' || log.event === 'FATAL_ERROR') {
        errors.push(log);
      }

      // ── Method stack (for duration tracking and context) ──────────────────
      if (log.event === 'METHOD_ENTRY') {
        methodStack.push(log);
      }
      if (log.event === 'METHOD_EXIT') {
        const entry = methodStack.pop();
        if (entry) {
          methods.push({
            entry,
            exit: log,
            durationNanos: log.nanos - entry.nanos
          });
        }
      }

      // ── Governor limits (LIMIT_USAGE_FOR_NS is multi-line in parser) ───────
      // Real format:
      //   "  Number of SOQL queries: 2 out of 100"
      //   "  Maximum CPU time: 3200 out of 10000"
      //   "  Maximum heap size: 820000 out of 6000000"
      if (log.event === 'LIMIT_USAGE_FOR_NS' || log.event.includes('LIMIT_USAGE')) {
        const lines = (log.details || '').split('\n');
        for (const line of lines) {
          // Match patterns like "2 out of 100" or "3,200 out of 10,000"
          const m = line.match(/([\d,]+)\s+out\s+of\s+([\d,]+)/);
          if (!m) continue;
          const used = parseInt(m[1].replace(/,/g, ''), 10);
          const max  = parseInt(m[2].replace(/,/g, ''), 10);
          const low  = line.toLowerCase();
          if      (low.includes('soql'))  { if (used > limits.soql.used)  limits.soql  = { used, max }; }
          else if (low.includes('dml'))   { if (used > limits.dml.used)   limits.dml   = { used, max }; }
          else if (low.includes('cpu'))   { if (used > limits.cpu.used)   limits.cpu   = { used, max }; }
          else if (low.includes('heap'))  { if (used > limits.heap.used)  limits.heap  = { used, max }; }
        }
      }
    }

    // Fallback: if log level didn't include LIMIT_USAGE, use running counts
    limits.soql.used = Math.max(limits.soql.used, soqlCount);
    limits.dml.used  = Math.max(limits.dml.used,  dmlCount);

    const n1Patterns = this._detectN1(soqlsWithContext);
    const dmlInLoops = this._detectDmlInLoops(dmlsWithContext);

    return {
      dmlCount, soqlCount, errors, queries, dmls, methods,
      limits, n1Patterns, dmlInLoops,
      totalLogs: this.logs.length
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LogAnalyzer;
} else {
  window.LogAnalyzer = LogAnalyzer;
}
