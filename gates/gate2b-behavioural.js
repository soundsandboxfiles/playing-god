// gate2b-behavioural.js — Gate 2b, behavioural locality (§13.3).
//
// AUTONOMOUS, fully (BUILD-ORDER). THIS IS THE DECISION POINT FOR EVERYTHING
// DOWNSTREAM (BUILD-ORDER, §7.2): the deep-cell archive depends on offspring
// landing in or near their parent's cell. If they scatter, random eviction is
// noise rather than re-questioning a lineage, and the archive design itself may
// have to change (coarser grid / different descriptors / adaptive sampling,
// §13.3). Building the archive before 2b passes risks throwing it away.
//
// PASS THRESHOLD (§13.3): p_same ≥ 0.35 AND p_near ≥ 0.70 on the MUTATION-ONLY
// run. H_cell is a diagnostic that says which fix applies if it fails.
//
// It is an INSTRUMENT (§2.2): it measures whether variation is local. It makes no
// claim about what will score. It also CALIBRATES the archive axis ranges from
// the observed descriptor distribution (BUILD-ORDER), writing them for Stage 3.
//
// Run: node gates/gate2b-behavioural.js   (run gate2a first — it produces the
//      J_class table this gate uses for switch flip rates.)

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { renderNormalized } from '../src/render.js';
import { mfccSequence, meanVector, vecDist } from '../src/mfcc.js';
import { developmentFromFrames, harmonicityRaw, binLog, HARM_AXIS_MIN_FLOOR } from '../src/descriptors.js';
import { breed } from '../src/variation.js';
import { medianDistance } from '../src/distance.js';
import { writeArtefact, percentile, ARTEFACT_DIR } from './_util.js';

export const SR = 22050;
export const LEN = 4;       // descriptor render length (consistent with Gate 2a)
export const N_PARENTS = 200; // §13.3: "Take 200 genomes"
export const N_OFFSPRING = 20; // §13.3: "generate 20 offspring"
const N_BINS = 16;
export const P_SAME_THRESH = 0.35; // §13.3
export const P_NEAR_THRESH = 0.70; // §13.3

// Render → normalise → analyse. Returns { dev, harm, meanVec } computing MFCC once.
export function analyze(g) {
  // v2: trimmed + normalised render path (F4/P4), matching the app's cell
  // assignment (loop.js computes descriptors on the trimmed buffer).
  const r = renderNormalized(g, { sampleRate: SR, lengthS: LEN });
  if (r.renderError) return null;
  const frames = mfccSequence(r.samples, SR);
  return {
    dev: developmentFromFrames(frames),
    harm: harmonicityRaw(r.samples, SR),
    meanVec: meanVector(frames, 13),
  };
}

// Load the J_class table from Gate 2a to set switch flip rates (§13.2, §3.3).
export function loadSwitchRates() {
  const p = join(ARTEFACT_DIR, 'J_class_table.json');
  if (!existsSync(p)) {
    console.log('  (warning: J_class_table.json not found — using base rate 0.004 for all switches)');
    return null;
  }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const rates = {};
  for (const [name, v] of Object.entries(j.J_class_table)) rates[name] = v.p_class;
  return rates;
}

// Calibrate an axis range from observed values: [p2, p98], clamped to >0 for the
// log scale (BUILD-ORDER: "Archive axis ranges need calibrating against observed
// distributions"). Reported so a human can see them.
//
// v2.1 (V2-REPORT §5): opts.floorMin raises the axis min to a belt-and-braces
// floor. The primary harm-axis fix is in the estimator (descriptors.harmonicityRaw
// relative noise floor); this floor is the second line of defence — even if a
// residual near-pure tone reads slightly above estimator noise, flooring harm.min
// at HARM_AXIS_MIN_FLOOR keeps it clamping cleanly into the tonal edge bin instead
// of anchoring the log scale on estimator noise. It only raises the min (never
// lowers it) so it cannot narrow a well-spread axis; it changes nothing about what
// can exist or what is heard (§2.2) — pure instrument legibility.
export function calibrateAxis(values, opts = {}) {
  const arr = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (arr.length < 2) return { min: opts.floorMin || 1e-6, max: 1 };
  let min = percentile(arr, 2), max = percentile(arr, 98);
  if (!(min > 0)) min = arr.find((v) => v > 0) || 1e-6;
  if (opts.floorMin != null && min < opts.floorMin) min = opts.floorMin; // belt-and-braces
  if (max <= min) max = min * 10;
  return { min, max };
}

