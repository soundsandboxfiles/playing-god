// _util.js — shared helpers for the headless gate scripts (§13, §14.4).
//
// Gate artefacts are EVIDENCE (README: "output/gate-artefacts/ — committed, they
// are evidence"). Each carries timestamp_ms, session_id and the spec version it
// was run against (§14.4). These scripts run under plain node — no browser, no
// audio device (README) — which is the whole reason src/ is DOM-free.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..');
export const ARTEFACT_DIR = join(PROJECT_ROOT, 'output', 'gate-artefacts');

// Spec version note (§14.4). The in-repo spec header reads "DESIGN BRIEF v3"; the
// vault entity calls it v9 (36pp). Recorded as-is rather than reconciled — see
// the report's ambiguities section.
export const SPEC_VERSION = 'playing-god-spec.md header "v3" / vault "v9"';

// One session id per overnight run, so every artefact and the (future) logs share
// it. Fixed string + start time keeps it stable within a run and readable.
export const SESSION_ID = 'overnight-headless-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

export function nowMs() { return Date.now(); }

export function ensureDir(dir) { mkdirSync(dir, { recursive: true }); }

// Write a JSON artefact with the mandatory envelope fields (§14.4).
export function writeArtefact(name, payload) {
  ensureDir(ARTEFACT_DIR);
  const record = {
    timestamp_ms: nowMs(),
    session_id: SESSION_ID,
    spec_version: SPEC_VERSION,
    artefact: name,
    ...payload,
  };
  const path = join(ARTEFACT_DIR, name);
  writeFileSync(path, JSON.stringify(record, null, 2));
  return path;
}

// Simple percentile over a numeric array (linear interpolation). Used for the
// distribution reports (§5.2, §14.4).
export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

// Distribution summary of a numeric array: count, min, max, mean, and deciles.
export function distributionSummary(values) {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (arr.length === 0) return { count: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const pcts = {};
  for (const p of [0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 100]) pcts['p' + p] = percentile(arr, p);
  return { count: arr.length, min: arr[0], max: arr[arr.length - 1], mean, percentiles: pcts };
}
