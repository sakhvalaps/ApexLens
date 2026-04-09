# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ApexLens** is a Chrome extension (Manifest V3) that provides an advanced debugging and analysis dashboard for Salesforce Apex debug logs. It injects analysis buttons into Salesforce pages and opens a side panel with interactive visualizations.

## Development Workflow

**No build process.** This is a vanilla JavaScript project with no npm, bundling, or transpilation. Load the extension directly in Chrome:

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After any code change, click the refresh icon on the extension card

**Testing changes:** Reload the extension, navigate to a Salesforce debug log page, and click the injected "Inspect Log" button. The side panel opens with the analysis.

**The only external dependency** is D3.js, vendored at `lib/d3.min.js`.

## Architecture

### Data Flow

```
Salesforce page (debug log URL)
  → content/content.js          # Detects log IDs, injects buttons, fetches log
  → chrome.storage.local        # Stores raw log text
  → background/service-worker.js # Receives openAnalyzerTab message, opens tab
  → sidepanel/sidepanel.js      # Orchestrates parsing and rendering
      → lib/log-parser.js       # Parses raw log text into structured entries
      → lib/analyzer.js         # Extracts DML/SOQL counts, errors, governor limits
      → lib/tree-builder.js     # Builds method execution trees
      → components/*.js         # Each component renders one dashboard tab
```

### Key Architectural Rules

- **All analysis is in-memory per session.** No persistence beyond `chrome.storage.local` for the raw log.
- **Components are self-contained classes** (e.g., `RawLogView`, `DMLDashboard`, `FlowGraph`) each with a `render(container, data)` method. They are instantiated and called from `sidepanel/sidepanel.js`.
- **sidepanel.js is the orchestrator.** It retrieves the stored log, runs the three library steps (parse → analyze → build trees), then calls each component's render method.
- **Content script detection** uses Salesforce log ID patterns (`07L` + 12-15 alphanumeric chars) and handles both Classic and Lightning UX, plus Apex Developer Console (ExtJS grid).

### Component Map

| Component file | Tab / Purpose |
|---|---|
| `components/raw-log-view.js` | Raw log with syntax highlighting, search, minimap |
| `components/raw-tree-view.js` | Full execution tree (all events) |
| `components/apex-debug-view.js` | User `System.debug()` statements |
| `components/flow-graph.js` | D3.js method call graph |
| `components/dml-dashboard.js` | DML operations and counts |
| `components/soql-analyzer.js` | SOQL query analysis and tips |
| `components/performance-dashboard.js` | CPU, heap, execution time metrics |
| `components/governor-limits.js` | Real-time governor limit consumption |
| `components/error-inspector.js` | Exceptions and error aggregation |
| `components/timeline.js` | Event timeline with duration visualization |

### Core Libraries

| File | Class | Responsibility |
|---|---|---|
| `lib/log-parser.js` | `SalesforceLogParser` | Regex-parses `HH:MM:SS.mmm (nanos)\|EVENT\|..` lines into structured objects |
| `lib/analyzer.js` | `LogAnalyzer` | Aggregates metrics (DML, SOQL, errors, governor limits, method durations) |
| `lib/tree-builder.js` | `TreeBuilder` | Three tree strategies: method-only, full, and significant (noise-filtered) |
| `lib/chart-builder.js` | `ChartBuilder` | Chart utilities (currently stubbed) |

### Styling

CSS variables are defined in `styles/common.css`. Dark/light themes are toggled via `.dark-theme` on `<body>` — see `styles/themes.css`. Glassmorphism (`backdrop-filter: blur`) is used throughout. Do not inline styles; use existing CSS variables.

## Adding a New Analysis Component

1. Create `components/my-analysis.js` with a class that has a `render(container, parsedLog, analysisData)` signature.
2. Add a `<script src="../components/my-analysis.js">` tag in `sidepanel/sidepanel.html` (before `sidepanel.js`).
3. Instantiate and call it in `sidepanel/sidepanel.js` alongside the other components.
4. Add a tab button in `sidepanel/sidepanel.html` matching the tab-switching pattern already in place.

## Manifest Permissions

Host permissions cover `*.salesforce.com`, `*.force.com`, `*.visualforce.com`, and `*.salesforce-setup.com`. Any new Salesforce domain must be added to `manifest.json` `host_permissions`.
