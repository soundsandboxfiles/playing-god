// variation.js — the variation pipeline (§6). select → recombine → duplicate →
// mutate (§6.1). This module implements recombine/duplicate/mutate; selection of
// the prime parent and of partners from the archive lives in archive.js (§7.3),
// which calls in here with concrete genomes.
//
// The whole layer is engineered against LINKAGE DISRUPTION (§6.4): waves are
// inherited intact and in place (§6.8), rerouted/duplicated connections arrive
// attenuated (§4.3, §6.3), and crossover is distance-restricted (§6.6). None of
// it narrows the space — every operator can still reach every region (§2.1); the
// attenuations only make a large structural jump arrive quietly so it can grow if
// selection favours it, rather than detonating.

import {
  Genome, WAVE_SLOTS, GENES_PER_WAVE, WAVE_SCHEMA, WAVE_INDEX,
  GLOBAL_SCHEMA, GLOBAL_INDEX, mapValue, inverseMap, reflect01, SWITCH_NAMES,
} from './genome.js';
import { distance } from './distance.js';
import { P_RATIO_JUMP_INIT } from './priors.js';

const GLOBAL_BASE = WAVE_SLOTS * GENES_PER_WAVE;

// Self-adaptive ES constants (§6.2, Appendix). Recomputed for n = 6167 (P1 added
// two genes); τ'=1/√(2n), τ=1/√(2√n). The change from v1's n≈6101 is past the 4th
// decimal, so behaviour is unchanged; updated for correctness.
const TAU_GLOBAL = 0.0090;  // τ' = 1/√(2·6167)
const TAU_LOCAL = 0.0798;   // τ  = 1/√(2·√6167)
const SIGMA_FLOOR = 0.002;  // Appendix SIGMA_FLOOR
const SIGMA_CEIL = 0.5;     // Appendix SIGMA_CEIL

const P_REROUTE = 0.02;         // §6.2b
const REROUTE_DEPTH_SCALE = 0.05; // §4.3 / §6.2b
const P_NODE_COUNT = 0.03;      // §6.2b
// §6.2b / Appendix base switch-flip rate. RECALIBRATED for v2 (see the v2 report
// and SPEC-DELTA-V2). v1 used 0.004, which under this prior (no switch class reaches
// J=0.25, so every class stays at the base) gave ~3 flips per reproduction against
// §13.2's target of ~1.0 (OVERNIGHT §8). The value below is set from the Gate 2a
// J table so that 64 · base · Σ_classes min(1, 0.25/J) ≈ 1.0 at p_switch_flip_scale=1.
export const P_SWITCH_FLIP_BASE = 0.00134;
const DUP_SIGMA_MULT = 3.0;     // §6.3 / Appendix
const DUP_ARRIVAL_ATTEN = 0.05; // §6.3 / Appendix

// P2 (V2-PROPOSALS): probability per reproduction that a whole FUNCTIONAL BLOCK is
// copied at a ratio from one active wave to another. PROVISIONAL, mirroring
// p_duplicate's 0.08 (a comparable structural operator). Recorded in the v2 report;
// could become an evolvable gene later like p_duplicate.
const P_COPY_RATIO_BLOCK = 0.08;

// ── precomputed schema index lists (built once) ──────────────────────────────
const WAVE_CONT = [];   // continuous, non-sigma per-wave gene indices
const WAVE_INT = [];    // integer per-wave gene indices (node counts, routing)
WAVE_SCHEMA.forEach((d, i) => {
  if (d.kind === 'cont') WAVE_CONT.push(i);
  else if (d.kind === 'int') WAVE_INT.push(i);
});
const SIGMA_WAVE_I = WAVE_INDEX['sigma_wave'];
const PMUT_I = WAVE_INDEX['p_mutate_wave'];
const PM_SRC_I = WAVE_INDEX['pm_source'];
const AM_SRC_I = WAVE_INDEX['am_source'];
const PM_DEPTH_I = WAVE_INDEX['pm_depth'];
const AM_DEPTH_I = WAVE_INDEX['am_depth'];
const PM_ON_I = WAVE_INDEX['pm_on'];
const AM_ON_I = WAVE_INDEX['am_on'];
const ACTIVE_I = WAVE_INDEX['active'];
const GAIN_OUT_I = WAVE_INDEX['gain_out'];
const GAIN_MOD_ON_I = WAVE_INDEX['gain_mod_on'];
const AMP_NNODES_I = WAVE_INDEX['amp_env_n_nodes'];
const PITCH_NNODES_I = WAVE_INDEX['pitch_env_n_nodes'];

