// fitness.js — dwell, provenance (contrib), and relatedness-weighted lineage
// averaging (§8.1, §8.2).
//
// Fitness is DWELL TIME IN SECONDS. Nothing else (§8.1). No claim is made
// anywhere about which sounds produce long dwell — that is what the system is for
// finding out (§2.3). This module is therefore an INSTRUMENT (§2.2): it averages
// observations, it never judges them, and NO GENE may touch it (§2.5).

import { WAVE_SLOTS } from './genome.js';

export const LINEAGE_DEPTH = 3;                 // §8.2 / Appendix
export const DEPTH_WEIGHTS = { 0: 0.5, 1: 0.3, 2: 0.2 }; // self / depth1 / depth2 (§8.2)
export const CONTRIB_MAX_ANCESTORS = 8;         // §8.2 / Appendix
export const UNATTENDED_WEIGHT = 0.25;          // §8.3 / Appendix

// Compute a child's `contrib` map (§8.2) from the src[0..63] array recorded at
// assembly and the parents' own contrib maps.
//   direct(p)     = |{ i : src[i]==p }| / 64
//   contrib_child = { p: direct(p) } ⊎ { a : Σ_p direct(p)·contrib_p(a) }
// Truncated to depth 3 and the 8 largest contributors (§8.2).
//
// `parents` is [prime, ...partners]; each parent object needs an `id` and a
// `contrib` map (its own ancestry) and a `depthFromChild` is derived here.
export function computeContrib(src, parents) {
  // Direct contribution of each immediate parent.
  const direct = new Map(); // parentId → fraction
  for (let i = 0; i < WAVE_SLOTS; i++) {
    const p = src[i];
    const id = parents[p] ? parents[p].id : parents[0].id;
    direct.set(id, (direct.get(id) || 0) + 1 / WAVE_SLOTS);
  }
  // Compose transitively with each parent's own contrib (its ancestors).
  const contrib = new Map();
  for (const [pid, frac] of direct) contrib.set(pid, (contrib.get(pid) || 0) + frac);
  for (const parent of parents) {
    const pFrac = direct.get(parent.id) || 0;
    if (pFrac === 0 || !parent.contrib) continue;
    for (const [aid, af] of Object.entries(parent.contrib)) {
      contrib.set(aid, (contrib.get(aid) || 0) + pFrac * af);
    }
  }
  // Truncate to the 8 largest.
  const sorted = [...contrib.entries()].sort((a, b) => b[1] - a[1]).slice(0, CONTRIB_MAX_ANCESTORS);
  return Object.fromEntries(sorted);
}

// Plain arithmetic mean of one genome's OWN attended observations (§8.2).
// `observations` is an array of { dwell_s, unattended } — unattended listens
// enter at weight 0.25 (§8.3). Relatedness weighting operates strictly BETWEEN
// individuals, never within one (§8.2); this is the within-individual mean.
export function ownDwellMean(observations) {
  let wsum = 0, vsum = 0;
  for (const o of observations) {
    const w = o.unattended ? UNATTENDED_WEIGHT : 1;
    wsum += w; vsum += w * o.dwell_s;
  }
  return wsum > 0 ? vsum / wsum : 0;
}

// Relatedness-weighted lineage fitness (§8.2):
//   w0 = 0.5;  w(a) = depth_weight(a) · contrib(a)
//   F(g) = [ w0·dwell(g) + Σ w(a)·dwell(a) ] / [ w0 + Σ w(a) ]
// `self` = { dwell } (own mean). `ancestors` = [{ id, dwell, depth, contrib }],
// where depth ∈ {1,2} and contrib is the inherited fraction from §8.2.
// Under mutation-only reproduction every contrib is 1.0 and this reduces exactly
// to the flat 0.5/0.3/0.2 scheme (§8.2 — a strict generalisation).
export function lineageFitness(self, ancestors) {
  let num = 0.5 * self.dwell;
  let den = 0.5;
  const used = [];
  for (const a of ancestors) {
    if (a.depth < 1 || a.depth > 2) continue; // depths beyond 2 are truncated (§8.2)
    const dw = DEPTH_WEIGHTS[a.depth] || 0;
    const w = dw * (a.contrib ?? 1);
    if (w <= 0) continue;
    num += w * a.dwell;
    den += w;
    used.push({ id: a.id, depth: a.depth, depth_weight: dw, contrib: a.contrib ?? 1, weight: w, dwell: a.dwell });
  }
  return { F: den > 0 ? num / den : self.dwell, used };
}
