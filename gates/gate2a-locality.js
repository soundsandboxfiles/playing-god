// gate2a-locality.js — Gate 2a, genotypic locality (§13.2).
//
// AUTONOMOUS, fully (BUILD-ORDER). Locality — genotypic neighbours map to
// phenotypic neighbours — is "the precondition for evolution working at all"
// (§13.2). This gate measures it and produces the J_class table that SETS the
// switch flip rates for Stage 3 (§13.2, §3.3).
//
// It is an INSTRUMENT (§2.2): it measures how the encoding moves under mutation.
// It makes no claim about what will score. A class that fails the criterion is a
// fact about the representation, to be fixed by re-encoding — NOT by forbidding
// that class of mutation (which would narrow the space, §2.1).
//
// CRITERION (§13.2): at ε = 0.01, the 90th-percentile perceptual distance over
// continuous-gene mutants must be below 0.20·U, where U is the median perceptual
// distance between unrelated random genomes.
//
// Run: node gates/gate2a-locality.js

import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { renderNormalized } from '../src/render.js';
import { mfccSequence, sequenceDistance } from '../src/mfcc.js';
import { distance } from '../src/distance.js';
import { P_SWITCH_FLIP_BASE } from '../src/variation.js';
import {
  WAVE_SLOTS, GENES_PER_WAVE, WAVE_SCHEMA, WAVE_INDEX, GLOBAL_SCHEMA, GLOBAL_INDEX,
  SWITCH_NAMES, reflect01, mapValue, inverseMap,
} from '../src/genome.js';
import { writeArtefact, percentile } from './_util.js';

const SR = 22050;          // descriptor rate (§12)
const LEN = 4;             // §13.2: "Render 4 s of SAMPLES"
const EPSILONS = [0.001, 0.01, 0.1, 0.5]; // Appendix LOCALITY_EPSILONS
const N_PARENTS = 100;     // §13.2: "Draw 100 genomes"
const N_MUTANTS = 20;      // §13.2: "20 mutants at each ε"
const CRIT_EPS = 0.01;     // §13.2 criterion epsilon
const CRIT_FRACTION = 0.20; // §13.2: p90 < 0.20·U

// Continuous gene CLASSES for the per-class breakdown (§13.2 "Repeat per gene
// class to locate any class that fails"). Grouped by musical role.
const CONT_CLASSES = {
  shape: ['shape_sine', 'shape_triangle', 'shape_saw', 'shape_square'],
  timing: ['period', 'duty', 'pre_prop', 'phase'], // v2 timing genes (P3)
  gain: ['gain_out', 'gain_mod'],
  amp_env_level: nodeGenes('amp', 'level'),
  amp_env_shape: [...nodeGenes('amp', 'time'), ...nodeGenes('amp', 'curve'), ...nodeGenes('amp', 'tension')],
  pitch: ['pitch_master'],
  pitch_env: [...nodeGenes('pitch', 'level'), ...nodeGenes('pitch', 'time'), ...nodeGenes('pitch', 'curve'), ...nodeGenes('pitch', 'tension')],
  mod_depth: ['pm_depth', 'am_depth'],
  meta: ['sigma_wave', 'p_mutate_wave', 'p_ratio_jump_wave'], // v2 adds p_ratio_jump_wave (P1)
};
function nodeGenes(kind, field) {
  const out = [];
  for (let k = 0; k < 8; k++) out.push(`${kind}_node${k}_${field}`);
  return out;
}

// Render → normalise → MFCC frame sequence. This is the SAMPLES-tier perceptual
// representation used everywhere in the locality tests (§4.7: descriptors read
// the normalised buffer).
function mfccOf(g) {
  // v2: the trimmed + normalised render path (F4/P4), so locality is measured on
  // exactly what the app produces and the listener hears.
  const r = renderNormalized(g, { sampleRate: SR, lengthS: LEN });
  if (r.renderError) return null;
  return mfccSequence(r.samples, SR);
}