const GLOBAL_CONT = [];
const GLOBAL_INT = [];
GLOBAL_SCHEMA.forEach((d, i) => {
  if (d.kind === 'cont') GLOBAL_CONT.push(i);
  else if (d.kind === 'int') GLOBAL_INT.push(i);
});
const SIGMA_GLOBAL_I = GLOBAL_INDEX['sigma_global'];
const P_RATIO_WAVE_I = WAVE_INDEX['p_ratio_jump_wave'];
const P_RATIO_SCALE_I = GLOBAL_INDEX['p_ratio_jump_scale'];

// ── P1: ratio-jump mixture (§6.2 extended) ───────────────────────────────────
// A pitch- or time-domain gene, when mutated, takes a STRUCTURED RATIO JUMP onto a
// simple fraction with probability p_ratio_jump, else the v1 ES Gaussian step. The
// Gaussian is RETAINED EVERYWHERE ("plus or minus some — nothing's perfect", P1):
// jumps land a wave near a ratio relation in one step; the Gaussian supplies the
// imperfection (detune, beating, drift) where much of what sounds alive lives.
//
// The ratio set is the §5 initialisation set, reused for consistency (P1: "changing
// it is a listening-session decision, not a code decision"), P ∝ 1/r, applied in a
// randomly chosen direction (up/down) so both regular and top-heavy fractions arise.
// This is a designed PRIOR on which moves are cheap — it truncates nothing (the
// Gaussian path reaches every value; §2.1) and is itself evolvable via
// p_ratio_jump_wave/_scale, which is the complete answer to the §2.2 worry (P1).
const RATIO_SET = [1, 2, 3, 4, 5, 6, 7, 8, 1 / 2, 1 / 3, 1 / 4, 3 / 2, 5 / 4, 5 / 3]; // §5
const RATIO_WEIGHTS = RATIO_SET.map((r) => 1 / r);                                    // P ∝ 1/r

// Per gene: how a ratio jump acts (P1 scope — every pitch- and time-domain gene):
//   'cents'   — pitch, cents-valued: add ±1200·log2(r) cents  (a fifth up is +702c)
//   'logmul'  — log-encoded period/tempo: multiply the value by r (or 1/r)
//   'propmul' — proportion (duty, envelope node times): multiply the proportion by r
//               (a subdivision move, P1). Amplitude/gain genes are NOT listed → never
//               ratio-jumped (they are not periods, P1).
function classifyRatio(name) {
  if (name === 'pitch_master' || name === 'fundamental_cents') return 'cents';
  if (/^pitch_node\d+_level$/.test(name)) return 'cents';        // pitch offsets, in cents
  if (name === 'period' || name === 'pre_prop' || name === 'tempo_bpm') return 'logmul';
  if (name === 'duty') return 'propmul';
  if (/^(amp|pitch)_node\d+_time$/.test(name)) return 'propmul'; // envelope subdivisions
  return null;
}
// Precompute wave-gene-index → mode and global-gene-index → mode.
const WAVE_RATIO_MODE = new Map();
WAVE_SCHEMA.forEach((d, i) => { const m = classifyRatio(d.name); if (m) WAVE_RATIO_MODE.set(i, m); });
const GLOBAL_RATIO_MODE = new Map();
GLOBAL_SCHEMA.forEach((d, i) => { const m = classifyRatio(d.name); if (m) GLOBAL_RATIO_MODE.set(i, m); });

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// Apply one ratio jump to the stored value at `storedIdx` for gene descriptor `d`
// in mode `mode`. Computed in STORED space and reflected at the bounds (§3), so a
// jump past the declared range folds back rather than piling on the boundary —
// nothing is snapped or truncated (§2.1).
function ratioJump(data, storedIdx, d, mode, rng) {
  const r = RATIO_SET[rng.weightedIndex(RATIO_WEIGHTS)];
  const up = rng.bool(0.5); // both directions (P1)
  const { lo, hi } = d.map;
  if (mode === 'cents') {
    // pitch cents: +1200·log2(r) added in value space → Δstored = that / (hi−lo).
    const dCents = (up ? 1 : -1) * 1200 * Math.log2(r);
    data[storedIdx] = reflect01(data[storedIdx] + dCents / (hi - lo));
  } else if (mode === 'logmul') {
    // log gene: value×r ⟺ stored += log(r)/log(hi/lo).
    const dStored = (up ? 1 : -1) * Math.log(r) / Math.log(hi / lo);
    data[storedIdx] = reflect01(data[storedIdx] + dStored);
  } else {
    // propmul: proportion in [0,1] (lo=0,hi=1), value×r ⟺ stored×r (subdivision).
    const f = up ? r : 1 / r;
    data[storedIdx] = reflect01(data[storedIdx] * f);
  }
}

