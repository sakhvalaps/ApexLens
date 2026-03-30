class TreeBuilder {
  static buildMethodTree(logs) {
    const root = { name: 'Execution Root', children: [], durationNanos: 0, depth: 0 };
    const stack = [root];

    for (const log of logs) {
      if (log.event === 'METHOD_ENTRY') {
        const parent = stack[stack.length - 1];
        const node = {
          name: log.details,
          entryLog: log,
          children: [],
          depth: stack.length,
          durationNanos: 0
        };
        parent.children.push(node);
        stack.push(node);
      } else if (log.event === 'METHOD_EXIT') {
        if (stack.length > 1) { // don't pop root
          const node = stack.pop();
          node.exitLog = log;
          node.durationNanos = log.nanos - node.entryLog.nanos;
          if (stack.length === 1) {
            root.durationNanos += node.durationNanos;
          }
        }
      }
    }
    return [root];
  }

  static buildFullTree(logs) {
    let root = { id: 0, event: 'ROOT', details: '', children: [], depth: 0, timeNs: 0, durationNs: 0, selfTimeNs: 0 };
    let stack = [root];
    let idCounter = 1;

    const entryEvents = ['EXECUTION_STARTED', 'CODE_UNIT_STARTED', 'METHOD_ENTRY', 'SOQL_EXECUTE_BEGIN', 'DML_BEGIN', 'CALLOUT_REQUEST', 'VF_APEX_CALL_START'];
    const exitEvents = ['EXECUTION_FINISHED', 'CODE_UNIT_FINISHED', 'METHOD_EXIT', 'SOQL_EXECUTE_END', 'DML_END', 'CALLOUT_RESPONSE', 'VF_APEX_CALL_END'];

    // Smart filtering: events that clutter the tree without adding high-level value
    const noiseEvents = new Set([
      'HEAP_ALLOCATE', 'STATEMENT_EXECUTE', 'VARIABLE_SCOPE_BEGIN', 'VARIABLE_ASSIGNMENT',
      'USER_INFO', 'CUMULATIVE_LIMIT_USAGE', 'CUMULATIVE_LIMIT_USAGE_END',
      'SYSTEM_MODE_ENTER', 'SYSTEM_MODE_EXIT', 'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED' 
      // Wait, CODE_UNIT is useful. Let's keep CODE_UNIT!
    ]);

    // Let's refine the noise list, keeping LIMIT_USAGE_FOR_NS so we don't miss limits
    const ignoreEvents = ['HEAP_ALLOCATE', 'STATEMENT_EXECUTE', 'VARIABLE_SCOPE_BEGIN', 'VARIABLE_ASSIGNMENT', 'USER_INFO', 'CUMULATIVE_LIMIT_USAGE', 'CUMULATIVE_LIMIT_USAGE_END'];

    logs.forEach(log => {
      if (log.event === 'HEADER' || ignoreEvents.includes(log.event)) return;
      
      const currentParent = stack[stack.length - 1];
      const nanos = parseInt(log.nanos || '0', 10);
      
      if (entryEvents.includes(log.event)) {
        const node = {
          id: idCounter++,
          log: log,
          event: log.event.replace('_STARTED', '').replace('_BEGIN', '').replace('_ENTRY', '').replace('_REQUEST', ''),
          details: log.details,
          children: [],
          depth: stack.length,
          timeNs: nanos,
          durationNs: 0
        };
        currentParent.children.push(node);
        stack.push(node);
      } else if (exitEvents.includes(log.event)) {
        if (stack.length > 1) { // ensure we don't pop ROOT
          const node = stack.pop();
          node.durationNs = Math.max(0, nanos - node.timeNs);
        }
      } else {
        // Leaf log
        currentParent.children.push({
          id: idCounter++,
          log: log,
          event: log.event,
          details: log.event === 'LIMIT_USAGE_FOR_NS' ? log.details.split('\n')[0] : log.details,
          children: [],
          depth: stack.length,
          timeNs: nanos,
          durationNs: 0
        });
      }
    });

    const computeSelfTime = (node) => {
      let childTime = 0;
      node.children.forEach(c => {
        computeSelfTime(c);
        childTime += c.durationNs;
      });
      node.selfTimeNs = Math.max(0, node.durationNs - childTime);
    };
    computeSelfTime(root);

    return root;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TreeBuilder;
} else {
  window.TreeBuilder = TreeBuilder;
}
