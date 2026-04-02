class MethodTree {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(treeData) {
    if (!this.container) return;
    
    if (!treeData || treeData.length === 0 || !treeData[0].children || treeData[0].children.length === 0) {
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 75vh; text-align: center; padding: 40px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <h3 style="font-size: 18px; font-weight: 600; color: var(--text-main); margin: 0 0 8px 0;">No Method Execution Available</h3>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 280px; margin: 0 0 24px 0; line-height: 1.6;">No method calls were found in this log. Check the Execution Tree for raw event data.</p>
          <button onclick="document.querySelector('.tab[data-target=&quot;raw-tree&quot;]').click()" style="font-size: 13px; padding: 10px 20px; background: var(--primary-color); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"></path><path d="m8 7 4-4 4 4"></path><path d="m8 17 4 4 4-4"></path></svg>
            View Execution Tree
          </button>
        </div>
      `;
      return;
    }
    
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
