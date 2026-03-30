class RawLogView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    highlightApex(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);

        // Keywords
        html = html.replace(/\b(public|private|protected|static|void|class|if|else|for|while|return|new|List|Set|Map|String|Integer|Boolean|Id|SObject|system\.debug)\b/gi, '<span style="color: #0000ff; font-weight: 500;">$1</span>');

        // SOQL inside apex
        html = html.replace(/\b(SELECT|FROM|WHERE|LIMIT|AND|OR)\b/gi, '<span style="color: #a1260d; font-weight: bold;">$1</span>');

        // Classes/Types inside brackets (escaped as &lt; &gt;)
        html = html.replace(/&lt;([a-zA-Z0-9_]+)&gt;/g, '&lt;<span style="color: #2b91af;">$1</span>&gt;');

        // Strings 'something'
        html = html.replace(/'([^']*)'/g, '<span style="color: #a31515;">\'$1\'</span>');

        // Strings "something" (escaped as &quot;)
        html = html.replace(/&quot;([^&]*)&quot;/g, '<span style="color: #a31515;">&quot;$1&quot;</span>');

        // Replace the prefix distinctly
        html = html.replace('Execute Anonymous:', '<span style="color: #888;">Execute Anonymous:</span>');
        return html;
    }

    render(logs) {
        if (!this.container) return;

        const chipStyle = "padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 16px; background: transparent; color: var(--text-main); cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s; white-space: nowrap;";
        const activeStyle = "background: #0176d3; color: #fff; border-color: #0176d3;";

        let html = `
    <style>
      .log-line.search-match { background-color: #fff7cd !important; }
      .log-line.search-active { background-color: #fbd38d !important; outline: 2px solid #dd6b20 !important; outline-offset: -2px; }
      .log-line.search-match .apex-code-block, .log-line.search-active .apex-code-block { background-color: transparent !important; }
    </style>
    <div class="raw-log-controls" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
      <div id="log-filters" style="display: flex; gap: 8px; flex-wrap: wrap; padding-bottom: 4px;">
        <button class="filter-chip active" data-filter="ALL" style="${chipStyle} ${activeStyle}">All Events</button>
        <button class="filter-chip" data-filter="ERROR,EXCEPTION,FATAL" style="${chipStyle}">Errors</button>
        <button class="filter-chip" data-filter="SOQL" style="${chipStyle}">SOQL</button>
        <button class="filter-chip" data-filter="DML" style="${chipStyle}">DML</button>
        <button class="filter-chip" data-filter="CALLOUT" style="${chipStyle}">Callouts</button>
        <button class="filter-chip" data-filter="USER_DEBUG" style="${chipStyle}">Debug</button>
        <div style="flex: 1;"></div>
        <button id="btn-export-log" style="${chipStyle} border-color:#22c55e; color:#16a34a;">📥 Export Visible HTML</button>
      </div>
      <div style="display: flex; gap: 8px; width: 100%; align-items: center;">
          <input type="text" id="raw-log-search" placeholder="Find in logs..." style="padding: 8px; flex: 1; border: 1px solid var(--border-color); border-radius: 4px;"/>
          <span id="log-search-matches" style="padding: 8px; color: #666; font-size: 13px; min-width: 60px; text-align: center;">0/0</span>
          <button id="log-search-prev" style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: var(--text-main); cursor: pointer; font-size: 15px; font-weight: bold; transition: background 0.2s; min-width: 32px; display:flex; justify-content:center; align-items:center;">↑</button>
          <button id="log-search-next" style="padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: var(--text-main); cursor: pointer; font-size: 15px; font-weight: bold; transition: background 0.2s; min-width: 32px; display:flex; justify-content:center; align-items:center;">↓</button>
      </div>
    </div>`;

        html += '<div style="position: relative; height: 73vh;">';
        html += '<div id="raw-log-wrapper" style="background: var(--bg-surface); overflow: auto; height: 100%; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.4; display: flex; flex-direction: column; padding-bottom: 20px;"></div>';
        html += '<canvas id="log-minimap" width="12" height="2000" style="position: absolute; right: 0; top: 0; width: 12px; height: 100%; border-left: 1px solid var(--border-color); background: rgba(0,0,0,0.02); pointer-events: none; z-index: 10;"></canvas>';
        html += '</div>';

        this.container.innerHTML = html;
        const scrollContainer = document.getElementById('raw-log-wrapper');
        const searchInput = document.getElementById('raw-log-search');

        // Draw Minimap Heatmap
        this.drawMinimap = (searchMatches = []) => {
            const canvas = document.getElementById('log-minimap');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            logs.forEach((log, idx) => {
                let color = null;
                if (log.event.match(/ERROR|EXCEPTION|FATAL/)) color = 'rgba(239, 68, 68, 0.7)'; // Red
                else if (log.event.includes('SOQL')) color = 'rgba(59, 130, 246, 0.7)'; // Blue
                else if (log.event.includes('DML')) color = 'rgba(34, 197, 94, 0.7)'; // Green

                if (color) {
                    ctx.fillStyle = color;
                    const y = Math.floor((idx / logs.length) * canvas.height);
                    ctx.fillRect(0, y - 1, canvas.width, 3); // Draw 3px thick marker
                }
            });

            // Draw active search matches on top
            if (searchMatches && searchMatches.length > 0) {
                ctx.fillStyle = '#f97316'; // Vivid orange for search matches
                searchMatches.forEach(el => {
                    const idx = parseInt(el.dataset.index);
                    if (!isNaN(idx)) {
                        const y = Math.floor((idx / logs.length) * canvas.height);
                        ctx.fillRect(0, y - 1, canvas.width, 3);
                    }
                });
            }
        };
        this.drawMinimap();

        // Export HTML Logic
        document.getElementById('btn-export-log').addEventListener('click', () => {
            const clone = scrollContainer.cloneNode(true);
            // Remove hidden rows so we only export what the user is currently seeing
            Array.from(clone.children).forEach(el => {
                if (el.style.display === 'none') clone.removeChild(el);
            });

            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Salesforce Log Export</title>
                <style>
                    body { font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.4; background: #fff; color: #333; margin: 0; padding: 20px; }
                    .log-line { display: flex; white-space: pre; border-bottom: 1px solid #f8f9fa; }
                    .log-line:hover { background-color: #f1f5f9; }
                </style>
            </head>
            <body>
                <h2>Salesforce Execution Log</h2>
                <div style="border: 1px solid #ccc;">${clone.innerHTML}</div>
            </body>
            </html>
        `;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `salesforce-log-${new Date().getTime()}.html`;
            a.click();
        });

        const applyFiltersAndSearch = () => {
            const activeBtn = document.querySelector('.filter-chip.active');
            const filter = activeBtn ? activeBtn.dataset.filter.split(',') : ['ALL'];

            scrollContainer.querySelectorAll('.log-line').forEach(line => {
                const ev = line.dataset.event || '';
                const typeMatch = filter[0] === 'ALL' || filter.some(f => ev.includes(f));
                line.style.display = typeMatch ? 'flex' : 'none';
            });

            // Trigger search highlight on visible lines
            triggerSearch();
        };

        // Filter Chips Logic
        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-chip').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-main)';
                    b.style.borderColor = 'var(--border-color)';
                });
                e.target.classList.add('active');
                e.target.style.background = '#0176d3';
                e.target.style.color = '#fff';
                e.target.style.borderColor = '#0176d3';

                applyFiltersAndSearch();
            });
        });

        // Contextual Search Logic
        let searchMatches = [];
        let currentMatchIndex = -1;
        let debounceTimer;

        const triggerSearch = () => {
            const term = searchInput.value.toLowerCase();

            // Clear previous highlights
            searchMatches.forEach(el => {
                el.classList.remove('search-match', 'search-active');
            });
            searchMatches = [];
            currentMatchIndex = -1;

            if (!term) {
                document.getElementById('log-search-matches').textContent = '0/0';
                this.drawMinimap([]); // Clear search from minimap
                return;
            }

            scrollContainer.querySelectorAll('.log-line').forEach(line => {
                if (line.style.display !== 'none' && line.textContent.toLowerCase().includes(term)) {
                    line.classList.add('search-match');
                    searchMatches.push(line);
                }
            });

            this.drawMinimap(searchMatches);

            if (searchMatches.length > 0) {
                currentMatchIndex = 0;
                navigateToMatch(false); // don't scroll if just filtering
            } else {
                document.getElementById('log-search-matches').textContent = '0/0';
            }
        };

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                triggerSearch();
                if (searchMatches.length > 0) navigateToMatch(true); // scroll when typing
            }, 150);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchMatches.length > 0) document.getElementById('log-search-next').click();
            }
        });

        document.getElementById('log-search-next').addEventListener('click', () => {
            if (searchMatches.length === 0) return;
            currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
            navigateToMatch(true);
        });

        document.getElementById('log-search-prev').addEventListener('click', () => {
            if (searchMatches.length === 0) return;
            currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
            navigateToMatch(true);
        });

        const navigateToMatch = (scroll = true) => {
            document.getElementById('log-search-matches').textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
            const targetRow = searchMatches[currentMatchIndex];

            searchMatches.forEach(el => el.classList.remove('search-active'));

            targetRow.classList.add('search-active');

            if (scroll) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        let i = 0;
        const chunkSize = 2500; // Render 2500 lines at a time to unfreeze UI

        const renderChunk = () => {
            let chunkHtml = '';
            const end = Math.min(i + chunkSize, logs.length);

            for (; i < end; i++) {
                const log = logs[i];
                const isHeader = log.event === 'HEADER';

                chunkHtml += `<div class="log-line" data-index="${i}" data-line="${log.lineNumber}" data-event="${log.event}" style="display: flex; white-space: pre; transition: background-color 0.2s;">`;

                // Gutter
                chunkHtml += `<div style="width: 50px; flex-shrink: 0; text-align: right; padding-right: 8px; color: #888; background: #f8f9fa; border-right: 1px solid #ddd; user-select: none; margin-right: 8px;">${log.lineNumber}</div>`;

                // Content
                if (isHeader) {
                    if (log.raw.includes('Execute Anonymous:')) {
                        const highlighted = this.highlightApex(log.raw);
                        chunkHtml += `<div class="apex-code-block" style="padding: 0 4px; width: 100%; background-color: #f4f8fd; border-left: 3px solid #0176D3; font-family: Consolas, monospace;">${highlighted}</div>`;
                    } else {
                        chunkHtml += `<div style="padding: 0 4px; color: var(--text-main);">${this.escapeHtml(log.raw)}</div>`;
                    }
                } else {
                    const timeColor = '#2e8b57';
                    const eventColor = '#005fb2'; // Softer blue for events
                    let detailsHtml = this.escapeHtml(log.details);

                    // SOQL Highlighting
                    if (log.event.includes('SOQL')) {
                        detailsHtml = detailsHtml.replace(/\b(SELECT|FROM|WHERE|LIMIT|AND|OR|ORDER BY|GROUP BY)\b/g, '<span style="color:#a1260d; font-weight:bold;">$1</span>');
                    }

                    // Exceptions
                    if (log.event.includes('ERROR') || log.event.includes('EXCEPTION') || log.event.includes('FATAL')) {
                        detailsHtml = `<span style="color: #e53e3e; font-weight: bold;">${detailsHtml}</span>`;
                    }

                    // Highlight bracket tokens like [EXTERNAL], [95]
                    detailsHtml = detailsHtml.replace(/\[([a-zA-Z0-9_\-]+)\]/g, '[<span style="color: #0b7a75;">$1</span>]');

                    // Highlight standard Salesforce IDs (15 or 18 chars)
                    detailsHtml = detailsHtml.replace(/\b([a-zA-Z0-9]{15,18})\b/g, '<span style="color: #d14;">$1</span>');

                    // Highlight numbers occurring after colon (Bytes:3)
                    detailsHtml = detailsHtml.replace(/:(\d+)\b/g, ':<span style="color: #098658;">$1</span>');

                    chunkHtml += `<div style="padding: 0 4px;">` +
                        `<span style="color: ${timeColor};">${log.time} <span style="color:#aaa;">(${log.nanos || ''})</span></span>|` +
                        `<span style="color: ${eventColor}; font-weight:600;">${this.escapeHtml(log.event)}</span>|` +
                        `<span style="color: var(--text-main);">${detailsHtml}</span>` +
                        `</div>`;
                }
                chunkHtml += `</div>`;
            }

            scrollContainer.insertAdjacentHTML('beforeend', chunkHtml);

            if (i < logs.length) {
                requestAnimationFrame(renderChunk);
            }
        };

        requestAnimationFrame(renderChunk);
    }

    escapeHtml(unsafe) {
        return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

window.RawLogView = RawLogView;
