# Building an ATS SDK for a New Language

> **Step-by-step guide for implementing `ATS.trace()` in any programming language.**

This document is for contributors who want to bring ATS support to a new language — Node.js, Python, Swift, Go, Kotlin, or anything else.

---

## Table of Contents

- [Overview: What You're Building](#overview)
- [Part 1: The Runtime SDK](#part-1-the-runtime-sdk)
- [Part 2: CodeGen (Handled by MCP Server)](#part-2-codegen-handled-by-mcp-server)
- [Part 3: Testing](#part-3-testing)
- [Part 4: Publishing](#part-4-publishing)
- [Reference Implementations](#reference-implementations)

---

## Overview

### V5 Architecture — What You Build vs What's Already Done

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ATS Protocol V5 Architecture                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ✅ ALREADY BUILT (Universal — works for ALL languages)              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  MCP Server (TypeScript)                                       │  │
│  │  • 8 AI tools (init, context, activate, silence, ...)         │  │
│  │  • CLI (init, sync, activate — via npx)                       │  │
│  │  • CodeGen (auto-generates native code for detected language) │  │
│  │  • Web Dashboard (D3.js flow visualization)                   │  │
│  │  • Auto-discovery (finds .ats/ in monorepos)                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  🔧 YOU BUILD (per language — runs inside user's application)        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Runtime SDK                                                   │  │
│  │  • trace(className, methodName, data?)   — the trace function │  │
│  │  • internalInit(methodMap, activeFlows)  — startup loader     │  │
│  │  • FlowRegistry                         — O(1) method lookup  │  │
│  │  • LogWriter (optional)                  — file-based logs    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

You do **not** need to build:

- ❌ **MCP Server** — universal, works for all languages
- ❌ **CLI** — the MCP server includes CLI commands (`npx ats-mcp-server init`, etc.)
- ❌ **CodeGen** — the MCP server auto-detects your language and generates native code
- ❌ **Web Dashboard** — already built, language-agnostic
- ❌ **AI Skills** — language-agnostic, bundled in the Claude Plugin

You **only** build the **Runtime SDK** — the code that runs **inside the user's application** (on their phone, server, or browser).

### What is a "Runtime SDK"?

The Runtime SDK is a small library that:
1. **Runs inside the user's app** — on iPhone, Android, Node.js server, Python backend, etc.
2. **Provides `ATS.trace()`** — the function AI agents insert into source code
3. **Checks if a method is in an active flow** — O(1) hash map lookup
4. **Prints structured logs** — when active, in `[ATS][FLOW][#SEQ][dDEPTH] Class.method` format
5. **Does nothing in production** — zero overhead when disabled or in release mode

```
Design-time (MCP Server)              Runtime (Your SDK)
─────────────────────────────         ─────────────────────────────
Runs on developer's machine           Runs inside user's application
Node.js / TypeScript                   Your target language (Dart, Python, etc.)
Reads/writes flow_graph.json           Reads the generated native code
Generates .g.dart / .generated.ts      Executes ATS.trace() at method entry
AI agent uses MCP tools                Developer's app calls trace()
Stops when dev closes terminal         Runs when user opens the app
```

---

## Part 1: The Runtime SDK

### Core Contract

Your SDK must implement two functions:

#### `trace(className, methodName, {data})`

```
FUNCTION trace(className: string, methodName: string, data?: any):
  1. IF release mode → RETURN immediately (zero production cost)
  2. IF not initialized → RETURN
  3. key = className + "." + methodName
  4. IF mutedMethods.contains(key) → RETURN (O(1) skip noisy methods)
  5. flows = methodMap.get(key)
  6. IF flows is null → RETURN (O(1) miss)
  7. FOR each flow in flows:
       IF flow is in activeFlows:
         seq = incrementGlobalSequence()
         depth = computeDepth()
         PRINT "[ATS][{flow}][#{seq}][d{depth}] {className}.{methodName} | {data}"
         RETURN
  8. RETURN (method exists but no active flow)
```

#### `internalInit(methodMap, activeFlows, mutedMethods?)`

```
FUNCTION internalInit(
  methodMap: Map<string, string[]>,
  activeFlows: Set<string>,
  mutedMethods?: Set<string>
):
  store methodMap, activeFlows, and mutedMethods in module-level variables
  (called once at app startup from generated code)
```

### Implementation Checklist

| Requirement | Description | Priority |
|---|---|---|
| O(1) lookup | Method → flow lookup must be constant time (hash map) | 🔴 Critical |
| No-op when inactive | If method isn't in an active flow, cost must be near-zero | 🔴 Critical |
| Release mode guard | First check must be environment/build mode detection | 🔴 Critical |
| Muted methods | Skip methods in the `mutedMethods` set (V4+ feature) | 🔴 Critical |
| Sequence counter | Global atomic integer, increments on each trace call | 🟡 Important |
| Depth computation | Derive from stack trace or manual tracking | 🟡 Important |
| Structured log format | `[ATS][FLOW][#SEQ][dDEPTH] Class.method \| {data}` | 🟡 Important |
| Data serialization | Convert `data` parameter to JSON string | 🟢 Nice to have |
| File logging | Write to `.ats/logs/` as JSONL | 🟢 Nice to have |

### Language-Specific Examples

<details>
<summary><b>Dart/Flutter</b> (reference implementation)</summary>

```dart
// Already implemented in packages/ats_flutter/lib/src/ats_core.dart
class ATS {
  static Map<String, List<String>>? _methodMap;
  static Set<String> _activeFlows = {};
  static Set<String> _mutedMethods = {};
  static int _seq = 0;
  static bool _initialized = false;

  static void trace(String className, String methodName, {dynamic data}) {
    if (kReleaseMode || !_initialized) return;
    final key = '$className.$methodName';
    if (_mutedMethods.contains(key)) return;
    // ... lookup and print
  }

  static Future<void> internalInit(
    Map<String, List<String>> staticMap,
    List<String> activeFlows, [
    Set<String>? mutedMethods,
  ]) async {
    _methodMap = staticMap;
    _activeFlows = Set.from(activeFlows);
    _mutedMethods = mutedMethods ?? {};
    _initialized = true;
  }
}
```
</details>

<details>
<summary><b>Node.js / TypeScript</b></summary>

```typescript
// ats-node/src/ats.ts
let methodMap: Map<string, string[]> = new Map();
let activeFlows: Set<string> = new Set();
let mutedMethods: Set<string> = new Set();
let sequence = 0;

export function trace(className: string, methodName: string, data?: any): void {
  if (process.env.NODE_ENV === 'production') return;

  const key = `${className}.${methodName}`;
  if (mutedMethods.has(key)) return;

  const flows = methodMap.get(key);
  if (!flows) return;

  for (const flow of flows) {
    if (activeFlows.has(flow)) {
      const seq = String(++sequence).padStart(3, '0');
      const depth = getDepth();
      const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
      console.log(`[ATS][${flow}][#${seq}][d${depth}] ${key}${dataStr}`);
      return;
    }
  }
}

export function internalInit(
  map: Record<string, string[]>,
  active: string[],
  muted?: string[]
): void {
  methodMap = new Map(Object.entries(map));
  activeFlows = new Set(active);
  mutedMethods = new Set(muted ?? []);
}

function getDepth(): number {
  const stack = new Error().stack?.split('\n') || [];
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
_muted_methods: set[str] = set()
_sequence = 0

def trace(class_name: str, method_name: str, data=None):
    global _sequence

    if os.environ.get('ATS_DISABLED') == '1':
        return

    key = f"{class_name}.{method_name}"
    if key in _muted_methods:
        return

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

def internal_init(method_map: dict, active_flows: list, muted_methods: list = None):
    global _method_map, _active_flows, _muted_methods
    _method_map = method_map
    _active_flows = set(active_flows)
    _muted_methods = set(muted_methods or [])
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
    static var mutedMethods: Set<String> = []
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
        guard !mutedMethods.contains(key) else { return }
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
        activeFlows: [String],
        mutedMethods: [String] = []
    ) {
        self.methodMap = methodMap
        self.activeFlows = Set(activeFlows)
        self.mutedMethods = Set(mutedMethods)
    }
}
```
</details>

---

## Part 2: CodeGen (Handled by MCP Server)

> **You do NOT need to implement CodeGen.** The MCP Server handles this automatically.

### How It Works (V5)

In V5, the MCP Server's `FlowGraph.write()` method automatically detects the project language and generates native code:

| Detected File | Language | Generated File | Status |
|---|---|---|---|
| `pubspec.yaml` | Dart/Flutter | `lib/generated/ats/ats_generated.g.dart` | ✅ Built |
| `package.json` | TypeScript/Node.js | _(can load JSON directly)_ | ✅ No codegen needed |
| `pyproject.toml` | Python | _(can load JSON directly)_ | ✅ No codegen needed |

### Why Dart Needs CodeGen but Others Don't

- **Node.js/Python** can `require()` / `json.load()` a JSON file synchronously at startup → no codegen needed
- **Dart/Flutter** loading files at runtime is async and complex → static code generation compiles the JSON into a `const Map` for instant synchronous access

### If Your Language Needs CodeGen

If your target language cannot easily load JSON at startup (like Dart), you can add a **CodeGen Plugin** to the MCP Server:

```typescript
// packages/ats-mcp-server/src/codegen/your-language-plugin.ts
import { CodeGenPlugin } from './plugin.js';

export const yourLanguagePlugin: CodeGenPlugin = {
  detectFile: 'your-manifest-file',  // e.g. 'Package.swift' for Swift
  generate(data, projectRoot, config) {
    // Generate native code file with const maps
  }
};
```

Register it in `src/codegen/registry.ts` and it will auto-run on every `FlowGraph.write()`.

---

## Part 3: Testing

### Minimum Test Coverage

| Test | What to verify |
|---|---|
| **Init test** | `internalInit()` loads map correctly |
| **Active flow trace** | Calling `trace()` for an active method produces output |
| **Inactive flow trace** | Calling `trace()` for an inactive method produces NO output |
| **Unknown method** | Calling `trace()` for a method not in any flow produces NO output |
| **Muted method** | Calling `trace()` for a muted method produces NO output |
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

TEST "muted method produces no log":
  init({ "Foo.bar": ["TEST_FLOW"] }, ["TEST_FLOW"], ["Foo.bar"])
  output = captureStdout(() => trace("Foo", "bar"))
  ASSERT output is empty

TEST "unknown method produces no log":
  init({}, ["TEST_FLOW"])
  output = captureStdout(() => trace("Unknown", "method"))
  ASSERT output is empty
```

---

## Part 4: Publishing

### Package Structure (Runtime SDK Only)

```
ats_<language>/
├── README.md               # Usage guide
├── LICENSE                  # MIT
├── src/                     # Runtime SDK source
│   ├── ats.{ext}            # trace() + internalInit()
│   ├── flow_registry.{ext}  # O(1) lookup (optional, can inline)
│   └── log_writer.{ext}     # File logging (optional)
├── test/                    # Unit tests
└── <package-manifest>       # pubspec.yaml / package.json / setup.py / etc.
```

> **Note:** No `cli/` directory needed. CLI is handled by the MCP Server.

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
- [ ] All 8 minimum tests passing (including muted method test)
- [ ] `trace()` + `internalInit()` + muted methods support
- [ ] Zero overhead in release/production mode
- [ ] CI job added to `.github/workflows/ci.yml`
- [ ] Root `README.md` language table updated

---

## Reference Implementations

| SDK | Language | Location | Status |
|---|---|---|---|
| **ats_flutter** | Dart | [packages/ats_flutter](../packages/ats_flutter/) | ✅ Released — runtime SDK reference |
| **ats-mcp-server** | TypeScript | [packages/ats-mcp-server](../packages/ats-mcp-server/) | ✅ Released — universal CLI + CodeGen + tools |
| **ats-node** | TypeScript | — | 🔜 Planned |
| **ats-python** | Python | — | 🔜 Planned |

### Key Files to Study

| File | What to learn |
|---|---|
| [ats_core.dart](../packages/ats_flutter/lib/src/ats_core.dart) | `trace()` implementation with sequence + depth + muting |
| [flow_registry.dart](../packages/ats_flutter/lib/src/flow_registry.dart) | O(1) lookup registry |
| [flow-graph.ts](../packages/ats-mcp-server/src/core/flow-graph.ts) | CodeGen system (how MCP auto-generates native code) |
| [instrument.ts](../packages/ats-mcp-server/src/tools/instrument.ts) | Multi-language parser (Dart, TS, Python) |

---

## Need Help?

- Open an issue with the label `new-sdk`
- Reference `spec/protocol.md` for the full protocol contract
- The MCP Server already handles CLI, CodeGen, and AI tools — your SDK only needs the runtime

**Thank you for expanding the ATS ecosystem!**
