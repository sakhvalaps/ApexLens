document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled')) return;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'method-flow' && flowGraph._pendingData) {
        flowGraph.render(flowGraph._pendingData);
        flowGraph._pendingData = null;
      }
    });
  });

  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    themeToggle.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
  });

  // Initialize components
  const rawLogView = new window.RawLogView('raw-log');
  const rawTreeView = new window.RawTreeView('raw-tree');
  const apexDebugView = new window.ApexDebugView('apex-debug');

  const flowGraph = new window.FlowGraph('method-flow');
  const dmlDashboard = new window.DMLDashboard('dml-dashboard');
  const soqlAnalyzer = new window.SOQLAnalyzer('soql-analyzer');
  const perfDashboard = new window.PerformanceDashboard('perf-dashboard');
  const limitsTracker = new window.GovernorLimitsTracker('limits');
  const errorInspector = new window.ErrorInspector('errors');
  const timelineLoader = new window.TimelineVisualization('timeline');

  // Provide a demo log analysis button for testing
  const titleArea = document.querySelector('.title-area');
  
  // Create a loading state header
  const statusEl = document.createElement('span');
  statusEl.style.marginLeft = '16px';
  statusEl.style.fontSize = '0.9rem';
  statusEl.style.color = '#888';
  statusEl.textContent = 'Checking for loaded logs...';
  if (titleArea) {
    titleArea.appendChild(statusEl);
  }

  function processLog(rawLogText) {
    statusEl.textContent = 'Parsing...';
    // Run asynchronously to allow UI to render 'Parsing...'
    setTimeout(() => {
      try {
        const parser = new window.SalesforceLogParser();
        const logs = parser.parse(rawLogText);
        const analyzer = new window.LogAnalyzer(parser);
        const analysis = analyzer.analyze();
        const treeData = window.TreeBuilder.buildMethodTree(logs);
        const fullTreeData = window.TreeBuilder.buildFullTree(logs);

        rawLogView.render(logs);
        rawTreeView.render(fullTreeData);
        apexDebugView.render(logs);

        const significantTreeData = window.TreeBuilder.buildSignificantTree(logs);
        const flowTab = document.getElementById('method-flow');
        if (flowTab && flowTab.classList.contains('active')) {
          flowGraph.render(significantTreeData);
        } else {
          flowGraph._pendingData = significantTreeData;
        }
        dmlDashboard.render(analysis);
        soqlAnalyzer.render(analysis);
        perfDashboard.render(analysis);
        limitsTracker.render(analysis);
        errorInspector.render(analysis);
        timelineLoader.render(fullTreeData);

        statusEl.textContent = 'Analysis Complete';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      } catch (err) {
        console.error(err);
        statusEl.textContent = 'Error parsing log.';
      }
    }, 50);
  }

  // Load log text from local storage
  chrome.storage.local.get(['currentLogText', 'currentLogId'], (result) => {
    if (result.currentLogText) {
        statusEl.textContent = 'Loading log: ' + (result.currentLogId || 'Demo') + '...';
        processLog(result.currentLogText);
    } else {
        statusEl.textContent = 'No log loaded — showing demo log';
        // Demo log with realistic structure so all tabs render meaningful data.
        const demoLines = [
          "59.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO;DB,INFO;SYSTEM,DEBUG",
          "09:30:17.010 (10000000)|EXECUTION_STARTED",
          "09:30:17.012 (12000000)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|AccountTrigger on Account trigger event BeforeInsert",
          "09:30:17.014 (14000000)|METHOD_ENTRY|[1]|01p000000000001|AccountService.processAccounts(List<Account>)",
          "09:30:17.016 (16000000)|SOQL_EXECUTE_BEGIN|[5]|Aggregations:0|SELECT Id, Name, Industry FROM Account WHERE Industry = 'Technology'",
          "09:30:17.044 (44000000)|SOQL_EXECUTE_END|[5]|Rows:15",
          "09:30:17.046 (46000000)|METHOD_ENTRY|[20]|01p000000000001|AccountService.validateAccounts(List<Account>)",
          "09:30:17.047 (47000000)|USER_DEBUG|[22]|DEBUG|Validating 15 accounts from trigger",
          "09:30:17.058 (58000000)|METHOD_EXIT|[20]|01p000000000001|AccountService.validateAccounts(List<Account>)",
          "09:30:17.060 (60000000)|METHOD_ENTRY|[28]|01p000000000001|AccountService.enrichAccounts(List<Account>)",
          "09:30:17.062 (62000000)|SOQL_EXECUTE_BEGIN|[30]|Aggregations:0|SELECT AccountId, Amount FROM Opportunity WHERE StageName = 'Closed Won'",
          "09:30:17.078 (78000000)|SOQL_EXECUTE_END|[30]|Rows:8",
          "09:30:17.079 (79000000)|DML_BEGIN|[35]|Op:Update|Type:Account|Rows:8",
          "09:30:17.098 (98000000)|DML_END|[35]",
          "09:30:17.099 (99000000)|METHOD_EXIT|[28]|01p000000000001|AccountService.enrichAccounts(List<Account>)",
          "09:30:17.100 (100000000)|DML_BEGIN|[42]|Op:Insert|Type:Task|Rows:3",
          "09:30:17.112 (112000000)|DML_END|[42]",
          "09:30:17.113 (113000000)|METHOD_EXIT|[1]|01p000000000001|AccountService.processAccounts(List<Account>)",
          "09:30:17.114 (114000000)|CODE_UNIT_FINISHED|[EXTERNAL]|AccountTrigger on Account trigger event BeforeInsert",
          "09:30:17.115 (115000000)|EXECUTION_FINISHED",
          "09:30:17.115 (115000000)|LIMIT_USAGE_FOR_NS|(default)|",
          "  Number of SOQL queries: 2 out of 100",
          "  Number of DML statements: 2 out of 150",
          "  Maximum CPU time: 3200 out of 10000",
          "  Maximum heap size: 820000 out of 6000000"
        ];
        processLog(demoLines.join('\n'));
    }
  });
});
