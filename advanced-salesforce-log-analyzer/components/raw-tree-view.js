class RawTreeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    render(rootNode) {
        if (!this.container) return;

        let html = '<div class="raw-log-controls" style="margin-bottom: 12px; display: flex; gap: 8px; width: 100%; align-items: center;">';
        html += '<input type="text" id="raw-tree-search" placeholder="Find in execution tree..." style="padding: 8px; flex: 1; border: 1px solid var(--border-color); border-radius: 4px;"/>';
        html += '<span id="tree-search-matches" style="padding: 8px; color: #666; font-size: 13px; min-width: 60px; text-align: center;">0/0</span>';

        const arrowBtnStyle = "padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: var(--text-main); cursor: pointer; font-size: 15px; font-weight: bold; transition: background 0.2s; min-width: 32px; display:flex; justify-content:center; align-items:center;";
        html += `<button id="tree-search-prev" style="${arrowBtnStyle}">↑</button>`;
        html += `<button id="tree-search-next" style="${arrowBtnStyle}">↓</button>`;

        const btnStyle = "padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: var(--text-main); cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.2s; white-space: nowrap;";

        html += `<div style="flex:1"></div>`;
        html += `<button id="btn-expand-all" style="${btnStyle}" title="Expand All Nodes">Expand All</button>`;
        html += `<button id="btn-collapse-all" style="${btnStyle}" title="Collapse All Nodes">Collapse All</button>`;
        html += '</div>';

        html += '<div style="position: relative; height: 75vh;">';
        html += '<div id="raw-tree-wrapper" style="background: #ffffff; overflow: auto; height: 100%; font-family: \'Consolas\', \'Monaco\', monospace; font-size: 13px; line-height: 1.5; padding-bottom: 20px;"></div>';
        html += '<canvas id="tree-minimap" width="12" height="2000" style="position: absolute; right: 0; top: 0; width: 12px; height: 100%; border-left: 1px solid var(--border-color); background: rgba(0,0,0,0.02); pointer-events: none; z-index: 10;"></canvas>';
        html += '</div>';

        this.container.innerHTML = html;
        const scrollContainer = document.getElementById('raw-tree-wrapper');

        // Flatten tree with structural prefixes
        const flattenRow = (node, prefixStr, isLastChild) => {
            let rows = [];
            // Include all nodes including ROOT
            rows.push({ node, prefix: prefixStr, isLast: isLastChild });

            const childCount = node.children.length;
            for (let i = 0; i < childCount; i++) {
                const isChildLast = i === childCount - 1;
                // The root doesn't contribute a prefix, otherwise use appropriate drawing chars
                let newPrefix = prefixStr;
                if (node.id !== 0) {
                    newPrefix += isLastChild ? '    ' : '│   ';
                }
                rows = rows.concat(flattenRow(node.children[i], newPrefix, isChildLast));
            }
            return rows;
        };

        const rows = flattenRow(rootNode, '', true);
        let totalTimeNs = 1;
        if (rootNode.children.length > 0) {
            totalTimeNs = Math.max(...rootNode.children.map(c => c.durationNs || 1));
        }

        // Draw Minimap Heatmap
        this.drawMinimap = (searchMatches = []) => {
            const canvas = document.getElementById('tree-minimap');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            rows.forEach((row, idx) => {
                const event = row.node.event;
                let color = null;
                if (event.includes('EXCEPTION') || event.includes('ERROR') || event.includes('FATAL')) color = 'rgba(239, 68, 68, 0.7)'; // Red
                else if (event.includes('SOQL')) color = 'rgba(59, 130, 246, 0.7)'; // Blue
                else if (event.includes('DML')) color = 'rgba(34, 197, 94, 0.7)'; // Green

                if (color) {
                    ctx.fillStyle = color;
                    const y = Math.floor((idx / rows.length) * canvas.height);
                    ctx.fillRect(0, y - 1, canvas.width, 3); // Draw 3px thick marker
                }
            });

            // Draw active search matches on top
            if (searchMatches && searchMatches.length > 0) {
                ctx.fillStyle = '#f97316'; // Vivid orange for search matches
                searchMatches.forEach(el => {
                    const idx = parseInt(el.dataset.index);
                    if (!isNaN(idx)) {
                        const y = Math.floor((idx / rows.length) * canvas.height);
                        ctx.fillRect(0, y - 1, canvas.width, 3);
                    }
                });
            }
        };
        this.drawMinimap();

        // Chunk rendering
        let i = 0;
        const chunkSize = 2000;

        const renderChunk = () => {
            const fragment = document.createDocumentFragment();
            const end = Math.min(i + chunkSize, rows.length);

            for (; i < end; i++) {
                const row = rows[i];
                const node = row.node;
                const ms = (node.durationNs / 1000000).toFixed(3);
                const pct = totalTimeNs > 0 ? ((node.durationNs / totalTimeNs) * 100).toFixed(1) : '0.0';

                const hasChildren = node.children.length > 0;

                const rowDiv = document.createElement('div');
                rowDiv.className = 'tree-row' + (hasChildren ? ' collapsible' : '');
                rowDiv.style.display = 'flex';
                rowDiv.style.whiteSpace = 'pre';
                rowDiv.style.position = 'relative';
                rowDiv.style.cursor = hasChildren ? 'pointer' : 'default';
                rowDiv.dataset.id = node.id;
                rowDiv.dataset.depth = node.depth;
                rowDiv.dataset.index = i; // Save index for minimap

                // Data structure for collapsible rows
                if (hasChildren) {
                    rowDiv.dataset.expanded = "true";
                    rowDiv.addEventListener('click', function (e) {
                        // Collapse/Expand behavior toggle
                        const expanded = this.dataset.expanded === "true";
                        this.dataset.expanded = !expanded;

                        // Visual toggle indicator on the row itself
                        const indicator = this.querySelector('.collapse-indicator');
                        if (indicator) indicator.textContent = expanded ? '+' : '-';

                        // Hide/Show next rows until depth <= this depth
                        let sibling = this.nextElementSibling;
                        const thisDepth = parseInt(this.dataset.depth);
                        let hiding = expanded;

                        while (sibling) {
                            const sibDepth = parseInt(sibling.dataset.depth);
                            if (sibDepth <= thisDepth) break; // Finished subtree

                            // If hiding, hide everything. If expanding, we only show direct children 
                            // (or if we want to expand all recursively, show all. Here we'll do simple toggle all)
                            sibling.style.display = expanded ? 'none' : 'flex';

                            // if expanding, reset children toggle states so they visually match
                            if (!expanded && sibling.dataset.expanded !== undefined) {
                                sibling.dataset.expanded = "true";
                                const sibInd = sibling.querySelector('.collapse-indicator');
                                if (sibInd) sibInd.textContent = '-';
                            }

                            sibling = sibling.nextElementSibling;
                        }
                    });
                }

                // Gutter / Deep-link Jump
                const gutter = document.createElement('div');
                gutter.style.width = '40px';
                gutter.style.flexShrink = '0';
                gutter.style.textAlign = 'right';
                gutter.style.paddingRight = '8px';
                gutter.style.color = '#888';
                gutter.style.background = '#f8f9fa';
                gutter.style.borderRight = '1px solid #ddd';
                gutter.style.userSelect = 'none';
                gutter.style.marginRight = '8px';

                let targetLineNumber = node.log ? node.log.lineNumber : 0;

                gutter.innerHTML = `<a href="#" class="tree-jump-link" data-targetline="${targetLineNumber}" title="Jump to Line ${targetLineNumber} in Log Explorer" style="color: #0176d3; text-decoration:none; font-weight:bold;">${i + 1}</a>`;
                rowDiv.appendChild(gutter);

                // Background percentage bar - removed per user request for simpler text blocks
                // The user preferred the text-based ASCII blocks.

                // Content
                const contentDiv = document.createElement('div');
                contentDiv.style.position = 'relative';
                contentDiv.style.zIndex = '1';
                contentDiv.style.paddingLeft = '4px';

                let prefixSpan = `<span style="color:#aaa; font-family: monospace;">${row.prefix}${hasChildren ? '<span class="collapse-indicator" style="font-weight:bold;color:#111;">-</span> ' : (row.isLast ? '└── ' : '├── ')}</span>`;

                let eventColor = '#333';
                if (node.event === 'ROOT') eventColor = '#333';
                else if (node.event.includes('EXCEPTION') || node.event.includes('ERROR') || node.event.includes('FATAL')) eventColor = '#e53e3e';
                else if (node.event.includes('SOQL')) eventColor = '#a1260d';
                else if (node.event.includes('DML')) eventColor = '#805ad5';
                else if (node.event.includes('LIMIT')) eventColor = '#dd6b20';
                else if (node.event.includes('CODE_UNIT') || node.event.includes('EXECUTION') || node.event.includes('METHOD')) eventColor = '#005fb2'; // blue 

                let cleanDetails = node.details.replace(/^[|]+/, ''); // strip leading pipe marks 
                let detailsInfo = cleanDetails ? ` <span style="color: #444;">${this.escapeHtml(cleanDetails)}</span>` : '';

                let nodeInfo = `<span style="color: ${eventColor}; font-weight: 600;">${node.event}</span><span style="color: #888;">(${String(node.id).padStart(5, '0')})</span>`;

                let durationInfo = '';
                if (node.durationNs > 0) {
                    let blocksCount = Math.min(20, Math.round(pct / 5)); // up to 20 blocks
                    let blocks = '█'.repeat(blocksCount);
                    let blockColor = pct > 80 ? '#e53e3e' : pct > 50 ? '#dd6b20' : '#4299e1';

                    durationInfo = ` <span style="color: #666; font-weight:500;">[${ms}ms | <span style="font-weight:bold; color:#0176D3;">${pct}%</span>]</span> <span style="color:${blockColor}; font-size:10px; letter-spacing:-1px; vertical-align: middle;">${blocks}</span>`;
                }

                contentDiv.innerHTML = prefixSpan + nodeInfo + detailsInfo + durationInfo;
                rowDiv.appendChild(contentDiv);

                fragment.appendChild(rowDiv);
            }

            scrollContainer.appendChild(fragment);

            if (i < rows.length) {
                requestAnimationFrame(renderChunk);
            } else {
                // Complete! Bind explicitly Expand/Collapse All
                document.getElementById('btn-expand-all').addEventListener('click', () => setAllExpanded(true));
                document.getElementById('btn-collapse-all').addEventListener('click', () => setAllExpanded(false));

                // Bind Jump Links
                scrollContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('tree-jump-link')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const targetLine = e.target.dataset.targetline;

                        // Switch to Raw Log tab
                        const logTabBtn = document.querySelector('.tab[data-target="raw-log"]');
                        if (logTabBtn) logTabBtn.click();

                        // Scroll specifically to that line
                        setTimeout(() => {
                            const rawLogLine = document.querySelector(`.log-line[data-line="${targetLine}"]`);
                            if (rawLogLine) {
                                rawLogLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                const originalBg = rawLogLine.style.backgroundColor;
                                rawLogLine.style.backgroundColor = '#fed7aa'; // vivid orange highlight
                                rawLogLine.style.transition = 'background-color 2s';
                                setTimeout(() => rawLogLine.style.backgroundColor = originalBg, 2500);
                            }
                        }, 100);
                    }
                });

                // Contextual Search Logic
                const searchInput = document.getElementById('raw-tree-search');
                if (searchInput) {
                    const matchCountSpan = document.getElementById('tree-search-matches');
                    let searchMatches = [];
                    let currentMatchIndex = -1;
                    let debounceTimer;

                    searchInput.addEventListener('input', (e) => {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            const term = e.target.value.toLowerCase();
                            // Reset previous highlights
                            searchMatches.forEach(el => {
                                el.style.backgroundColor = '';
                                el.style.outline = 'none';
                            });
                            searchMatches = [];
                            currentMatchIndex = -1;

                            if (!term) {
                                matchCountSpan.textContent = '0/0';
                                this.drawMinimap([]); // Clear search from minimap
                                return;
                            }

                            scrollContainer.querySelectorAll('.tree-row').forEach(row => {
                                // Avoid matching the gutter HTML text if possible
                                if (row.textContent.toLowerCase().includes(term)) {
                                    row.style.backgroundColor = '#fff7cd'; // pale yellow for all matches
                                    searchMatches.push(row);
                                }
                            });

                            this.drawMinimap(searchMatches);

                            if (searchMatches.length > 0) {
                                currentMatchIndex = 0;
                                navigateToMatch();
                            } else {
                                matchCountSpan.textContent = '0/0';
                            }
                        }, 350);
                    });

                    searchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            // Prevent default form submission or scrolling
                            e.preventDefault();
                            if (searchMatches.length > 0) {
                                document.getElementById('tree-search-next').click();
                            }
                        }
                    });

                    document.getElementById('tree-search-next').addEventListener('click', () => {
                        if (searchMatches.length === 0) return;
                        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
                        navigateToMatch();
                    });

                    document.getElementById('tree-search-prev').addEventListener('click', () => {
                        if (searchMatches.length === 0) return;
                        currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
                        navigateToMatch();
                    });

                    const navigateToMatch = () => {
                        matchCountSpan.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
                        const targetRow = searchMatches[currentMatchIndex];

                        // Reset colors to inactive match color
                        searchMatches.forEach(el => {
                            el.style.backgroundColor = '#fff7cd'; // Pale yellow for all background matches
                            el.style.outline = 'none';
                        });

                        // Active Match Highlight styling (strong vibrant orange-yellow with thick border)
                        targetRow.style.backgroundColor = '#fbd38d'; // vibrant orange-yellow
                        targetRow.style.outline = '2px solid #dd6b20'; // solid orange border
                        targetRow.style.outlineOffset = '-2px'; // inset the outline so it doesn't push layout

                        // Expanding collapsed parent logic
                        let p = targetRow.previousElementSibling;
                        let currentDepth = parseInt(targetRow.dataset.depth);

                        // Walk up the tree and click any collapsed ancestor
                        while (p) {
                            const pDepth = parseInt(p.dataset.depth);
                            if (pDepth < currentDepth) {
                                currentDepth = pDepth;
                                if (p.dataset.expanded === "false") {
                                    p.click(); // the toggle listener automatically handles children
                                }
                            }
                            if (currentDepth <= 0) break;
                            p = p.previousElementSibling;
                        }

                        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    };
                }
            }
        };

        const setAllExpanded = (expanded) => {
            const rowNodes = scrollContainer.querySelectorAll('.tree-row');
            rowNodes.forEach(row => {
                if (row.classList.contains('collapsible')) {
                    row.dataset.expanded = String(expanded);
                    const ind = row.querySelector('.collapse-indicator');
                    if (ind) ind.textContent = expanded ? '-' : '+';
                }
                const depth = parseInt(row.dataset.depth || "0");
                if (depth > 1) { // keep ROOT (0) and direct children (1) always visible if Collapsed
                    row.style.display = expanded ? 'flex' : 'none';
                }
            });
        };

        requestAnimationFrame(renderChunk);
    }

    escapeHtml(unsafe) {
        return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

window.RawTreeView = RawTreeView;
