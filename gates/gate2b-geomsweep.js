// gate2b-geomsweep.js — LANE A: Gate 2b across archive GEOMETRIES (work order §2).
//
// The v2.1 run showed Gate 2b FAILING at 16×16 under the fixed harm instrument +
// F10 priors (p_same 0.192 ≥0.35, p_near 0.479 ≥0.70). §13.3's first sanctioned
// response to a 2b failure is a COARSER GRID — a pure archive-geometry change that
// narrows nothing and adds no quality metric: a parent's neighbourhood simply
// absorbs the now-larger offspring descriptor spread. This harness makes the grid
// geometry a PARAMETER and re-runs the decision gate across
//   {16×16, 16×8, 12×12, 12×8, 10×10, 8×8}
// with the thresholds UNCHANGED (p_same ≥ 0.35 AND p_near ≥ 0.70, mutation-only).
// G = the FINEST geometry (most cells) that passes WITH MARGIN.
//
// Efficiency + honesty: the archive geometry changes only where the BIN EDGES fall,
// never the underlying descriptor VALUES or the parent's sound. So every parent and
// offspring is rendered and analysed EXACTLY ONCE, and each geometry is a pure
// re-binning of the same stored (dev, harm, meanVec) points. The p_same/p_near
// differences across geometries are therefore attributable to grid resolution alone
// — the cleanest possible read of §13.3's "coarser grid" lever. This is an
// INSTRUMENT (§2.2): it measures locality, it makes no claim about what will score.
//
// Run: node gates/gate2b-geomsweep.js   (after gate2a writes J_class_table.json)

import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { medianDistance } from '../src/distance.js';
import { breed } from '../src/variation.js';
import {
  analyze, loadSwitchRates, calibrateAxis, N_PARENTS, N_OFFSPRING,
  P_SAME_THRESH, P_NEAR_THRESH,
} from './gate2b-behavioural.js';
import { binLog, HARM_AXIS_MIN_FLOOR } from '../src/descriptors.js';
import { vecDist } from '../src/mfcc.js';
import { writeArtefact, percentile } from './_util.js';

// Finest → coarsest by cell count (256, 144, 128, 100, 96, 64).
const GEOMS = [
  { nx: 16, ny: 16 }, { nx: 12, ny: 12 }, { nx: 16, ny: 8 },
  { nx: 10, ny: 10 }, { nx: 12, ny: 8 }, { nx: 8, ny: 8 },
];
const MARGIN = 0.02; // "with margin" = both thresholds cleared by ≥ this

function neighbours8(x, y, nx, ny) {
  const out = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx === 0 && dy === 0) continue;
    const ax = x + dx, ay = y + dy;
    if (ax >= 0 && ax < nx && ay >= 0 && ay < ny) out.add(ax + ',' + ay);
  }
  return out;
}

// Given stored parent/offspring descriptor points and a geometry, compute the
// locality metrics purely by re-binning. `points` = array of
//   { p:{dev,harm,vec}, kids:[{dev,harm,vec}, ...] }  (kids already analysed).
function scoreGeometry(points, cal, geom) {
  const { nx, ny } = geom;
  let same = 0, near = 0, total = 0;
  const byCell = new Map();
  const add = (x, y, v) => { const k = x + ',' + y; if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(v); };
  for (const pt of points) {
    if (!pt.p) continue;
    const px = binLog(pt.p.dev, cal.dev.min, cal.dev.max, nx);
    const py = binLog(pt.p.harm, cal.harm.min, cal.harm.max, ny);
    add(px, py, pt.p.vec);
    const nbrs = neighbours8(px, py, nx, ny);
    for (const k of pt.kids) {
      if (!k) continue;
      const cx = binLog(k.dev, cal.dev.min, cal.dev.max, nx);
      const cy = binLog(k.harm, cal.harm.min, cal.harm.max, ny);
      const isSame = cx === px && cy === py;
      if (isSame) same++;
      if (isSame || nbrs.has(cx + ',' + cy)) near++;
      total++;
      add(cx, cy, k.vec);
    }
  }
  // H_cell: mean within-cell MFCC distance / U (median unrelated-pair distance).
  const allVecs = [];
  for (const [, m] of byCell) for (const v of m) allVecs.push(v);
  const un = [];
  const urng = new RNG(0x4843 ^ (nx * 31 + ny)); // deterministic per geometry
  for (let i = 0; i < 400 && allVecs.length > 1; i++) {
    let a = urng.int(allVecs.length), b = urng.int(allVecs.length);
    if (a === b) b = (b + 1) % allVecs.length;
    un.push(vecDist(allVecs[a], allVecs[b]));
  }
  const U = un.length ? percentile(un.sort((a, b) => a - b), 50) : 1;
  let hsum = 0, hn = 0;
  for (const [, m] of byCell) {
    if (m.length < 2) continue;
    let ps = 0, pc = 0;
    for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) { ps += vecDist(m[a], m[b]); pc++; }
    if (pc > 0) { hsum += ps / pc; hn++; }
  }
  const H_cell = U > 0 ? (hn ? hsum / hn : 0) / U : 0;
  const p_same = total ? same / total : 0;
  const p_near = total ? near / total : 0;
  return { p_same, p_near, H_cell, total, cells_occupied: byCell.size, cells_with_2plus: hn, U };
}

