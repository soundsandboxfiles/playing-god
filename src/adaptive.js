// adaptive.js — Adaptive-sampling MAP-Elites (Justesen et al. 2019), the LANE B
// archive (§13.3, work order §3). The alternative to the deep grid when behavioural
// locality is in doubt.
//
// The deep grid (archive.js) denoises a cell's fitness IMPLICITLY — a cell fills
// with near-replications of a lineage and their spread averages out the noise, which
// costs no extra listens but DEPENDS ON offspring landing in or near their parent's
// cell (§7.2, the assumption Gate 2b tests). Adaptive sampling makes the opposite
// trade (§13.3): a SINGLE elite per cell, and the noise is beaten down by EXPLICIT
// RE-EVALUATION — re-listening genomes to accumulate samples. It depends on NO
// locality assumption at all, and pays for that with listens spent re-measuring
// instead of exploring (the "re-listen tax" the race measures).
//
// The rule (§13.3, one sentence, implemented faithfully for a one-listen-at-a-time
// interface):
//   "Single elite per cell; a challenger must beat the elite after being sampled the
//    same number of times, and the elite is re-sampled whenever it survives."
//
//   • A newly bred child that lands in an OCCUPIED cell opens a CONTEST against that
//     cell's elite. It has been sampled once; the elite has been sampled n_e times.
//   • The scheduler owes the challenger more listens until it has n_e samples too —
//     these are explicit RE-LISTENS of the same genome. Only then are the two
//     denoised means compared on equal footing. Challenger mean > elite mean ⇒ it
//     takes the cell (keeping its samples); otherwise the elite SURVIVES.
//   • Whenever the elite survives it is RE-SAMPLED once (n_e grows), so the bar to
//     unseat it rises with its own robustness — noisy one-shot elites cannot hold a
//     cell.
//
// §8.5 cooldown is RESPECTED when scheduling re-listens (work order §3): a genome
// still inside the repeat-cooldown window is not re-listened yet; the scheduler
// defers it and does something else (another contest, an elite resample, or a fresh
// breed) until the window clears. Re-listens of any one genome are therefore spaced
// out exactly as the cooldown intends — it is not bypassed.
//
// This is an INSTRUMENT (§2.2): eviction/replacement is by denoised fitness (that is
// what adaptive sampling IS — it is not the deep grid's fitness-blind eviction), but
// it still judges nothing about what a sound SHOULD be; dwell is the only signal and
// no cell is ever culled. Coverage spreads over behaviour space exactly as MAP-Elites
// does.

import { complexity } from './genome.js';
import { distance } from './distance.js';

export const CELL_SELECT_ALPHA = 2.0;  // §7.3a rank-bias, reused

export class AdaptiveArchive {
  constructor(geom) {
    this.gridX = (geom && geom.nx) ? geom.nx : 16;
    this.gridY = (geom && geom.ny) ? geom.ny : 16;
    this.cells = new Map(); // key → cell
    this._dMed = 0;
    this._acceptedPartnerD = [];
    this._evict = null; // parity with Archive.setEvictionRng (unused: no random eviction here)
    // Re-listen accounting for the race's re-listen tax.
    this.relisten_count = 0;
    this.breed_count = 0;
  }

  _cellKey(x, y) { return y * this.gridX + x; }
  setEvictionRng(fn) { this._evict = fn; }

  getCell(x, y, create = false) {
    const k = this._cellKey(x, y);
    let c = this.cells.get(k);
    if (!c && create) {
      c = { x, y, elite: null, contest: null, needsResample: false, n_offspring: 0, offspringDwell: [] };
      this.cells.set(k, c);
    }
    return c;
  }

  occupiedCount() {
    let n = 0;
    for (const c of this.cells.values()) if (c.elite) n++;
    return n;
  }

  // Partner pool for crossover (§6.6): the elites. Active contest challengers are
  // provisional and excluded so partners are archive members, matching the deep grid.
  allResidentGenomes() {
    const out = [];
    for (const c of this.cells.values()) if (c.elite) out.push(c.elite.genome);
    return out;
  }

