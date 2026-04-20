import * as path from 'path';
import * as fs from 'fs';

/** Recursively find all .ats/flow_graph.json files under root */
export function discoverGraphPaths(root: string, maxDepth = 5): string[] {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', '.dart_tool', 'build', 'dist', '.pub-cache']);

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    const candidate = path.join(dir, '.ats', 'flow_graph.json');
    if (fs.existsSync(candidate)) {
      results.push(candidate);
      return;
    }
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || skip.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      }
    } catch { /* permission denied */ }
  }

  walk(root, 0);
  return results;
}
