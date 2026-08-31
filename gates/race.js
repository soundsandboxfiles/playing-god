// race.js — THE RACE (work order §4): deep-grid@G vs adaptive-sampling@16×16 under
// ONE honest synthetic noisy-dwell model, multiple seeds. Measures COST and STRUCTURE
// only. It declares NO WINNER — the choice is the owner's, and the boredom-confound
// weighting (kin-averaging measures WITHOUT re-hearing; adaptive re-listens carry the
// familiarity confound) is explicitly theirs to add (V2-PROPOSALS "fulcrum check").
//
// Same picks-seeded herd, same taste landscape per seed, same engine RNG per seed —
// so the ONLY differences between the two columns are the archive architecture. Both
// run through the real Engine (src/loop.js), so the race also validates that both
// shipping modes work end-to-end.
//
// Per architecture, per seed, sampled every SNAP listens:
//   • coverage / niches maintained (occupied cells) — the fill trajectory
//   • QD trajectory (deep: Σ mean cell fitness; adaptive: Σ elite mean) + mean cell
//     quality (QD / occupied), which is comparable across geometries
//   • listens-to-fill: first listen reaching 25/50/75% coverage
//   • listens-to-stabilise: first listen where fitness turnover per window falls below
//     a threshold (elites/cells stop churning)
//   • re-listen tax: fraction of listens spent re-measuring (0 for deep by construction)
//   • denoising error: |reported cell fitness − true μ of its residents| — the honest
//     read on how well each architecture recovers appeal under noise (uses the known
//     taste landscape; this is the one thing a real run can never measure, which is
//     exactly why the synthetic race is worth running).
//
// Run: node gates/race.js   (after gate2b-geomsweep.js writes chosen_G)

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { Engine } from '../src/loop.js';
import { genomesFromSeedPicks } from '../src/seedpicks.js';
import { makeTaste, DWELL_MIN } from './_synthetic-dwell.js';
import { writeArtefact, ARTEFACT_DIR } from './_util.js';

const N_LISTENS = 2400;   // enough to fill + stabilise both architectures
const RENDER_LEN = 2;     // SYNTHETIC — realism irrelevant (BUILD-ORDER); short for speed
const SNAP = 100;         // snapshot cadence
const SEEDS = [0xA11CE, 0xB0B, 0xC0FFEE]; // taste-landscape seeds (multi-seed average)
const TURNOVER_STABLE = 0.12; // fraction-of-cells-changed threshold for "stabilised"