// ── P2: copy-at-ratio of whole functional blocks (§6.3 sibling operator) ──────
// Copies a FUNCTIONAL BLOCK from one active wave to another active wave within the
// same genome, with the block's period/pitch offset by a simple ratio. Finer-
// grained than duplication (§6.3): the target keeps its OWN shape, gains, amplitude
// envelope and modulation — it ADOPTS A RELATION rather than becoming a clone. This
// is the "regularity and rhyming" the vault records Jon is drawn to, obtained by
// operator rather than by construction. Two block kinds (P2):
//   • pitch block  — pitch_master + the ENTIRE pitch envelope. Copy-at-ratio yields
//     an octave double, a fifth, a harmonic stack in one step. Copied verbatim, then
//     the target's master is offset by ±1200·log2(r) cents (the pitch-env node
//     levels are cent OFFSETS, so the contour transposes with the master).
//   • timing block — period, duty, pre_prop, mid_wait_on. Copy-at-ratio scales the
//     copied PERIOD by r, yielding e.g. 3:4 against an existing pulse — polyrhythm in
//     one step. duty/pre_prop/mid_wait_on copied verbatim (same character, scaled).
// r is drawn from the §5 ratio set (P ∝ 1/r) INCLUDING 1/1 for unison (a doubling),
// in a random direction. No soft-arrival attenuation is needed (unlike §6.3): the
// target keeps its own gains, so nothing arrives at full strength on top of a voice.
// Invariant-clean (§2.1): a designed bias on which relations are one step away; it
// truncates nothing (mutation still reaches every value; the whole space stays
// reachable via other operators). Requires ≥2 active waves — an operator precondition
// like duplication needing an active source, not a truncation (the muted-target region
// remains reachable via unmute + P1 ratio jump).
const PITCH_BLOCK_INDICES = (() => {
  const names = ['pitch_env_on', 'pitch_env_n_nodes', 'pitch_master'];
  for (let k = 0; k < 8; k++) for (const f of ['level', 'time', 'curve', 'tension']) names.push(`pitch_node${k}_${f}`);
  return names.map((n) => WAVE_INDEX[n]);
})();
const TIMING_BLOCK_INDICES = ['period', 'duty', 'pre_prop', 'mid_wait_on'].map((n) => WAVE_INDEX[n]);
const PITCH_MASTER_I = WAVE_INDEX['pitch_master'];
const PERIOD_I = WAVE_INDEX['period'];

export function copyAtRatioBlock(gn, rng) {
  const none = { copy_ratio_fired: false, copy_ratio_kind: null, copy_ratio_r: null, copy_ratio_up: null, copy_ratio_source: null, copy_ratio_target: null };
  if (rng.next() >= P_COPY_RATIO_BLOCK) return none;
  // Source and target: two DISTINCT active waves (so the relation is between two
  // audible voices). Fewer than two active → the operator has nothing to relate.
  const active = [];
  for (let w = 0; w < WAVE_SLOTS; w++) if (gn.data[w * GENES_PER_WAVE + ACTIVE_I] >= 0.5) active.push(w);
  if (active.length < 2) return none;
  const source = rng.pick(active);
  let target = source;
  while (target === source) target = rng.pick(active);

  const kind = rng.bool(0.5) ? 'pitch' : 'timing';
  const r = RATIO_SET[rng.weightedIndex(RATIO_WEIGHTS)]; // includes 1/1 (unison), P2
  const up = rng.bool(0.5);
  const sBase = source * GENES_PER_WAVE, tBase = target * GENES_PER_WAVE;
  const block = kind === 'pitch' ? PITCH_BLOCK_INDICES : TIMING_BLOCK_INDICES;

  // Copy the block verbatim, source → target.
  for (const gi of block) gn.data[tBase + gi] = gn.data[sBase + gi];

  // Offset by the ratio (in stored space, reflected at bounds; §3, §2.1).
  if (kind === 'pitch') {
    const d = WAVE_SCHEMA[PITCH_MASTER_I]; // cents, linear
    const dCents = (up ? 1 : -1) * 1200 * Math.log2(r);
    gn.data[tBase + PITCH_MASTER_I] = reflect01(gn.data[tBase + PITCH_MASTER_I] + dCents / (d.map.hi - d.map.lo));
  } else {
    const d = WAVE_SCHEMA[PERIOD_I]; // log period → ×r ⟺ +log(r)/log(hi/lo)
    const dStored = (up ? 1 : -1) * Math.log(r) / Math.log(d.map.hi / d.map.lo);
    gn.data[tBase + PERIOD_I] = reflect01(gn.data[tBase + PERIOD_I] + dStored);
  }
  return { copy_ratio_fired: true, copy_ratio_kind: kind, copy_ratio_r: r, copy_ratio_up: up, copy_ratio_source: source, copy_ratio_target: target };
}