// Perturb ONLY the continuous genes named in `geneNames` (per-wave) and/or
// globals, by adding ε·N(0,1) in stored space with switches held fixed (§13.2:
// "all σ forced to ε and switches held fixed"). Returns a mutated clone.
function perturb(g, eps, rng, geneNames, includeGlobals) {
  const m = g.clone();
  if (geneNames) {
    const idxs = geneNames.map((n) => WAVE_INDEX[n]).filter((i) => i !== undefined);
    for (let w = 0; w < WAVE_SLOTS; w++) {
      const base = w * GENES_PER_WAVE;
      for (const ci of idxs) m.data[base + ci] = reflect01(m.data[base + ci] + eps * rng.gaussian());
    }
  }
  if (includeGlobals) {
    const GBASE = WAVE_SLOTS * GENES_PER_WAVE;
    GLOBAL_SCHEMA.forEach((d, gi) => {
      if (d.kind === 'cont') m.data[GBASE + gi] = reflect01(m.data[GBASE + gi] + eps * rng.gaussian());
    });
  }
  m.id = m.hash();
  return m;
}

// Perturb ALL continuous genes (per-wave + global) — the main criterion mutant.
function perturbAll(g, eps, rng) {
  const m = g.clone();
  WAVE_SCHEMA.forEach((d, ci) => {
    if (d.kind !== 'cont' && d.kind !== 'sigma') return;
    for (let w = 0; w < WAVE_SLOTS; w++) {
      const base = w * GENES_PER_WAVE;
      m.data[base + ci] = reflect01(m.data[base + ci] + eps * rng.gaussian());
    }
  });
  const GBASE = WAVE_SLOTS * GENES_PER_WAVE;
  GLOBAL_SCHEMA.forEach((d, gi) => {
    if (d.kind === 'cont' || d.kind === 'sigma') m.data[GBASE + gi] = reflect01(m.data[GBASE + gi] + eps * rng.gaussian());
  });
  m.id = m.hash();
  return m;
}

// Flip exactly one switch of a given class on a random ACTIVE wave (§13.2 switch
// J). Flipping on an inactive wave (which does not render) would measure zero for
// every class except `active`, understating the true structural effect — so we
// pick an active wave when one exists.
function flipSwitch(g, switchName, rng) {
  const m = g.clone();
  const active = [];
  for (let w = 0; w < WAVE_SLOTS; w++) if (g.getWave(w, 'active') >= 0.5) active.push(w);
  const w = active.length ? active[rng.int(active.length)] : rng.int(WAVE_SLOTS);
  const si = WAVE_INDEX[switchName];
  const base = w * GENES_PER_WAVE;
  m.data[base + si] = m.data[base + si] >= 0.5 ? 0 : 1;
  m.id = m.hash();
  return m;
}

function stats(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  return { median: percentile(s, 50), p90: percentile(s, 90), mean: s.reduce((a, b) => a + b, 0) / (s.length || 1), n: s.length };
}

