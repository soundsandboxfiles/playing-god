// distance.js — compatibility distance D(A,B) (§6.5).
//
// D measures how different two genomes are, for the partner kernel (§6.6). Three
// terms, each in [0,1], each a different kind of difference:
//   d_switch — structural (which of the 768 switches disagree)
//   d_active — slot correspondence (Jaccard over the active-slot sets)
//   d_global — tuning (mean |Δ| over the global genes, stored space)
// D = 0.4·d_switch + 0.4·d_active + 0.2·d_global (§6.5).
//
// Continuous per-wave genes are deliberately EXCLUDED (§6.5): two genomes with
// the same waves in the same slots at slightly different tunings are exactly the
// pair crossover handles best, and penalising them would be wrong.

import {
  WAVE_SLOTS, GENES_PER_WAVE, SWITCH_WAVE_INDICES, WAVE_INDEX, GLOBAL_SCHEMA,
} from './genome.js';

const ACTIVE_IDX = WAVE_INDEX['active'];
const GLOBAL_BASE = WAVE_SLOTS * GENES_PER_WAVE;

export function distance(a, b) {
  // d_switch — normalised Hamming over all 768 binary switches (§6.5).
  let diff = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) {
    const base = w * GENES_PER_WAVE;
    for (const si of SWITCH_WAVE_INDICES) {
      const av = a.data[base + si] >= 0.5 ? 1 : 0;
      const bv = b.data[base + si] >= 0.5 ? 1 : 0;
      if (av !== bv) diff++;
    }
  }
  const dSwitch = diff / (WAVE_SLOTS * SWITCH_WAVE_INDICES.length);

  // d_active — Jaccard DISTANCE over active-slot sets (§6.5). Two genomes using
  // entirely different slots score 1.0 regardless of other similarity, which is
  // the right sensitivity for slot-preserving inheritance.
  let inter = 0, union = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) {
    const base = w * GENES_PER_WAVE;
    const av = a.data[base + ACTIVE_IDX] >= 0.5;
    const bv = b.data[base + ACTIVE_IDX] >= 0.5;
    if (av && bv) inter++;
    if (av || bv) union++;
  }
  const dActive = union === 0 ? 0 : 1 - inter / union;

  // d_global — mean absolute difference over the global genes, stored [0,1]
  // (§6.5). Spec says "21 global genes"; this genome carries 22 (the recorded
  // count discrepancy in genome.js), so the mean is over all of them. The extra
  // gene is one visualiser value out of 22 and changes d_global negligibly.
  let gsum = 0;
  for (let i = 0; i < GLOBAL_SCHEMA.length; i++) {
    gsum += Math.abs(a.data[GLOBAL_BASE + i] - b.data[GLOBAL_BASE + i]);
  }
  const dGlobal = gsum / GLOBAL_SCHEMA.length;

  return 0.4 * dSwitch + 0.4 * dActive + 0.2 * dGlobal;
}

// Median distance over random pairs from a list of genomes. Used for D_med (§6.6)
// and by the locality gate's U estimate helper. `nPairs` pairs are sampled with
// the provided RNG so it is reproducible.
export function medianDistance(genomes, rng, nPairs = 200) {
  if (genomes.length < 2) return 0;
  const ds = [];
  for (let i = 0; i < nPairs; i++) {
    let a = rng.int(genomes.length), b = rng.int(genomes.length);
    if (a === b) b = (b + 1) % genomes.length;
    ds.push(distance(genomes[a], genomes[b]));
  }
  ds.sort((x, y) => x - y);
  return ds[Math.floor(ds.length / 2)];
}
