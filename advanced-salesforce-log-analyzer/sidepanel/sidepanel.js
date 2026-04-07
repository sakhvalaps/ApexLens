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
        statusEl.textContent = 'No log loaded. Opening Demo Log...';
        // Fallback to Demo limit log so user sees something if opened manually
        const demoLines = [
            "59.0 APEX_CODE,DEBUG;APEX_PROFILING,INFO",
            "09:30:17.027 (27179000)|EXECUTION_STARTED",
            "09:30:17.027 (27179000)|USER_DEBUG|[1]|DEBUG|Hello World",
            "09:30:17.027 (40000000)|DML_BEGIN|[3]|Op:Insert|Type:Contact|Rows:1",
            "09:30:17.027 (60000000)|DML_END|[3]",
            "09:30:17.027 (67000000)|EXECUTION_FINISHED"
        ];
        processLog(demoLines.join('\n'));
    }
  });
});
