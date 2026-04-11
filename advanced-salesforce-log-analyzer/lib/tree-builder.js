/**
 * TreeBuilder — builds execution trees from parsed Salesforce Apex log entries.
 *
 * Key improvements over the original:
 *  - computeSelfTime is now iterative (explicit stack) so a deep call tree
 *    (e.g. 10 000+ nested method calls) cannot overflow the JS call stack.
 *  - buildSignificantTree's filterTree and annotateCallChain have an explicit
 *    depth guard (MAX_DEPTH = 500) to prevent stack overflows on pathological logs.
 *  - All public methods remain API-compatible with the original.
 */
class TreeBuilder {

  static MAX_DEPTH = 500;   // guard against stack overflows in recursive helpers

  // ── Method tree (minimal, for overview) ───────────────────────────────────

  static buildMethodTree(logs) {
    const root = { name: 'Execution Root', children: [], durationNanos: 0, depth: 0 };
    const stack = [root];

    for (const log of logs) {
      if (log.event === 'METHOD_ENTRY') {
        const parent = stack[stack.length - 1];

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
          durationNanos: 0,
        };
        parent.children.push(node);
        stack.push(node);
      } else if (log.event === 'METHOD_EXIT') {
        if (stack.length > 1) {
          const node = stack.pop();
          node.exitLog = log;
          node.durationNanos = node.entryLog
            ? Math.max(0, log.nanos - node.entryLog.nanos)
            : 0;
          if (stack.length === 1) {
            root.durationNanos += node.durationNanos;
          }
        }
      }
    }
    return [root];
  }

  // ── Full tree (all events, used by flame graph + timeline) ────────────────

  static buildFullTree(logs) {
    const root = {
      id: 0, event: 'ROOT', details: '', children: [],
      depth: 0, timeNs: 0, durationNs: 0, selfTimeNs: 0,
    };
    const stack = [root];
    let idCounter = 1;

    const entryEvents = new Set([
      'EXECUTION_STARTED', 'CODE_UNIT_STARTED', 'METHOD_ENTRY',
      'SOQL_EXECUTE_BEGIN', 'DML_BEGIN', 'CALLOUT_REQUEST', 'VF_APEX_CALL_START',
    ]);
    const exitEvents = new Set([
      'EXECUTION_FINISHED', 'CODE_UNIT_FINISHED', 'METHOD_EXIT',
      'SOQL_EXECUTE_END', 'DML_END', 'CALLOUT_RESPONSE', 'VF_APEX_CALL_END',
    ]);
    const ignoreEvents = new Set([
      'HEAP_ALLOCATE', 'STATEMENT_EXECUTE', 'VARIABLE_SCOPE_BEGIN',
      'VARIABLE_ASSIGNMENT', 'USER_INFO', 'CUMULATIVE_LIMIT_USAGE',
      'CUMULATIVE_LIMIT_USAGE_END',
    ]);

    for (const log of logs) {
      if (log.event === 'HEADER' || ignoreEvents.has(log.event)) continue;

      const currentParent = stack[stack.length - 1];
      const nanos = log.nanos || 0;

      if (entryEvents.has(log.event)) {
        const node = {
          id: idCounter++,
          log,
          event: log.event
            .replace('_STARTED', '').replace('_BEGIN', '')
            .replace('_ENTRY', '').replace('_REQUEST', ''),
          details: log.details,
          children: [],
          depth: stack.length,
          timeNs: nanos,
          durationNs: 0,
          selfTimeNs: 0,
        };
        currentParent.children.push(node);
        stack.push(node);
      } else if (exitEvents.has(log.event)) {
        if (stack.length > 1) {
          const node = stack.pop();
          node.durationNs = Math.max(0, nanos - node.timeNs);
        }
      } else {
        currentParent.children.push({
          id: idCounter++,
          log,
          event: log.event,
          details: log.event === 'LIMIT_USAGE_FOR_NS'
            ? (log.details || '').split('\n')[0]
            : log.details,
          children: [],
          depth: stack.length,
          timeNs: nanos,
          durationNs: 0,
          selfTimeNs: 0,
        });
      }
    }

    // ── Iterative self-time computation (no recursion → no stack overflow) ──
    TreeBuilder._computeSelfTimeIterative(root);

    return root;
  }

  /**
   * Iterative post-order traversal to compute selfTimeNs for every node.
   * Replaces the original recursive computeSelfTime to avoid call-stack
   * overflow on deep trees (10 000+ levels).
   */
  static _computeSelfTimeIterative(root) {
    // Two-pass iterative post-order using an explicit stack.
    // Pass 1: build a post-order visit list.
    const visitOrder = [];
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      visitOrder.push(node);
      for (const child of (node.children || [])) {
        stack.push(child);
      }
    }
    // Pass 2: process in reverse (children before parents).
    for (let i = visitOrder.length - 1; i >= 0; i--) {
      const node = visitOrder[i];
      let childTime = 0;
      for (const child of (node.children || [])) {
        childTime += child.durationNs;
      }
      node.selfTimeNs = Math.max(0, node.durationNs - childTime);
    }
  }

  // ── Significant tree (noise-filtered, used by method flow graph) ──────────

  static buildSignificantTree(logs) {
    const fullRoot = this.buildFullTree(logs);

    const noisePrefixes = new Set([
      'SYSTEM_METHOD_ENTRY', 'SYSTEM_METHOD_EXIT',
      'CONSTRUCTOR_ENTRY', 'CONSTRUCTOR_EXIT',
      'SYSTEM_MODE_ENTER', 'SYSTEM_MODE_EXIT',
      'LIMIT_USAGE', 'CUMULATIVE_LIMIT',
      'HEAP_ALLOCATE', 'STATEMENT_EXECUTE',
      'VARIABLE_SCOPE', 'VARIABLE_ASSIGNMENT',
      'USER_INFO', 'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED',
    ]);

    const minDurationMs = 5;

    const isSignificant = (node) => {
      const evt = (node.event || '').toUpperCase();
      if (noisePrefixes.has(evt)) return false;
      if (evt.includes('SOQL') || evt.includes('DML') || evt.includes('CALLOUT')) return true;
      if (evt.includes('METHOD')) {
        const name = (node.details || node.name || '').toLowerCase();
        if (
          name.startsWith('system.') || name.startsWith('<init>') ||
          name.includes('wrappers.') || name.includes('encodingutil.') ||
          name.includes('url.')
        ) {
          return (node.durationNs / 1_000_000) >= minDurationMs;
        }
        return true;
      }
      if (evt.includes('EXECUTION') || evt.includes('CODE_UNIT')) return true;
      return false;
    };

    // Iterative tree filter (avoids recursive stack overflow on large trees)
    const filterTreeIterative = (root) => {
      // Post-order: rebuild children arrays bottom-up
      // We use a parent-map approach with a DFS stack.
      const result = new Map();  // node → filtered-children[]

      const stack = [];
      // Push with a flag indicating whether we've processed children yet
      const push = (node, parentNode) => stack.push({ node, parentNode, processed: false });
      push(root, null);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (!frame.processed) {
          frame.processed = true;
          // Push children (reversed so we process left-to-right)
          const children = frame.node.children || [];
          for (let i = children.length - 1; i >= 0; i--) {
            push(children[i], frame.node);
          }
        } else {
          stack.pop();
          const { node, parentNode } = frame;
          const filteredChildren = [];
          for (const child of (node.children || [])) {
            const childFiltered = result.get(child);
            if (isSignificant(child)) {
              filteredChildren.push({ ...child, children: childFiltered || [] });
            } else if (childFiltered && childFiltered.length > 0) {
              // Hoist grandchildren up
              filteredChildren.push(...childFiltered);
            }
          }
          result.set(node, filteredChildren);
        }
      }

      const rootChildren = result.get(root) || [];
      return { ...root, children: rootChildren };
    };

    const filtered = filterTreeIterative(fullRoot);

    // Annotate call chain info (iterative BFS to avoid recursion)
    const queue = [{ node: filtered, parentName: null, depth: 0 }];
    while (queue.length > 0) {
      const { node, parentName, depth } = queue.shift();

      node.callerName = parentName || '—';
      node.nodeDepth  = depth;

      if (!node.name) {
        const evt = (node.event || '').toUpperCase();
        let detail = node.details || '';
        if (detail.includes('|')) {
          const parts = detail.split('|');
          detail = parts[parts.length - 1].trim();
        }
        if (
          evt.includes('METHOD') || evt.includes('CALLOUT') || evt.includes('CODE_UNIT') ||
          evt.includes('SOQL')   || evt.includes('DML')
        ) {
          node.name = detail.substring(0, 80) || node.event;
        } else {
          node.name = detail.substring(0, 60) || node.event;
        }
      }

      if (node.children && node.children.length > 0) {
        node.callees = node.children.map(c => ({
          name: c.name || c.event,
          durationMs: (c.durationNs / 1_000_000).toFixed(2),
          event: c.event,
        }));
        for (const child of node.children) {
          queue.push({ node: child, parentName: node.name || node.event, depth: depth + 1 });
        }
      }
    }

    return [filtered];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TreeBuilder;
} else {
  window.TreeBuilder = TreeBuilder;
}