function main() {
  const t0 = Date.now();
  console.log('── LANE A: Gate 2b geometry sweep (16×16 → 8×8) — the decision gate ──');
  const switchRates = loadSwitchRates();

  // Parents from the F10 priors (before the archive exists, §13.3).
  const genRng = new RNG(0x2B60);
  const parents = [];
  for (let i = 0; i < N_PARENTS; i++) parents.push(randomGenome(genRng));
  const parentAnalyses = parents.map(analyze);
  const nOk = parentAnalyses.filter(Boolean).length;
  console.log(`  parents analysed: ${nOk}/${N_PARENTS}`);

  // Render each parent's mutation-only AND crossover offspring ONCE; store points.
  // Mutation-only is the decision run; crossover is reported informationally.
  const breedRng = new RNG(0x2B61);
  const dMed = medianDistance(parents, breedRng, 300);
  const mutPoints = [];
  const crossPoints = [];
  const devVals = [], harmVals = []; // calibration pool: parents + mutation offspring
  let rendered = 0;
  for (let i = 0; i < parents.length; i++) {
    const pa = parentAnalyses[i];
    const pPoint = pa ? { dev: pa.dev, harm: pa.harm, vec: pa.meanVec } : null;
    if (pa) { devVals.push(pa.dev); harmVals.push(pa.harm); }
    const mutKids = [], crossKids = [];
    for (let j = 0; j < N_OFFSPRING; j++) {
      const mc = breed(parents[i], breedRng, { crossoverRate: 0, switchRates }).child;
      const ma = analyze(mc); rendered++;
      if (ma) { mutKids.push({ dev: ma.dev, harm: ma.harm, vec: ma.meanVec }); devVals.push(ma.dev); harmVals.push(ma.harm); }
      else mutKids.push(null);
      const cc = breed(parents[i], breedRng, { crossoverRate: 0.5, switchRates, partnerCandidates: parents, dMed }).child;
      const ca = analyze(cc); rendered++;
      crossKids.push(ca ? { dev: ca.dev, harm: ca.harm, vec: ca.meanVec } : null);
    }
    mutPoints.push({ p: pPoint, kids: mutKids });
    crossPoints.push({ p: pPoint, kids: crossKids });
    if ((i + 1) % 40 === 0) console.log(`  bred ${i + 1}/${parents.length} parents (${rendered} offspring rendered, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  // One geometry-independent calibration over parents + mutation offspring (the
  // distribution the archive will actually hold). [p2, p98], harm floored.
  const cal = { dev: calibrateAxis(devVals), harm: calibrateAxis(harmVals, { floorMin: HARM_AXIS_MIN_FLOOR }) };
  console.log('  axis calibration (fixed across geometries): dev', fmt(cal.dev), 'harm', fmt(cal.harm));

  const table = [];
  for (const geom of GEOMS) {
    const m = scoreGeometry(mutPoints, cal, geom);
    const c = scoreGeometry(crossPoints, cal, geom);
    const passSame = m.p_same >= P_SAME_THRESH;
    const passNear = m.p_near >= P_NEAR_THRESH;
    const pass = passSame && passNear;
    const passMargin = m.p_same >= P_SAME_THRESH + MARGIN && m.p_near >= P_NEAR_THRESH + MARGIN;
    const cells = geom.nx * geom.ny;
    table.push({
      geometry: `${geom.nx}x${geom.ny}`, nx: geom.nx, ny: geom.ny, cells,
      mutation_only: { p_same: m.p_same, p_near: m.p_near, H_cell: m.H_cell, cells_occupied: m.cells_occupied, n: m.total },
      with_crossover: { p_same: c.p_same, p_near: c.p_near, H_cell: c.H_cell, n: c.total },
      pass, pass_with_margin: passMargin,
    });
    console.log(`  ${geom.nx}x${geom.ny} (${cells} cells): p_same=${m.p_same.toFixed(3)} p_near=${m.p_near.toFixed(3)} ` +
      `H_cell=${m.H_cell.toFixed(3)} → ${pass ? (passMargin ? 'PASS+margin' : 'PASS(bare)') : 'FAIL'}`);
  }

  // G = finest (most cells) passing WITH MARGIN; fall back to finest bare pass; else none.
  const byCellsDesc = [...table].sort((a, b) => b.cells - a.cells);
  const marginPasses = byCellsDesc.filter((t) => t.pass_with_margin);
  const barePasses = byCellsDesc.filter((t) => t.pass);
  let chosen = null, basis;
  if (marginPasses.length) { chosen = marginPasses[0]; basis = 'finest geometry passing with margin ≥0.02 on both thresholds'; }
  else if (barePasses.length) { chosen = barePasses[0]; basis = 'finest bare pass (no geometry cleared with margin)'; }
  else { chosen = null; basis = 'NO GEOMETRY PASSED — see report; owner decision required'; }

  const payload = {
    lane: 'A (archive geometry sweep, work order §2)',
    gate: '2b behavioural locality (§13.3)',
    threshold: `p_same ≥ ${P_SAME_THRESH} AND p_near ≥ ${P_NEAR_THRESH} (mutation-only); G = finest passing with margin ≥${MARGIN}`,
    calibration_basis: 'geometry-independent [p2,p98] over parents + mutation-only offspring descriptors; harm min floored at HARM_AXIS_MIN_FLOOR',
    axis_calibration: cal,
    parents_analysed: nOk,
    config: { sample_rate: 22050, length_s: 4, n_parents: N_PARENTS, n_offspring: N_OFFSPRING, seed_parents: '0x2B60', seed_breed: '0x2B61' },
    table,
    chosen_G: chosen ? chosen.geometry : null,
    chosen_G_detail: chosen,
    basis,
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('gate2b-geomsweep.json', payload);
  console.log(`  → G = ${chosen ? chosen.geometry : 'NONE'} (${basis})`);
  console.log('  artefact:', path, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

function fmt(r) { return `[${r.min.toExponential(2)}, ${r.max.toExponential(2)}]`; }
main();
