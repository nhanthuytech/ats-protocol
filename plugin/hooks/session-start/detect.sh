#!/bin/bash
# ATS Plugin — Session Start Hook
# Detects ATS projects in the workspace and logs discovery results

ATS_FOUND=0

# Check current directory
if [ -f ".ats/flow_graph.json" ]; then
  echo "[ATS] ✓ Found .ats/flow_graph.json in project root"
  ATS_FOUND=$((ATS_FOUND + 1))
fi

# Scan immediate subdirectories
for dir in */; do
  if [ -f "${dir}.ats/flow_graph.json" ]; then
    echo "[ATS] ✓ Found .ats/flow_graph.json in ${dir}"
    ATS_FOUND=$((ATS_FOUND + 1))
  fi
done

if [ "$ATS_FOUND" -eq 0 ]; then
  echo "[ATS] No ATS projects detected. Run 'ats init' to set up."
elif [ "$ATS_FOUND" -gt 1 ]; then
  echo "[ATS] ⚠ Multiple ATS projects found ($ATS_FOUND). Use 'project' parameter in tools to specify which one."
fi
