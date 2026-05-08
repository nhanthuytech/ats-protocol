/** Overview + D3 Charts component */

function renderOverview() {
  var activeCount = State.getActiveCount();
  var totalMethods = State.getTotalMethods();
  var totalMuted = State.getTotalMuted();
  var totalEdges = State.getTotalEdges();

  var html = renderMetricCards(activeCount, totalMethods, totalMuted, totalEdges);
  html += '<div class="charts-grid">';
  html += '<div class="chart-card"><div class="chart-title"><span class="icon">🍩</span> Flow Status</div><div id="chart-donut"></div></div>';
  html += '<div class="chart-card"><div class="chart-title"><span class="icon">📊</span> Methods per Flow</div><div id="chart-bars"></div></div>';
  html += '<div class="chart-card"><div class="chart-title"><span class="icon">🔗</span> Edge Types</div><div id="chart-edges"></div></div>';
  html += '<div class="chart-card"><div class="chart-title"><span class="icon">⚡</span> Priority Distribution</div><div id="chart-priority"></div></div>';
  html += '</div>';

  document.getElementById('tab-overview').innerHTML = html;
  setTimeout(function() {
    var inactiveCount = State.allFlows.length - activeCount;
    drawDonut(activeCount, inactiveCount, State.globalClassInfo.classCount);
    drawBars();
    drawEdgeChart();
    drawPriorityChart();
  }, Config.CHART_ANIMATION_DELAY);
}

function renderMetricCards(activeCount, totalMethods, totalMuted, totalEdges) {
  var html = '<div class="overview-grid">';
  html += '<div class="metric-card flows animate-in delay-1"><div class="mc-label">Total Flows</div><div class="mc-value">' + State.allFlows.length + '</div><div class="mc-sub">' + State.globalClassInfo.classCount + ' global classes</div></div>';
  html += '<div class="metric-card active-c animate-in delay-2"><div class="mc-label">Active</div><div class="mc-value">' + activeCount + '</div><div class="mc-sub">' + (State.allFlows.length - activeCount) + ' inactive</div></div>';
  html += '<div class="metric-card methods animate-in delay-3"><div class="mc-label">Methods</div><div class="mc-value">' + totalMethods + '</div><div class="mc-sub">' + totalEdges + ' edges</div></div>';
  html += '<div class="metric-card muted-c animate-in delay-4"><div class="mc-label">Muted</div><div class="mc-value">' + totalMuted + '</div><div class="mc-sub">' + (State.globalClassInfo.mutedCount || 0) + ' global muted</div></div>';
  html += '</div>';
  return html;
}

// ─── D3 Charts ───

function drawDonut(active, inactive, global) {
  var el = document.getElementById('chart-donut');
  if (!el) return;
  el.innerHTML = '';
  var C = Config.COLORS;
  var w = el.clientWidth || 400, h = 220, r = 65;
  var items = [
    { label: 'Active', value: active, color: C.active },
    { label: 'Inactive', value: inactive, color: C.inactive },
    { label: 'Global', value: global, color: C.accent }
  ];
  var svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
  var g = svg.append('g').attr('transform', 'translate(' + w / 2 + ',' + (r + 10) + ')');
  var arc = d3.arc().innerRadius(r - 22).outerRadius(r);
  var pie = d3.pie().value(function(d) { return d.value; }).sort(null).padAngle(0.03);
  g.selectAll('path').data(pie(items)).join('path')
    .attr('d', arc).attr('fill', function(d) { return d.data.color; })
    .attr('stroke', '#0d1117').attr('stroke-width', 2)
    .style('opacity', 0).transition().duration(600).style('opacity', 1)
    .attrTween('d', function(d) { var i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d); return function(t) { return arc(i(t)); }; });
  // Center label
  g.append('text').attr('text-anchor', 'middle').attr('dy', '-4').attr('fill', '#e6edf3').attr('font-size', '24px').attr('font-weight', '700').attr('font-family', 'JetBrains Mono').text(active + inactive);
  g.append('text').attr('text-anchor', 'middle').attr('dy', '16').attr('fill', '#8b949e').attr('font-size', '11px').text('flows');
  // Legend row below
  var legend = svg.append('g').attr('transform', 'translate(' + (w / 2 - items.length * 55) + ',' + (r * 2 + 30) + ')');
  items.forEach(function(d, i) {
    legend.append('circle').attr('cx', i * 110).attr('cy', 5).attr('r', 5).attr('fill', d.color);
    legend.append('text').attr('x', i * 110 + 10).attr('y', 9).text(d.label + ' ' + d.value).attr('fill', '#8b949e').attr('font-size', '11px');
  });
}

