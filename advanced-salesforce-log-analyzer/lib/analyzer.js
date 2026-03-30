class LogAnalyzer {
  constructor(parser) {
    this.logs = parser.logs;
  }

  analyze() {
    let dmlCount = 0;
    let soqlCount = 0;
    const errors = [];
    const queries = [];
    const dmls = [];
    const methodStack = [];
    const methods = [];
    
    let usedSoql = 0;
    let usedDml = 0;
    const limits = {
        soql: { used: 0, max: 100 },
        dml: { used: 0, max: 150 },
        cpu: { used: 0, max: 10000 },
        heap: { used: 0, max: 6000000 }
    };

    for (const log of this.logs) {
      if (log.event.includes('DML_BEGIN')) {
        dmlCount++;
        dmls.push(log);
        usedDml++;
      }
      if (log.event.includes('SOQL_EXECUTE_BEGIN')) {
        soqlCount++;
        queries.push(log);
        usedSoql++;
      }
      if (log.event === 'EXCEPTION_THROWN' || log.event === 'FATAL_ERROR') {
        errors.push(log);
      }
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
      if (log.event.includes('LIMIT_USAGE')) {
        // Parse basic limit usage info if found in details
        const limitMatch = log.details.match(/([A-Za-z]+): *(\d+) *out of *(\d+)/);
        if (limitMatch) {
            const [, name, used, max] = limitMatch;
            const nm = name.toLowerCase();
            if (limits[nm]) {
                limits[nm] = { used: parseInt(used), max: parseInt(max) };
            }
        }
      }
    }
    
    // If exact limits not found, use running counts
    limits.soql.used = Math.max(limits.soql.used, usedSoql);
    limits.dml.used = Math.max(limits.dml.used, usedDml);

    return {
      dmlCount,
      soqlCount,
      errors,
      queries,
      dmls,
      methods,
      limits,
      totalLogs: this.logs.length
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LogAnalyzer;
} else {
  window.LogAnalyzer = LogAnalyzer;
}
