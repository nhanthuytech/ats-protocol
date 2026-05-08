/** Sidebar component */

function renderSidebar(filter) {
  filter = filter || '';
  var list = document.getElementById('flow-list');
  var filtered = filter
    ? State.allFlows.filter(function(f) { return f.name.toLowerCase().includes(filter.toLowerCase()); })
    : State.allFlows;

  list.innerHTML = filtered.map(function(f, i) {
    var sel = State.selectedFlow === f.name ? ' selected' : '';
    var dotCls = f.active ? 'active' : 'inactive';
    if (f.priority === 'high') dotCls += ' priority-high';
    var meta = f.methodCount + ' methods';
    if (f.mutedCount > 0) meta += ' · <span class="highlight">' + f.mutedCount + ' muted</span>';
    return '<div class="flow-item' + sel + '" style="animation-delay:' + (i * 30) + 'ms" onclick="selectFlow(\'' + f.name + '\')">'
      + '<div class="flow-dot ' + dotCls + '"></div>'
      + '<div class="flow-info"><span class="flow-name">' + f.name + '</span><div class="flow-meta">' + meta + '</div></div>'
      + '<label class="toggle" onclick="event.stopPropagation()">'
      + '<input type="checkbox" ' + (f.active ? 'checked' : '') + ' onchange="toggleFlow(\'' + f.name + '\', this.checked)" />'
      + '<span class="slider"></span></label></div>';
  }).join('');

  var active = State.getActiveCount();
  var muted = State.getTotalMuted();
  var footer = State.allFlows.length + ' flows · ' + active + ' active · ' + muted + ' muted';
  if (State.globalClassInfo.classCount > 0) footer += ' · ' + State.globalClassInfo.classCount + ' global';
  document.getElementById('sidebar-footer').textContent = footer;
}

async function toggleFlow(name, active) {
  var f = State.allFlows.find(function(f) { return f.name === name; });
  if (f) f.active = active;
  renderSidebar(document.getElementById('search').value);
  await api('/api/flows/' + encodeURIComponent(name) + '/toggle', { active: active });
  toast((active ? '🟢' : '⚫') + ' ' + name + (active ? ' activated' : ' silenced'), 'Hot Restart to apply');
  if (State.selectedFlow === name) selectFlow(name);
}