  // ── selection (§7.3a) — rank-biased over occupied cells by elite fitness ───────
  // Single elite per cell, so cell fitness IS the elite's denoised mean. No offspring
  // yield term (that was a deep-grid refinement); rank + α keeps the quality bias.
  selectCell(rng) {
    const occ = [...this.cells.values()].filter((c) => c.elite);
    if (occ.length === 0) return null;
    const withF = occ.map((c) => ({ c, f: c.elite.mean }));
    const N = withF.length;
    const byF = [...withF].sort((a, b) => b.f - a.f);
    const rankF = new Map();
    byF.forEach((e, j) => rankF.set(e.c, 1 - j / N));
    const weights = withF.map((e) => Math.pow(Math.max(1e-9, rankF.get(e.c)), CELL_SELECT_ALPHA));
    return withF[rng.weightedIndex(weights)].c;
  }

  // Single elite per cell — the "resident" is the elite. Interface parity with the
  // deep grid's selectResident so the Engine's breed path is unchanged.
  selectResident(cell /*, rng */) {
    return { genome: cell.elite.genome, F: cell.elite.mean };
  }

  // ── re-listen scheduling ──────────────────────────────────────────────────────
  // Returns a genome to RE-LISTEN (explicit re-evaluation) or null to breed fresh.
  // Cooldown-respecting: a genome in the repeat-cooldown window is skipped (deferred),
  // never re-listened early. Priority: settle open contests first (a challenger owed
  // samples), then re-sample elites that just survived.
  pendingRelisten(cooldown) {
    // 1. Contests where the challenger still has fewer samples than the elite.
    for (const c of this.cells.values()) {
      if (c.contest && c.contest.n < c.elite.n) {
        if (cooldown && cooldown.contains(c.contest.genome.id)) continue; // §8.5 defer
        return { genome: c.contest.genome, cellX: c.x, cellY: c.y, kind: 'contest' };
      }
    }
    // 2. Elites flagged for a survival re-sample.
    for (const c of this.cells.values()) {
      if (c.needsResample && c.elite) {
        if (cooldown && cooldown.contains(c.elite.genome.id)) continue; // §8.5 defer
        return { genome: c.elite.genome, cellX: c.x, cellY: c.y, kind: 'elite' };
      }
    }
    return null;
  }

  // Whether any re-listen is *owed* but currently blocked only by cooldown — lets the
  // scheduler know the tax is deferred, not absent (diagnostic only).
  hasDeferredRelisten(cooldown) {
    for (const c of this.cells.values()) {
      if (c.contest && c.contest.n < c.elite.n && cooldown && cooldown.contains(c.contest.genome.id)) return true;
      if (c.needsResample && c.elite && cooldown && cooldown.contains(c.elite.genome.id)) return true;
    }
    return false;
  }

  // ── record a listen's outcome into the adaptive archive ───────────────────────
  // `ownMean`,`ownN` are the genome's denoised own-dwell statistics (from the Engine's
  // registry — accumulated across every re-listen of that genome, §8.2). Returns the
  // §14.1-style archive-action fields, plus adaptive-specific bookkeeping.
  //
  // relisten: null for a freshly bred child; else { kind:'contest'|'elite', cellX, cellY }.
  recordAdaptive(genome, x, y, ownMean, ownN, listenId, relisten) {
    if (relisten) {
      this.relisten_count++;
      const cell = this.getCell(relisten.cellX, relisten.cellY, false);
      if (!cell) return { adaptive_action: 'relisten_orphan', target_cell: [x, y] };
      if (relisten.kind === 'elite' && cell.elite && cell.elite.genome.id === genome.id) {
        cell.elite.mean = ownMean; cell.elite.n = ownN; cell.needsResample = false;
        return { adaptive_action: 'elite_resampled', target_cell: [relisten.cellX, relisten.cellY], elite_n: ownN, elite_mean: ownMean };
      }
      if (relisten.kind === 'contest' && cell.contest && cell.contest.genome.id === genome.id) {
        cell.contest.mean = ownMean; cell.contest.n = ownN;
        return this._maybeResolveContest(cell, relisten.cellX, relisten.cellY);
      }
      return { adaptive_action: 'relisten_stale', target_cell: [x, y] };
    }

    // Freshly bred child — it lands in its own target cell (x,y).
    this.breed_count++;
    const cell = this.getCell(x, y, true);
    if (!cell.elite) {
      cell.elite = { genome, mean: ownMean, n: ownN };
      return { adaptive_action: 'installed_elite', target_cell: [x, y], elite_n: ownN, elite_mean: ownMean, inserted: true };
    }
    if (!cell.contest) {
      cell.contest = { genome, mean: ownMean, n: ownN };
      return this._maybeResolveContest(cell, x, y);
    }
    // A contest is already running in this cell — bounded to one at a time. The child
    // was still heard/measured/logged; it simply does not open a second contest.
    return { adaptive_action: 'no_contest_slot', target_cell: [x, y], inserted: false };
  }

