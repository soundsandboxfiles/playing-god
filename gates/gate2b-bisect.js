// gate2b-bisect.js — isolate WHICH v2.1 change dropped Gate 2b below threshold.
//
// Gate 2b (the decision gate) FAILED under {instrument fix + F10 priors}: p_same
// 0.192, p_near 0.479 (thresholds 0.35 / 0.70). Two changes landed since the passing
// v2 run. Per the work order, when 2b fails we BISECT and REPORT which change broke
// it — we do NOT loosen the threshold. This harness runs the same mutation-only
// locality measure across the 2×2 of:
//   activation ∈ { per-slot (v2 default, pActive=0.03) , F10 (n_active uniform 1..10) }
//   harm estimator ∈ { v2 (fixed eps 1e-10, silent-frame=1) , v2.1 (relative floor +
//                      exclude silent + calibrated harm.min floor) }
// The dev axis and everything else are identical across cells, so the difference
// between cells is attributable to the one change that varies.
//
// Reduced N for tractability (F10 renders are ~3× heavier); the direction is what
// matters, and it is stark. Mutation-only (the decision is mutation-only, §13.3).
//
// Run: node gates/gate2b-bisect.js

import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { renderNormalized } from '../src/render.js';
import { mfccSequence, meanVector, vecDist, fft } from '../src/mfcc.js';
import { developmentFromFrames, binLog, HARM_AXIS_MIN_FLOOR, harmonicityRaw as harmNew } from '../src/descriptors.js';
import { breed } from '../src/variation.js';
import { loadSwitchRates, calibrateAxis } from './gate2b-behavioural.js';
import { writeArtefact, percentile } from './_util.js';

const SR = 22050, LEN = 4, N_BINS = 16;
const N_PARENTS = 150, N_OFFSPRING = 20;

