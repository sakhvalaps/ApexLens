class SalesforceLogParser {
  constructor() {
    this.logs = [];
    this.metadata = {};
  }

  parse(rawLogText) {
    const lines = rawLogText.split('\n');
    const parsedLogs = [];
    
    // Salesforce log line regex pattern: 
    // e.g. 09:30:17.027 (27179000)|USER_DEBUG|[1]|DEBUG|Hello World
    const logPattern = /^(\d{2}:\d{2}:\d{2}\.\d+) \((\d+)\)\|([A-Z_]+)\|?(.*)/;

    let currentLog = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const match = line.match(logPattern);
      if (match) {
        currentLog = {
          lineNumber: i + 1,
          time: match[1],
          nanos: parseInt(match[2]),
          event: match[3],
          details: match[4],
          raw: line
        };
        parsedLogs.push(currentLog);
      } else if (currentLog) {
        // Multi-line log (e.g. exception stack trace or long query)
        currentLog.details += '\n' + line;
        currentLog.raw += '\n' + line;
      } else {
        // Header or unformatted line
        parsedLogs.push({
          lineNumber: i + 1,
          time: '',
          nanos: 0,
          event: 'HEADER',
          details: line,
          raw: line
        });
      }
    }
    
    this.logs = parsedLogs;
    return this.logs;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SalesforceLogParser;
} else {
  window.SalesforceLogParser = SalesforceLogParser;
}