function loadJSON(name, fallback) {
  const p = join(ARTEFACT_DIR, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
}
function loadSeedPicks() {
  const p = join(ARTEFACT_DIR, 'seed-picks.json');
  return existsSync(p) ? genomesFromSeedPicks(JSON.parse(readFileSync(p, 'utf8'))) : null;
}
function parseGeom(s, fallback) {
  if (!s) return fallback;
  const m = /^(\d+)x(\d+)$/.exec(s);
  return m ? { nx: +m[1], ny: +m[2] } : fallback;
}

// Reported cell fitness + true-μ error for a run's archive, given the taste model.
function denoisingError(engine, taste, mode, L) {
  const cells = [...engine.archive.cells.values()];
  let sumAbs = 0, n = 0;
  for (const c of cells) {
    if (mode === 'adaptive') {
      if (!c.elite) continue;
      const trueMu = taste.mu(c.elite.genome, L);
      sumAbs += Math.abs(c.elite.mean - trueMu); n++;
    } else {
      if (!c.residents || c.residents.length === 0) continue;
      // deep cell reported = mean resident F; true = mean resident μ.
      let repSum = 0, muSum = 0;
      for (const r of c.residents) { repSum += r.F; muSum += taste.mu(r.genome, L); }
      sumAbs += Math.abs(repSum / c.residents.length - muSum / c.residents.length); n++;
    }
  }
  return n ? sumAbs / n : null;
}

function runArch(mode, geom, tasteSeed, engineSeed) {
  const rng = new RNG(engineSeed);
  const noise = new RNG(engineSeed ^ 0x9E3779B9); // separate noise stream
  const taste = makeTaste(tasteSeed);
  const total = geom.nx * geom.ny;
  const engine = new Engine({
    rng, calibration: CAL, switchRates: SWITCH_RATES,
    seedGenomes: loadSeedPicks(),
    archiveMode: mode, geometry: geom,
    renderOpts: { sampleRate: 22050, lengthOverride: RENDER_LEN },
    synthetic: true,
  });

  const traj = [];
  let relistens = 0, breeds = 0;
  const fillAt = { 25: null, 50: null, 75: null };
  let stabiliseAt = null;
  let prevFit = null; // cellKey → reported fitness, for turnover

  for (let i = 1; i <= N_LISTENS; i++) {
    const cand = engine.nextCandidate();
    if (cand.relisten) relistens++; else breeds++;
    const L = cand.L_at_listen;
    const s = taste.sample(cand.genome, noise, L);
    engine.recordListen(cand, { dwell_s: s.dwell_s, completed: s.completed, listener_id: 'synthetic' });

    const covPct = (engine.archive.occupiedCount() / total) * 100;
    for (const k of [25, 50, 75]) if (fillAt[k] === null && covPct >= k) fillAt[k] = i;

    if (i % SNAP === 0) {
      const snap = engine.archive.snapshot(i);
      const qd = mode === 'adaptive' ? snap.qd_score_sum_elite_fitness : snap.qd_score_sum_mean_fitness;
      const occ = snap.cells_occupied;
      // Turnover: fraction of cells occupied in BOTH snapshots whose reported fitness
      // changed by >10%. When it settles below TURNOVER_STABLE, call it stabilised.
      const curFit = new Map();
      for (const c of engine.archive.cells.values()) {
        if (mode === 'adaptive') { if (c.elite) curFit.set(`${c.x},${c.y}`, c.elite.mean); }
        else { if (c.residents && c.residents.length) curFit.set(`${c.x},${c.y}`, engine.archive.meanCellFitness(c)); }
      }
      let churn = null;
      if (prevFit) {
        let changed = 0, common = 0;
        for (const [k, v] of curFit) if (prevFit.has(k)) { common++; const p = prevFit.get(k); if (p > 0 && Math.abs(v - p) / p > 0.10) changed++; }
        churn = common ? changed / common : 1;
        if (stabiliseAt === null && i > 400 && churn <= TURNOVER_STABLE) stabiliseAt = i;
      }
      prevFit = curFit;
      traj.push({
        listen: i, coverage: +(occ / total).toFixed(4), occupied: occ,
        qd: +qd.toFixed(2), mean_cell_quality: occ ? +(qd / occ).toFixed(3) : 0,
        relisten_tax: +(relistens / (relistens + breeds)).toFixed(4),
        mean_elite_samples: mode === 'adaptive' ? +(snap.mean_elite_samples || 0).toFixed(2) : null,
        churn: churn != null ? +churn.toFixed(3) : null,
      });
    }
  }

  const denoise = denoisingError(engine, taste, mode, RENDER_LEN);
  const finalSnap = engine.archive.snapshot(N_LISTENS);
  return {
    mode, geometry: `${geom.nx}x${geom.ny}`, cells_total: total, taste_seed: '0x' + tasteSeed.toString(16),
    fill_at: fillAt, stabilise_at: stabiliseAt,
    final_coverage: +(finalSnap.cells_occupied / total).toFixed(4),
    final_occupied: finalSnap.cells_occupied,
    final_qd: +((mode === 'adaptive' ? finalSnap.qd_score_sum_elite_fitness : finalSnap.qd_score_sum_mean_fitness)).toFixed(2),
    relisten_tax: +(relistens / (relistens + breeds)).toFixed(4),
    relistens, breeds,
    mean_elite_samples: mode === 'adaptive' ? +(finalSnap.mean_elite_samples || 0).toFixed(2) : null,
    denoising_mae_seconds: denoise != null ? +denoise.toFixed(3) : null,
    servo_final_L: engine.servo.L,
    trajectory: traj,
  };
}

// shared config, filled in main
let CAL, SWITCH_RATES;

function meanOf(runs, sel) { const xs = runs.map(sel).filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

function summarise(runs) {
  return {
    fill_25_mean: meanOf(runs, (r) => r.fill_at[25]),
    fill_50_mean: meanOf(runs, (r) => r.fill_at[50]),
    fill_75_mean: meanOf(runs, (r) => r.fill_at[75]),
    stabilise_mean: meanOf(runs, (r) => r.stabilise_at),
    final_coverage_mean: meanOf(runs, (r) => r.final_coverage),
    final_occupied_mean: meanOf(runs, (r) => r.final_occupied),
    relisten_tax_mean: meanOf(runs, (r) => r.relisten_tax),
    mean_elite_samples_mean: meanOf(runs, (r) => r.mean_elite_samples),
    denoising_mae_mean: meanOf(runs, (r) => r.denoising_mae_seconds),
  };
}

function main() {
  const t0 = Date.now();
  CAL = loadJSON('axis-calibration.json', { axis_calibration: { dev: { min: 7.5, max: 304 }, harm: { min: 1.15e-3, max: 5.11e-2 } } }).axis_calibration;
  const jt = loadJSON('J_class_table.json', null);
  SWITCH_RATES = jt ? Object.fromEntries(Object.entries(jt.J_class_table).map(([k, v]) => [k, v.p_class])) : null;

  const sweep = loadJSON('gate2b-geomsweep.json', null);
  const G = parseGeom(sweep && sweep.chosen_G, { nx: 8, ny: 8 });
  console.log(`── THE RACE: deep@${G.nx}x${G.ny} (G, from Lane A) vs adaptive@16x16 — NO winner declared ──`);
  console.log(`  synthetic dwell: censored Gaussian, σ=0.35·range; ${SEEDS.length} taste seeds; ${N_LISTENS} listens each`);

  const deepRuns = [], adaptiveRuns = [], deepRefRuns = [];
  for (let si = 0; si < SEEDS.length; si++) {
    const ts = SEEDS[si];
    const es = 0x5EED0000 + si;
    console.log(`  seed ${si + 1}/${SEEDS.length} (taste 0x${ts.toString(16)})...`);
    deepRuns.push(runArch('deep', G, ts, es));
    adaptiveRuns.push(runArch('adaptive', { nx: 16, ny: 16 }, ts, es));
    // Reference: deep@16×16 (the geometry that failed 2b) — shows what G buys.
    deepRefRuns.push(runArch('deep', { nx: 16, ny: 16 }, ts, es));
    console.log(`    deep@G cov=${deepRuns[si].final_coverage} tax=0 | adaptive cov=${adaptiveRuns[si].final_coverage} tax=${adaptiveRuns[si].relisten_tax} eliteN=${adaptiveRuns[si].mean_elite_samples}`);
  }

  const payload = {
    race: 'deep-grid@G vs adaptive-sampling@16×16 (work order §4)',
    winner: 'NONE DECLARED — cost + structure only; archive-mode choice + boredom weighting are the owner\'s (V2-PROPOSALS fulcrum check)',
    synthetic_model: {
      description: 'censored Gaussian around a fixed arbitrary genome-smooth taste landscape; encodes NO claim about real sound (§2.3)',
      sigma_frac: 0.35, dwell_min: DWELL_MIN, render_len_s: RENDER_LEN, n_listens: N_LISTENS, seeds: SEEDS.map((s) => '0x' + s.toString(16)),
    },
    G: `${G.nx}x${G.ny}`,
    columns: {
      deep_at_G: { geometry: `${G.nx}x${G.ny}`, summary: summarise(deepRuns), runs: deepRuns },
      adaptive_at_16x16: { geometry: '16x16', summary: summarise(adaptiveRuns), runs: adaptiveRuns },
      deep_at_16x16_reference: { geometry: '16x16', note: 'the geometry that FAILED Gate 2b — reference only', summary: summarise(deepRefRuns), runs: deepRefRuns },
    },
    reading_guide: {
      comparable_across_geometries: ['coverage fraction', 'relisten_tax', 'denoising_mae_seconds', 'mean_cell_quality'],
      NOT_comparable_raw: ['qd (depends on cell count + fitness definition: deep=lineage F mean, adaptive=elite own-dwell mean)'],
      relisten_tax: 'deep is 0 by construction (implicit averaging, no re-hearing); adaptive spends this fraction re-measuring — the price of assuming no locality',
      boredom_confound: 'NOT modelled here: the synthetic listener has no familiarity fatigue. A real re-listen carries it; kin-averaging does not. Owner weights this (fulcrum check).',
    },
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('race.json', payload);
  console.log('  deep@G   summary:', JSON.stringify(payload.columns.deep_at_G.summary));
  console.log('  adaptive summary:', JSON.stringify(payload.columns.adaptive_at_16x16.summary));
  console.log('  → NO winner declared (owner\'s choice). artefact:', path, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

main();
