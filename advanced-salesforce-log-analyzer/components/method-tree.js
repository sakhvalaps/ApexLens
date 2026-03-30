class MethodTree {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(treeData) {
    if (!this.container) return;
    
    let html = '<h3>Method Execution Tree</h3><div class="tree-container">';
    
    const renderNode = (node) => {
      const durationMs = (node.durationNanos / 1000000).toFixed(2);
      const colorClass = durationMs > 100 ? 'code-slow' : (durationMs > 10 ? 'code-medium' : 'code-fast');
      
      let res = `<div class="tree-node" style="margin-left: ${node.depth * 15}px; padding: 4px; border-left: 1px solid var(--border-color);">
        <div class="node-content">
          <strong style="color: var(--primary-color);">${this.escapeHtml(node.name)}</strong> 
          <span class="duration ${colorClass}">[${durationMs} ms]</span>
        </div>`;
        
      if (node.children && node.children.length > 0) {
        res += '<div class="children">';
        for (const child of node.children) {
          res += renderNode(child);
        }
        res += '</div>';
      }
      res += '</div>';
      return res;
    };

    for (const root of treeData) {
      html += renderNode(root);
    }
    html += '</div>';
    this.container.innerHTML = html;
  }

  escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

window.MethodTree = MethodTree;
