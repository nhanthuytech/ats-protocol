/** App configuration & constants */
var Config = {
  API_BASE: '',
  CHART_ANIMATION_DELAY: 80,
  TOAST_DURATION: 3000,
  TOAST_FADE: 200,

  COLORS: {
    active:    '#3fb950',
    inactive:  '#484f58',
    accent:    '#58a6ff',
    red:       '#f85149',
    amber:     '#d29922',
    purple:    '#bc8cff',

    // Edge type colors
    calls:      '#3fb950',
    emits:      '#f85149',
    delegates:  '#d29922',
    navigates:  '#bc8cff',
    depends_on: '#58a6ff',
    parent:     '#484f58',
  },

  PRIORITY: {
    high:   { label: 'HIGH',   color: '#f85149' },
    normal: { label: 'NORMAL', color: '#58a6ff' },
    low:    { label: 'LOW',    color: '#484f58' },
  },

  GRAPH: {
    FLOW_RADIUS: 20,
    METHOD_BASE_RADIUS: 12,
    RANK_MULTIPLIER: 500,
    LINK_DISTANCE: 100,
    DEPENDS_DISTANCE: 150,
    CHARGE_STRENGTH: -300,
    COLLISION_RADIUS: 40,
  },
};
