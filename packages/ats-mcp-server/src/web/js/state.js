/** Global app state */
var State = {
  allFlows: [],
  selectedFlow: null,
  globalClassInfo: { classCount: 0, methodCount: 0, mutedCount: 0 },

  getActiveCount: function() {
    return this.allFlows.filter(function(f) { return f.active; }).length;
  },
  getTotalMethods: function() {
    return this.allFlows.reduce(function(s, f) { return s + f.methodCount; }, 0);
  },
  getTotalMuted: function() {
    return this.allFlows.reduce(function(s, f) { return s + f.mutedCount; }, 0);
  },
  getTotalEdges: function() {
    return this.allFlows.reduce(function(s, f) { return s + (f.edgeCount || 0); }, 0);
  },
};
