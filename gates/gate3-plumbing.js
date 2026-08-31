// gate3-plumbing.js — Gate 3 machinery check with SYNTHETIC dwell (BUILD-ORDER),
// v2.2: for BOTH archive modes (work order §5) — deep-grid@G and adaptive@16×16.
//
// This proves the ARCHIVE MACHINERY RUNS: cells fill, the container rule fires
// (deep: eviction + newcomer protection; adaptive: contests + re-listens), the servo
// moves, and the logs round-trip. It proves NOTHING about the search (BUILD-ORDER):
// "no conclusion about behaviour, convergence or quality may be drawn from a
// synthetic-dwell run." Every record it writes is tagged SYNTHETIC (§13).
//
// Dwell here is a uniform random source, NOT a measurement — it exists only to drive
// the state machine and says nothing about what sounds are good.
//
// Run: node gates/gate3-plumbing.js   (after Gate 2b geometry sweep writes chosen_G)

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { Engine } from '../src/loop.js';
import { Logger } from '../src/logging.js';
import { genomesFromSeedPicks } from '../src/seedpicks.js';
import { writeArtefact, ARTEFACT_DIR } from './_util.js';

const N_LISTENS = 2500;
const RENDER_LEN = 2; // short renders — plumbing only, realism irrelevant (SYNTHETIC)

