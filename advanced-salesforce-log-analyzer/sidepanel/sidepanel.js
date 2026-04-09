document.addEventListener('DOMContentLoaded', () => {
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  // ── Tab switcher (shared, used by overview "View →" links too) ────────────

  function switchTab(targetId) {
    tabs.forEach(t   => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    const targetTab   = document.querySelector(`.tab[data-target="${targetId}"]`);
    const targetPanel = document.getElementById(targetId);
    if (targetTab)   targetTab.classList.add('active');
    if (targetPanel) targetPanel.classList.add('active');

    // Lazy-render deferred components
    if (targetId === 'method-flow' && flowGraph._pendingData) {
      flowGraph.render(flowGraph._pendingData);
      flowGraph._pendingData = null;
    }
    if (targetId === 'flame-graph' && flameGraph._pendingData) {
      flameGraph.render(flameGraph._pendingData);
      flameGraph._pendingData = null;
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled')) return;
      switchTab(tab.getAttribute('data-target'));
    });
  });

  // ── Theme toggle ──────────────────────────────────────────────────────────

  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    themeToggle.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
  });

  // ── Status indicator ─────────────────────────────────────────────────────

  const titleArea = document.querySelector('.title-area');
  const statusEl  = document.createElement('span');
  statusEl.style.cssText = 'margin-left:16px;font-size:0.85rem;color:#888;';
  statusEl.textContent   = 'Checking for loaded logs…';
  if (titleArea) titleArea.appendChild(statusEl);

  // ── Initialise all components ─────────────────────────────────────────────

  const overviewDashboard = new window.OverviewDashboard('overview');
  const rawLogView        = new window.RawLogView('raw-log');
  const rawTreeView       = new window.RawTreeView('raw-tree');
  const apexDebugView     = new window.ApexDebugView('apex-debug');
  const flowGraph         = new window.FlowGraph('method-flow');
  const flameGraph        = new window.FlameGraph('flame-graph');
  const dmlDashboard      = new window.DMLDashboard('dml-dashboard');
  const soqlAnalyzer      = new window.SOQLAnalyzer('soql-analyzer');
  const perfDashboard     = new window.PerformanceDashboard('perf-dashboard');
  const limitsTracker     = new window.GovernorLimitsTracker('limits');
  const errorInspector    = new window.ErrorInspector('errors');
  const timelineLoader    = new window.TimelineVisualization('timeline');

  // ── Log History ───────────────────────────────────────────────────────────

  const logHistory = new window.LogHistory();
  logHistory.init();

  // When user loads a past log from the history panel
  logHistory.onLoad((rawText, logId) => {
    statusEl.style.display = 'inline';
    statusEl.textContent   = `Loading: ${logId}…`;
    processLog(rawText, logId, /*orgUrl*/ '');
  });

  document.getElementById('history-btn').addEventListener('click', () => {
    logHistory.show();
  });

  // ── Core log processing ───────────────────────────────────────────────────

  function processLog(rawLogText, logId, orgUrl) {
    statusEl.style.display = 'inline';
    statusEl.textContent   = 'Parsing…';

    // Yield to the browser so "Parsing…" renders before the heavy work
    setTimeout(() => {
      try {
        const parser   = new window.SalesforceLogParser();
        const logs     = parser.parse(rawLogText);
        const analyzer = new window.LogAnalyzer(parser);
        const analysis = analyzer.analyze();

        const fullTreeData        = window.TreeBuilder.buildFullTree(logs);
        const significantTreeData = window.TreeBuilder.buildSignificantTree(logs);

        // Compute total execution time (used by overview + history metadata)
        const execNode = fullTreeData.children
          && fullTreeData.children.find(c => c.durationNs > 0);
        const execMs = execNode ? execNode.durationNs / 1_000_000 : 0;

        // ── Render all tabs ──

        overviewDashboard.render(analysis, fullTreeData, switchTab);

        rawLogView.render(logs);
        rawTreeView.render(fullTreeData);
        apexDebugView.render(logs);

        // Method Flow — lazy if not the active tab
        const flowTab = document.getElementById('method-flow');
        if (flowTab && flowTab.classList.contains('active')) {
          flowGraph.render(significantTreeData);
        } else {
          flowGraph._pendingData = significantTreeData;
        }

        // Flame Graph — lazy if not the active tab
        const flameTab = document.getElementById('flame-graph');
        if (flameTab && flameTab.classList.contains('active')) {
          flameGraph.render(fullTreeData);
        } else {
          flameGraph._pendingData = fullTreeData;
        }

        dmlDashboard.render(analysis);
        soqlAnalyzer.render(analysis);
        perfDashboard.render(analysis);
        limitsTracker.render(analysis);
        errorInspector.render(analysis);
        timelineLoader.render(fullTreeData);

        // ── Save to history (real Salesforce logs only) ──
        if (logId && logId.startsWith('07L')) {
          logHistory.save(logId, rawLogText, orgUrl || '', analysis, execMs)
            .catch(() => {/* quota exceeded — silently ignore */});
        }

        statusEl.textContent = 'Analysis complete';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);

      } catch (err) {
        console.error('[ApexLens] processLog error:', err);
        statusEl.textContent = '⚠ Error parsing log — see console for details.';
      }
    }, 50);
  }

  // ── Bootstrap: load from storage or fall back to demo log ────────────────

  chrome.storage.local.get(['currentLogText', 'currentLogId', 'currentOrgUrl'], result => {
    if (result.currentLogText) {
      statusEl.textContent = 'Loading: ' + (result.currentLogId || 'Log') + '…';
      processLog(result.currentLogText, result.currentLogId || '', result.currentOrgUrl || '');
    } else {
      statusEl.textContent = 'No log loaded — showing demo';

      // Realistic demo log so every tab shows meaningful data
      const demoLines = [
        '59.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO;DB,INFO;SYSTEM,DEBUG',
        '09:30:17.010 (10000000)|EXECUTION_STARTED',
        '09:30:17.012 (12000000)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|AccountTrigger on Account trigger event BeforeInsert',
        '09:30:17.014 (14000000)|METHOD_ENTRY|[1]|01p000000000001|AccountService.processAccounts(List<Account>)',
        '09:30:17.016 (16000000)|SOQL_EXECUTE_BEGIN|[5]|Aggregations:0|SELECT Id, Name, Industry FROM Account WHERE Industry = \'Technology\'',
        '09:30:17.044 (44000000)|SOQL_EXECUTE_END|[5]|Rows:15',
        '09:30:17.046 (46000000)|METHOD_ENTRY|[20]|01p000000000001|AccountService.validateAccounts(List<Account>)',
        '09:30:17.047 (47000000)|USER_DEBUG|[22]|DEBUG|Validating 15 accounts from trigger',
        '09:30:17.058 (58000000)|METHOD_EXIT|[20]|01p000000000001|AccountService.validateAccounts(List<Account>)',
        '09:30:17.060 (60000000)|METHOD_ENTRY|[28]|01p000000000001|AccountService.enrichAccounts(List<Account>)',
        '09:30:17.062 (62000000)|SOQL_EXECUTE_BEGIN|[30]|Aggregations:0|SELECT AccountId, Amount FROM Opportunity WHERE StageName = \'Closed Won\'',
        '09:30:17.078 (78000000)|SOQL_EXECUTE_END|[30]|Rows:8',
        '09:30:17.079 (79000000)|DML_BEGIN|[35]|Op:Update|Type:Account|Rows:8',
        '09:30:17.098 (98000000)|DML_END|[35]',
        '09:30:17.099 (99000000)|METHOD_EXIT|[28]|01p000000000001|AccountService.enrichAccounts(List<Account>)',
        '09:30:17.100 (100000000)|DML_BEGIN|[42]|Op:Insert|Type:Task|Rows:3',
        '09:30:17.112 (112000000)|DML_END|[42]',
        '09:30:17.113 (113000000)|METHOD_EXIT|[1]|01p000000000001|AccountService.processAccounts(List<Account>)',
        '09:30:17.114 (114000000)|CODE_UNIT_FINISHED|[EXTERNAL]|AccountTrigger on Account trigger event BeforeInsert',
        '09:30:17.115 (115000000)|EXECUTION_FINISHED',
        '09:30:17.115 (115000000)|LIMIT_USAGE_FOR_NS|(default)|',
        '  Number of SOQL queries: 2 out of 100',
        '  Number of DML statements: 2 out of 150',
        '  Maximum CPU time: 3200 out of 10000',
        '  Maximum heap size: 820000 out of 6000000',
      ];

      processLog(demoLines.join('\n'), 'Demo', '');
    }
  });
});
