/** Detail view component */

function renderDetail(data) {
  var totalMethods = data.classes.reduce(function(s, c) { return s + c.totalCount; }, 0);
  var totalMuted = data.classes.reduce(function(s, c) { return s + c.totalCount - c.enabledCount; }, 0);

  var html = '<div class="flow-header"><div class="row1"><h2>' + data.name + '</h2>';
  html += '<span class="badge ' + (data.active ? 'badge-active' : 'badge-inactive') + '">' + (data.active ? 'Active' : 'Inactive') + '</span>';
  if (data.priority && data.priority !== 'normal') html += '<span class="badge badge-' + data.priority + '">' + data.priority.toUpperCase() + '</span>';
  html += '</div><div class="desc">' + (data.description || 'No description') + '</div>';
  if (data.depends_on && data.depends_on.length) {
    html += '<div class="chips">' + data.depends_on.map(function(d) { return '<span class="chip">' + d + '</span>'; }).join('') + '</div>';
  }
  html += renderStatsBar(totalMethods, data.edges.length, data.sessions.length, totalMuted);
  html += '</div>';

  // Global Classes
  if (data.globalClasses && data.globalClasses.length > 0) {
    html += '<div class="section-title">Global Classes <span class="count-badge">' + data.globalClasses.length + '</span> <span class="global-badge">SHARED</span></div>';
    html += '<div class="class-card global-card">' + renderClassTree(data.globalClasses, true) + '</div>';
  }

  // Flow Classes
  html += '<div class="section-title">Classes <span class="count-badge">' + data.classes.length + '</span></div>';
  html += '<div class="class-card">' + renderClassTree(data.classes, false) + '</div>';

  // Edges
  if (data.edges.length > 0) {
    html += renderEdgeTable(data.edges);
  }

  // Known Issues
  if (data.known_issues && data.known_issues.length > 0) {
    html += renderIssuesBox(data.known_issues);
  }

  // Sessions
  if (data.sessions.length > 0) {
    html += renderSessions(data.sessions);
  }

  document.getElementById('tab-detail').innerHTML = html;
}

function renderStatsBar(methods, edges, sessions, muted) {
  var html = '<div class="stats-bar">';
  html += '<div class="stat"><span class="stat-label">Methods</span><span class="stat-value">' + methods + '</span></div>';
  html += '<div class="stat"><span class="stat-label">Edges</span><span class="stat-value">' + edges + '</span></div>';
  html += '<div class="stat"><span class="stat-label">Sessions</span><span class="stat-value">' + sessions + '</span></div>';
  html += '<div class="stat"><span class="stat-label">Muted</span><span class="stat-value' + (muted > 0 ? ' warn' : '') + '">' + muted + '</span></div>';
  return html + '</div>';
}

function renderClassTree(classes, isGlobal) {
  var html = '';
  classes.forEach(function(cls) {
    var hasMuted = cls.enabledCount < cls.totalCount;
    var maxConn = Math.max.apply(null, cls.methods.map(function(m) { return m.callers + m.callees; }));
    html += '<div class="class-header" onclick="toggleClassExpand(this)">';
    html += '<div class="left"><span class="chevron open">▶</span><span class="cls-name">' + cls.name + '</span>';
    if (isGlobal) html += '<span class="global-badge">GLOBAL</span>';
    html += '</div><span class="cls-count' + (hasMuted ? ' has-muted' : '') + '">' + cls.enabledCount + '/' + cls.totalCount + '</span></div>';
    html += '<div class="method-list">';
    cls.methods.forEach(function(m) {
      html += renderMethodRow(cls.name, m, maxConn);
    });
    html += '</div>';
  });
  return html;
}

function renderMethodRow(className, m, maxConn) {
  var conn = m.callers + m.callees;
  var connText = m.callers > 0 && m.callees > 0 ? '↔ ' + conn : m.callees > 0 ? '→ ' + m.callees : m.callers > 0 ? '← ' + m.callers : '';
  var heat = conn >= maxConn && conn > 3 ? ' very-hot' : conn > 2 ? ' hot' : '';
  var html = '<div class="method-row"><div class="left">';
  html += '<input type="checkbox" ' + (!m.muted ? 'checked' : '') + ' onchange="muteMethod(\'' + className + '\',\'' + m.name + '\',!this.checked)" />';
  html += '<span class="m-name' + (m.muted ? ' is-muted' : '') + heat + '">' + m.name + '</span>';
  if (m.muted) html += '<span class="muted-badge">MUTED</span>';
  html += '</div><div class="right">' + connText + '</div></div>';
  return html;
}

function renderEdgeTable(edges) {
  var html = '<div class="section-title">Edges <span class="count-badge">' + edges.length + '</span></div>';
  html += '<div class="edge-table"><table><thead><tr><th>From</th><th></th><th>To</th><th>Type</th><th>Trigger</th><th>State Impact</th></tr></thead><tbody>';
  edges.forEach(function(e) {
    html += '<tr><td>' + e.from + '</td><td class="arrow">→</td><td>' + e.to + '</td>';
    html += '<td><span class="type-badge type-' + e.type + '">' + e.type + '</span></td>';
    html += '<td>' + (e.trigger ? '<span class="trigger-badge">' + e.trigger + '</span>' : '') + '</td>';
    html += '<td>' + (e.state_impact ? '<span class="state-impact">' + e.state_impact + '</span>' : '') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderIssuesBox(issues) {
  var html = '<div class="issues-box"><div class="issues-title">⚠ Known Issues</div><ul>';
  issues.forEach(function(issue) { html += '<li>' + issue + '</li>'; });
  html += '</ul></div>';
  return html;
}

function renderSessions(sessions) {
  var html = '<div class="section-title">Sessions <span class="count-badge">' + sessions.length + '</span></div>';
  html += '<div class="session-card">';
  sessions.forEach(function(s) {
    html += '<div class="session-entry"><div class="row1"><span class="date">📅 ' + s.date + '</span>';
    html += '<span class="action-badge">' + s.action + '</span>';
    html += '<span>' + (s.resolved ? '✅' : '❌') + '</span></div>';
    html += '<div class="note">' + s.note + '</div></div>';
  });
  html += '</div>';
  return html;
}

function toggleClassExpand(el) {
  el.querySelector('.chevron').classList.toggle('open');
  var ml = el.nextElementSibling;
  ml.style.display = ml.style.display === 'none' ? '' : 'none';
}

async function muteMethod(className, methodName, mute) {
  await api(mute ? '/api/methods/mute' : '/api/methods/unmute', { className: className, methodName: methodName });
  toast((mute ? '🔇' : '🔊') + ' ' + className + '.' + methodName + (mute ? ' muted' : ' unmuted'), 'Hot Restart to apply');
  var fdata = await api('/api/flows');
  State.allFlows = fdata.flows;
  renderSidebar(document.getElementById('search').value);
  if (State.selectedFlow) selectFlow(State.selectedFlow);
}
