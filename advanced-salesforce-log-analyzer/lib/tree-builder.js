class TreeBuilder {
  static buildMethodTree(logs) {
    const root = { name: 'Execution Root', children: [], durationNanos: 0, depth: 0 };
    const stack = [root];

    for (const log of logs) {
      if (log.event === 'METHOD_ENTRY') {
        const parent = stack[stack.length - 1];

        // Extract proper method name from the pipeline-separated details
        let properName = log.details || 'Unknown Method';
        if (properName.includes('|')) {
          const parts = properName.split('|');
          properName = parts[parts.length - 1];
        }

        const node = {
          name: properName,
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
          // Guard: entryLog may be missing for truncated/malformed logs
          node.durationNanos = node.entryLog ? Math.max(0, log.nanos - node.entryLog.nanos) : 0;
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
        if (stack.length > 1) {
          const node = stack.pop();
          node.durationNs = Math.max(0, nanos - node.timeNs);
        }
      } else {
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

  static buildSignificantTree(logs) {
    const fullRoot = this.buildFullTree(logs);

    const noisePrefixes = new Set([
      'SYSTEM_METHOD_ENTRY', 'SYSTEM_METHOD_EXIT',
      'CONSTRUCTOR_ENTRY', 'CONSTRUCTOR_EXIT',
      'SYSTEM_MODE_ENTER', 'SYSTEM_MODE_EXIT',
      'LIMIT_USAGE', 'CUMULATIVE_LIMIT',
      'HEAP_ALLOCATE', 'STATEMENT_EXECUTE',
      'VARIABLE_SCOPE', 'VARIABLE_ASSIGNMENT',
      'USER_INFO', 'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED'
    ]);

    const minDurationMs = 5;

    const isSignificant = (node) => {
      const evt = (node.event || '').toUpperCase();
      if (noisePrefixes.has(evt)) return false;
      if (evt.includes('SOQL') || evt.includes('DML') || evt.includes('CALLOUT')) return true;
      if (evt.includes('METHOD')) {
        const name = (node.details || node.name || '').toLowerCase();
        if (name.startsWith('system.') || name.startsWith('<init>') || name.includes('wrappers.') || name.includes('encodingutil.') || name.includes('url.')) {
          const durMs = node.durationNs / 1000000;
          return durMs >= minDurationMs;
        }
        return true;
      }
      if (evt.includes('EXECUTION') || evt.includes('CODE_UNIT')) return true;
      return false;
    };

    const filterTree = (node, parentKept) => {
      const kept = isSignificant(node) || parentKept;
      const filteredChildren = [];
      for (const child of (node.children || [])) {
        const childKept = isSignificant(child);
        if (childKept) {
          const filteredChild = filterTree(child, true);
          filteredChildren.push(filteredChild);
        } else {
          const grandResults = filterTree(child, false);
          if (grandResults && grandResults.children && grandResults.children.length > 0) {
            filteredChildren.push(...grandResults.children);
          }
        }
      }
      return { ...node, children: filteredChildren };
    };

    const annotateCallChain = (node, parentName, depth) => {
      node.callerName = parentName || '—';
      node.nodeDepth = depth || 0;

      if (!node.name) {
        const evt = (node.event || '').toUpperCase();
        if (evt.includes('METHOD') || evt.includes('CALLOUT') || evt.includes('CODE_UNIT')) {
          let detail = node.details || '';
          if (detail.includes('|')) {
            const parts = detail.split('|');
            node.name = parts[parts.length - 1].trim();
          } else {
            node.name = detail.substring(0, 80) || node.event;
          }
        } else if (evt.includes('SOQL') || evt.includes('DML')) {
          let detail = node.details || '';
          if (detail.includes('|')) {
            const parts = detail.split('|');
            node.name = parts[parts.length - 1].trim();
          } else {
            node.name = detail.substring(0, 60) || node.event;
          }
        } else {
          node.name = node.details ? node.details.substring(0, 60) : node.event;
        }
      }

      if (node.children && node.children.length > 0) {
        node.callees = node.children.map(c => ({
          name: c.name || c.event,
          durationMs: (c.durationNs / 1000000).toFixed(2),
          event: c.event
        }));
      }
      for (const child of (node.children || [])) {
        annotateCallChain(child, node.name || node.event, (depth || 0) + 1);
      }
    };

    const filtered = filterTree(fullRoot, true);
    annotateCallChain(filtered, null, 0);
    return [filtered];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TreeBuilder;
} else {
  window.TreeBuilder = TreeBuilder;
}
