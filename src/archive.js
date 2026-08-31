// archive.js — Deep-Grid MAP-Elites (§7). The search's memory.
//
// 16×16 = 256 cells over two behaviour descriptors (§7.1), each cell holding up
// to D = 8 residents (§7.2, Flageat & Cully 2020). Deep cells solve the noisy-
// fitness bias WITHOUT spending listens: a cell's residents are near-replications
// of one another over time, so the cell's aggregate is a denoised estimate that
// cost nothing beyond the listens already spent generating (§7.2). This depends
// on behavioural locality, which Gate 2b tests before this module is ever built.
//
// The container is an INSTRUMENT (§2.2). Two rules keep it from smuggling a
// prediction about what wins:
//   • Eviction is UNIFORMLY RANDOM, ignoring fitness and age (§7.4) — that is the
//     debiasing mechanism; making it fitness-based would reintroduce the bias.
//   • Newcomer protection is BLIND TO FITNESS (§7.2), keyed on arrival order only.
// Selection IS biased toward quality (§7.3) — but selection decides where effort
// goes, not what is measured, so it is a prior, not an instrument (§2.2, §7.6).

import { complexity } from './genome.js';
import { distance } from './distance.js';

export const GRID = 16;              // §7.1 default (16×16 = 256 cells)
export const CELL_DEPTH = 8;         // §7.2 D = 8
export const CELL_SELECT_ALPHA = 2.0; // §7.3a
export const IN_CELL_SELECT_BETA = 2.0; // §7.3c
export const PARENT_YIELD_WEIGHT = 0.3; // §7.6 score = 0.7·r_fitness + 0.3·r_yield
export const YIELD_SHRINKAGE_M = 5;  // §7.6
export const YIELD_WINDOW = 50;      // §7.6 rolling window of offspring
export const NEWCOMER_PROTECT_ARRIVALS = 2; // §7.2
export const PARSIMONY_TIE_LO = 0.95; // §7.4 / Appendix
export const PARSIMONY_TIE_HI = 1.05;

export class Archive {
  // v2.2: geometry is a parameter (work order §2). `geom = { nx, ny }` sets the
  // grid; it defaults to 16×16 (§7.1) so every prior caller is unchanged. Deep
  // cells and every rule below are geometry-agnostic — only the cell count and the
  // coverage denominator change.
  constructor(geom) {
    this.gridX = (geom && geom.nx) ? geom.nx : GRID;
    this.gridY = (geom && geom.ny) ? geom.ny : GRID;
    this.cells = new Map(); // key → { x, y, residents:[], n_offspring, offspringDwell:[] }
    this._dMed = 0;
    this._acceptedPartnerD = []; // for the §6.6 diagnostic
  }

  _cellKey(x, y) { return y * this.gridX + x; }

  getCell(x, y, create = false) {
    const k = this._cellKey(x, y);
    let c = this.cells.get(k);
    if (!c && create) { c = { x, y, residents: [], n_offspring: 0, offspringDwell: [] }; this.cells.set(k, c); }
    return c;
  }

  occupiedCount() {
    let n = 0;
    for (const c of this.cells.values()) if (c.residents.length > 0) n++;
    return n;
  }

  // All resident genomes across occupied cells — the partner candidate pool (§6.6).
  allResidentGenomes() {
    const out = [];
    for (const c of this.cells.values()) for (const r of c.residents) out.push(r.genome);
    return out;
  }

