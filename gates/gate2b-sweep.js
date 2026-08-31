// gate2b-sweep.js — Gate 2b across the p_ratio_jump sweep (work order §6).
//
// Gate 2b is THE decision gate for the archive (§13.3, BUILD-ORDER). v2 runs it on
// the final kernel and schema at p_ratio_jump init ∈ {0, 0.05, 0.15, 0.3}, reports
// the whole curve, and sets the shipped default to the LARGEST value that passes
// p_same ≥ 0.35 AND p_near ≥ 0.70 (mutation-only) WITH MARGIN. If only 0 passes,
// ship 0 (the preference still exists and evolution can raise it) and flag it loudly.
//
// p_ratio_jump does not change a PARENT's sound (it only biases MUTATION), so the
// parent set and the axis calibration are generated ONCE and reused across the
// sweep — the p_same/p_near differences are then purely the kernel's, on a fixed
// grid. This is an INSTRUMENT (§2.2): it measures locality, it makes no claim about
// what will score.
//
// Run: node gates/gate2b-sweep.js   (after gate2a writes J_class_table.json)

import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { medianDistance } from '../src/distance.js';
import {
  analyze, loadSwitchRates, calibrateAxis, runPass, computeHcell,
  N_PARENTS, P_SAME_THRESH, P_NEAR_THRESH,
} from './gate2b-behavioural.js';
import { breed } from '../src/variation.js';
import { WAVE_SLOTS, GENES_PER_WAVE, WAVE_INDEX, GLOBAL_INDEX, GLOBAL_SCHEMA, WAVE_SCHEMA, inverseMap } from '../src/genome.js';
import { writeArtefact } from './_util.js';

const SWEEP = [0, 0.05, 0.15, 0.3]; // work order §6
const P_RATIO_WAVE_I = WAVE_INDEX['p_ratio_jump_wave'];
const P_RATIO_SCALE_I = GLOBAL_INDEX['p_ratio_jump_scale'];
const GLOBAL_BASE = WAVE_SLOTS * GENES_PER_WAVE;

// Set every wave's p_ratio_jump_wave to `v` and the global scale to 1.0, so the
// effective ratio-jump probability is exactly `v`. Does not alter the parent's sound.
function setRatioJump(g, v) {
  const dW = WAVE_SCHEMA[P_RATIO_WAVE_I];
  for (let w = 0; w < WAVE_SLOTS; w++) g.data[w * GENES_PER_WAVE + P_RATIO_WAVE_I] = inverseMap(dW, v);
  g.data[GLOBAL_BASE + P_RATIO_SCALE_I] = inverseMap(GLOBAL_SCHEMA[P_RATIO_SCALE_I], 1.0);
}

