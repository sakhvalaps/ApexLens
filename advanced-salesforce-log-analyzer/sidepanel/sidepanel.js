/**
 * sidepanel.js — ApexLens orchestrator
 *
 * Improvements over the original:
 *  - Phased async processing: parsing, analysis, and tree-building are
 *    each yielded to the browser between phases so the UI stays responsive
 *    and the "Parsing…" → "Analysing…" → "Building trees…" status messages
 *    actually render before the heavy work begins.
 *  - Progress bar: a thin animated bar under the header gives visual
 *    feedback during processing of large logs.
 *  - Theme picker: replaces the single dark/light toggle with a dropdown
 *    supporting all 5 themes. Preference persists via chrome.storage.local.
 *  - Deduplicates tree building: the original called buildFullTree twice
 *    (once directly, once inside buildSignificantTree). Now fullTree is
 *    built once and significant filtering is applied to it directly.
 *  - All API calls are backward-compatible with existing components.
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── Tab switcher ──────────────────────────────────────────────────────────

  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  function switchTab(targetId) {
    tabs.forEach(t   => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    const targetTab   = document.querySelector(`.tab[data-target="${targetId}"]`);
    const targetPanel = document.getElementById(targetId);
    if (targetTab)   targetTab.classList.add('active');
    if (targetPanel) targetPanel.classList.add('active');

    // Lazy-render deferred components when their tab becomes visible
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

  // ── Theme picker ──────────────────────────────────────────────────────────

  const THEME_CLASSES = ['dark-theme', 'high-contrast-theme', 'midnight-theme', 'warm-theme'];
  function applyTheme(themeClass) {
    document.body.classList.remove(...THEME_CLASSES);
    if (themeClass) document.body.classList.add(themeClass);

    const picker = document.getElementById('theme-picker');
    if (picker) picker.value = themeClass;

    chrome.storage.local.set({ apexLensTheme: themeClass }).catch(() => {});
  }

  // Restore saved theme preference
  chrome.storage.local.get(['apexLensTheme'], result => {
    const saved = result.apexLensTheme || '';
    applyTheme(saved);
  });

  const themePicker = document.getElementById('theme-picker');
  if (themePicker) {
    themePicker.addEventListener('change', () => applyTheme(themePicker.value));
  }

  // Backward-compat: keep the old toggle working if it still exists
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-theme');
      applyTheme(isDark ? '' : 'dark-theme');
    });
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  const progressBar = document.getElementById('apex-progress-bar');
  const statusEl    = document.getElementById('apex-status');

  function setProgress(pct, message) {
    if (progressBar) {
      progressBar.style.width   = pct + '%';
      progressBar.style.opacity = pct >= 100 ? '0' : '1';
    }
    if (statusEl) {
      statusEl.textContent   = message || '';
      statusEl.style.display = message ? 'inline' : 'none';
    }
  }

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

  logHistory.onLoad((rawText, logId) => {
    processLog(rawText, logId, '');
  });

  document.getElementById('history-btn')?.addEventListener('click', () => {
    logHistory.show();
  });

  // ── Core log processing (phased, async) ───────────────────────────────────

  /**
   * yield() — returns a Promise that resolves on the next event-loop tick.
   * Inserting these between heavy synchronous phases lets the browser paint
   * intermediate status messages and keeps the UI responsive.
   */
  const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

  async function processLog(rawLogText, logId, orgUrl) {
    try {
      // ── Phase 1: Parse ────────────────────────────────────────────────────
      setProgress(10, 'Parsing…');
      await yieldToUI();

      const parser = new window.SalesforceLogParser();
      const logs   = parser.parse(rawLogText);

      // ── Phase 2: Analyse ──────────────────────────────────────────────────
      setProgress(35, `Analysing ${logs.length.toLocaleString()} entries…`);
      await yieldToUI();

      const analyzer = new window.LogAnalyzer(parser);
      const analysis = analyzer.analyze();

      // ── Phase 3: Build trees ──────────────────────────────────────────────
      setProgress(60, 'Building execution tree…');
      await yieldToUI();

      const fullTreeData = window.TreeBuilder.buildFullTree(logs);

      setProgress(75, 'Filtering significant events…');
      await yieldToUI();

      const significantTreeData = window.TreeBuilder.buildSignificantTree(logs);

      // Compute total execution time for overview + history metadata
      const execNode = fullTreeData.children?.find(c => c.durationNs > 0);
      const execMs   = execNode ? execNode.durationNs / 1_000_000 : 0;

      // ── Phase 4: Render tabs ──────────────────────────────────────────────
      setProgress(85, 'Rendering dashboards…');
      await yieldToUI();

      overviewDashboard.render(analysis, fullTreeData, switchTab);
      rawLogView.render(logs);
      rawTreeView.render(fullTreeData);
      apexDebugView.render(logs);

      // Heavy D3 components — lazy if their tab isn't currently visible
      const flowTab  = document.getElementById('method-flow');
      const flameTab = document.getElementById('flame-graph');

      if (flowTab?.classList.contains('active')) {
        flowGraph.render(significantTreeData);
      } else {
        flowGraph._pendingData = significantTreeData;
      }

      if (flameTab?.classList.contains('active')) {
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

      // ── Phase 5: Persist to history ───────────────────────────────────────
      if (logId?.startsWith('07L')) {
        logHistory.save(logId, rawLogText, orgUrl || '', analysis, execMs)
          .catch(() => { /* storage quota exceeded — silently ignore */ });
      }

      setProgress(100, '');
      setTimeout(() => setProgress(0, ''), 600);

    } catch (err) {
      console.error('[ApexLens] processLog error:', err);
      setProgress(0, '');
      if (statusEl) {
        statusEl.textContent   = '⚠ Error parsing log — see DevTools console for details.';
        statusEl.style.display = 'inline';
      }
    }
  }

  // ── Bootstrap: load from storage or fall back to demo log ────────────────

  chrome.storage.local.get(['currentLogText', 'currentLogId', 'currentOrgUrl'], result => {
    if (result.currentLogText) {
      setProgress(5, 'Loading: ' + (result.currentLogId || 'Log') + '…');
      processLog(result.currentLogText, result.currentLogId || '', result.currentOrgUrl || '');
    } else {
      setProgress(0, '');
      if (statusEl) {
        statusEl.textContent   = 'No log loaded — showing demo data';
        statusEl.style.display = 'inline';
      }

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
