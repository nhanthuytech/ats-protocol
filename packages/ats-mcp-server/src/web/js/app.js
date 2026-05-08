/** App initialization, routing & keyboard shortcuts */

async function init() {
  var data = await api('/api/flows');
  State.allFlows = data.flows;
  State.globalClassInfo = data.globalClasses || { classCount: 0, methodCount: 0, mutedCount: 0 };
  document.getElementById('project-name').textContent = data.project;
  renderSidebar();
}

async function selectFlow(name) {
  State.selectedFlow = name;
  renderSidebar(document.getElementById('search').value);
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('detail-view').style.display = '';
  var data = await api('/api/flows/' + encodeURIComponent(name));
  renderDetail(data);
  switchTab('detail');
}

// ─── Tab Routing ───
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() { switchTab(tab.dataset.tab); });
});

function switchTab(t) {
  document.querySelectorAll('.tab').forEach(function(el) { el.classList.remove('active'); });
  document.querySelector('[data-tab="' + t + '"]').classList.add('active');
  document.getElementById('tab-detail').style.display = t === 'detail' ? '' : 'none';
  document.getElementById('tab-graph').style.display = t === 'graph' ? '' : 'none';
  document.getElementById('tab-overview').style.display = t === 'overview' ? '' : 'none';
  if (t === 'graph') renderGraph();
  if (t === 'overview') renderOverview();
}

// ─── Search ───
document.getElementById('search').addEventListener('input', function(e) {
  renderSidebar(e.target.value);
});

// ─── Keyboard Shortcuts ───
document.addEventListener('keydown', function(e) {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('search').focus();
  }
  if (e.key === 'Escape') {
    document.getElementById('search').value = '';
    document.getElementById('search').blur();
    renderSidebar();
  }
});

// ─── Boot ───
init();
