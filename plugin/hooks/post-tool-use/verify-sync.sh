#!/bin/bash
# ATS Plugin — Post Tool Use Hook
# Verifies generated code is in sync after ats_activate / ats_silence / ats_instrument
#
# This is a safety net — FlowGraph.write() in TypeScript already handles codegen.
# This hook catches edge cases where the sync might have been skipped.

# Only relevant for Flutter/Dart projects
if [ ! -f "pubspec.yaml" ]; then
  exit 0
fi

GRAPH_FILE=""

# Find flow_graph.json
if [ -f ".ats/flow_graph.json" ]; then
  GRAPH_FILE=".ats/flow_graph.json"
else
  for dir in */; do
    if [ -f "${dir}.ats/flow_graph.json" ]; then
      GRAPH_FILE="${dir}.ats/flow_graph.json"
      break
    fi
  done
fi

if [ -z "$GRAPH_FILE" ]; then
  exit 0
fi

# Check if generated file exists and compare timestamps
PROJECT_DIR=$(dirname $(dirname "$GRAPH_FILE"))
GEN_FILE="${PROJECT_DIR}/lib/generated/ats/ats_generated.g.dart"

if [ -f "$GEN_FILE" ]; then
  # Compare modification times
  GRAPH_TIME=$(stat -f %m "$GRAPH_FILE" 2>/dev/null || stat -c %Y "$GRAPH_FILE" 2>/dev/null)
  GEN_TIME=$(stat -f %m "$GEN_FILE" 2>/dev/null || stat -c %Y "$GEN_FILE" 2>/dev/null)

  if [ "$GRAPH_TIME" -gt "$GEN_TIME" ]; then
    echo "[ATS] ⚠ Generated code is stale. flow_graph.json was modified after ats_generated.g.dart."
    echo "[ATS] Run 'ats sync' or toggle a flow to force re-sync."
  fi
else
  echo "[ATS] ⚠ ats_generated.g.dart not found. Run 'ats sync' to generate."
fi