function drawBars() {
  var el = document.getElementById('chart-bars');
  if (!el) return;
  el.innerHTML = '';
  var sorted = State.allFlows.slice().sort(function(a, b) { return b.methodCount - a.methodCount; });
  var w = el.clientWidth || 400, barH = 22, gap = 6;
  var h = sorted.length * (barH + gap) + 20;
  var maxVal = d3.max(sorted, function(d) { return d.methodCount; }) || 1;
  var labelW = 100, barArea = w - labelW - 50;
  var svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
  var P = Config.PRIORITY;
  sorted.forEach(function(f, i) {
    var y = i * (barH + gap) + 10;
    var barW = (f.methodCount / maxVal) * barArea;
    var color = (P[f.priority] || P.normal).color;
    svg.append('text').attr('x', labelW - 8).attr('y', y + 15).text(f.name.replace('_FLOW', '')).attr('fill', '#8b949e').attr('font-size', '11px').attr('font-family', 'JetBrains Mono').attr('text-anchor', 'end');
    svg.append('rect').attr('x', labelW).attr('y', y).attr('width', barArea).attr('height', barH).attr('rx', 4).attr('fill', '#21262d');
    svg.append('rect').attr('x', labelW).attr('y', y).attr('width', 0).attr('height', barH).attr('rx', 4).attr('fill', color).attr('opacity', 0.85)
      .transition().duration(600).delay(i * 40).attr('width', barW);
    svg.append('text').attr('x', labelW + barW + 8).attr('y', y + 15).text(f.methodCount).attr('fill', '#e6edf3').attr('font-size', '12px').attr('font-weight', '600').attr('font-family', 'JetBrains Mono')
      .style('opacity', 0).transition().delay(i * 40 + 400).style('opacity', 1);
  });
}

function drawEdgeChart() {
  var el = document.getElementById('chart-edges');
  if (!el) return;
  el.innerHTML = '';
  var C = Config.COLORS;
  api('/api/graph').then(function(data) {
    var types = {};
    data.links.forEach(function(l) {
      var t = l.type || 'unknown';
      if (t === 'parent') return;
      types[t] = (types[t] || 0) + 1;
    });
    var entries = Object.entries(types).sort(function(a, b) { return b[1] - a[1]; });
    var total = entries.reduce(function(s, e) { return s + e[1]; }, 0);
    var w = el.clientWidth || 400, h = 220, r = 55;
    var svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
    var g = svg.append('g').attr('transform', 'translate(' + w / 2 + ',' + (r + 10) + ')');
    var arc = d3.arc().innerRadius(r - 18).outerRadius(r);
    var pie = d3.pie().value(function(d) { return d[1]; }).sort(null).padAngle(0.04);
    g.selectAll('path').data(pie(entries)).join('path')
      .attr('d', arc).attr('fill', function(d) { return C[d.data[0]] || C.inactive; })
      .attr('stroke', '#0d1117').attr('stroke-width', 2)
      .style('opacity', 0).transition().duration(600).style('opacity', 1)
      .attrTween('d', function(d) { var i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d); return function(t) { return arc(i(t)); }; });
    g.append('text').attr('text-anchor', 'middle').attr('dy', '-4').attr('fill', '#e6edf3').attr('font-size', '22px').attr('font-weight', '700').attr('font-family', 'JetBrains Mono').text(total);
    g.append('text').attr('text-anchor', 'middle').attr('dy', '14').attr('fill', '#8b949e').attr('font-size', '11px').text('edges');
    var legendY = r * 2 + 30, cols = Math.min(entries.length, 3);
    entries.forEach(function(e, i) {
      var row = Math.floor(i / cols), col = i % cols;
      var lx = (w / cols) * col + 20, ly = legendY + row * 22;
      svg.append('circle').attr('cx', lx).attr('cy', ly + 5).attr('r', 5).attr('fill', C[e[0]] || C.inactive);
      svg.append('text').attr('x', lx + 12).attr('y', ly + 9).text(e[0] + ' · ' + e[1]).attr('fill', '#8b949e').attr('font-size', '11px');
    });
  });
}

function drawPriorityChart() {
  var el = document.getElementById('chart-priority');
  if (!el) return;
  el.innerHTML = '';
  var priorities = { high: 0, normal: 0, low: 0 };
  State.allFlows.forEach(function(f) { priorities[f.priority || 'normal']++; });
  var P = Config.PRIORITY;
  var w = el.clientWidth || 400, h = 160;
  var maxVal = Math.max(priorities.high, priorities.normal, priorities.low) || 1;
  var barArea = w - 120;
  var svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
  var entries = [['high', priorities.high], ['normal', priorities.normal], ['low', priorities.low]];
  entries.forEach(function(e, i) {
    var y = i * 44 + 15, barW = (e[1] / maxVal) * barArea;
    var p = P[e[0]];
    svg.append('text').attr('x', 65).attr('y', y + 18).text(p.label).attr('fill', p.color).attr('font-size', '12px').attr('font-weight', '600').attr('font-family', 'JetBrains Mono').attr('text-anchor', 'end');
    svg.append('rect').attr('x', 80).attr('y', y + 3).attr('width', barArea).attr('height', 22).attr('rx', 4).attr('fill', '#21262d');
    svg.append('rect').attr('x', 80).attr('y', y + 3).attr('width', 0).attr('height', 22).attr('rx', 4).attr('fill', p.color).attr('opacity', 0.8)
      .transition().duration(500).delay(i * 100).attr('width', barW);
    svg.append('text').attr('x', 80 + barW + 10).attr('y', y + 18).text(e[1]).attr('fill', '#e6edf3').attr('font-size', '13px').attr('font-weight', '600').attr('font-family', 'JetBrains Mono')
      .style('opacity', 0).transition().delay(i * 100 + 400).style('opacity', 1);
  });
}
