// migrate.js — v1 → v2 genome migration (P3 timing reparam + P1 appended genes).
//
// Two v2 changes touch the genome LAYOUT and VALUES; this module maps a v1 genome
// to the current v2 schema, phenotype-preserving for everything v1 expressed:
//
//   P3 — the per-wave timing trio pre_wait/duration/mid_wait was reparameterised in
//        place to period/duty/pre_prop (same slots). Bijective:
//          period = duration + mid_wait ; duty = duration/period ; pre_prop = pre_wait/period
//        and synthesis reconstructs the seconds at decode time. GATE P3-mig proved
//        this sample-exact.
//   P1 — two evolvable meta-genes were APPENDED: per-wave `p_ratio_jump_wave` (so a
//        wave is 96 genes now, not 95) and global `p_ratio_jump_scale` (23 globals,
//        not 22). Being appended, all pre-existing indices are unchanged, so the
//        migration copies each v1 wave's 95 genes into the v2 wave's first 95 slots
//        and writes the new gene at slot 95; likewise the 22 v1 globals then the new
//        global. The new genes get their init values (neutral: the migrated genome
//        starts with the same ratio-jump propensity as a fresh v2 genome), so an
//        imported v1 creature behaves identically except that it can now evolve the
//        ratio-jump bias like any v2 creature.
//
// The v1 LAYOUT is hardcoded here (it no longer exists in genome.js), so this file
// is a fixed, self-contained spec of "what v1 was" and does not drift if genome.js
// changes again.

import {
  GENOME_SIZE, GENES_PER_WAVE, WAVE_SLOTS, WAVE_SCHEMA, WAVE_INDEX,
  GLOBAL_SCHEMA, GLOBAL_INDEX, mapValue, inverseMap,
} from './genome.js';
import { P_RATIO_JUMP_INIT, P_RATIO_JUMP_SCALE_INIT } from './priors.js';

// ── v1 layout (frozen) ───────────────────────────────────────────────────────
const V1_GENES_PER_WAVE = 95;
const V1_GLOBALS = 22;
const V1_GENOME_SIZE = WAVE_SLOTS * V1_GENES_PER_WAVE + V1_GLOBALS; // 6102
// v1 within-wave positions of the timing genes (schema order, unchanged in slots).
const V1_PRE_I = 11;   // pre_wait
const V1_DUR_I = 12;   // duration
const V1_MID_I = 13;   // mid_wait
// v1 timing maps (exact v1 log ranges).
const V1_PRE = { type: 'log', lo: 0.0005, hi: 30 };
const V1_DUR = { type: 'log', lo: 0.0005, hi: 120 };
const V1_MID = { type: 'log', lo: 0.0005, hi: 30 };

// ── v2 targets ───────────────────────────────────────────────────────────────
const I_PERIOD = WAVE_INDEX['period'];    // v2 slot 11
const I_DUTY = WAVE_INDEX['duty'];        // v2 slot 12
const I_PREPROP = WAVE_INDEX['pre_prop']; // v2 slot 13
const I_PRATIO_WAVE = WAVE_INDEX['p_ratio_jump_wave']; // v2 slot 95 (appended)
const D_PERIOD = WAVE_SCHEMA[I_PERIOD], D_DUTY = WAVE_SCHEMA[I_DUTY], D_PREPROP = WAVE_SCHEMA[I_PREPROP];
const D_PRATIO_WAVE = WAVE_SCHEMA[I_PRATIO_WAVE];
const GI_PRATIO_SCALE = GLOBAL_INDEX['p_ratio_jump_scale']; // v2 global 22 (appended)
const D_PRATIO_SCALE = GLOBAL_SCHEMA[GI_PRATIO_SCALE];

// Decode the v1 timing of wave `w` from a raw v1 gene array to seconds. Exposed so
// the P3-mig gate can render the v1 side without a v1 copy of synthesis. Reads the
// v1 LAYOUT (95 genes/wave), independent of the current v2 layout.
export function decodeV1TimingSeconds(rawV1, w) {
  const base = w * V1_GENES_PER_WAVE;
  return {
    preS: mapValue(V1_PRE, rawV1[base + V1_PRE_I]),
    durS: mapValue(V1_DUR, rawV1[base + V1_DUR_I]),
    midS: mapValue(V1_MID, rawV1[base + V1_MID_I]),
  };
}

// Migrate a raw v1 gene array (length 6102) to a raw v2 Float32Array (length 6167).
export function migrateRawV1toV2(rawV1) {
  const src = rawV1 instanceof Float32Array ? rawV1 : Float32Array.from(rawV1);
  if (src.length !== V1_GENOME_SIZE) throw new Error(`migrate: expected v1 size ${V1_GENOME_SIZE}, got ${src.length}`);
  const out = new Float32Array(GENOME_SIZE);

  // Per wave: copy the 95 v1 genes into the v2 wave's first 95 slots, reparam the
  // three timing slots in place, then set the appended p_ratio_jump_wave.
  for (let w = 0; w < WAVE_SLOTS; w++) {
    const vBase = w * V1_GENES_PER_WAVE;   // v1 wave base
    const nBase = w * GENES_PER_WAVE;      // v2 wave base
    for (let i = 0; i < V1_GENES_PER_WAVE; i++) out[nBase + i] = src[vBase + i];
    // Timing reparam (P3): period = dur+mid, duty = dur/period, pre_prop = pre/period.
    const preS = mapValue(V1_PRE, src[vBase + V1_PRE_I]);
    const durS = mapValue(V1_DUR, src[vBase + V1_DUR_I]);
    const midS = mapValue(V1_MID, src[vBase + V1_MID_I]);
    const period = durS + midS;
    out[nBase + I_PERIOD] = inverseMap(D_PERIOD, period);
    out[nBase + I_DUTY] = inverseMap(D_DUTY, period > 0 ? durS / period : 1);
    out[nBase + I_PREPROP] = inverseMap(D_PREPROP, period > 0 ? preS / period : 0);
    // Appended P1 gene (slot 95): init value.
    out[nBase + I_PRATIO_WAVE] = inverseMap(D_PRATIO_WAVE, P_RATIO_JUMP_INIT);
  }

  // Globals: copy the 22 v1 globals, then set the appended p_ratio_jump_scale.
  const v1GlobalBase = WAVE_SLOTS * V1_GENES_PER_WAVE;   // 6080
  const v2GlobalBase = WAVE_SLOTS * GENES_PER_WAVE;      // 6144
  for (let i = 0; i < V1_GLOBALS; i++) out[v2GlobalBase + i] = src[v1GlobalBase + i];
  out[v2GlobalBase + GI_PRATIO_SCALE] = inverseMap(D_PRATIO_SCALE, P_RATIO_JUMP_SCALE_INIT);

  return out;
}
