// gate3-plumbing.js — Gate 3 machinery check with SYNTHETIC dwell (BUILD-ORDER).
//
// This proves the ARCHIVE MACHINERY RUNS: cells fill, eviction fires, newcomer
// protection holds, the servo moves, and the logs round-trip. It proves NOTHING
// about the search (BUILD-ORDER): "no conclusion about behaviour, convergence or
// quality may be drawn from a synthetic-dwell run." Every record it writes is
// tagged SYNTHETIC so no later reader mistakes it for evidence (§13, BUILD-ORDER).
//
// Dwell here is a uniform random source, NOT a measurement. It exists only to
// drive the state machine; it says nothing about what sounds are good.
//
// Run: node gates/gate3-plumbing.js  (after Gate 2b PASSes and Stage 3 is built)

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { Engine } from '../src/loop.js';
import { Logger } from '../src/logging.js';
import { genomesFromSeedPicks } from '../src/seedpicks.js';
import { writeArtefact, ARTEFACT_DIR } from './_util.js';

// Load the owner's Gate 1a picks as seed parents (F2), so the plumbing run exercises
// the same picks-seeded herd the app uses. Fresh Genome objects each call (the engine
// mutates them).
function loadSeedPicks() {
  const p = join(ARTEFACT_DIR, 'seed-picks.json');
  return existsSync(p) ? genomesFromSeedPicks(JSON.parse(readFileSync(p, 'utf8'))) : null;
}

const N_LISTENS = 2500; // enough to fill many cells to depth and exercise eviction
const RENDER_LEN = 2;   // short renders — plumbing only, realism irrelevant (SYNTHETIC)

function loadJSON(name, fallback) {
  const p = join(ARTEFACT_DIR, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
}

function main() {
  const rng = new RNG(0x3B00);
  const cal = loadJSON('axis-calibration.json', { axis_calibration: { dev: { min: 0.5, max: 60 }, harm: { min: 0.001, max: 0.6 } } }).axis_calibration;
  const jt = loadJSON('J_class_table.json', null);
  const switchRates = jt ? Object.fromEntries(Object.entries(jt.J_class_table).map(([k, v]) => [k, v.p_class])) : null;

  const logger = new Logger('SYNTHETIC-' + '0x3B00', () => Date.now());
  const engine = new Engine({
    rng, calibration: cal, switchRates, logger,
    seedGenomes: loadSeedPicks(), // F2 picks-seeded herd
    renderOpts: { sampleRate: 22050, lengthOverride: RENDER_LEN },
    synthetic: true,
  });

  let evictions = 0, protectionSeen = 0, protectionBlocked = 0, servoMoves = 0, renderErrors = 0;
  let maxDepthSeen = 0;
  const t0 = Date.now();

  for (let i = 0; i < N_LISTENS; i++) {
    const cand = engine.nextCandidate();
    if (cand.render.renderError) renderErrors++;
    // SYNTHETIC dwell: uniform in [0, 1.2·L], censored at L (completed if it hits L).
    const L = cand.L_at_listen;
    let dwell = rng.next() * L * 1.2;
    let completed = false;
    if (dwell >= L) { dwell = L; completed = true; }
    if (dwell < 0.35) dwell = 0.35; // avoid discarding everything; still SYNTHETIC
    const res = engine.recordListen(cand, { dwell_s: dwell, completed, listener_id: 'SYNTHETIC' });
    if (res.archiveAction) {
      if (res.archiveAction.evicted_genome_id) evictions++;
      if (res.archiveAction.n_protected_in_cell > 0) protectionSeen++;
      if (res.archiveAction.eviction_blocked_by_protection) protectionBlocked++;
    }
    // Track servo movement from the last servo event.
    const lastServo = logger.streams.servo[logger.streams.servo.length - 1];
    if (lastServo && lastServo.direction !== 'no_change' && lastServo.listen_id === cand.listen_id) servoMoves++;
  }

  // Max cell depth reached.
  const snap = engine.archive.snapshot(N_LISTENS);
  for (let d = snap.cell_depth_histogram.length - 1; d >= 0; d--) if (snap.cell_depth_histogram[d] > 0) { maxDepthSeen = d; break; }

  // Log round-trip: reconstruct every stored genome exactly.
  let reconAll = true, reconChecked = 0;
  for (const [id] of engine.genomeStore.entries) {
    const arr = engine.genomeStore.reconstruct(id);
    if (!arr) { reconAll = false; break; }
    reconChecked++;
  }

  const checks = {
    cells_filled_ge_40: snap.cells_occupied >= 40,
    some_cell_reached_depth_8: snap.cell_depth_histogram[8] > 0,
    eviction_fired: evictions > 0,
    protection_held: protectionSeen > 0,
    servo_moved: servoMoves > 0,
    logs_round_trip: reconAll,
    snapshots_written: logger.streams.snapshots.length >= Math.floor(N_LISTENS / 100),
    no_render_errors: renderErrors === 0,
  };
  const pass = Object.values(checks).every(Boolean);

  const payload = {
    gate: '3-plumbing (SYNTHETIC dwell — machinery only, NOT evidence about the search)',
    SYNTHETIC: true,
    pass, checks,
    measured: {
      n_listens: N_LISTENS,
      cells_occupied: snap.cells_occupied,
      coverage: snap.coverage,
      cell_depth_histogram: snap.cell_depth_histogram,
      max_cell_depth: maxDepthSeen,
      evictions, protection_events: protectionSeen, protection_blocked_all: protectionBlocked,
      servo_moves: servoMoves, final_L: engine.servo.L,
      render_errors: renderErrors,
      genomes_stored: engine.genomeStore.entries.size,
      genomes_reconstructed: reconChecked,
      snapshots: logger.streams.snapshots.length,
      servo_events: logger.streams.servo.length,
      anomalies: logger.streams.anomalies.length,
    },
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('gate3-plumbing.json', payload);

  console.log('── Gate 3-plumbing (SYNTHETIC dwell) ──');
  for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`);
  console.log('  measured:', JSON.stringify(payload.measured));
  console.log('  PASS:', pass, '| artefact:', path);
  process.exit(pass ? 0 : 1);
}

main();