function loadJSON(name, fallback) {
  const p = join(ARTEFACT_DIR, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
}
function loadSeedPicks() {
  const p = join(ARTEFACT_DIR, 'seed-picks.json');
  return existsSync(p) ? genomesFromSeedPicks(JSON.parse(readFileSync(p, 'utf8'))) : null;
}
function parseGeom(s, fb) { const m = s && /^(\d+)x(\d+)$/.exec(s); return m ? { nx: +m[1], ny: +m[2] } : fb; }

function runMode(mode, geom, cal, switchRates) {
  const rng = new RNG(mode === 'adaptive' ? 0x3BAD : 0x3B00);
  const total = geom.nx * geom.ny;
  const logger = new Logger('SYNTHETIC-' + mode + '-' + (mode === 'adaptive' ? '0x3BAD' : '0x3B00'), () => Date.now());
  const engine = new Engine({
    rng, calibration: cal, switchRates, logger,
    seedGenomes: loadSeedPicks(),
    archiveMode: mode, geometry: geom,
    renderOpts: { sampleRate: 22050, lengthOverride: RENDER_LEN },
    synthetic: true,
  });

  let evictions = 0, protectionSeen = 0, protectionBlocked = 0, servoMoves = 0, renderErrors = 0;
  let relistens = 0, contestsWon = 0, elitesSurvived = 0, elitesResampled = 0;
  const t0 = Date.now();

  for (let i = 0; i < N_LISTENS; i++) {
    const cand = engine.nextCandidate();
    if (cand.render.renderError) renderErrors++;
    if (cand.relisten) relistens++;
    const L = cand.L_at_listen;
    let dwell = rng.next() * L * 1.2;
    let completed = false;
    if (dwell >= L) { dwell = L; completed = true; }
    if (dwell < 0.35) dwell = 0.35;
    const res = engine.recordListen(cand, { dwell_s: dwell, completed, listener_id: 'SYNTHETIC' });
    if (res.archiveAction) {
      const a = res.archiveAction;
      if (a.evicted_genome_id) evictions++;
      if (a.n_protected_in_cell > 0) protectionSeen++;
      if (a.eviction_blocked_by_protection) protectionBlocked++;
      if (a.adaptive_action === 'challenger_won') contestsWon++;
      if (a.adaptive_action === 'elite_survived') elitesSurvived++;
      if (a.adaptive_action === 'elite_resampled') elitesResampled++;
    }
    const lastServo = logger.streams.servo[logger.streams.servo.length - 1];
    if (lastServo && lastServo.direction !== 'no_change' && lastServo.listen_id === cand.listen_id) servoMoves++;
  }

  const snap = engine.archive.snapshot(N_LISTENS);
  let maxDepth = 0;
  if (snap.cell_depth_histogram) for (let d = snap.cell_depth_histogram.length - 1; d >= 0; d--) if (snap.cell_depth_histogram[d] > 0) { maxDepth = d; break; }

  // Log round-trip: reconstruct every stored genome exactly.
  let reconAll = true, reconChecked = 0;
  for (const [id] of engine.genomeStore.entries) { const arr = engine.genomeStore.reconstruct(id); if (!arr) { reconAll = false; break; } reconChecked++; }

  // Mode-appropriate checks. Deep: eviction + depth-8 + protection. Adaptive: contests
  // resolved (won or survived) + re-listens actually happened (explicit re-evaluation).
  const common = {
    cells_filled_ge_30: snap.cells_occupied >= 30,
    servo_moved: servoMoves > 0,
    logs_round_trip: reconAll,
    snapshots_written: logger.streams.snapshots.length >= Math.floor(N_LISTENS / 100),
    no_render_errors: renderErrors === 0,
  };
  const modeChecks = mode === 'adaptive'
    ? {
        relistens_fired: relistens > 0,
        contests_resolved: (contestsWon + elitesSurvived) > 0,
        elites_resampled: elitesResampled > 0,
      }
    : {
        some_cell_reached_depth_8: snap.cell_depth_histogram[8] > 0,
        eviction_fired: evictions > 0,
        protection_held: protectionSeen > 0,
      };
  const checks = { ...common, ...modeChecks };
  const pass = Object.values(checks).every(Boolean);

  return {
    mode, geometry: `${geom.nx}x${geom.ny}`, pass, checks,
    measured: {
      n_listens: N_LISTENS, cells_occupied: snap.cells_occupied, coverage: snap.coverage,
      cell_depth_histogram: snap.cell_depth_histogram || null, max_cell_depth: maxDepth,
      evictions, protection_events: protectionSeen, protection_blocked_all: protectionBlocked,
      relistens, relisten_tax: snap.relisten_tax != null ? snap.relisten_tax : (mode === 'deep' ? 0 : null),
      contests_won: contestsWon, elites_survived: elitesSurvived, elites_resampled: elitesResampled,
      mean_elite_samples: snap.mean_elite_samples != null ? snap.mean_elite_samples : null,
      servo_moves: servoMoves, final_L: engine.servo.L,
      genomes_stored: engine.genomeStore.entries.size, genomes_reconstructed: reconChecked,
      snapshots: logger.streams.snapshots.length, servo_events: logger.streams.servo.length,
      anomalies: logger.streams.anomalies.length, render_errors: renderErrors,
    },
    elapsed_s: (Date.now() - t0) / 1000,
  };
}

function main() {
  const cal = loadJSON('axis-calibration.json', { axis_calibration: { dev: { min: 0.5, max: 60 }, harm: { min: 0.001, max: 0.6 } } }).axis_calibration;
  const jt = loadJSON('J_class_table.json', null);
  const switchRates = jt ? Object.fromEntries(Object.entries(jt.J_class_table).map(([k, v]) => [k, v.p_class])) : null;
  const G = parseGeom(loadJSON('gate2b-geomsweep.json', {}).chosen_G, { nx: 8, ny: 8 });

  console.log('── Gate 3-plumbing (SYNTHETIC dwell) — BOTH archive modes ──');
  const modes = [runMode('deep', G, cal, switchRates), runMode('adaptive', { nx: 16, ny: 16 }, cal, switchRates)];
  const allPass = modes.every((m) => m.pass);

  for (const m of modes) {
    console.log(`  [${m.mode}@${m.geometry}] PASS=${m.pass}`);
    for (const [k, v] of Object.entries(m.checks)) console.log(`      ${v ? 'ok' : 'FAIL'}  ${k}`);
    console.log('      measured:', JSON.stringify(m.measured));
  }

  const payload = {
    gate: '3-plumbing (SYNTHETIC dwell — machinery only, NOT evidence about the search), both modes',
    SYNTHETIC: true, pass: allPass, G: `${G.nx}x${G.ny}`, modes,
  };
  const path = writeArtefact('gate3-plumbing.json', payload);
  console.log('  PASS(all):', allPass, '| artefact:', path);
  process.exit(allPass ? 0 : 1);
}

main();
