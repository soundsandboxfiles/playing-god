#!/bin/bash
# start-24h-runs.sh — launches the two 24-hour chimes runs (set up 2026-09-04).
#
#   Run 1  chimes-24h-random   — evolution from random creatures
#   Run 2  chimes-24h-artisan  — evolution seeded with ARTISAN's best chimes genome
#
# Both stop themselves cleanly after 24 hours. caffeinate keeps the Mac from
# idle-sleeping while they're alive, but the lid must stay OPEN and the Mac
# plugged in. You can close the Terminal window once this script says both are
# running. Logs: mimic/output/chimes-24h-random.log and chimes-24h-artisan.log
cd "$(dirname "$0")"
if ! command -v node > /dev/null 2>&1; then
  echo "PROBLEM: node isn't installed on this Mac, so the runs can't start here."
  echo "Tell Claude and we'll re-plan (the runs can go in the cloud instead)."
  exit 1
fi
# Idempotent: if a previous attempt left runs going, stop them first.
pkill -f "chimes-24h-random.json" 2>/dev/null && echo "(stopped an already-running run 1)"
pkill -f "chimes-24h-artisan.json" 2>/dev/null && echo "(stopped an already-running run 2)"
sleep 2
mkdir -p output
nohup caffeinate -ims node run.js --config configs/chimes-24h-random.json  > output/chimes-24h-random.log  2>&1 &
echo "Run 1 (random start)   launched — PID $!"
nohup caffeinate -ims node run.js --config configs/chimes-24h-artisan.json > output/chimes-24h-artisan.log 2>&1 &
echo "Run 2 (ARTISAN start)  launched — PID $!"
sleep 10
echo
echo "── first lines of run 1 ──────────────────────────"
head -8 output/chimes-24h-random.log
echo
echo "── first lines of run 2 ──────────────────────────"
head -8 output/chimes-24h-artisan.log
echo
if pgrep -f "chimes-24h-random.json" > /dev/null && pgrep -f "chimes-24h-artisan.json" > /dev/null; then
  echo "Both runs are alive. They'll finish themselves in 24 hours."
  echo "Leave the Mac plugged in with the lid open. This window can be closed."
else
  echo "WARNING: one or both runs are NOT alive — check the logs above / tell Claude."
fi
