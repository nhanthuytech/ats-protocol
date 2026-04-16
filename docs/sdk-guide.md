# Building an ATS SDK for a New Language

> **Step-by-step guide for implementing `ATS.trace()` in any programming language.**

This document is for contributors who want to bring ATS support to a new language — Node.js, Python, Swift, Go, Kotlin, or anything else.

---

## Table of Contents

- [Overview: What You're Building](#overview)
- [Part 1: The Runtime SDK](#part-1-the-runtime-sdk)
- [Part 2: The CLI](#part-2-the-cli)
- [Part 3: The CodeGen System](#part-3-the-codegen-system)
- [Part 4: Testing](#part-4-testing)
- [Part 5: Publishing](#part-5-publishing)
- [Reference Implementations](#reference-implementations)

---

## Overview

An ATS language SDK has three components:

```
┌─────────────────────────────────────────────────────┐
│  1. Runtime SDK          trace() + registry          │
│  2. CLI                  init, sync, activate, etc.  │
│  3. CodeGen              JSON → native lookup table  │
└─────────────────────────────────────────────────────┘
```

You do **not** need to build:
- ❌ MCP Server — the TypeScript server is universal, works for all languages
- ❌ Web Visualization — same, already built
- ❌ AI Skills — they're language-agnostic

You **only** build the runtime (trace function + flow registry) and the CLI (to manage the graph).

---

## Part 1: The Runtime SDK

### Core Contract

Your SDK must implement two functions:

#### `trace(className, methodName, {data})`

```
FUNCTION trace(className: string, methodName: string, data?: any):
  1. IF release mode → RETURN immediately (zero production cost)
  2. key = className + "." + methodName
  3. flows = methodMap.get(key)
  4. IF flows is null → RETURN (O(1) miss)
  5. FOR each flow in flows:
       IF flow is in activeFlows:
         seq = incrementGlobalSequence()
         depth = computeDepth()
         PRINT "[ATS][{flow}][#{seq}][d{depth}] {className}.{methodName} | {data}"
         RETURN
  6. RETURN (method exists but no active flow)
```

#### `internalInit(methodMap, activeFlows)`

```
FUNCTION internalInit(methodMap: Map<string, string[]>, activeFlows: Set<string>):
  store methodMap and activeFlows in module-level variables
  (called once at app startup from generated code)
```

### Implementation Checklist

| Requirement | Description | Priority |
|---|---|---|
| O(1) lookup | Method → flow lookup must be constant time (hash map) | 🔴 Critical |
| No-op when inactive | If method isn't in an active flow, cost must be near-zero | 🔴 Critical |
| Release mode guard | First check must be environment/build mode detection | 🔴 Critical |
| Sequence counter | Global atomic integer, increments on each trace call | 🟡 Important |
| Depth computation | Derive from stack trace or manual tracking | 🟡 Important |
| Structured log format | `[ATS][FLOW][#SEQ][dDEPTH] Class.method \| {data}` | 🟡 Important |
| Data serialization | Convert `data` parameter to JSON string | 🟢 Nice to have |
| File logging | Write to `.ats/logs/` as JSONL | 🟢 Nice to have |

### Language-Specific Examples

<details>
<summary><b>Node.js / TypeScript</b></summary>

```typescript
// ats-node/src/ats.ts

let methodMap: Map<string, string[]> = new Map();
let activeFlows: Set<string> = new Set();
let sequence = 0;

export function trace(className: string, methodName: string, data?: any): void {
  if (process.env.NODE_ENV === 'production') return;

  const key = `${className}.${methodName}`;
  const flows = methodMap.get(key);
  if (!flows) return;

  for (const flow of flows) {
    if (activeFlows.has(flow)) {
      const seq = String(++sequence).padStart(3, '0');
      const depth = getDepth(); // from Error().stack
      const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
      console.log(`[ATS][${flow}][#${seq}][d${depth}] ${key}${dataStr}`);
      return;
    }
  }
}

export function internalInit(
  map: Record<string, string[]>,
  active: string[]
): void {
  methodMap = new Map(Object.entries(map));
  activeFlows = new Set(active);
}

function getDepth(): number {
  const stack = new Error().stack?.split('\n') || [];
  // Count frames between trace() and the app's entry point
  return Math.max(0, stack.length - 4);
}
```
</details>

<details>
<summary><b>Python</b></summary>

```python
# ats_python/ats.py

import json
import traceback
import os

_method_map: dict[str, list[str]] = {}
_active_flows: set[str] = set()
_sequence = 0

def trace(class_name: str, method_name: str, data=None):
    global _sequence

    if os.environ.get('ATS_DISABLED') == '1':
        return

    key = f"{class_name}.{method_name}"
    flows = _method_map.get(key)
    if not flows:
        return

    for flow in flows:
        if flow in _active_flows:
            _sequence += 1
            depth = len(traceback.extract_stack()) - 2
            seq = str(_sequence).zfill(3)
            data_str = f" | {json.dumps(data)}" if data else ""
            print(f"[ATS][{flow}][#{seq}][d{depth}] {key}{data_str}")
            return

def internal_init(method_map: dict, active_flows: list):
    global _method_map, _active_flows
    _method_map = method_map
    _active_flows = set(active_flows)
```
</details>

<details>
<summary><b>Swift</b></summary>

```swift
// ATSSwift/Sources/ATS.swift

import Foundation

public final class ATS {
    static var methodMap: [String: [String]] = [:]
    static var activeFlows: Set<String> = []
    static var sequence: Int = 0

    public static func trace(
        _ className: String,
        _ methodName: String,
        data: [String: Any]? = nil
    ) {
        #if !DEBUG
        return
        #endif

        let key = "\(className).\(methodName)"
        guard let flows = methodMap[key] else { return }

        for flow in flows {
            if activeFlows.contains(flow) {
                sequence += 1
                let seq = String(format: "%03d", sequence)
                let depth = Thread.callStackSymbols.count - 4
                var line = "[ATS][\(flow)][#\(seq)][d\(depth)] \(key)"
                if let data = data,
                   let json = try? JSONSerialization.data(withJSONObject: data),
                   let str = String(data: json, encoding: .utf8) {
                    line += " | \(str)"
                }
                print(line)
                return
            }
        }
    }

    public static func internalInit(
        methodMap: [String: [String]],
        activeFlows: [String]
    ) {
        self.methodMap = methodMap
        self.activeFlows = Set(activeFlows)
    }
}
```
</details>

---

## Part 2: The CLI

Your SDK should include a CLI that manages the flow graph. Implement these commands:

| Command | What it does | Priority |
|---|---|---|
| `ats init` | Create `.ats/flow_graph.json` with empty graph, create generated file | 🔴 Critical |
| `ats sync` | Compile `flow_graph.json` → generated native code | 🔴 Critical |
| `ats activate <FLOW>` | Set `active: true` in JSON + auto-run sync | 🔴 Critical |
| `ats silence <FLOW>` | Set `active: false` in JSON + auto-run sync | 🔴 Critical |
| `ats status` | Print all flows with active/inactive state | 🟡 Important |
| `ats graph` | Export flow dependencies as Mermaid diagram | 🟢 Nice to have |

### CLI Implementation Notes

- **Read/write `flow_graph.json`** — All commands modify this single file.
- **Auto-sync after activate/silence** — The user shouldn't need to run two commands.
- **Validate before sync** — Check for duplicate methods, missing classes, etc.
- **Respect `ats.yaml`** — If it exists, use its paths. Otherwise use defaults.

### Default Paths

| Setting | Default |
|---|---|
| Graph file | `.ats/flow_graph.json` |
| Generated output | `lib/generated/ats/` (Dart), `src/generated/ats/` (TS), etc. |
| Log output | `.ats/logs/` |

---

## Part 3: The CodeGen System

### Why CodeGen?

The flow graph is JSON. Reading JSON at runtime costs startup time and prevents compile-time optimization. Instead, we compile JSON into a native data structure.

### What to Generate

Your sync command should produce a file like this (adapt for your language):

```
// AUTO-GENERATED BY ATS CLI — DO NOT EDIT

import { internalInit } from 'ats-node';

const METHOD_MAP = {
  'PaymentService.processPayment': ['PAYMENT_FLOW'],
  'PaymentService.refund': ['PAYMENT_FLOW'],
  'CartService.checkout': ['CHECKOUT_FLOW'],
};

const ACTIVE_FLOWS = ['CHECKOUT_FLOW'];

export function initATS() {
  internalInit(METHOD_MAP, ACTIVE_FLOWS);
}
```

### CodeGen Checklist

| Requirement | Description |
|---|---|
| **Static/const** | Use your language's compile-time constant mechanism |
| **Single file** | One generated file containing the full map |
| **Auto-generated header** | `// AUTO-GENERATED BY ATS CLI — DO NOT EDIT` |
| **Import only the SDK** | No other dependencies |
| **Init function** | One function that calls `internalInit()` |
| **Deterministic** | Same input JSON → same output file (for clean git diffs) |

---

## Part 4: Testing

### Minimum Test Coverage

| Test | What to verify |
|---|---|
| **Init test** | `internalInit()` loads map correctly |
| **Active flow trace** | Calling `trace()` for an active method produces output |
| **Inactive flow trace** | Calling `trace()` for an inactive method produces NO output |
| **Unknown method** | Calling `trace()` for an method not in any flow produces NO output |
| **Multi-flow method** | A method in 2 flows: trace when either is active |
| **Sequence counter** | Sequence numbers increment correctly |
| **Log format** | Output matches `[ATS][FLOW][#SEQ][dDEPTH] Class.method` pattern |

### Test Template (pseudocode)

```
TEST "active flow produces log":
  init({ "Foo.bar": ["TEST_FLOW"] }, ["TEST_FLOW"])
  output = captureStdout(() => trace("Foo", "bar"))
  ASSERT output contains "[ATS][TEST_FLOW]"
  ASSERT output contains "Foo.bar"

TEST "inactive flow produces no log":
  init({ "Foo.bar": ["TEST_FLOW"] }, [])  // no active flows
  output = captureStdout(() => trace("Foo", "bar"))
  ASSERT output is empty

TEST "unknown method produces no log":
  init({}, ["TEST_FLOW"])
  output = captureStdout(() => trace("Unknown", "method"))
  ASSERT output is empty
```

---

## Part 5: Publishing

### Package Structure

```
ats_<language>/
├── README.md               # Usage guide (see ats_flutter/README.md for reference)
├── LICENSE                  # MIT
├── src/                     # Runtime SDK source
│   ├── ats.{ext}            # trace() + internalInit()
│   └── cli/                 # CLI commands
├── test/                    # Unit tests
└── <package-manifest>       # pubspec.yaml / package.json / setup.py / etc.
```

### Naming Convention

| Language | Package name | Import |
|---|---|---|
| Dart/Flutter | `ats_flutter` | `import 'package:ats_flutter/ats_flutter.dart'` |
| Node.js/TypeScript | `ats-node` | `import { trace } from 'ats-node'` |
| Python | `ats-python` | `from ats_python import trace` |
| Swift | `ATSSwift` | `import ATSSwift` |
| Go | `ats-go` | `import "github.com/nhanthuytech/ats-go"` |

### Checklist Before Publishing

- [ ] README with installation + usage examples
- [ ] All 7 minimum tests passing
- [ ] CLI: init, sync, activate, silence working
- [ ] CodeGen produces deterministic output
- [ ] `ats_version: "4.0.0"` in generated flow graph
- [ ] CI job added to `.github/workflows/ci.yml`
- [ ] Root `README.md` language table updated
- [ ] `CONTRIBUTING.md` updated with new SDK instructions

---

## Reference Implementations

| SDK | Language | Location | Status |
|---|---|---|---|
| **ats_flutter** | Dart | [packages/ats_flutter](../packages/ats_flutter/) | ✅ Released — use as primary reference |
| **ats-node** | TypeScript | — | 🔜 Planned |
| **ats-python** | Python | — | 🔜 Planned |

The Flutter SDK is the most complete reference. Study these files:

| File | What to learn from it |
|---|---|
| [ats_core.dart](../packages/ats_flutter/lib/src/ats_core.dart) | `trace()` implementation with sequence + depth |
| [flow_registry.dart](../packages/ats_flutter/lib/src/flow_registry.dart) | O(1) lookup registry |
| [runner.dart](../packages/ats_flutter/lib/src/cli/runner.dart) | CLI implementation (init, sync, activate, silence) |
| [ats_flutter_test.dart](../packages/ats_flutter/test/ats_flutter_test.dart) | Test patterns |

---

## Need Help?

- Open an issue with the label `new-sdk`
- Reference `spec/protocol.md` for the full protocol contract
- The MCP Server (`packages/ats-mcp-server`) already supports instrumenting your language (Dart, TS, Python) — your SDK just needs the runtime + CLI

**Thank you for expanding the ATS ecosystem!**