// The v2 (OLD) harmonicity estimator, reproduced verbatim so the bisect can measure
// the archive under it. Fixed absolute eps per bin; a silent frame reads flatness 1.
function harmOld(samples) {
  const win = 1024, hop = 512;
  const hann = new Float64Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
  const re = new Float64Array(win), im = new Float64Array(win);
  let flatnessSum = 0, nFrames = 0;
  for (let start = 0; start + win <= samples.length; start += hop) {
    for (let i = 0; i < win; i++) { re[i] = samples[start + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const nBins = win / 2 + 1;
    let logSum = 0, arithSum = 0;
    const eps = 1e-10;
    for (let k = 1; k < nBins; k++) { const p = re[k] * re[k] + im[k] * im[k] + eps; logSum += Math.log(p); arithSum += p; }
    const nUsed = nBins - 1;
    const geo = Math.exp(logSum / nUsed), arith = arithSum / nUsed;
    flatnessSum += arith > 0 ? geo / arith : 0; nFrames++;
  }
  return nFrames > 0 ? flatnessSum / nFrames : 0;
}

function analyzeWith(g, harmFn) {
  const r = renderNormalized(g, { sampleRate: SR, lengthS: LEN });
  if (r.renderError) return null;
  const frames = mfccSequence(r.samples, SR);
  return { dev: developmentFromFrames(frames), harm: harmFn(r.samples), meanVec: meanVector(frames, 13) };
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

function runCell(label, activation, harmFn, harmFloor, switchRates) {
  const rng = new RNG(0x2B01);
  const parents = [];
  for (let i = 0; i < N_PARENTS; i++) parents.push(activation === 'f10' ? randomGenome(rng) : randomGenome(rng, { pActive: 0.03 }));
  const pa = parents.map((g) => analyzeWith(g, harmFn));
  // Calibrate from parents + a small mutation-only probe (as the real gate does).
  const devVals = [], harmVals = [];
  for (const a of pa) if (a) { devVals.push(a.dev); harmVals.push(a.harm); }
  for (let i = 0; i < 40; i++) { const { child } = breed(parents[i], rng, { crossoverRate: 0, switchRates }); const a = analyzeWith(child, harmFn); if (a) { devVals.push(a.dev); harmVals.push(a.harm); } }
  const cal = { dev: calibrateAxis(devVals), harm: calibrateAxis(harmVals, harmFloor ? { floorMin: HARM_AXIS_MIN_FLOOR } : {}) };

  let same = 0, near = 0, total = 0;
  const byCell = new Map();
  const add = (x, y, v) => { const k = x + ',' + y; if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(v); };
  for (let i = 0; i < parents.length; i++) {
    const a = pa[i]; if (!a) continue;
    const px = binLog(a.dev, cal.dev.min, cal.dev.max), py = binLog(a.harm, cal.harm.min, cal.harm.max);
    add(px, py, a.meanVec);
    const nbrs = new Set(neighbours8(px, py));
    for (let j = 0; j < N_OFFSPRING; j++) {
      const { child } = breed(parents[i], rng, { crossoverRate: 0, switchRates });
      const ca = analyzeWith(child, harmFn); if (!ca) continue;
      const cx = binLog(ca.dev, cal.dev.min, cal.dev.max), cy = binLog(ca.harm, cal.harm.min, cal.harm.max);
      const isSame = cx === px && cy === py;
      if (isSame) same++;
      if (isSame || nbrs.has(cx + ',' + cy)) near++;
      total++; add(cx, cy, ca.meanVec);
    }
  }
  // H_cell.
  const allVecs = []; for (const [, m] of byCell) for (const v of m) allVecs.push(v);
  const un = [];
  for (let i = 0; i < 400 && allVecs.length > 1; i++) { let x = rng.int(allVecs.length), y = rng.int(allVecs.length); if (x === y) y = (y + 1) % allVecs.length; un.push(vecDist(allVecs[x], allVecs[y])); }
  const U = un.length ? percentile(un.sort((a, b) => a - b), 50) : 1;
  let sum = 0, n = 0;
  for (const [, m] of byCell) { if (m.length < 2) continue; let ps = 0, pc = 0; for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) { ps += vecDist(m[a], m[b]); pc++; } if (pc) { sum += ps / pc; n++; } }
  const H_cell = U > 0 ? (n ? sum / n : 0) / U : 0;
  const res = { label, activation, harm: harmFn === harmNew ? 'v2.1' : 'v2', p_same: same / total, p_near: near / total, H_cell, dev_axis: cal.dev, harm_axis: cal.harm, n: total };
  console.log(`  ${label.padEnd(28)} p_same=${res.p_same.toFixed(3)} p_near=${res.p_near.toFixed(3)} H_cell=${H_cell.toFixed(3)} | dev[${cal.dev.min.toExponential(2)},${cal.dev.max.toExponential(2)}] harm[${cal.harm.min.toExponential(2)},${cal.harm.max.toExponential(2)}]`);
  return res;
}

function main() {
  const t0 = Date.now();
  const switchRates = loadSwitchRates();
  console.log('── Gate 2b BISECT (mutation-only, N=' + N_PARENTS + '×' + N_OFFSPRING + ') ──');
  console.log('  thresholds: p_same ≥ 0.35 AND p_near ≥ 0.70 (NOT loosened — this only attributes)');
  const cells = [
    runCell('v2 baseline (perslot,oldharm)', 'perslot', harmOld, false, switchRates),
    runCell('instrument-fix alone', 'perslot', harmNew, true, switchRates),
    runCell('F10 alone', 'f10', harmOld, false, switchRates),
    runCell('both (= failing 2b config)', 'f10', harmNew, true, switchRates),
  ];
  writeArtefact('gate2b-bisect.json', {
    gate: 'Gate 2b bisect (attribution only — thresholds NOT loosened)',
    threshold: 'p_same ≥ 0.35 AND p_near ≥ 0.70 (mutation-only, §13.3)',
    note: '2×2 of {activation: perslot|F10} × {harm estimator: v2|v2.1}. dev axis and all else identical across cells.',
    config: { sample_rate: SR, length_s: LEN, n_parents: N_PARENTS, n_offspring: N_OFFSPRING },
    cells,
    elapsed_s: (Date.now() - t0) / 1000,
  });
  console.log('  artefact: output/gate-artefacts/gate2b-bisect.json');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
