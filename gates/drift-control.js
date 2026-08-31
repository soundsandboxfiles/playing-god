// drift-control.js — the SYNTHETIC-dwell null model (V2-PROPOSALS methodological
// note; Jon's long-held rule).
//
// How do you know a development in a real run is due to SELECTION and not to
// operator bias + drift + the priors? You compare against the same herd run under a
// RANDOM fitness function. SYNTHETIC-dwell mode is exactly that null model: evolution
// with selection removed. Where its archives drift is the signature of operator bias
// and priors ALONE. Any claimed discovery in a real run must differ from this drift
// distribution (Jon's stated "no meaningful difference from the start herd" is
// stronger than needed — operators WILL move even an unselected herd somewhere; the
// point is to MEASURE where and correct for it).
//
// So: run N synthetic-dwell runs of 2,500 listens each from the SAME picks-seeded
// herd (F2), keep the archive snapshots as the baseline. This is a candidate addition
// to the evaluation protocol (§15), not to the engine. Every record is labelled
// SYNTHETIC by the existing logging rule (BUILD-ORDER) so no reader mistakes it for
// evidence about the search.
//
// NOTHING here is a conclusion about behaviour, convergence or quality — the dwell is
// random. It is the reference distribution a real run is measured AGAINST.
//
// Run: node gates/drift-control.js
// Output: output/gate-artefacts/drift-control.json (per-run snapshot series).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { Engine } from '../src/loop.js';
import { Logger } from '../src/logging.js';
import { genomesFromSeedPicks } from '../src/seedpicks.js';
import { writeArtefact, ARTEFACT_DIR } from './_util.js';

const N_RUNS = 3;         // V2-PROPOSALS: "3 synthetic-dwell runs"
const N_LISTENS = 2500;   // "of 2,500 listens each"
const RENDER_LEN = 4;     // short renders — the archive geometry is what matters
const SEEDS = [0xD8171, 0xD8172, 0xD8173]; // distinct, recorded

function loadJSON(name, fallback) {
  const p = join(ARTEFACT_DIR, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
}
function loadSeedPicks() {
  const p = join(ARTEFACT_DIR, 'seed-picks.json');
  return existsSync(p) ? genomesFromSeedPicks(JSON.parse(readFileSync(p, 'utf8'))) : null;
}

// Population-level readouts that a real run would be compared against.
function popSummary(engine) {
  const genomes = engine.archive.allResidentGenomes();
  if (genomes.length === 0) return null;
  const names = ['n_partners', 'partner_influence', 'p_duplicate', 'mutation_fraction', 'p_ratio_jump_scale'];
  const out = {};
  for (const nm of names) { let s = 0; for (const g of genomes) s += g.getGlobal(nm); out[nm + '_mean'] = s / genomes.length; }
  // active-wave and ratio-jump-wave means
  let aw = 0, prj = 0;
  for (const g of genomes) {
    let a = 0, p = 0, na = 0;
    for (let w = 0; w < 64; w++) { if (g.getWave(w, 'active') >= 0.5) { a++; p += g.getWave(w, 'p_ratio_jump_wave'); na++; } }
    aw += a; prj += na ? p / na : 0;
  }
  out.active_wave_count_mean = aw / genomes.length;
  out.p_ratio_jump_wave_mean_over_active = prj / genomes.length;
  return out;
}

function runOne(seed, runIndex) {
  const cal = loadJSON('axis-calibration.json', { axis_calibration: { dev: { min: 0.5, max: 60 }, harm: { min: 0.001, max: 0.6 } } }).axis_calibration;
  const jt = loadJSON('J_class_table.json', null);
  const switchRates = jt ? Object.fromEntries(Object.entries(jt.J_class_table).map(([k, v]) => [k, v.p_class])) : null;
  const rng = new RNG(seed);
  const logger = new Logger('SYNTHETIC-drift-' + runIndex, () => Date.now());
  const engine = new Engine({
    rng, calibration: cal, switchRates, logger,
    seedGenomes: loadSeedPicks(),
    renderOpts: { sampleRate: 22050, lengthOverride: RENDER_LEN },
    synthetic: true,
  });

  const snapshots = [];
  const t0 = Date.now();
  for (let i = 0; i < N_LISTENS; i++) {
    const cand = engine.nextCandidate();
    const L = cand.L_at_listen;
    let dwell = rng.next() * L * 1.2, completed = false; // SYNTHETIC: random dwell
    if (dwell >= L) { dwell = L; completed = true; }
    if (dwell < 0.35) dwell = 0.35;
    engine.recordListen(cand, { dwell_s: dwell, completed, listener_id: 'SYNTHETIC' });
    if ((i + 1) % 250 === 0) {
      const snap = engine.archive.snapshot(i + 1);
      snapshots.push({
        listen: i + 1,
        cells_occupied: snap.cells_occupied,
        coverage: snap.coverage,
        qd_score: snap.qd_score_sum_mean_fitness,
        depth_hist: snap.cell_depth_histogram,
        D_med: snap.D_med,
        population: popSummary(engine),
      });
    }
  }
  console.log(`  run ${runIndex} (seed 0x${seed.toString(16)}): ${(( Date.now() - t0) / 1000).toFixed(0)}s, ` +
    `final cells=${snapshots[snapshots.length - 1].cells_occupied}, QD=${snapshots[snapshots.length - 1].qd_score.toFixed(0)}`);
  return { seed: '0x' + seed.toString(16), snapshots };
}

function main() {
  console.log('── Drift control: SYNTHETIC null model (3× 2500 listens, picks-seeded) ──');
  const runs = [];
  for (let r = 0; r < N_RUNS; r++) runs.push(runOne(SEEDS[r], r));
  writeArtefact('drift-control.json', {
    gate: 'drift-control (SYNTHETIC null model — NOT evidence about the search, BUILD-ORDER)',
    SYNTHETIC: true,
    note: 'Where the picks-seeded herd drifts under RANDOM fitness = operator bias + priors alone. A real run must differ from this to claim a selection effect (V2-PROPOSALS methodological note). Every record labelled SYNTHETIC.',
    config: { n_runs: N_RUNS, n_listens: N_LISTENS, render_len_s: RENDER_LEN, seeds: SEEDS.map((s) => '0x' + s.toString(16)) },
    runs,
  });
  console.log('  artefact: output/gate-artefacts/drift-control.json (labelled SYNTHETIC)');
}

main();
