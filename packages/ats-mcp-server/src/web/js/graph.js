/** Graph view component (D3 force-directed) */

async function renderGraph() {
  var container = document.getElementById('graph-container');
  var data = await api('/api/graph');
  document.getElementById('graph-svg').innerHTML = '';
  var width = container.clientWidth, height = container.clientHeight;
  var svg = d3.select('#graph-svg');
  var G = Config.GRAPH;

  // Arrow markers
  svg.append('defs').selectAll('marker')
    .data(['calls', 'delegates', 'emits', 'navigates', 'depends_on', 'parent'])
    .join('marker').attr('id', function(d) { return 'arrow-' + d; })
    .attr('viewBox', '0 -5 10 10').attr('refX', 20).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5').attr('class', 'arrow');

  var g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.1, 5]).on('zoom', function(e) { g.attr('transform', e.transform); }));

  var sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(function(d) { return d.id; }).distance(function(d) { return d.type === 'depends_on' ? G.DEPENDS_DISTANCE : G.LINK_DISTANCE; }))
    .force('charge', d3.forceManyBody().strength(G.CHARGE_STRENGTH))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(G.COLLISION_RADIUS));

  var link = g.selectAll('.link').data(data.links).join('line')
    .attr('class', function(d) { return 'link ' + d.type; })
    .attr('marker-end', function(d) { return 'url(#arrow-' + d.type + ')'; });

  var node = g.selectAll('.node').data(data.nodes).join('g')
    .call(d3.drag().on('start', dragStart).on('drag', dragged).on('end', dragEnd));

  node.append('circle')
    .attr('r', function(d) { return d.type === 'flow' ? G.FLOW_RADIUS : G.METHOD_BASE_RADIUS + (d.rank || 0) * G.RANK_MULTIPLIER; })
    .attr('class', function(d) {
      if (d.type === 'flow') return 'node-flow' + (d.active ? ' active' : '');
      return 'node-method' + (d.muted ? ' muted' : '') + (d.isGlobal ? ' global' : '');
    });

  node.append('text')
    .attr('class', function(d) { return d.type === 'flow' ? 'node-label' : 'node-label node-label-method'; })
    .attr('dy', function(d) { return d.type === 'flow' ? 32 : 22; })
    .text(function(d) { return d.type === 'flow' ? d.id : d.id.split('.').pop(); });

  // Click flow nodes
  node.filter(function(d) { return d.type === 'flow'; }).on('click', function(e, d) {
    switchTab('detail');
    selectFlow(d.id);
  });

  // Tooltip
  var tip = document.getElementById('tooltip');
  node.on('mouseover', function(e, d) {
    var h = '<div class="tt-title">' + d.id + '</div>';
    if (d.type === 'flow') {
      h += '<div class="tt-detail">Active: ' + (d.active ? '✅' : '❌') + '</div>';
      h += '<div class="tt-detail">Priority: ' + (d.priority || 'normal') + '</div>';
      h += '<div class="tt-detail">Methods: ' + d.methodCount + '</div>';
      if (d.mutedCount) h += '<div class="tt-detail">Muted: ' + d.mutedCount + '</div>';
    } else {
      if (d.muted) h += '<div class="tt-detail">⚠ MUTED</div>';
      if (d.isGlobal) h += '<div class="tt-detail">🌐 GLOBAL</div>';
      h += '<div class="tt-detail">PageRank: ' + (d.rank || 0) + '</div>';
    }
    tip.innerHTML = h;
    tip.style.opacity = 1;
    tip.style.left = (e.pageX + 12) + 'px';
    tip.style.top = (e.pageY - 12) + 'px';
  }).on('mouseout', function() { tip.style.opacity = 0; });

  sim.on('tick', function() {
    link.attr('x1', function(d) { return d.source.x; }).attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; }).attr('y2', function(d) { return d.target.y; });
    node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
  });

  function dragStart(e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
  function dragged(e, d) { d.fx = e.x; d.fy = e.y; }
  function dragEnd(e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }
}