  // ── insertion / container maintenance (§7.4) ───────────────────────────────
  // Every offspring enters its target cell; if full, evict a uniformly random
  // UNPROTECTED resident. Returns the §14.1 archive-action fields.
  insert(genome, F, ownDwellMean, ownN, x, y, listenId) {
    const cell = this.getCell(x, y, true);
    const sizeBefore = cell.residents.length;
    // Every existing resident sees one more arrival in this cell (§7.2 protection
    // keys on arrivals since entry).
    for (const r of cell.residents) r.arrivals++;

    const newResident = { genome, F, own_dwell_mean: ownDwellMean, own_n_observations: ownN, arrivals: 0, inserted_at: listenId };

    let evicted = null, nProtected = 0, blockedByProtection = false;
    if (cell.residents.length < CELL_DEPTH) {
      cell.residents.push(newResident);
    } else {
      // Protected = residents with fewer than 2 arrivals since entry, capped at
      // half a cell, preferring the most-recently-arrived (§7.2).
      const eligible = cell.residents
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.arrivals < NEWCOMER_PROTECT_ARRIVALS)
        .sort((a, b) => a.r.arrivals - b.r.arrivals)
        .slice(0, Math.floor(CELL_DEPTH / 2));
      const protectedSet = new Set(eligible.map((e) => e.i));
      nProtected = protectedSet.size;
      let candidates = cell.residents.map((_, i) => i).filter((i) => !protectedSet.has(i));
      if (candidates.length === 0) { candidates = cell.residents.map((_, i) => i); blockedByProtection = true; }
      // UNIFORMLY random among unprotected — the debiasing mechanism (§7.4). The
      // RNG is uniform and fitness-blind; it is injectable only so a plumbing run
      // is reproducible, never so eviction can be steered toward anyone.
      const victimIdx = this._pick(candidates);
      evicted = cell.residents[victimIdx];
      cell.residents[victimIdx] = newResident;
    }
    return {
      target_cell: [x, y], cell_size_before: sizeBefore, inserted: true,
      evicted_genome_id: evicted ? evicted.genome.id : null,
      evicted_had_n_observations: evicted ? evicted.own_n_observations : null,
      n_protected_in_cell: nProtected, eviction_blocked_by_protection: blockedByProtection,
    };
  }

  // Allow a gate/loop to inject a seeded RNG for reproducible eviction (plumbing).
  setEvictionRng(fn) { this._evict = fn; }
  _pick(candidates) {
    const r = this._evict ? this._evict() : Math.random();
    return candidates[Math.floor(r * candidates.length)];
  }

  // ── offspring yield (§7.6) ──────────────────────────────────────────────────
  // Called after every listen with the PARENT'S cell, so it tracks every child
  // bred from any resident of that cell regardless of where the child landed.
  recordOffspring(px, py, dwell) {
    const cell = this.getCell(px, py, true);
    cell.n_offspring++;
    cell.offspringDwell.push(dwell);
    while (cell.offspringDwell.length > YIELD_WINDOW) cell.offspringDwell.shift();
  }

  meanCellFitness(cell) {
    if (cell.residents.length === 0) return 0;
    let s = 0; for (const r of cell.residents) s += r.F; return s / cell.residents.length;
  }

  // Archive-wide mean offspring dwell, for the yield shrinkage prior (§7.6).
  _archiveMeanOffspringDwell() {
    let s = 0, n = 0;
    for (const c of this.cells.values()) {
      if (c.offspringDwell.length > 0) { s += c.offspringDwell.reduce((a, b) => a + b, 0) / c.offspringDwell.length; n++; }
    }
    return n > 0 ? s / n : 0;
  }

  cellYield(cell, yArchive) {
    const n = cell.offspringDwell.length;
    const mean = n > 0 ? cell.offspringDwell.reduce((a, b) => a + b, 0) / n : yArchive;
    return (n * mean + YIELD_SHRINKAGE_M * yArchive) / (n + YIELD_SHRINKAGE_M);
  }

  // ── cell selection (§7.3a) ─────────────────────────────────────────────────
  // Rank-based over occupied cells: score = 0.7·r_fitness + 0.3·r_yield, P ∝
  // score^α. Returns the chosen cell (or null if none occupied).
  selectCell(rng) {
    const occ = [...this.cells.values()].filter((c) => c.residents.length > 0);
    if (occ.length === 0) return null;
    const yArchive = this._archiveMeanOffspringDwell();
    const withStats = occ.map((c) => ({ c, f: this.meanCellFitness(c), y: this.cellYield(c, yArchive) }));
    const N = withStats.length;
    // Ranks (1 = best). r = 1 − (j−1)/N.
    const byF = [...withStats].sort((a, b) => b.f - a.f);
    const byY = [...withStats].sort((a, b) => b.y - a.y);
    const rankF = new Map(), rankY = new Map();
    byF.forEach((e, j) => rankF.set(e.c, 1 - j / N));
    byY.forEach((e, j) => rankY.set(e.c, 1 - j / N));
    const weights = withStats.map((e) => {
      const score = 0.7 * rankF.get(e.c) + PARENT_YIELD_WEIGHT * rankY.get(e.c);
      return Math.pow(Math.max(1e-9, score), CELL_SELECT_ALPHA);
    });
    return withStats[rng.weightedIndex(weights)].c;
  }

  // ── in-cell resident selection (§7.3c) ─────────────────────────────────────
  // Rank-based among residents with lexicographic parsimony breaking effective
  // ties (§7.3c, §7.4): within a ±5% fitness band, the lower-complexity resident
  // ranks higher; complexity can NEVER override a real fitness difference.
  selectResident(cell, rng) {
    const residents = cell.residents;
    if (residents.length === 1) return residents[0];
    // Sort by fitness desc, then reorder tie-bands by complexity asc.
    const withC = residents.map((r) => ({ r, c: complexity(r.genome) }));
    withC.sort((a, b) => b.r.F - a.r.F);
    // Group consecutive residents whose fitness lies within the ±5% tie band and
    // sort each group by complexity ascending (parsimony).
    let i = 0;
    while (i < withC.length) {
      let j = i + 1;
      while (j < withC.length && inTieBand(withC[i].r.F, withC[j].r.F)) j++;
      const band = withC.slice(i, j).sort((a, b) => a.c - b.c);
      for (let t = i; t < j; t++) withC[t] = band[t - i];
      i = j;
    }
    const n = withC.length;
    const weights = withC.map((_, j) => Math.pow(1 - j / n, IN_CELL_SELECT_BETA));
    return withC[rng.weightedIndex(weights)].r;
  }

  // ── D_med (§6.6) ───────────────────────────────────────────────────────────
  // Median compatibility distance over random pairs of occupied-cell residents,
  // refreshed by the loop every 100 listens.
  refreshDMed(rng, nPairs = 100) {
    const genomes = this.allResidentGenomes();
    if (genomes.length < 2) { this._dMed = 0; return 0; }
    const ds = [];
    for (let i = 0; i < nPairs; i++) {
      let a = rng.int(genomes.length), b = rng.int(genomes.length);
      if (a === b) b = (b + 1) % genomes.length;
      ds.push(distance(genomes[a], genomes[b]));
    }
    ds.sort((x, y) => x - y);
    this._dMed = ds[Math.floor(ds.length / 2)];
    return this._dMed;
  }
  get dMed() { return this._dMed; }

  noteAcceptedPartnerDistance(d) { this._acceptedPartnerD.push(d); }

  // ── snapshot (§14.2) ───────────────────────────────────────────────────────
  snapshot(listenId) {
    const occ = [...this.cells.values()].filter((c) => c.residents.length > 0);
    const depthHist = new Array(CELL_DEPTH + 1).fill(0);
    let qdScore = 0;
    const perCell = [];
    const yArchive = this._archiveMeanOffspringDwell();
    for (const c of occ) {
      depthHist[c.residents.length]++;
      const mf = this.meanCellFitness(c);
      qdScore += mf;
      perCell.push({
        cell: [c.x, c.y], mean_fitness: mf, resident_count: c.residents.length,
        n_offspring: c.n_offspring,
        mean_offspring_dwell: c.offspringDwell.length ? c.offspringDwell.reduce((a, b) => a + b, 0) / c.offspringDwell.length : null,
        Y_shrunk: this.cellYield(c, yArchive),
        resident_ids: c.residents.map((r) => r.genome.id),
      });
    }
    const partnerDMean = this._acceptedPartnerD.length ? this._acceptedPartnerD.reduce((a, b) => a + b, 0) / this._acceptedPartnerD.length : null;
    this._acceptedPartnerD = [];
    return {
      listen_id_at_snapshot: listenId,
      cells_occupied: occ.length,
      coverage: occ.length / (this.gridX * this.gridY),
      cell_depth_histogram: depthHist,
      qd_score_sum_mean_fitness: qdScore,
      D_med: this._dMed,
      mean_accepted_partner_D: partnerDMean,
      per_cell: perCell,
    };
  }
}

function inTieBand(fBest, fOther) {
  if (fBest === 0) return fOther === 0;
  const ratio = fOther / fBest;
  return ratio >= PARSIMONY_TIE_LO && ratio <= PARSIMONY_TIE_HI;
}
