#!/usr/bin/env node

import * as path from 'path';

const command = process.argv[2];
const projectRoot = process.argv[3] ?? '.';

switch (command) {
  case 'dashboard':
  case 'web': {
    const { startWebServer } = await import('./web/web-server.js');
    const { discoverGraphPaths } = await import('./discover.js');
    const root = path.resolve(projectRoot);
    const found = discoverGraphPaths(root);
    if (found.length === 0) {
      console.error('❌ No .ats/flow_graph.json found.');
      process.exit(1);
    }
    console.error(`📍 Using: ${path.relative(root, found[0])}`);
    startWebServer(found[0]);
    break;
  }
  default:
    console.log(`
ATS Protocol CLI

Usage:
  ats dashboard [project-dir]   Open web visualization
  ats dashboard                 Auto-discover and open

Examples:
  ats dashboard
  ats dashboard /path/to/flutter-project
`);
}