// Clamp a step-size to its declared range.
function clampSigma(s) { return Math.max(SIGMA_FLOOR, Math.min(SIGMA_CEIL, s)); }

// Log-normal update of one step-size gene (§6.2). Returns the updated σ VALUE
// (mapped units 0.002..0.5) and writes it back into the genome.
function updateSigmaGene(gn, storedIndex, descriptor, n0, rng) {
  const cur = mapValue(descriptor, gn.data[storedIndex]);
  const next = clampSigma(cur * Math.exp(TAU_GLOBAL * n0 + TAU_LOCAL * rng.gaussian()));
  gn.data[storedIndex] = inverseMap(descriptor, next);
  return next;
}

// Mutate a single wave's continuous genes at (mult × σ), used both by the main
// pass and by duplication's 3σ divergence kick (§6.3). If `gated`, only a
// fraction (mutation_fraction × p_mutate_wave) of genes receive a draw (§6.2).
function mutateWaveContinuous(gn, w, sigmaVal, rng, mult, gated, mutationFraction) {
  const base = w * GENES_PER_WAVE;
  const pmut = gated ? mapValue(WAVE_SCHEMA[PMUT_I], gn.data[base + PMUT_I]) : 1;
  const rate = gated ? mutationFraction * pmut : 1;
  const step = mult * sigmaVal;
  for (const ci of WAVE_CONT) {
    if (rate >= 1 || rng.next() < rate) {
      gn.data[base + ci] = reflect01(gn.data[base + ci] + step * rng.gaussian());
    }
  }
}

