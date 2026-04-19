import { FlowGraph } from './src/core/flow-graph.js';
const g = new FlowGraph('/Users/MAC/Documents/FCI/df-mobile1/app/.ats/flow_graph.json');
const d = g.read();
g.write(d);
console.log("Done");