function neighbours8(x, y) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < N_BINS && ny >= 0 && ny < N_BINS) out.push(nx + ',' + ny);
  }
  return out;
}

export function runPass(parents, parentAnalyses, rng, opts, cal) {
  // For each parent, breed N_OFFSPRING, analyse, and check cell locality.
  let same = 0, near = 0, total = 0;
  const byCell = new Map(); // "x,y" → array of meanVec (for H_cell, mutation-only)
  const addToCell = (x, y, v) => { const k = x + ',' + y; if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(v); };

  for (let i = 0; i < parents.length; i++) {
    const pa = parentAnalyses[i];
    if (!pa) continue;
    const px = binLog(pa.dev, cal.dev.min, cal.dev.max);
    const py = binLog(pa.harm, cal.harm.min, cal.harm.max);
    if (opts.collectHcell) addToCell(px, py, pa.meanVec);
    const nbrs = new Set(neighbours8(px, py));
    for (let j = 0; j < N_OFFSPRING; j++) {
      const { child } = breed(parents[i], rng, opts.breedOpts);
      const ca = analyze(child);
      if (!ca) continue;
      const cx = binLog(ca.dev, cal.dev.min, cal.dev.max);
      const cy = binLog(ca.harm, cal.harm.min, cal.harm.max);
      const isSame = cx === px && cy === py;
      if (isSame) same++;
      if (isSame || nbrs.has(cx + ',' + cy)) near++;
      total++;
      if (opts.collectHcell) addToCell(cx, cy, ca.meanVec);
    }
  }
  return {
    p_same: total ? same / total : 0,
    p_near: total ? near / total : 0,
    total,
    byCell: opts.collectHcell ? byCell : null,
  };
}

// H_cell (§13.3): mean within-cell MFCC distance as a fraction of U. Uses the
// per-render mean MFCC vector as the timbre point; U is the median pairwise
// distance of those vectors between unrelated genomes.
export function computeHcell(byCell, allVecs, rng) {
  // U over unrelated pairs.
  const un = [];
  for (let i = 0; i < 400 && allVecs.length > 1; i++) {
    let a = rng.int(allVecs.length), b = rng.int(allVecs.length);
    if (a === b) b = (b + 1) % allVecs.length;
    un.push(vecDist(allVecs[a], allVecs[b]));
  }
  const U = un.length ? percentile(un.sort((a, b) => a - b), 50) : 1;
  let sum = 0, n = 0;
  for (const [, members] of byCell) {
    if (members.length < 2) continue;
    let ps = 0, pc = 0;
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) { ps += vecDist(members[a], members[b]); pc++; }
    if (pc > 0) { sum += ps / pc; n++; }
  }
  const meanWithin = n ? sum / n : 0;
  return { H_cell: U > 0 ? meanWithin / U : 0, U_vec: U, cells_with_2plus: n };
}