  // Compare only once the challenger has caught up to the elite's sample count
  // (§13.3 "sampled the same number of times"). Winner keeps the cell; loser is
  // discarded; the survivor is flagged for a re-sample.
  _maybeResolveContest(cell, x, y) {
    if (cell.contest.n < cell.elite.n) {
      return { adaptive_action: 'contest_pending', target_cell: [x, y], contest_n: cell.contest.n, elite_n: cell.elite.n, inserted: false };
    }
    const ch = cell.contest, el = cell.elite;
    if (ch.mean > el.mean) {
      cell.elite = { genome: ch.genome, mean: ch.mean, n: ch.n };
      cell.contest = null; cell.needsResample = true; // fresh elite gets a denoising sample
      return { adaptive_action: 'challenger_won', target_cell: [x, y], evicted_genome_id: el.genome.id, elite_n: ch.n, elite_mean: ch.mean, inserted: true };
    }
    cell.contest = null; cell.needsResample = true; // elite survived → re-sample it
    return { adaptive_action: 'elite_survived', target_cell: [x, y], survivor_genome_id: el.genome.id, elite_n: el.n, elite_mean: el.mean, inserted: false };
  }

  // Offspring yield is a deep-grid selection refinement (§7.6); adaptive selection is
  // plain rank-by-elite-fitness. Kept as a no-op for Engine interface parity.
  recordOffspring(px, py, dwell) {
    const cell = this.getCell(px, py, false);
    if (cell) { cell.n_offspring++; cell.offspringDwell.push(dwell); while (cell.offspringDwell.length > 50) cell.offspringDwell.shift(); }
  }

  // ── D_med (§6.6) parity ───────────────────────────────────────────────────────
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

  // ── snapshot (§14.2), adaptive shape ──────────────────────────────────────────
  snapshot(listenId) {
    const occ = [...this.cells.values()].filter((c) => c.elite);
    let qdScore = 0, sampleSum = 0, contestsOpen = 0;
    const perCell = [];
    for (const c of occ) {
      qdScore += c.elite.mean;
      sampleSum += c.elite.n;
      if (c.contest) contestsOpen++;
      perCell.push({ cell: [c.x, c.y], elite_mean_fitness: c.elite.mean, elite_n_samples: c.elite.n, contest_open: !!c.contest, elite_id: c.elite.genome.id });
    }
    const partnerDMean = this._acceptedPartnerD.length ? this._acceptedPartnerD.reduce((a, b) => a + b, 0) / this._acceptedPartnerD.length : null;
    this._acceptedPartnerD = [];
    const total = this.relisten_count + this.breed_count;
    return {
      listen_id_at_snapshot: listenId,
      archive_mode: 'adaptive',
      cells_occupied: occ.length,
      coverage: occ.length / (this.gridX * this.gridY),
      qd_score_sum_elite_fitness: qdScore,
      mean_elite_samples: occ.length ? sampleSum / occ.length : 0,
      contests_open: contestsOpen,
      relisten_count: this.relisten_count,
      breed_count: this.breed_count,
      relisten_tax: total ? this.relisten_count / total : 0,
      D_med: this._dMed,
      mean_accepted_partner_D: partnerDMean,
      per_cell: perCell,
    };
  }
}