function main() {
  const t0 = Date.now();
  console.log('── Gate 2b sweep (p_ratio_jump ∈ {0, 0.05, 0.15, 0.3}) — the decision gate ──');
  const switchRates = loadSwitchRates();

  // One parent set, analysed once (parent sound is independent of p_ratio_jump).
  const genRng = new RNG(0x2B57);
  const parents = [];
  for (let i = 0; i < N_PARENTS; i++) parents.push(randomGenome(genRng));
  const parentAnalyses = parents.map(analyze);
  console.log(`  parents analysed: ${parentAnalyses.filter(Boolean).length}/${N_PARENTS}`);

  // Fixed axis calibration (parents + a mid-value mutation-only probe), reused for
  // every sweep point so p_same/p_near are comparable on one grid.
  const devVals = [], harmVals = [];
  for (const pa of parentAnalyses) if (pa) { devVals.push(pa.dev); harmVals.push(pa.harm); }
  {
    const probeRng = new RNG(0x2B58);
    for (let i = 0; i < 40; i++) {
      const p = parents[i].clone(); setRatioJump(p, 0.15); p.id = p.hash();
      const { child } = breed(p, probeRng, { crossoverRate: 0, switchRates });
      const ca = analyze(child);
      if (ca) { devVals.push(ca.dev); harmVals.push(ca.harm); }
    }
  }
  const cal = { dev: calibrateAxis(devVals), harm: calibrateAxis(harmVals) };
  console.log('  axis calibration (fixed across sweep): dev', fmt(cal.dev), 'harm', fmt(cal.harm));

  const curve = [];
  for (const v of SWEEP) {
    // Apply the sweep value to the parents (mutation reads the gene; offspring inherit).
    for (const p of parents) { setRatioJump(p, v); p.id = p.hash(); }
    const rng = new RNG(0x2B00 + Math.round(v * 1000)); // reproducible per point
    const mut = runPass(parents, parentAnalyses, rng,
      { breedOpts: { crossoverRate: 0, switchRates }, collectHcell: true }, cal);
    const dMed = medianDistance(parents, rng, 300);
    const cross = runPass(parents, parentAnalyses, rng,
      { breedOpts: { crossoverRate: 0.5, switchRates, partnerCandidates: parents, dMed }, collectHcell: false }, cal);
    const allVecs = [];
    for (const [, m] of mut.byCell) for (const vv of m) allVecs.push(vv);
    const hc = computeHcell(mut.byCell, allVecs, rng);
    const pass = mut.p_same >= P_SAME_THRESH && mut.p_near >= P_NEAR_THRESH;
    curve.push({
      p_ratio_jump: v,
      mutation_only: { p_same: mut.p_same, p_near: mut.p_near, n: mut.total },
      with_crossover: { p_same: cross.p_same, p_near: cross.p_near, n: cross.total },
      H_cell: hc.H_cell,
      pass,
    });
    console.log(`  p_ratio_jump=${v}: p_same=${mut.p_same.toFixed(3)} (≥${P_SAME_THRESH}) ` +
      `p_near=${mut.p_near.toFixed(3)} (≥${P_NEAR_THRESH}) H_cell=${hc.H_cell.toFixed(3)} → ${pass ? 'PASS' : 'FAIL'}`);
  }

  // Default = largest passing value with margin (task §6). "With margin" = both
  // thresholds cleared by ≥0.02; if none clears with margin, the largest bare pass;
  // if none passes at all, 0 (flagged).
  const MARGIN = 0.02;
  const passesWithMargin = curve.filter((c) => c.mutation_only.p_same >= P_SAME_THRESH + MARGIN && c.mutation_only.p_near >= P_NEAR_THRESH + MARGIN);
  const barePasses = curve.filter((c) => c.pass);
  let chosen, basis;
  if (passesWithMargin.length) { chosen = Math.max(...passesWithMargin.map((c) => c.p_ratio_jump)); basis = 'largest passing with margin ≥0.02'; }
  else if (barePasses.length) { chosen = Math.max(...barePasses.map((c) => c.p_ratio_jump)); basis = 'largest bare pass (no value cleared with margin)'; }
  else { chosen = 0; basis = 'NO VALUE PASSED — shipping 0; the preference still exists and evolution can raise it (FLAGGED)'; }

  const onlyZeroPasses = barePasses.length === 1 && barePasses[0].p_ratio_jump === 0;

  const payload = {
    gate: '2b sweep (behavioural locality decision, work order §6)',
    threshold: `p_same ≥ ${P_SAME_THRESH} AND p_near ≥ ${P_NEAR_THRESH} (mutation-only), largest passing with margin`,
    axis_calibration: cal,
    curve,
    chosen_default_p_ratio_jump: chosen,
    basis,
    only_zero_passes: onlyZeroPasses,
    flag: chosen === 0 ? 'Shipping p_ratio_jump=0: ratio jumps are OFF at init. The preference EXISTS in the kernel and evolution can raise p_ratio_jump_wave/_scale. This is a LOUD FLAG (work order §6).' : null,
    action: `Set P_RATIO_JUMP_INIT in src/priors.js to ${chosen}.`,
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('gate2b-sweep.json', payload);
  console.log(`  → chosen default p_ratio_jump = ${chosen} (${basis})`);
  if (chosen === 0) console.log('  *** FLAG: only p_ratio_jump=0 passes; shipping 0. Evolution can still raise it. ***');
  console.log('  artefact:', path);
}

function fmt(r) { return `[${r.min.toExponential(2)}, ${r.max.toExponential(2)}]`; }
main();