// ── the main mutation pass (§6.2, §6.2b) ─────────────────────────────────────
// Mutates `gn` in place. `switchRates` maps a switch NAME to its base per-class
// flip probability (§13.2); before Gate 2a produces the calibrated table, every
// class uses P_SWITCH_FLIP_BASE. Returns a summary of what was DONE (§14.1
// "variation actually applied"), not the gene values.
export function mutateGenome(gn, rng, opts = {}) {
  const switchRates = opts.switchRates || null;
  const mutationFraction = mapValue(GLOBAL_SCHEMA[GLOBAL_INDEX['mutation_fraction']],
    gn.data[GLOBAL_BASE + GLOBAL_INDEX['mutation_fraction']]);
  const flipScale = mapValue(GLOBAL_SCHEMA[GLOBAL_INDEX['p_switch_flip_scale']],
    gn.data[GLOBAL_BASE + GLOBAL_INDEX['p_switch_flip_scale']]);

  // One shared global normal per reproduction (§6.2, the τ'·N(0,1) term).
  const n0 = rng.gaussian();

  // P1: the global ratio-jump scale, and the reference rate for the two GLOBAL
  // pitch/time genes (fundamental_cents, tempo_bpm), which have no per-wave carrier.
  const ratioScale = mapValue(GLOBAL_SCHEMA[P_RATIO_SCALE_I], gn.data[GLOBAL_BASE + P_RATIO_SCALE_I]);
  const globalRatioP = clamp01(P_RATIO_JUMP_INIT * ratioScale);

  const summary = {
    n_continuous_genes_mutated: 0,
    sigma_min: Infinity, sigma_max: -Infinity, sigma_sum: 0, sigma_count: 0,
    n_switch_flips: 0, switch_flip_classes: {},
    n_reroutes: 0, n_node_count_changes: 0,
    n_ratio_jumps: 0, // P1
  };
  const recordSigma = (s) => {
    summary.sigma_min = Math.min(summary.sigma_min, s);
    summary.sigma_max = Math.max(summary.sigma_max, s);
    summary.sigma_sum += s; summary.sigma_count++;
  };

  // ---- globals: step-size self-adaptation, then continuous, then discrete ----
  const sgVal = updateSigmaGene(gn, GLOBAL_BASE + SIGMA_GLOBAL_I, GLOBAL_SCHEMA[SIGMA_GLOBAL_I], n0, rng);
  recordSigma(sgVal);
  for (const gi of GLOBAL_CONT) {
    if (rng.next() < mutationFraction) {
      const mode = GLOBAL_RATIO_MODE.get(gi); // fundamental_cents / tempo_bpm (P1)
      if (mode && rng.next() < globalRatioP) {
        ratioJump(gn.data, GLOBAL_BASE + gi, GLOBAL_SCHEMA[gi], mode, rng);
        summary.n_ratio_jumps++;
      } else {
        gn.data[GLOBAL_BASE + gi] = reflect01(gn.data[GLOBAL_BASE + gi] + sgVal * rng.gaussian());
      }
      summary.n_continuous_genes_mutated++;
    }
  }
  for (const gi of GLOBAL_INT) {
    // Visualiser-only integer genes drift ±1 at the node-count rate; inert in the
    // headless build but kept evolvable so the visualiser (§11) has variety.
    if (rng.next() < P_NODE_COUNT) {
      const d = GLOBAL_SCHEMA[gi];
      let v = mapValue(d, gn.data[GLOBAL_BASE + gi]) + (rng.bool(0.5) ? 1 : -1);
      gn.data[GLOBAL_BASE + gi] = inverseMap(d, v);
    }
  }

  // ---- per wave ----
  for (let w = 0; w < WAVE_SLOTS; w++) {
    const base = w * GENES_PER_WAVE;
    // Step-size self-adaptation for this wave.
    const swVal = updateSigmaGene(gn, base + SIGMA_WAVE_I, WAVE_SCHEMA[SIGMA_WAVE_I], n0, rng);
    recordSigma(swVal);

    // Continuous genes (gated by mutation_fraction × p_mutate_wave).
    const pmut = mapValue(WAVE_SCHEMA[PMUT_I], gn.data[base + PMUT_I]);
    const rate = mutationFraction * pmut;
    // P1: effective per-wave ratio-jump probability = p_ratio_jump_wave × scale.
    const pRatioWave = clamp01(mapValue(WAVE_SCHEMA[P_RATIO_WAVE_I], gn.data[base + P_RATIO_WAVE_I]) * ratioScale);
    for (const ci of WAVE_CONT) {
      if (rng.next() < rate) {
        const mode = WAVE_RATIO_MODE.get(ci); // pitch/time gene? (P1)
        if (mode && rng.next() < pRatioWave) {
          ratioJump(gn.data, base + ci, WAVE_SCHEMA[ci], mode, rng);
          summary.n_ratio_jumps++;
        } else {
          gn.data[base + ci] = reflect01(gn.data[base + ci] + swVal * rng.gaussian());
        }
        summary.n_continuous_genes_mutated++;
      }
    }

    // Binary switches (§6.2b): per-class base rate × p_switch_flip_scale.
    for (const name of SWITCH_NAMES) {
      const baseRate = switchRates ? (switchRates[name] ?? P_SWITCH_FLIP_BASE) : P_SWITCH_FLIP_BASE;
      const p = baseRate * flipScale;
      const si = WAVE_INDEX[name];
      if (rng.next() < p) {
        // Flip: invert the boolean state. Stored as 0/1 so the flip is crisp.
        gn.data[base + si] = gn.data[base + si] >= 0.5 ? 0 : 1;
        summary.n_switch_flips++;
        summary.switch_flip_classes[name] = (summary.switch_flip_classes[name] || 0) + 1;
      }
    }

    // Routing indices (§6.2b): reassign uniformly, and on change attenuate depth
    // (§4.3 — a rerouted connection arrives quietly and grows only if favoured).
    if (rng.next() < P_REROUTE) {
      gn.data[base + PM_SRC_I] = rng.next();
      const d = WAVE_SCHEMA[PM_DEPTH_I];
      const newDepth = mapValue(d, gn.data[base + PM_DEPTH_I]) * REROUTE_DEPTH_SCALE;
      gn.data[base + PM_DEPTH_I] = inverseMap(d, newDepth);
      summary.n_reroutes++;
    }
    if (rng.next() < P_REROUTE) {
      gn.data[base + AM_SRC_I] = rng.next();
      const d = WAVE_SCHEMA[AM_DEPTH_I];
      const newDepth = mapValue(d, gn.data[base + AM_DEPTH_I]) * REROUTE_DEPTH_SCALE;
      gn.data[base + AM_DEPTH_I] = inverseMap(d, newDepth);
      summary.n_reroutes++;
    }

    // Node counts (§6.2b): ±1 with probability 0.03.
    for (const idx of [AMP_NNODES_I, PITCH_NNODES_I]) {
      if (rng.next() < P_NODE_COUNT) {
        const d = WAVE_SCHEMA[idx];
        let v = mapValue(d, gn.data[base + idx]) + (rng.bool(0.5) ? 1 : -1);
        gn.data[base + idx] = inverseMap(d, v);
        summary.n_node_count_changes++;
      }
    }
  }

  summary.sigma_mean = summary.sigma_count ? summary.sigma_sum / summary.sigma_count : 0;
  if (!Number.isFinite(summary.sigma_min)) summary.sigma_min = 0;
  if (!Number.isFinite(summary.sigma_max)) summary.sigma_max = 0;
  return summary;
}

