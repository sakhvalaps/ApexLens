/**
 * SalesforceLogParser — parses raw Apex debug log text into structured entry objects.
 *
 * Key improvements over the original:
 *  - 50 MB hard limit: truncates before any allocation so extremely large files
 *    do not freeze the browser.
 *  - O(n) multiline handling: continuation lines are collected into a temporary
 *    array and joined once at the end, avoiding the O(n²) string-concatenation
 *    pattern of the original.
 *  - Line-boundary walk: uses indexOf('\n') instead of split('\n') to avoid
 *    creating a second giant array of substrings.
 *  - Blank-line reset: a blank line correctly terminates a multi-line entry
 *    (matches real Salesforce log behaviour).
 */
class SalesforceLogParser {
  /** Hard cap on the raw text we will attempt to parse (50 MB). */
  static MAX_LOG_SIZE = 50 * 1024 * 1024;

  constructor() {
    this.logs     = [];
    this.metadata = {};
  }

  parse(rawLogText) {
    if (!rawLogText) { this.logs = []; return []; }

    // ── Size guard ────────────────────────────────────────────────────────────
    if (rawLogText.length > SalesforceLogParser.MAX_LOG_SIZE) {
      const mb = (rawLogText.length / 1024 / 1024).toFixed(1);
      console.warn(
        `[ApexLens] Log is ${mb} MB — exceeds the 50 MB limit. ` +
        `Truncating to the first 50 MB. Some entries may be cut off.`
      );
      rawLogText = rawLogText.substring(0, SalesforceLogParser.MAX_LOG_SIZE);
    }

    // ── Regex for a standard Salesforce debug-log line ────────────────────────
    // e.g.  09:30:17.027 (27179000)|USER_DEBUG|[1]|DEBUG|Hello World
    const LOG_RE = /^(\d{2}:\d{2}:\d{2}\.\d+) \((\d+)\)\|([A-Z_]+)\|?(.*)/;

    const parsedLogs = [];
    let currentLog = null;
    let lineNumber  = 0;
    let pos         = 0;
    const len       = rawLogText.length;

    // ── Line-by-line walk (no split — avoids a second large array) ────────────
    while (pos <= len) {
      let nl = rawLogText.indexOf('\n', pos);
      if (nl === -1) nl = len;

      // Slice the current line (strip trailing \r for Windows CRLF)
      let line = rawLogText.substring(pos, nl);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      pos = nl + 1;
      lineNumber++;

      // A blank line terminates any in-flight multi-line entry
      if (!line.trim()) {
        currentLog = null;
        continue;
      }

      const m = line.match(LOG_RE);
      if (m) {
        currentLog = {
          lineNumber,
          time:    m[1],
          nanos:   parseInt(m[2], 10),
          event:   m[3],
          details: m[4],
          raw:     line,
          _cont:   null,   // accumulator for continuation lines
        };
        parsedLogs.push(currentLog);
      } else if (currentLog) {
        // Continuation line (e.g. exception stack trace, long SOQL query).
        // Collect into an array and join once — avoids O(n²) concatenation.
        if (currentLog._cont === null) {
          currentLog._cont = [];
        }
        currentLog._cont.push(line);
      } else {
        // Header line or unrecognised format
        parsedLogs.push({
          lineNumber,
          time:    '',
          nanos:   0,
          event:   'HEADER',
          details: line,
          raw:     line,
          _cont:   null,
        });
      }
    }

    // ── Resolve continuation lines (single-pass, O(n)) ────────────────────────
    for (const log of parsedLogs) {
      if (log._cont !== null && log._cont.length > 0) {
        const extra  = log._cont.join('\n');
        log.details += '\n' + extra;
        log.raw     += '\n' + extra;
      }
      delete log._cont;  // clean up internal field
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