function main() {
  const rng = new RNG(0x2A10);
  const t0 = Date.now();
  console.log('── Gate 2a (genotypic locality) ──');

  // Parents + their MFCC.
  const parents = [];
  const parentMfcc = [];
  for (let i = 0; i < N_PARENTS; i++) {
    const g = randomGenome(rng);
    const mf = mfccOf(g);
    if (!mf) continue;
    parents.push(g); parentMfcc.push(mf);
  }
  console.log(`  parents rendered: ${parents.length}`);

  // U = median perceptual distance between UNRELATED random genomes (§13.2).
  const unrelated = [];
  for (let i = 0; i < 300; i++) {
    let a = rng.int(parents.length), b = rng.int(parents.length);
    if (a === b) b = (b + 1) % parents.length;
    unrelated.push(sequenceDistance(parentMfcc[a], parentMfcc[b]));
  }
  const U = stats(unrelated).median;
  console.log(`  U (unrelated median perceptual distance): ${U.toFixed(3)}`);

  // Locality curve: median & p90 vs ε, over all-continuous mutants.
  const curve = [];
  for (const eps of EPSILONS) {
    const dists = [];
    for (let i = 0; i < parents.length; i++) {
      for (let j = 0; j < N_MUTANTS; j++) {
        const mf = mfccOf(perturbAll(parents[i], eps, rng));
        if (mf) dists.push(sequenceDistance(parentMfcc[i], mf));
      }
    }
    const st = stats(dists);
    curve.push({ eps, median: st.median, p90: st.p90, median_over_U: st.median / U, p90_over_U: st.p90 / U, n: st.n });
    console.log(`  ε=${eps}: median=${st.median.toFixed(3)} p90=${st.p90.toFixed(3)} p90/U=${(st.p90 / U).toFixed(3)}`);
  }
  const critPoint = curve.find((c) => c.eps === CRIT_EPS);
  const continuousPass = critPoint.p90_over_U < CRIT_FRACTION;

  // Per-class breakdown at ε=0.01 (diagnostic — locate a failing class).
  const perClass = {};
  const PC_PARENTS = Math.min(50, parents.length), PC_MUT = 10;
  for (const [cls, genes] of Object.entries(CONT_CLASSES)) {
    const dists = [];
    for (let i = 0; i < PC_PARENTS; i++) {
      for (let j = 0; j < PC_MUT; j++) {
        const mf = mfccOf(perturb(parents[i], CRIT_EPS, rng, genes, false));
        if (mf) dists.push(sequenceDistance(parentMfcc[i], mf));
      }
    }
    const st = stats(dists);
    perClass[cls] = { p90: st.p90, p90_over_U: st.p90 / U, pass: st.p90 / U < CRIT_FRACTION };
  }
  // Global-gene class separately.
  {
    const dists = [];
    for (let i = 0; i < PC_PARENTS; i++) for (let j = 0; j < PC_MUT; j++) {
      const mf = mfccOf(perturb(parents[i], CRIT_EPS, rng, null, true));
      if (mf) dists.push(sequenceDistance(parentMfcc[i], mf));
    }
    const st = stats(dists);
    perClass['global'] = { p90: st.p90, p90_over_U: st.p90 / U, pass: st.p90 / U < CRIT_FRACTION };
  }

  // Switch J_class table (§13.2). J = median perceptual distance of a single flip
  // as a fraction of U; p_class = 0.004·min(1, 0.25/J).
  const jTable = {};
  const SW_PARENTS = Math.min(60, parents.length);
  let sumFactor = 0; // Σ_classes min(1, 0.25/J), for the recalibration below
  for (const name of SWITCH_NAMES) {
    const dists = [];
    for (let i = 0; i < SW_PARENTS; i++) {
      const mf = mfccOf(flipSwitch(parents[i], name, rng));
      if (mf) dists.push(sequenceDistance(parentMfcc[i], mf));
    }
    const st = stats(dists);
    const J = st.median / U;
    const factor = Math.min(1, 0.25 / Math.max(1e-6, J));
    // p_class uses the CURRENT base (imported from variation.js) — the shipped
    // effective per-class rate that loop.js / gate2b / gate3 read from this table.
    const p_class = P_SWITCH_FLIP_BASE * factor;
    jTable[name] = { J_median_over_U: J, p_class, factor, n: st.n };
    sumFactor += factor;
  }
  // Recalibration readout (V2-PROPOSALS, OVERNIGHT §8). Expected flips per
  // reproduction at p_switch_flip_scale=1 is 64 · base · Σ min(1,0.25/J) over the
  // 12 switch classes (64 switches per class). The base that hits §13.2's ~1.0 is
  // 1 / (64 · sumFactor), independent of the base used to measure J.
  const N_WAVES = 64;
  const expectedFlipsAtCurrentBase = N_WAVES * P_SWITCH_FLIP_BASE * sumFactor;
  const recommendedBaseForOneFlip = 1 / (N_WAVES * sumFactor);
  const switchCalibration = {
    sum_factor_over_classes: sumFactor,
    current_base: P_SWITCH_FLIP_BASE,
    expected_flips_per_reproduction_at_current_base: expectedFlipsAtCurrentBase,
    recommended_base_for_1_flip: recommendedBaseForOneFlip,
    target_flips: 1.0,
    note: 'Set P_SWITCH_FLIP_BASE in src/variation.js to recommended_base_for_1_flip, then re-run 2a so this table ships with the matching p_class values. v1 base 0.004 gave ~3 flips (OVERNIGHT §8).',
  };

  // Compatibility-distance distribution (§6.5) — Gate 2a also confirms the worked
  // intuitions within a factor of two, since λ (§6.6) is calibrated against D_med.
  const dCheck = compatibilityIntuitions(parents, rng);

  const pass = continuousPass; // the stated Gate 2a criterion is the continuous one
  const payload = {
    gate: '2a (genotypic locality, §13.2)',
    criterion: `p90 perceptual distance at ε=${CRIT_EPS} below ${CRIT_FRACTION}·U`,
    U, continuous_pass: continuousPass, pass,
    locality_curve: curve,
    per_class_at_crit_eps: perClass,
    J_class_table: jTable,
    switch_flip_calibration: switchCalibration,
    compatibility_distance: dCheck,
    config: { sample_rate: SR, length_s: LEN, n_parents: parents.length, n_mutants: N_MUTANTS, epsilons: EPSILONS },
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('gate2a-locality.json', payload);
  // Also write the J_class table standalone — Stage 3 reads it to set flip rates.
  writeArtefact('J_class_table.json', { gate: '2a', U, J_class_table: jTable, note: 'Switch flip rates for Stage 3: p_class = 0.004·min(1, 0.25/J).' });

  console.log('  continuous criterion p90/U at ε=0.01:', critPoint.p90_over_U.toFixed(3), '<', CRIT_FRACTION, '→', continuousPass ? 'PASS' : 'FAIL');
  console.log('  J_class (median/U):');
  for (const [k, v] of Object.entries(jTable)) console.log(`    ${k}: J=${v.J_median_over_U.toFixed(3)} → p_class=${v.p_class.toExponential(2)}`);
  console.log('  switch-flip calibration (V2, OVERNIGHT §8):');
  console.log(`    current base=${switchCalibration.current_base} → expected flips/repro=${expectedFlipsAtCurrentBase.toFixed(3)}`);
  console.log(`    recommended base for ~1.0 flip = ${recommendedBaseForOneFlip.toExponential(3)}`);
  console.log('  D-distribution vs §6.5 intuitions:');
  for (const [k, v] of Object.entries(dCheck)) console.log(`    ${k}: measured=${v.measured.toFixed(4)} expected≈${v.expected} within2x=${v.within_2x}`);
  console.log('  PASS:', pass, '| artefact:', path);
}

// Measure the §6.5 worked intuitions on real genomes.
function compatibilityIntuitions(parents, rng) {
  // unrelated elites
  const unrel = [];
  for (let i = 0; i < 300; i++) { let a = rng.int(parents.length), b = rng.int(parents.length); if (a === b) b = (b + 1) % parents.length; unrel.push(distance(parents[a], parents[b])); }
  // parent-child mutation-only (no switch flip): perturb continuous only at small ε
  const pcNoFlip = [], pcFlip = [], sibs = [];
  for (let i = 0; i < 60; i++) {
    const p = parents[i % parents.length];
    // mutation-only child via the real pipeline but suppress switch flips by using
    // a tiny custom pass: clone + continuous perturb.
    const child = p.clone();
    for (let w = 0; w < WAVE_SLOTS; w++) {
      const base = w * GENES_PER_WAVE;
      WAVE_SCHEMA.forEach((d, ci) => { if (d.kind === 'cont') child.data[base + ci] = reflect01(child.data[base + ci] + 0.01 * rng.gaussian()); });
    }
    child.id = child.hash();
    pcNoFlip.push(distance(p, child));
    // child where a flip hit `active`
    const child2 = child.clone();
    const w2 = rng.int(WAVE_SLOTS);
    const ai = WAVE_INDEX['active'];
    child2.data[w2 * GENES_PER_WAVE + ai] = child2.data[w2 * GENES_PER_WAVE + ai] >= 0.5 ? 0 : 1;
    pcFlip.push(distance(p, child2));
    // siblings: two independent small perturbations of p
    const s1 = child, s2 = p.clone();
    for (let w = 0; w < WAVE_SLOTS; w++) { const base = w * GENES_PER_WAVE; WAVE_SCHEMA.forEach((d, ci) => { if (d.kind === 'cont') s2.data[base + ci] = reflect01(s2.data[base + ci] + 0.01 * rng.gaussian()); }); }
    sibs.push(distance(s1, s2));
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const mk = (measured, expected) => ({ measured, expected, within_2x: measured >= expected / 2 && measured <= expected * 2 });
  return {
    parent_child_no_flip: mk(med(pcNoFlip), 0.005),
    parent_child_active_flip: mk(med(pcFlip), 0.105),
    siblings: mk(med(sibs), 0.1),
    unrelated_elites: mk(med(unrel), 0.55),
  };
}

main();