// ── duplication (§6.3) ───────────────────────────────────────────────────────
// A whole wave copied into one or more other slots, overwriting whatever is
// there. Not part of crossover; applied after recombination, before the final
// mutation pass (§6.1). Reaches a chorus / detuned pair / rhythmic echo in one
// step (§6.3) — a move point mutation cannot make.
export function duplicate(gn, rng) {
  const pDup = mapValue(GLOBAL_SCHEMA[GLOBAL_INDEX['p_duplicate']],
    gn.data[GLOBAL_BASE + GLOBAL_INDEX['p_duplicate']]);
  if (rng.next() >= pDup) return { duplication_fired: false, duplication_targets: [], duplication_hit_active_slot: false };

  // Source: uniform among ACTIVE waves (§6.3). If none active, no duplication.
  const active = [];
  for (let w = 0; w < WAVE_SLOTS; w++) if (gn.data[w * GENES_PER_WAVE + ACTIVE_I] >= 0.5) active.push(w);
  if (active.length === 0) return { duplication_fired: false, duplication_targets: [], duplication_hit_active_slot: false };
  const source = rng.pick(active);
  const sVal = mapValue(WAVE_SCHEMA[SIGMA_WAVE_I], gn.data[source * GENES_PER_WAVE + SIGMA_WAVE_I]);

  // n_targets: 1 (.75), 2 (.20), 3 (.05) — the multi-slot tail keeps a wave
  // propagating into several slots reachable in one step (§6.3, §2.1).
  const r = rng.next();
  const nTargets = r < 0.75 ? 1 : r < 0.95 ? 2 : 3;
  const candidates = [];
  for (let w = 0; w < WAVE_SLOTS; w++) if (w !== source) candidates.push(w);
  // Draw nTargets distinct targets uniformly (muted OR active, no restriction §6.3).
  for (let i = candidates.length - 1; i > 0; i--) { const j = rng.int(i + 1);[candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  const targets = candidates.slice(0, nTargets);

  let hitActive = false;
  const srcBase = source * GENES_PER_WAVE;
  const srcSelfPM = mapValue(WAVE_SCHEMA[PM_SRC_I], gn.data[srcBase + PM_SRC_I]) === source;
  const srcSelfAM = mapValue(WAVE_SCHEMA[AM_SRC_I], gn.data[srcBase + AM_SRC_I]) === source;

  for (const target of targets) {
    const tBase = target * GENES_PER_WAVE;
    const wasActive = gn.data[tBase + ACTIVE_I] >= 0.5;
    if (wasActive) hitActive = true;
    // Copy the whole 95-gene block.
    for (let k = 0; k < GENES_PER_WAVE; k++) gn.data[tBase + k] = gn.data[srcBase + k];
    // Arrives active (§6.3).
    gn.data[tBase + ACTIVE_I] = 1;
    // Self-modulation follows the copy to its own new slot (§6.3); other indices
    // (absolute) are kept so the copy inherits its modulator.
    if (srcSelfPM) gn.data[tBase + PM_SRC_I] = inverseMap(WAVE_SCHEMA[PM_SRC_I], target);
    if (srcSelfAM) gn.data[tBase + AM_SRC_I] = inverseMap(WAVE_SCHEMA[AM_SRC_I], target);
    // 3σ divergence so the copies do not arrive bit-identical (§6.3).
    mutateWaveContinuous(gn, target, sVal, rng, DUP_SIGMA_MULT, false, 1);
    if (wasActive) {
      // Overwriting an active slot is a compound change; attenuate the arrival so
      // it decomposes into a clean deletion + a quiet new wave (§6.3).
      const d = WAVE_SCHEMA[GAIN_OUT_I];
      const newG = mapValue(d, gn.data[tBase + GAIN_OUT_I]) + 20 * Math.log10(DUP_ARRIVAL_ATTEN);
      gn.data[tBase + GAIN_OUT_I] = inverseMap(d, newG); // dB space: ×0.05 lin = −26 dB
      // Any enabled inbound routing edge pointing at `target` is attenuated too.
      for (let w = 0; w < WAVE_SLOTS; w++) {
        const wb = w * GENES_PER_WAVE;
        if (gn.data[wb + PM_ON_I] >= 0.5 && mapValue(WAVE_SCHEMA[PM_SRC_I], gn.data[wb + PM_SRC_I]) === target) {
          const dd = WAVE_SCHEMA[PM_DEPTH_I];
          gn.data[wb + PM_DEPTH_I] = inverseMap(dd, mapValue(dd, gn.data[wb + PM_DEPTH_I]) * DUP_ARRIVAL_ATTEN);
        }
        if (gn.data[wb + AM_ON_I] >= 0.5 && mapValue(WAVE_SCHEMA[AM_SRC_I], gn.data[wb + AM_SRC_I]) === target) {
          const dd = WAVE_SCHEMA[AM_DEPTH_I];
          gn.data[wb + AM_DEPTH_I] = inverseMap(dd, mapValue(dd, gn.data[wb + AM_DEPTH_I]) * DUP_ARRIVAL_ATTEN);
        }
      }
    }
  }
  return { duplication_fired: true, duplication_targets: targets, duplication_hit_active_slot: hitActive };
}

// ── partner kernel (§6.6) ────────────────────────────────────────────────────
// Draw k partners from `candidates` (each a genome, excluding the prime) with
// probability ∝ exp(−D/(λ·D_med)), WITHOUT replacement. λ = 0.25. There is no
// failure case (§6.6): the kernel never reaches zero, so a partner is always
// returned. `dMed` must be > 0 (caller guarantees an occupied archive).
export function samplePartners(prime, candidates, k, dMed, rng, lambda = 0.25) {
  const pool = candidates.filter((c) => c !== prime);
  const chosen = [];
  const denom = Math.max(1e-9, lambda * dMed);
  const remaining = pool.slice();
  while (chosen.length < k && remaining.length > 0) {
    const weights = remaining.map((c) => Math.exp(-distance(prime, c) / denom));
    const idx = rng.weightedIndex(weights);
    chosen.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return chosen;
}

// ── slot-preserving multi-parent crossover (§6.8) ────────────────────────────
// The crossover unit is the WHOLE wave (all 95 genes together). A wave lands in
// the same slot index it occupied in its source parent (slot-preserving), which
// keeps routing indices meaningful because distance-restricted parents have
// homologous slot-i waves (§6.8).
export function assembleChild(prime, partners, rng) {
  const k = partners.length;
  const child = new Genome();
  const partnerInfluence = mapValue(GLOBAL_SCHEMA[GLOBAL_INDEX['partner_influence']],
    prime.data[GLOBAL_BASE + GLOBAL_INDEX['partner_influence']]);
  const src = new Int8Array(WAVE_SLOTS);
  const parents = [prime, ...partners];

  for (let w = 0; w < WAVE_SLOTS; w++) {
    let pIndex = 0; // prime
    if (k > 0 && rng.next() < partnerInfluence) pIndex = 1 + rng.int(k);
    src[w] = pIndex;
    const from = parents[pIndex];
    const dst = w * GENES_PER_WAVE, srcOff = w * GENES_PER_WAVE;
    for (let g = 0; g < GENES_PER_WAVE; g++) child.data[dst + g] = from.data[srcOff + g];
  }

  // Global genes cross uniformly per gene across all k+1 parents (§6.8).
  for (let gi = 0; gi < GLOBAL_SCHEMA.length; gi++) {
    const from = parents[rng.int(parents.length)];
    child.data[GLOBAL_BASE + gi] = from.data[GLOBAL_BASE + gi];
  }

  // Repair pass (§6.8): a routing index pointing at a slot whose occupant came
  // from a different parent than the referring wave, AND whose active/gain_mod_on
  // differs between those two parents, keeps the index but takes depth × 0.05.
  const repair = (srcGeneI, depthGeneI, onGeneI) => {
    for (let w = 0; w < WAVE_SLOTS; w++) {
      const wb = w * GENES_PER_WAVE;
      if (child.data[wb + onGeneI] < 0.5) continue;
      const s = mapValue(WAVE_SCHEMA[srcGeneI], child.data[wb + srcGeneI]);
      const refParent = src[w], occParent = src[s];
      if (refParent === occParent) continue;
      const A = parents[refParent], B = parents[occParent];
      const sBaseA = s * GENES_PER_WAVE, sBaseB = s * GENES_PER_WAVE;
      const actDiff = (A.data[sBaseA + ACTIVE_I] >= 0.5) !== (B.data[sBaseB + ACTIVE_I] >= 0.5);
      const modDiff = (A.data[sBaseA + GAIN_MOD_ON_I] >= 0.5) !== (B.data[sBaseB + GAIN_MOD_ON_I] >= 0.5);
      if (actDiff || modDiff) {
        const dd = WAVE_SCHEMA[depthGeneI];
        child.data[wb + depthGeneI] = inverseMap(dd, mapValue(dd, child.data[wb + depthGeneI]) * REROUTE_DEPTH_SCALE);
      }
    }
  };
  repair(PM_SRC_I, PM_DEPTH_I, PM_ON_I);
  repair(AM_SRC_I, AM_DEPTH_I, AM_ON_I);

  child.src = src;
  child.parentIds = parents.map((p) => p.id);
  return child;
}

// ── the full breeding step for one listen (§6.0) ─────────────────────────────
// prime — the prime parent (already selected, §7.3).
// opts.partnerCandidates — genomes eligible as partners (occupied-cell residents
//   in the real loop; a prior pool for the pre-archive Gate 2b run). If absent or
//   empty, or crossover does not fire, the child is mutation-only.
// opts.crossoverRate — CROSSOVER_RATE (0.50), or 0 for a mutation-only run.
// Returns { child, provenance } where provenance carries the §14.1 fields.
export function breed(prime, rng, opts = {}) {
  const crossoverRate = opts.crossoverRate ?? 0;
  const candidates = opts.partnerCandidates || [];
  const dMed = opts.dMed || 0;
  const switchRates = opts.switchRates || null;

  let child, crossoverFired = false, kPartners = 0, partnerIds = [];
  const canCross = crossoverRate > 0 && candidates.length >= 1 && dMed > 0;
  if (canCross && rng.next() < crossoverRate) {
    // k from n_partners (§6.8): floor/ceil weighted by the fractional part.
    const nPart = mapValue(GLOBAL_SCHEMA[GLOBAL_INDEX['n_partners']],
      prime.data[GLOBAL_BASE + GLOBAL_INDEX['n_partners']]);
    const frac = nPart - Math.floor(nPart);
    let k = rng.next() < frac ? Math.ceil(nPart) : Math.floor(nPart);
    k = Math.max(1, Math.min(candidates.length, k));
    const partners = samplePartners(prime, candidates, k, dMed, rng);
    if (partners.length > 0) {
      child = assembleChild(prime, partners, rng);
      crossoverFired = true;
      kPartners = partners.length;
      partnerIds = partners.map((p) => p.id);
    }
  }
  if (!child) {
    // Mutation-only event: child by mutation alone (§6.1). Provenance is all-prime.
    child = prime.clone();
    child.src = new Int8Array(WAVE_SLOTS); // all zeros → all prime
    child.parentIds = [prime.id];
  }

  const dup = duplicate(child, rng);
  // P2: copy-at-ratio of a whole pitch/timing block. Applied alongside duplication,
  // before the per-gene mutation pass (§6.1 pipeline position), so the copied block
  // then diverges under mutation like any inherited material.
  const copy = copyAtRatioBlock(child, rng);
  const mut = mutateGenome(child, rng, { switchRates });
  child.id = child.hash();

  return {
    child,
    provenance: {
      prime_parent_id: prime.id,
      partner_ids: partnerIds,
      k_partners: kPartners,
      crossover_fired: crossoverFired,
      src: Array.from(child.src),
      ...dup,
      ...copy,
      variation: mut,
    },
  };
}
