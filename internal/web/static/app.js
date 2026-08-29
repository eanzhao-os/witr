/**
 * witr Web Dashboard Application Logic
 * Integrates with Go REST APIs & applies native-ai-ui primitives
 */

(function () {
  'use strict';

  // State Management
  const state = {
    activeTab: 'processes', // 'processes' | 'ports' | 'containers' | 'locks'
    processes: [],
    ports: [],
    containers: [],
    locks: [],
    filteredData: [],
    systemInfo: null,
    searchQuery: '',
    activeFilter: null,
    selectedItem: null,
    selectedDetail: null,
    sortCol: 'cpu',
    sortDesc: true,
    showAllPorts: false,
    showAllFiles: false,
    refreshInterval: 3000,
    refreshTimer: null,
    countdownTimer: null,
    nextRefreshTime: Date.now() + 3000,
    themePreference: localStorage.getItem('witr-theme-pref') || 'system',
    pendingAction: null,
  };

  // DOM Elements
  const el = {
    html: document.documentElement,
    app: document.getElementById('app'),
    versionBadge: document.getElementById('versionBadge'),
    globalSearchInput: document.getElementById('globalSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    refreshRateSelect: document.getElementById('refreshRateSelect'),
    refreshTimerLabel: document.getElementById('refreshTimerLabel'),
    manualRefreshBtn: document.getElementById('manualRefreshBtn'),
    liveIndicator: document.getElementById('liveIndicator'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIconAuto: document.getElementById('themeIconAuto'),
    themeIconSun: document.getElementById('themeIconSun'),
    themeIconMoon: document.getElementById('themeIconMoon'),
    navItems: document.querySelectorAll('.nav-item'),
    countProcesses: document.getElementById('countProcesses'),
    countPorts: document.getElementById('countPorts'),
    countContainers: document.getElementById('countContainers'),
    countLocks: document.getElementById('countLocks'),
    filterChips: document.querySelectorAll('.chip'),
    telemetryOS: document.getElementById('telemetryOS'),
    telemetryHost: document.getElementById('telemetryHost'),
    telemetryCPU: document.getElementById('telemetryCPU'),
    viewTitle: document.getElementById('viewTitle'),
    viewMeta: document.getElementById('viewMeta'),
    tabCustomControls: document.getElementById('tabCustomControls'),
    mainGrid: document.getElementById('mainGrid'),
    gridHead: document.getElementById('gridHead'),
    gridBody: document.getElementById('gridBody'),
    emptyPlaceholder: document.getElementById('emptyPlaceholder'),
    detailPanel: document.getElementById('detailPanel'),
    panelTag: document.getElementById('panelTag'),
    panelTitle: document.getElementById('panelTitle'),
    panelContent: document.getElementById('panelContent'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    actionModal: document.getElementById('actionModal'),
    modalActionIcon: document.getElementById('modalActionIcon'),
    modalActionTitle: document.getElementById('modalActionTitle'),
    modalActionSub: document.getElementById('modalActionSub'),
    modalActionBody: document.getElementById('modalActionBody'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // --- Theme Management ---
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(preference) {
    if (preference) {
      state.themePreference = preference;
      localStorage.setItem('witr-theme-pref', preference);
    }
    const pref = state.themePreference || 'system';
    const effectiveTheme = pref === 'system' ? getSystemTheme() : pref;

    if (effectiveTheme === 'dark') {
      el.html.classList.add('dark');
    } else {
      el.html.classList.remove('dark');
    }

    // Update Theme Icons & Tooltips
    if (pref === 'system') {
      el.themeIconAuto.style.display = 'block';
      el.themeIconSun.style.display = 'none';
      el.themeIconMoon.style.display = 'none';
      el.themeToggleBtn.title = `主题: 跟随系统 (当前: ${effectiveTheme === 'dark' ? '深色' : '浅色'})`;
    } else if (pref === 'dark') {
      el.themeIconAuto.style.display = 'none';
      el.themeIconSun.style.display = 'none';
      el.themeIconMoon.style.display = 'block';
      el.themeToggleBtn.title = '主题: 强制深色';
    } else {
      el.themeIconAuto.style.display = 'none';
      el.themeIconSun.style.display = 'block';
      el.themeIconMoon.style.display = 'none';
      el.themeToggleBtn.title = '主题: 强制浅色';
    }
  }

  function cycleTheme() {
    const current = state.themePreference || 'system';
    let next = 'dark';
    let label = '强制深色';
    if (current === 'system') {
      next = 'dark';
      label = '深色模式';
    } else if (current === 'dark') {
      next = 'light';
      label = '浅色模式';
    } else {
      next = 'system';
      label = '跟随系统';
    }
    applyTheme(next);
    showToast(`主题模式切换为: ${label}`, 'info');
  }

  // --- Toast Notification ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  // --- Formatting Helpers ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr || dateStr.startsWith('0001')) return '未知';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return `${diffSec}秒前`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}天前`;
  }

  // --- API Calls ---
  async function fetchJSON(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function loadSystemInfo() {
    try {
      state.systemInfo = await fetchJSON('/api/system');
      el.versionBadge.textContent = state.systemInfo.version || 'v0.3.3';
      el.telemetryOS.textContent = `${state.systemInfo.os} ${state.systemInfo.arch}`;
      el.telemetryHost.textContent = state.systemInfo.hostname || 'localhost';
      el.telemetryCPU.textContent = `${state.systemInfo.num_cpu} Cores`;
    } catch (err) {
      console.error('Failed to load system info:', err);
    }
  }

  async function refreshActiveTabData() {
    el.liveIndicator.style.backgroundColor = 'var(--accent)';
    try {
      if (state.activeTab === 'processes') {
        const data = await fetchJSON('/api/processes');
        state.processes = data || [];
        el.countProcesses.textContent = state.processes.length;
      } else if (state.activeTab === 'ports') {
        const data = await fetchJSON('/api/ports');
        state.ports = data || [];
        el.countPorts.textContent = state.ports.length;
      } else if (state.activeTab === 'containers') {
        const data = await fetchJSON('/api/containers');
        state.containers = data || [];
        el.countContainers.textContent = state.containers.length;
      } else if (state.activeTab === 'locks') {
        const data = await fetchJSON(`/api/locks?all=${state.showAllFiles}`);
        state.locks = data || [];
        el.countLocks.textContent = state.locks.length;
      }
      filterAndRenderTable();
      el.liveIndicator.style.backgroundColor = 'var(--green)';
    } catch (err) {
      console.error('Refresh error:', err);
      el.liveIndicator.style.backgroundColor = 'var(--red)';
    }
  }

  // --- Tab Switcher ---
  function switchTab(tabName) {
    state.activeTab = tabName;
    state.selectedItem = null;
    state.selectedDetail = null;
    el.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Reset default sort per tab
    if (tabName === 'processes') {
      state.sortCol = 'cpu';
      state.sortDesc = true;
      el.viewTitle.textContent = '进程监控与因果溯源';
    } else if (tabName === 'ports') {
      state.sortCol = 'port';
      state.sortDesc = false;
      el.viewTitle.textContent = '开放端口与归属进程';
    } else if (tabName === 'containers') {
      state.sortCol = 'name';
      state.sortDesc = false;
      el.viewTitle.textContent = '容器与沙箱概览';
    } else if (tabName === 'locks') {
      state.sortCol = 'pid';
      state.sortDesc = false;
      el.viewTitle.textContent = '全局文件锁与打开句柄';
    }

    renderTabCustomControls();
    refreshActiveTabData();
  }

  function renderTabCustomControls() {
    el.tabCustomControls.innerHTML = '';
    if (state.activeTab === 'ports') {
      const btn = document.createElement('button');
      btn.className = `btn ${state.showAllPorts ? 'btn-primary' : 'btn-secondary'}`;
      btn.innerHTML = state.showAllPorts ? '仅显示监听 (LISTEN)' : '显示全部连接 (ALL)';
      btn.onclick = () => {
        state.showAllPorts = !state.showAllPorts;
        renderTabCustomControls();
        filterAndRenderTable();
      };
      el.tabCustomControls.appendChild(btn);
    } else if (state.activeTab === 'locks') {
      const btn = document.createElement('button');
      btn.className = `btn ${state.showAllFiles ? 'btn-primary' : 'btn-secondary'}`;
      btn.innerHTML = state.showAllFiles ? '仅显示锁定文件 (Locks Only)' : '包含所有打开文件 (All Open Files)';
      btn.onclick = () => {
        state.showAllFiles = !state.showAllFiles;
        renderTabCustomControls();
        refreshActiveTabData();
      };
      el.tabCustomControls.appendChild(btn);
    }
  }

  // --- Filter & Sort Engine ---
  function filterAndRenderTable() {
    let list = [];
    if (state.activeTab === 'processes') list = [...state.processes];
    else if (state.activeTab === 'ports') list = [...state.ports];
    else if (state.activeTab === 'containers') list = [...state.containers];
    else if (state.activeTab === 'locks') list = [...state.locks];

    const q = state.searchQuery.toLowerCase();

    // Text search
    if (q) {
      list = list.filter(item => {
        if (state.activeTab === 'processes') {
          return (
            (item.Command && item.Command.toLowerCase().includes(q)) ||
            (item.Cmdline && item.Cmdline.toLowerCase().includes(q)) ||
            (item.User && item.User.toLowerCase().includes(q)) ||
            String(item.PID).includes(q)
          );
        } else if (state.activeTab === 'ports') {
          return (
            String(item.Port).includes(q) ||
            (item.Protocol && item.Protocol.toLowerCase().includes(q)) ||
            (item.Address && item.Address.toLowerCase().includes(q)) ||
            (item.Process && item.Process.toLowerCase().includes(q))
          );
        } else if (state.activeTab === 'containers') {
          return (
            (item.Name && item.Name.toLowerCase().includes(q)) ||
            (item.Image && item.Image.toLowerCase().includes(q)) ||
            (item.Runtime && item.Runtime.toLowerCase().includes(q)) ||
            (item.Ports && item.Ports.toLowerCase().includes(q))
          );
        } else if (state.activeTab === 'locks') {
          return (
            String(item.PID).includes(q) ||
            (item.Path && item.Path.toLowerCase().includes(q)) ||
            (item.Process && item.Process.toLowerCase().includes(q))
          );
        }
        return true;
      });
    }

    // Quick chip filter
    if (state.activeFilter && state.activeTab === 'processes') {
      if (state.activeFilter === 'high-cpu') list = list.filter(p => p.CPUPercent > 90 || p.Health === 'high-cpu');
      else if (state.activeFilter === 'high-mem') list = list.filter(p => p.MemoryRSS > 1024 * 1024 * 1024 || p.Health === 'high-mem');
      else if (state.activeFilter === 'sockets') list = list.filter(p => p.Sockets && p.Sockets.length > 0);
      else if (state.activeFilter === 'forked') list = list.filter(p => p.Forked === 'forked');
      else if (state.activeFilter === 'root') list = list.filter(p => p.User === 'root');
    }

    // Port listen toggle
    if (state.activeTab === 'ports' && !state.showAllPorts) {
      list = list.filter(p => p.State === 'LISTEN' || p.State === 'LISTENING');
    }

    // Sorting
    list.sort((a, b) => {
      let valA, valB;
      const col = state.sortCol;

      if (state.activeTab === 'processes') {
        if (col === 'pid') { valA = a.PID; valB = b.PID; }
        else if (col === 'user') { valA = a.User || ''; valB = b.User || ''; }
        else if (col === 'name') { valA = a.Command || ''; valB = b.Command || ''; }
        else if (col === 'cpu') { valA = a.CPUPercent || 0; valB = b.CPUPercent || 0; }
        else if (col === 'mem') { valA = a.MemoryRSS || 0; valB = b.MemoryRSS || 0; }
        else if (col === 'started') { valA = new Date(a.StartedAt).getTime() || 0; valB = new Date(b.StartedAt).getTime() || 0; }
        else { valA = a.PID; valB = b.PID; }
      } else if (state.activeTab === 'ports') {
        if (col === 'port') { valA = a.Port || 0; valB = b.Port || 0; }
        else if (col === 'proto') { valA = a.Protocol || ''; valB = b.Protocol || ''; }
        else if (col === 'addr') { valA = a.Address || ''; valB = b.Address || ''; }
        else if (col === 'state') { valA = a.State || ''; valB = b.State || ''; }
        else { valA = a.Port; valB = b.Port; }
      } else if (state.activeTab === 'containers') {
        if (col === 'name') { valA = a.Name || ''; valB = b.Name || ''; }
        else if (col === 'runtime') { valA = a.Runtime || ''; valB = b.Runtime || ''; }
        else if (col === 'image') { valA = a.Image || ''; valB = b.Image || ''; }
        else if (col === 'status') { valA = a.Status || ''; valB = b.Status || ''; }
        else { valA = a.Name; valB = b.Name; }
      } else if (state.activeTab === 'locks') {
        if (col === 'pid') { valA = a.PID || 0; valB = b.PID || 0; }
        else if (col === 'process') { valA = a.Process || ''; valB = b.Process || ''; }
        else if (col === 'path') { valA = a.Path || ''; valB = b.Path || ''; }
        else if (col === 'type') { valA = a.Type || ''; valB = b.Type || ''; }
        else { valA = a.PID; valB = b.PID; }
      }

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return state.sortDesc ? -cmp : cmp;
      }
      return state.sortDesc ? valB - valA : valA - valB;
    });

    state.filteredData = list;
    el.viewMeta.textContent = `共 ${list.length} 条记录`;
    renderTable();
  }

  // --- Table Headers & Body Rendering ---
  function renderTable() {
    renderGridHead();
    renderGridBody();
  }

  function renderGridHead() {
    let cols = [];
    if (state.activeTab === 'processes') {
      cols = [
        { id: 'pid', label: 'PID', width: '70px' },
        { id: 'user', label: '用户', width: '100px' },
        { id: 'name', label: '进程名', width: '160px' },
        { id: 'cpu', label: 'CPU %', width: '90px' },
        { id: 'mem', label: '内存 RSS', width: '110px' },
        { id: 'started', label: '启动时间', width: '110px' },
        { id: 'sockets', label: '套接字', width: '120px' },
        { id: 'cmd', label: '命令行', width: 'auto' },
      ];
    } else if (state.activeTab === 'ports') {
      cols = [
        { id: 'port', label: '端口', width: '80px' },
        { id: 'proto', label: '协议', width: '90px' },
        { id: 'addr', label: '绑定地址', width: '160px' },
        { id: 'state', label: '状态', width: '120px' },
        { id: 'proc', label: '归属进程', width: 'auto' },
      ];
    } else if (state.activeTab === 'containers') {
      cols = [
        { id: 'name', label: '容器名称', width: '180px' },
        { id: 'runtime', label: '运行时', width: '100px' },
        { id: 'image', label: '镜像', width: '200px' },
        { id: 'status', label: '状态', width: '120px' },
        { id: 'ports', label: '端口映射', width: 'auto' },
      ];
    } else if (state.activeTab === 'locks') {
      cols = [
        { id: 'pid', label: 'PID', width: '80px' },
        { id: 'process', label: '进程', width: '140px' },
        { id: 'type', label: '锁类型', width: '100px' },
        { id: 'mode', label: '模式', width: '90px' },
        { id: 'path', label: '文件路径', width: 'auto' },
      ];
    }

    let html = '<tr>';
    cols.forEach(col => {
      let sortClass = '';
      if (state.sortCol === col.id) {
        sortClass = state.sortDesc ? 'sort-desc' : 'sort-asc';
      }
      html += `<th data-col="${col.id}" style="width:${col.width}" class="${sortClass}">${escapeHtml(col.label)}</th>`;
    });
    html += '</tr>';
    el.gridHead.innerHTML = html;

    el.gridHead.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const colId = th.dataset.col;
        if (state.sortCol === colId) {
          state.sortDesc = !state.sortDesc;
        } else {
          state.sortCol = colId;
          state.sortDesc = true;
        }
        filterAndRenderTable();
      });
    });
  }

  function renderGridBody() {
    const list = state.filteredData;
    if (list.length === 0) {
      el.gridBody.innerHTML = '';
      el.emptyPlaceholder.style.display = 'flex';
      return;
    }
    el.emptyPlaceholder.style.display = 'none';

    let html = '';
    list.forEach((item, index) => {
      const isSelected = state.selectedItem && (
        (state.activeTab === 'processes' && state.selectedItem.PID === item.PID) ||
        (state.activeTab === 'ports' && state.selectedItem.Port === item.Port) ||
        (state.activeTab === 'containers' && state.selectedItem.ID === item.ID) ||
        (state.activeTab === 'locks' && state.selectedItem.Path === item.Path && state.selectedItem.PID === item.PID)
      );
      const rowClass = isSelected ? 'selected' : '';

      if (state.activeTab === 'processes') {
        const health = item.Health || 'healthy';
        const healthClass = (health === 'high-cpu' || health === 'high-mem' || health === 'zombie') ? 'danger' : (item.Forked === 'forked' ? 'warning' : 'healthy');
        const cpuPct = (item.CPUPercent || 0).toFixed(1);
        const cpuBarClass = item.CPUPercent > 80 ? 'high' : item.CPUPercent > 40 ? 'medium' : '';
        const memStr = formatBytes(item.MemoryRSS);

        let socketsBadge = '-';
        if (item.Sockets && item.Sockets.length > 0) {
          socketsBadge = `<span class="badge" style="background:var(--green-tint);color:var(--green);border-color:transparent;">${item.Sockets.length} Sockets</span>`;
        }

        html += `
          <tr class="${rowClass}" data-index="${index}" data-pid="${item.PID}">
            <td><span class="pid-pill">${item.PID}</span></td>
            <td><span style="color:var(--ink-2)">${escapeHtml(item.User || '-')}</span></td>
            <td>
              <span class="status-dot ${healthClass}"></span>
              <strong style="color:var(--ink);">${escapeHtml(item.Command || '-')}</strong>
            </td>
            <td>
              <div class="mini-bar-container">
                <span style="font-family:var(--font-mono);font-size:11px;min-width:32px;">${cpuPct}%</span>
                <div class="mini-bar"><div class="mini-bar-fill ${cpuBarClass}" style="width:${Math.min(100, item.CPUPercent || 0)}%"></div></div>
              </div>
            </td>
            <td><span style="font-family:var(--font-mono);">${memStr}</span></td>
            <td><span style="color:var(--ink-3);font-size:11px;">${formatRelativeTime(item.StartedAt)}</span></td>
            <td>${socketsBadge}</td>
            <td><div class="cmd-text" title="${escapeHtml(item.Cmdline || item.Command)}">${escapeHtml(item.Cmdline || item.Command)}</div></td>
          </tr>
        `;
      } else if (state.activeTab === 'ports') {
        const isListen = item.State === 'LISTEN' || item.State === 'LISTENING';
        const statePill = isListen
          ? `<span class="badge" style="background:var(--green-tint);color:var(--green);border-color:transparent;font-weight:600;">${escapeHtml(item.State)}</span>`
          : `<span class="badge">${escapeHtml(item.State || '-')}</span>`;

        html += `
          <tr class="${rowClass}" data-index="${index}" data-port="${item.Port}">
            <td><span class="pid-pill" style="background:var(--accent-tint);color:var(--accent-ink);">${item.Port}</span></td>
            <td><span class="badge">${escapeHtml(item.Protocol || 'TCP')}</span></td>
            <td><span style="font-family:var(--font-mono);color:var(--ink);">${escapeHtml(item.Address || '*')}</span></td>
            <td>${statePill}</td>
            <td><strong style="color:var(--ink);">${escapeHtml(item.Process || '未知')}</strong></td>
          </tr>
        `;
      } else if (state.activeTab === 'containers') {
        html += `
          <tr class="${rowClass}" data-index="${index}" data-cid="${escapeHtml(item.ID)}">
            <td><strong style="color:var(--ink);">${escapeHtml(item.Name || '-')}</strong></td>
            <td><span class="badge">${escapeHtml(item.Runtime || 'docker')}</span></td>
            <td><span style="font-family:var(--font-mono);color:var(--ink-2);">${escapeHtml(item.Image || '-')}</span></td>
            <td><span class="badge" style="background:var(--green-tint);color:var(--green);border-color:transparent;">${escapeHtml(item.Status || 'running')}</span></td>
            <td><span class="cmd-text">${escapeHtml(item.Ports || '-')}</span></td>
          </tr>
        `;
      } else if (state.activeTab === 'locks') {
        html += `
          <tr class="${rowClass}" data-index="${index}" data-pid="${item.PID}">
            <td><span class="pid-pill">${item.PID}</span></td>
            <td><strong style="color:var(--ink);">${escapeHtml(item.Process || '-')}</strong></td>
            <td><span class="badge">${escapeHtml(item.Type || 'FLOCK')}</span></td>
            <td><span class="badge" style="background:var(--orange-tint);color:var(--orange);border-color:transparent;">${escapeHtml(item.Mode || 'WRITE')}</span></td>
            <td><span class="cmd-text" style="color:var(--accent-ink);" title="${escapeHtml(item.Path)}">${escapeHtml(item.Path || '-')}</span></td>
          </tr>
        `;
      }
    });

    el.gridBody.innerHTML = html;

    // Attach Click Handlers
    el.gridBody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const idx = parseInt(tr.dataset.index, 10);
        const item = state.filteredData[idx];
        if (!item) return;
        selectItem(item);
      });
    });
  }

  // --- Inspect & Analyze Detail Panel ---
  async function selectItem(item) {
    state.selectedItem = item;
    renderTable(); // Update active row highlighting

    el.panelContent.innerHTML = `
      <div class="empty-detail-guide">
        <div class="placeholder-icon" style="animation:spin 1s linear infinite;">⏳</div>
        <p>正在深入分析因果链条...</p>
      </div>
    `;

    try {
      let analyzeUrl = '';
      if (state.activeTab === 'processes') {
        analyzeUrl = `/api/analyze?pid=${item.PID}`;
        el.panelTag.textContent = 'Process';
        el.panelTitle.textContent = `${item.Command} (PID ${item.PID})`;
      } else if (state.activeTab === 'ports') {
        analyzeUrl = `/api/analyze?port=${item.Port}`;
        el.panelTag.textContent = 'Port';
        el.panelTitle.textContent = `Port ${item.Port}`;
      } else if (state.activeTab === 'containers') {
        analyzeUrl = `/api/analyze?container=${encodeURIComponent(item.Name || item.ID)}`;
        el.panelTag.textContent = 'Container';
        el.panelTitle.textContent = `${item.Name || item.ID}`;
      } else if (state.activeTab === 'locks') {
        analyzeUrl = `/api/analyze?pid=${item.PID}`;
        el.panelTag.textContent = 'Locked File';
        el.panelTitle.textContent = `PID ${item.PID}`;
      }

      const res = await fetchJSON(analyzeUrl);
      state.selectedDetail = res;
      renderDetailContent(res);
    } catch (err) {
      console.error('Analyze failed:', err);
      el.panelContent.innerHTML = `
        <div class="warnings-card">
          <div class="warnings-header">❌ 分析失败</div>
          <p style="font-size:12px;color:var(--ink);">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function renderDetailContent(res) {
    if (res.container_only) {
      renderContainerOnlyDetail(res.container);
      return;
    }

    const proc = res.Process || {};
    const ancestry = res.Ancestry || [];
    const src = res.Source || {};
    const warnings = res.Warnings || [];
    const sockets = proc.Sockets || [];

    let html = '';

    // 1. Causal Ancestry Tree Flow (nai-causal-chain-tree)
    html += `
      <div class="causal-card">
        <div class="causal-header">
          <span class="causal-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            因果溯源 (Why It Exists)
          </span>
          <span class="badge" style="background:var(--accent-tint);color:var(--accent-ink);">${escapeHtml(src.Name || src.Type || 'system')}</span>
        </div>
        <div class="tree-flow">
    `;

    ancestry.forEach((node, i) => {
      const isRoot = i === 0;
      const isTarget = i === ancestry.length - 1;
      const nodeClass = isTarget ? 'tree-node active' : isRoot ? 'tree-node root' : 'tree-node';

      html += `
        <div class="${nodeClass}">
          <div class="tree-node-dot"></div>
          <div class="tree-node-card">
            <div class="node-header">
              <span class="node-name">${escapeHtml(node.Command || 'unknown')}</span>
              <span class="pid-pill">pid ${node.PID}</span>
            </div>
            <div class="node-cmd">${escapeHtml(node.Cmdline || node.Command || '')}</div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    // 2. Warnings Card (if any)
    if (warnings.length > 0) {
      html += `
        <div class="warnings-card">
          <div class="warnings-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            安全与异常警告 (${warnings.length})
          </div>
          ${warnings.map(w => `<div class="warning-item"><span class="warning-bullet">•</span><span>${escapeHtml(w)}</span></div>`).join('')}
        </div>
      `;
    }

    // 3. Process Context Grid (session-telemetry)
    html += `
      <div class="context-grid">
        <div class="context-box">
          <div class="context-label">运行用户</div>
          <div class="context-value">${escapeHtml(proc.User || '-')}</div>
        </div>
        <div class="context-box">
          <div class="context-label">启动时间</div>
          <div class="context-value">${formatRelativeTime(proc.StartedAt)}</div>
        </div>
        <div class="context-box full-width">
          <div class="context-label">工作目录 (CWD)</div>
          <div class="context-value mono">${escapeHtml(proc.WorkingDir || '-')}</div>
        </div>
    `;

    if (proc.GitRepo) {
      html += `
        <div class="context-box full-width">
          <div class="context-label">Git 仓库 & 分支</div>
          <div class="context-value" style="color:var(--accent-ink);">
            📦 ${escapeHtml(proc.GitRepo)} ${proc.GitBranch ? `(${escapeHtml(proc.GitBranch)})` : ''}
          </div>
        </div>
      `;
    }

    if (src.UnitFile) {
      html += `
        <div class="context-box full-width">
          <div class="context-label">服务配置文件 (Unit / Plist)</div>
          <div class="context-value mono">${escapeHtml(src.UnitFile)}</div>
        </div>
      `;
    }

    html += `
        <div class="context-box">
          <div class="context-label">常驻内存 (RSS)</div>
          <div class="context-value mono">${formatBytes(proc.MemoryRSS)}</div>
        </div>
        <div class="context-box">
          <div class="context-label">虚拟内存 (VMS)</div>
          <div class="context-value mono">${proc.Memory && proc.Memory.VMS ? formatBytes(proc.Memory.VMS) : '-'}</div>
        </div>
      </div>
    `;

    // 4. Sockets & Network Binding Pills
    if (sockets.length > 0) {
      html += `
        <div class="causal-card">
          <div class="causal-title" style="color:var(--green);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            网络套接字 (${sockets.length})
          </div>
          <div class="socket-pills">
      `;
      sockets.forEach(s => {
        const isListen = s.State === 'LISTEN' || s.State === 'LISTENING';
        const isPublic = s.Address === '0.0.0.0' || s.Address === '::';
        const pillClass = isPublic ? 'socket-pill public' : isListen ? 'socket-pill listen' : 'socket-pill';
        html += `
          <div class="${pillClass}" title="State: ${escapeHtml(s.State)}">
            <span>${escapeHtml(s.Address)}:${s.Port}</span>
            <span style="opacity:0.7">(${escapeHtml(s.Protocol)} | ${escapeHtml(s.State)})</span>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // 5. Actions Toolbar
    if (proc.PID > 0) {
      html += `
        <div class="panel-actions-toolbar">
          <button class="btn btn-secondary" onclick="window.witrApp.promptAction(${proc.PID}, '${escapeHtml(proc.Command)}', 'term')">优雅停止 (Term)</button>
          <button class="btn btn-danger" onclick="window.witrApp.promptAction(${proc.PID}, '${escapeHtml(proc.Command)}', 'kill')">强制结束 (Kill)</button>
          <button class="btn btn-secondary" onclick="window.witrApp.promptAction(${proc.PID}, '${escapeHtml(proc.Command)}', 'renice')">调整优先级 (Renice)</button>
        </div>
      `;
    }

    el.panelContent.innerHTML = html;
  }

  function renderContainerOnlyDetail(container) {
    el.panelContent.innerHTML = `
      <div class="causal-card">
        <div class="causal-header">
          <span class="causal-title">📦 容器详情</span>
          <span class="badge">${escapeHtml(container.Runtime || 'container')}</span>
        </div>
        <div class="context-grid">
          <div class="context-box full-width">
            <div class="context-label">容器名称</div>
            <div class="context-value">${escapeHtml(container.Name)}</div>
          </div>
          <div class="context-box full-width">
            <div class="context-label">镜像 (Image)</div>
            <div class="context-value mono">${escapeHtml(container.Image)}</div>
          </div>
          <div class="context-box">
            <div class="context-label">运行状态</div>
            <div class="context-value">${escapeHtml(container.Status)}</div>
          </div>
          <div class="context-box">
            <div class="context-label">端口映射</div>
            <div class="context-value">${escapeHtml(container.Ports || '-')}</div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Process Action Modal & Execution ---
  function promptAction(pid, command, action) {
    state.pendingAction = { pid, command, action };
    el.modalActionTitle.textContent = `确认操作: ${action.toUpperCase()}`;
    el.modalActionSub.textContent = `目标进程: ${command} (PID ${pid})`;

    let bodyHtml = '';
    if (action === 'kill') {
      el.modalActionIcon.textContent = '🚨';
      bodyHtml = `<p>您确定要向进程 <strong>${escapeHtml(command)} (PID ${pid})</strong> 发送 <code>SIGKILL</code> 强制终止信号吗？该操作不可撤销。</p>`;
    } else if (action === 'term') {
      el.modalActionIcon.textContent = '🛑';
      bodyHtml = `<p>您确定要向进程 <strong>${escapeHtml(command)} (PID ${pid})</strong> 发送 <code>SIGTERM</code> 优雅终止信号吗？</p>`;
    } else if (action === 'renice') {
      el.modalActionIcon.textContent = '⚙️';
      bodyHtml = `
        <p>调整进程 <strong>${escapeHtml(command)} (PID ${pid})</strong> 的调度优先级 (Nice 值):</p>
        <div style="margin-top:10px;">
          <input type="number" id="reniceValInput" class="select-control" style="border:1px solid var(--line);border-radius:6px;padding:6px;width:100%;" min="-20" max="19" value="0">
          <small style="color:var(--ink-3);display:block;margin-top:4px;">-20 (最高优先级) 至 19 (最低优先级)</small>
        </div>
      `;
    }

    el.modalActionBody.innerHTML = bodyHtml;
    el.actionModal.style.display = 'flex';
  }

  async function executeAction() {
    if (!state.pendingAction) return;
    const { pid, action } = state.pendingAction;
    let val = 0;
    if (action === 'renice') {
      const input = document.getElementById('reniceValInput');
      if (input) val = parseInt(input.value, 10) || 0;
    }

    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, action, value: val }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '执行失败');

      showToast(`已成功对 PID ${pid} 执行 ${action.toUpperCase()}`, 'success');
      el.actionModal.style.display = 'none';
      setTimeout(() => refreshActiveTabData(), 500);
    } catch (err) {
      showToast(`操作失败: ${err.message}`, 'error');
    }
  }

  // --- Auto-Refresh Scheduling ---
  function setupRefreshTimer() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    if (state.countdownTimer) clearInterval(state.countdownTimer);

    const rate = state.refreshInterval;
    if (rate <= 0) {
      el.refreshTimerLabel.textContent = '已暂停';
      return;
    }

    state.nextRefreshTime = Date.now() + rate;

    state.countdownTimer = setInterval(() => {
      const remainMs = Math.max(0, state.nextRefreshTime - Date.now());
      el.refreshTimerLabel.textContent = `${(remainMs / 1000).toFixed(1)}s`;
    }, 100);

    state.refreshTimer = setInterval(() => {
      state.nextRefreshTime = Date.now() + rate;
      refreshActiveTabData();
    }, rate);
  }

  // --- Event Listeners ---
  function setupEvents() {
    // Theme toggle (cycles: system -> dark -> light -> system)
    el.themeToggleBtn.addEventListener('click', cycleTheme);

    // Listen to OS prefers-color-scheme change in real time
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!state.themePreference || state.themePreference === 'system') {
          applyTheme('system');
        }
      });
    }

    // Navigation Tabs
    el.navItems.forEach(item => {
      item.addEventListener('click', () => {
        switchTab(item.dataset.tab);
      });
    });

    // Global Search Input
    el.globalSearchInput.addEventListener('input', e => {
      state.searchQuery = e.target.value.trim();
      el.clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
      filterAndRenderTable();
    });

    el.clearSearchBtn.addEventListener('click', () => {
      el.globalSearchInput.value = '';
      state.searchQuery = '';
      el.clearSearchBtn.style.display = 'none';
      filterAndRenderTable();
    });

    // Filter Chips
    el.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const filter = chip.dataset.filter;
        if (state.activeFilter === filter) {
          state.activeFilter = null;
          chip.classList.remove('active');
        } else {
          el.filterChips.forEach(c => c.classList.remove('active'));
          state.activeFilter = filter;
          chip.classList.add('active');
        }
        filterAndRenderTable();
      });
    });

    // Refresh rate select
    el.refreshRateSelect.addEventListener('change', e => {
      state.refreshInterval = parseInt(e.target.value, 10);
      setupRefreshTimer();
    });

    // Manual refresh button
    el.manualRefreshBtn.addEventListener('click', () => {
      refreshActiveTabData();
      setupRefreshTimer();
    });

    // Close detail panel
    el.closePanelBtn.addEventListener('click', () => {
      state.selectedItem = null;
      state.selectedDetail = null;
      renderTable();
      el.panelContent.innerHTML = `
        <div class="empty-detail-guide">
          <div class="guide-icon">👆</div>
          <p>在左侧列表中点击任意行</p>
          <p class="guide-sub">witr 将立即解析其完整的启动因果链、工作目录、Git 分支、Socket 状态及安全告警</p>
        </div>
      `;
    });

    // Modal Actions
    el.modalCancelBtn.addEventListener('click', () => {
      el.actionModal.style.display = 'none';
    });
    el.modalConfirmBtn.addEventListener('click', executeAction);

    // Hotkeys
    window.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement !== el.globalSearchInput) {
        e.preventDefault();
        el.globalSearchInput.focus();
        el.globalSearchInput.select();
      } else if (e.key === 'Escape') {
        if (el.actionModal.style.display === 'flex') {
          el.actionModal.style.display = 'none';
        } else if (document.activeElement === el.globalSearchInput) {
          el.globalSearchInput.blur();
        }
      }
    });
  }

  // Global app exports for inline HTML events
  window.witrApp = {
    promptAction,
  };

  // --- Initialization ---
  async function init() {
    applyTheme(state.themePreference);
    setupEvents();
    await loadSystemInfo();
    switchTab('processes');
    setupRefreshTimer();
  }

  // Start app when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