function main() {
  const rng = new RNG(0x2B00);
  const t0 = Date.now();
  console.log('── Gate 2b (behavioural locality) — the decision point ──');
  const switchRates = loadSwitchRates();

  // Parents from priors (before the archive exists, §13.3).
  const parents = [];
  for (let i = 0; i < N_PARENTS; i++) parents.push(randomGenome(rng));
  const parentAnalyses = parents.map(analyze);
  console.log(`  parents analysed: ${parentAnalyses.filter(Boolean).length}/${N_PARENTS}`);

  // Calibrate axes from parents + a probe of offspring so ranges cover both.
  const devVals = [], harmVals = [];
  for (const pa of parentAnalyses) if (pa) { devVals.push(pa.dev); harmVals.push(pa.harm); }
  // Probe offspring descriptor spread with a small mutation-only sample.
  for (let i = 0; i < 40; i++) {
    const { child } = breed(parents[i], rng, { crossoverRate: 0, switchRates });
    const ca = analyze(child);
    if (ca) { devVals.push(ca.dev); harmVals.push(ca.harm); }
  }
  const cal = { dev: calibrateAxis(devVals), harm: calibrateAxis(harmVals, { floorMin: HARM_AXIS_MIN_FLOOR }) };
  console.log('  axis calibration: dev', fmtRange(cal.dev), 'harm', fmtRange(cal.harm));

  // Pass 1 — mutation + duplication only (the graded run, §13.3).
  const mut = runPass(parents, parentAnalyses, rng,
    { breedOpts: { crossoverRate: 0, switchRates }, collectHcell: true }, cal);
  // Pass 2 — including crossover (partners from the prior pool; expected less local).
  const dMed = medianDistance(parents, rng, 300);
  const cross = runPass(parents, parentAnalyses, rng,
    { breedOpts: { crossoverRate: 0.5, switchRates, partnerCandidates: parents, dMed }, collectHcell: false }, cal);

  // H_cell from the mutation-only run.
  const allVecs = [];
  for (const [, m] of mut.byCell) for (const v of m) allVecs.push(v);
  const hc = computeHcell(mut.byCell, allVecs, rng);

  const pass = mut.p_same >= P_SAME_THRESH && mut.p_near >= P_NEAR_THRESH;

  const payload = {
    gate: '2b (behavioural locality, §13.3)',
    threshold: `p_same ≥ ${P_SAME_THRESH} AND p_near ≥ ${P_NEAR_THRESH} (mutation-only)`,
    pass,
    mutation_only: { p_same: mut.p_same, p_near: mut.p_near, n: mut.total },
    with_crossover: { p_same: cross.p_same, p_near: cross.p_near, n: cross.total },
    H_cell: hc.H_cell, H_cell_detail: hc,
    axis_calibration: cal,
    switch_rates_used: switchRates ? 'from Gate 2a J_class_table' : 'base 0.004 (2a table missing)',
    config: { sample_rate: SR, length_s: LEN, n_parents: N_PARENTS, n_offspring: N_OFFSPRING, seed: '0x2B00' },
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('gate2b-behavioural.json', payload);
  // Axis calibration standalone — Stage 3 reads this to map descriptors → cells.
  writeArtefact('axis-calibration.json', { gate: '2b', axis_calibration: cal, length_s: LEN, sample_rate: SR, note: 'Calibrated at 4 s render for the gate; the app at L=60 s should recalibrate from live descriptor data (BUILD-ORDER).' });

  console.log('  mutation-only: p_same=' + mut.p_same.toFixed(3) + ' (≥' + P_SAME_THRESH + ') p_near=' + mut.p_near.toFixed(3) + ' (≥' + P_NEAR_THRESH + ')');
  console.log('  with-crossover: p_same=' + cross.p_same.toFixed(3) + ' p_near=' + cross.p_near.toFixed(3));
  console.log('  H_cell=' + hc.H_cell.toFixed(3) + ' (fraction of U; ' + hc.cells_with_2plus + ' cells with ≥2)');
  console.log('  PASS:', pass);
  console.log('  artefact:', path);
  // Exit code communicates the branch to the runner.
  process.exit(pass ? 0 : 2);
}

function fmtRange(r) { return `[${r.min.toExponential(2)}, ${r.max.toExponential(2)}]`; }
if (import.meta.url === `file://${process.argv[1]}`) main();
