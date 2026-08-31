// genome.js — the Creature's genotype (§3).
//
// A genome is 64 wave slots × 95 genes + the global genes. Every gene is stored
// as a float in [0, 1] (§3, first paragraph: "All genes are stored internally as
// floats in [0, 1] and mapped to their declared range on read. Mutation operates
// in stored space. Bounds are handled by reflection, not clamping.").
//
// WHY stored-space [0,1] for everything: it lets one mutation rule (§6.2) apply
// uniformly across genes whose natural units are wildly different — cents,
// seconds, decibels — and it makes "reflect at the bound" a single operation
// rather than per-gene clamping logic. The declared range lives only in the
// mapping table below, so the search never has to know a gene's units.
//
// ─────────────────────────────────────────────────────────────────────────────
// A RECORDED CONTRADICTION IN THE SPEC (see OVERNIGHT-REPORT.md).
// The Appendix gives GLOBAL_GENES = 21 and GENOME_SIZE = 6101, and §2.1 quotes
// 6,101 throughout. But the *enumeration* in §3.2 names 8 non-visual globals
// (fundamental_cents, tempo_bpm, sigma_global, p_duplicate, p_switch_flip_scale,
// n_partners, partner_influence, mutation_fraction) plus 14 visualiser genes = 22.
// 64×95 + 22 = 6102, not 6101. The "22 → 21" bookkeeping for the deleted
// master_gain (vault entity) collided with n_partners being "silently lost and
// restored", leaving the headline count one below the enumerated gene set.
//
// DECISION: implement every gene the spec actually enumerates (22 globals, 6102
// parameters). Dropping an enumerated gene to hit 6101 would remove specified
// function (every visualiser gene "must do something perceptible", §11.1) or a
// load-bearing variation gene — itself a silent narrowing, which is the one
// thing this project forbids. The ±1 difference is a rounding error against the
// 10^14,693 cardinality claim and changes the ES constants only past the 4th
// decimal. Flagged, not silently reconciled.
//
// v2 UPDATE (P1). Two evolvable meta-genes were APPENDED: a per-wave
// `p_ratio_jump_wave` (96 genes per wave now, not 95) and a global
// `p_ratio_jump_scale` (23 globals now, not 22). So GENOME_SIZE = 64×96 + 23 =
// 6167. They were appended, not inserted, so all pre-existing gene indices are
// unchanged and the v1→v2 migration is a simple per-wave/global extension
// (src/migrate.js). P3 separately reparameterised the 3 timing genes in place, so
// their indices are unchanged too.
// ─────────────────────────────────────────────────────────────────────────────

export const WAVE_SLOTS = 64;      // §3, Appendix WAVE_SLOTS
export const ENV_MAX_NODES = 8;    // §3.1 amplitude/pitch envelopes, Appendix ENV_MAX_NODES

// Gene "kind" drives which mutation operator applies (§6.2 vs §6.2b):
//   'cont'  — continuous, self-adaptive ES additive step
//   'sigma' — a step-size gene; mutates by the log-normal ES rule, not additively
//   'binary'— a kill switch; flips discretely at a per-class rate (§6.2b, §3.3)
//   'int'   — an integer gene (node counts, routing indices); discrete moves
//
// 'map' converts stored [0,1] → declared value. type 'linear' is value =
// lo + s·(hi−lo); type 'log' is value = lo·(hi/lo)^s and REQUIRES lo>0.
//
// WHY some log genes have a tiny positive floor instead of 0 (gain_mod, pm_depth,
// am_depth are declared 0..X but mapped from ~0.001; pre_prop from 1e-6): a log map
// cannot reach 0, and the true "off" for these is provided by a companion switch
// (gain_mod_on, pm_on, am_on) or is sub-perceptual (a pre_prop of 1e-6 period is a
// zero delay). This does not truncate the space in the §2.1 sense — every audible
// value remains reachable and the off-state is reachable via the switch.

function g(name, kind, mapType, lo, hi) {
  return { name, kind, map: { type: mapType, lo, hi } };
}

// Build the 95-gene per-wave schema in a fixed, stable order. Order is arbitrary
// but must never change once logs exist, because a gene is addressed by its
// index in delta storage (§14).
function buildWaveSchema() {
  const s = [];
  // Structural switches — 3 (§3.1). Independent by design: gain_out_on false /
  // gain_mod_on true is a pure modulator (an LFO or FM operator).
  s.push(g('active', 'binary'));
  s.push(g('gain_out_on', 'binary'));
  s.push(g('gain_mod_on', 'binary'));
  // Shape — 8 (§3.1): four continuous weights and a switch each. Output is the
  // sum of enabled shapes weighted by their values, normalised by enabled weight.
  s.push(g('shape_sine', 'cont', 'linear', 0, 1));
  s.push(g('shape_triangle', 'cont', 'linear', 0, 1));
  s.push(g('shape_saw', 'cont', 'linear', 0, 1));
  s.push(g('shape_square', 'cont', 'linear', 0, 1));
  s.push(g('shape_sine_on', 'binary'));
  s.push(g('shape_triangle_on', 'binary'));
  s.push(g('shape_saw_on', 'binary'));
  s.push(g('shape_square_on', 'binary'));
  // Timing — 5. v2 REPARAMETERISATION (P3, V2-PROPOSALS). v1 stored the trio
  // pre_wait / duration / mid_wait directly. v2 stores a PERIOD and a DUTY that
  // splits it into sound and gap, and PRE_PROP (pre_wait as a proportion of the
  // period). Bijective with the v1 trio: period = duration + mid_wait,
  // duty = duration/period, pre_prop = pre_wait/period. WHY (P3): ratio relations
  // *between periods* are what polyrhythm is, so P1/P2 ratio jumps act on the
  // period; mutating the period then scales the whole pattern (same character,
  // different tempo) while mutating duty changes character on a fixed grid — the
  // mutation axes line up with perceptually coherent moves. Still "load-bearing
  // and must not be simplified": the same rhythm/polyrhythm space, re-axed.
  // Positions are unchanged from v1 (period↔pre_wait, duty↔duration,
  // pre_prop↔mid_wait slots), so every later gene index is stable and the delta
  // store (§14) is unaffected. The migration lives in src/migrate.js.
  //   period   log 0.001–150 s   (min = 2×0.5 ms floor; max = 120 + 30 s)
  //   duty     linear 0–1        (fraction of the period that is sound)
  //   pre_prop log 1e-6–1e5      (pre_wait ÷ period; "free to exceed 1", P3). Wide
  //            so migration is loss-free at both extremes (pre 0.5 ms / period 150
  //            → 3e-6; pre 30 s / period 1 ms → 3e4) and no delay is unreachable
  //            (§2.1). Locality cost of the wide range noted in the v2 report; it
  //            is the least consequential timing gene (F4/P4 neutralises the
  //            leading pre_wait anyway).
  s.push(g('period', 'cont', 'log', 0.001, 150));
  s.push(g('duty', 'cont', 'linear', 0, 1));
  s.push(g('pre_prop', 'cont', 'log', 1e-6, 1e5));
  s.push(g('mid_wait_on', 'binary'));                 // off = play once
  s.push(g('phase', 'cont', 'linear', 0, 1));         // wrapping, 0–1
  // Gains — 2 (§3.1). gain_out in dB scales the audio destination; gain_mod
  // scales the modulation destination. Two destinations, one shaped signal.
  s.push(g('gain_out', 'cont', 'linear', -80, 6));    // dB, −80..+6
  s.push(g('gain_mod', 'cont', 'log', 0.001, 32));    // 0..32
  // Amplitude envelope — 34 (§3.1): switch + node count + 8 nodes × 4 fields.
  s.push(g('amp_env_on', 'binary'));
  s.push(g('amp_env_n_nodes', 'int', 'linear', 2, 8));
  for (let k = 0; k < ENV_MAX_NODES; k++) {
    s.push(g(`amp_node${k}_level`, 'cont', 'linear', -80, 24));   // dB
    s.push(g(`amp_node${k}_time`, 'cont', 'linear', 0, 1));       // proportion
    s.push(g(`amp_node${k}_curve`, 'cont', 'linear', -1, 1));
    s.push(g(`amp_node${k}_tension`, 'cont', 'linear', 0, 1));
  }
  // Pitch — 35 (§3.1): identical structure to amp env plus pitch_master. Node
  // levels are cents OFFSETS (±9600). pitch_master is cents above 0.01 Hz.
  s.push(g('pitch_env_on', 'binary'));
  s.push(g('pitch_env_n_nodes', 'int', 'linear', 2, 8));
  s.push(g('pitch_master', 'cont', 'linear', 0, 25100));           // 0.01 Hz – 20 kHz
  for (let k = 0; k < ENV_MAX_NODES; k++) {
    s.push(g(`pitch_node${k}_level`, 'cont', 'linear', -9600, 9600)); // cents
    s.push(g(`pitch_node${k}_time`, 'cont', 'linear', 0, 1));
    s.push(g(`pitch_node${k}_curve`, 'cont', 'linear', -1, 1));
    s.push(g(`pitch_node${k}_tension`, 'cont', 'linear', 0, 1));
  }
  // Modulation — 6 (§3.1). Sources are absolute slot indices (0–63).
  s.push(g('pm_source', 'int', 'linear', 0, 63));
  s.push(g('pm_depth', 'cont', 'log', 0.001, 32));
  s.push(g('pm_on', 'binary'));
  s.push(g('am_source', 'int', 'linear', 0, 63));
  s.push(g('am_depth', 'cont', 'log', 0.001, 8));
  s.push(g('am_on', 'binary'));
  // Per-wave meta — 3 (§3.1 + P1). sigma_wave is a step-size (self-adaptive ES),
  // p_mutate_wave modulates how many of this wave's genes get a draw (§6.2).
  s.push(g('sigma_wave', 'sigma', 'linear', 0.002, 0.5));  // Appendix SIGMA_FLOOR/CEIL
  s.push(g('p_mutate_wave', 'cont', 'linear', 0, 1));
  // p_ratio_jump_wave (P1, V2-PROPOSALS): per-wave probability that a pitch- or
  // time-domain gene, when mutated, takes a STRUCTURED RATIO JUMP onto a simple
  // fraction of the §5 set rather than the ES Gaussian step (§6.2). A self-adaptive
  // meta-gene "in the pattern of sigma_wave / p_mutate_wave" — the search turns the
  // bias up where ratio moves pay and down where they do not, which is the complete
  // answer to the §2.2 worry (a bias the system can evolve away is a prior on moves,
  // not an instrument with an opinion). APPENDED (not inserted) so all earlier
  // per-wave indices are unchanged; the global scale is p_ratio_jump_scale. Init is
  // set in priors.js (the Gate 2b sweep chooses the default). Amplitude/gain genes
  // are out of scope (not periods, P1) and never see a ratio jump.
  s.push(g('p_ratio_jump_wave', 'cont', 'linear', 0, 1));
  return s;
}

// Global genes (§3.2). The 8 non-visual genes are load-bearing; the 14
// visualiser genes are inert in the headless build (no gate reads them) but are
// carried so the genome is complete and the visualiser (§11) can read them.
function buildGlobalSchema() {
  const s = [];
  s.push(g('fundamental_cents', 'cont', 'linear', 0, 25100)); // §5.1(1): range set to the pitch range (see priors.js)
  s.push(g('tempo_bpm', 'cont', 'log', 30, 300));             // §3.2 range; §5.1(5) draw = log-uniform
  s.push(g('sigma_global', 'sigma', 'linear', 0.002, 0.5));   // global step size (§6.2)
  s.push(g('p_duplicate', 'cont', 'linear', 0, 1));           // §6.3 trigger prob (init 0.08)
  s.push(g('p_switch_flip_scale', 'cont', 'linear', 0, 4));   // §6.2b scale on base 0.004; init 1.0 (see priors.js §5.1(8))
  s.push(g('n_partners', 'cont', 'linear', 1, 8));            // §6.8 how MANY partners (init 1.4)
  s.push(g('partner_influence', 'cont', 'linear', 0, 0.5));   // §6.8 how MUCH from partners (init 0.15)
  s.push(g('mutation_fraction', 'cont', 'linear', 0, 1));     // §6.2 proportion of genes drawn
  // 14 visualiser genes (§11). Ranges are the implementer's proposal (§5.1(9),
  // §11.1) — visual only, so provisional and reactable. Recorded in the report.
  s.push(g('hue_base', 'cont', 'linear', 0, 1));
  s.push(g('hue_spread', 'cont', 'linear', 0, 1));
  s.push(g('saturation', 'cont', 'linear', 0, 1));
  s.push(g('luminance_floor', 'cont', 'linear', 0, 0.5));
  s.push(g('ripple_gain', 'cont', 'linear', 0, 1));
  s.push(g('bloom_radius', 'cont', 'linear', 0, 1));
  s.push(g('motion_damping', 'cont', 'linear', 0, 1));
  s.push(g('particle_density', 'cont', 'linear', 0, 1));
  s.push(g('edge_softness', 'cont', 'linear', 0, 1));
  s.push(g('pitch_to_hue_weight', 'cont', 'linear', 0, 1));
  s.push(g('amp_to_scale_weight', 'cont', 'linear', 0, 1));
  s.push(g('symmetry_order', 'int', 'linear', 1, 8));
  s.push(g('field_blend_mode', 'int', 'linear', 0, 3));
  s.push(g('background_drift', 'cont', 'linear', 0, 1));
  // p_ratio_jump_scale (P1, V2-PROPOSALS): the GLOBAL SCALE on the per-wave
  // p_ratio_jump_wave (effective per-wave probability = wave × scale, clamped to
  // [0,1]) — same shape as p_switch_flip_scale scaling the per-class switch rate
  // (§6.2b). It also governs the two global pitch/time genes (fundamental_cents,
  // tempo_bpm). Evolvable; init 1.0 (neutral). APPENDED at the end so v1→v2
  // migration only adds one global (src/migrate.js).
  s.push(g('p_ratio_jump_scale', 'cont', 'linear', 0, 4));
  return s;
}

export const WAVE_SCHEMA = buildWaveSchema();
export const GLOBAL_SCHEMA = buildGlobalSchema();
export const GENES_PER_WAVE = WAVE_SCHEMA.length;          // 95
export const GLOBAL_COUNT = GLOBAL_SCHEMA.length;          // 22 (see contradiction note above)
export const GENOME_SIZE = WAVE_SLOTS * GENES_PER_WAVE + GLOBAL_COUNT;

// Fast name → within-wave index, and name → global index.
export const WAVE_INDEX = Object.fromEntries(WAVE_SCHEMA.map((d, i) => [d.name, i]));
export const GLOBAL_INDEX = Object.fromEntries(GLOBAL_SCHEMA.map((d, i) => [d.name, i]));

// Which of the 95 per-wave genes are the 12 kill switches (§3.3): active,
// gain_out_on, gain_mod_on, 4 shape switches, mid_wait_on, amp_env_on,
// pitch_env_on, pm_on, am_on = 12 per wave, 768 total.
export const SWITCH_NAMES = [
  'active', 'gain_out_on', 'gain_mod_on',
  'shape_sine_on', 'shape_triangle_on', 'shape_saw_on', 'shape_square_on',
  'mid_wait_on', 'amp_env_on', 'pitch_env_on', 'pm_on', 'am_on',
];
export const SWITCH_WAVE_INDICES = SWITCH_NAMES.map((n) => WAVE_INDEX[n]);

// Reflect a value into [0,1] at the bounds (§3: "reflection, not clamping").
// WHY reflection: clamping piles probability mass onto the exact boundary, which
// biases genes that mutate near a bound toward that bound. Reflection preserves
// the step distribution's shape and keeps the walk exploratory at the edges.
export function reflect01(v) {
  // Handle arbitrarily large excursions by folding repeatedly.
  if (v >= 0 && v <= 1) return v;
  // Map into a period-2 triangle wave with peaks at 0 and 1.
  let x = Math.abs(v) % 2;
  return x <= 1 ? x : 2 - x;
}

// The genome itself. A flat Float32Array keeps memory tight (~24 KB, §12) and
// makes delta storage (§14) a simple index/value scan.
export class Genome {
  constructor() {
    this.data = new Float32Array(GENOME_SIZE);
    // Metadata carried alongside the raw genes but not part of the 6,10x count.
    // These are needed by fitness/provenance (§8.2) and logging (§14) and are
    // set by the variation pipeline at birth.
    this.id = null;              // content hash, assigned lazily (see hash())
    this.src = null;             // Int8Array[64]: which parent supplied each slot (§6.8)
    this.contrib = null;         // { ancestorId: inheritedFraction } (§8.2)
    this.parentIds = [];         // prime parent first, then partners
  }

  // Stored value of the wth wave's named gene.
  getWaveStored(w, name) {
    return this.data[w * GENES_PER_WAVE + WAVE_INDEX[name]];
  }
  setWaveStored(w, name, v) {
    this.data[w * GENES_PER_WAVE + WAVE_INDEX[name]] = reflect01(v);
  }
  getGlobalStored(name) {
    return this.data[WAVE_SLOTS * GENES_PER_WAVE + GLOBAL_INDEX[name]];
  }
  setGlobalStored(name, v) {
    this.data[WAVE_SLOTS * GENES_PER_WAVE + GLOBAL_INDEX[name]] = reflect01(v);
  }

  // Mapped (declared-unit) value of a per-wave gene.
  getWave(w, name) {
    const d = WAVE_SCHEMA[WAVE_INDEX[name]];
    return mapValue(d, this.data[w * GENES_PER_WAVE + WAVE_INDEX[name]]);
  }
  getGlobal(name) {
    const d = GLOBAL_SCHEMA[GLOBAL_INDEX[name]];
    return mapValue(d, this.data[WAVE_SLOTS * GENES_PER_WAVE + GLOBAL_INDEX[name]]);
  }

  // Is the wth wave's named switch on? on = stored ≥ 0.5.
  isOn(w, name) {
    return this.data[w * GENES_PER_WAVE + WAVE_INDEX[name]] >= 0.5;
  }

  clone() {
    const c = new Genome();
    c.data.set(this.data);
    // src/contrib/parentIds are re-established by the variation pipeline; a raw
    // clone (used by mutation-only breeding before provenance is set) copies none.
    return c;
  }

  // A stable content hash of the raw gene array, used as genome_id (§14) and by
  // the repeat cooldown (§8.5). FNV-1a over the Float32Array's bytes.
  hash() {
    const bytes = new Uint8Array(this.data.buffer);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
    // Return as an unsigned hex string.
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

// Map a stored [0,1] value to its declared range for a given gene descriptor.
export function mapValue(d, stored) {
  const s = reflect01(stored); // defensive: stored should already be in range
  const { type, lo, hi } = d.map || {};
  if (d.kind === 'binary') return s >= 0.5 ? 1 : 0;
  if (d.kind === 'int') {
    // n distinct integers lo..hi inclusive; split [0,1] into (hi-lo+1) bins.
    const n = hi - lo + 1;
    let v = lo + Math.floor(s * n);
    if (v > hi) v = hi; // s can be exactly 1.0 after reflection
    return v;
  }
  if (type === 'log') {
    // value = lo · (hi/lo)^s. lo>0 guaranteed by the schema for log genes.
    return lo * Math.pow(hi / lo, s);
  }
  // linear (also covers dB / cents / proportion / curve / tension — same map,
  // different unit label; the unit conversion happens at point of use).
  return lo + s * (hi - lo);
}

// Inverse of mapValue: declared value → stored [0,1]. Used by the priors (§5)
// to set genes from natural units (Hz, dB, seconds) and by any code that wants
// to write a specific declared value. For int genes it returns the bin CENTRE so
// the value round-trips through mapValue.
export function inverseMap(d, value) {
  const { type, lo, hi } = d.map || {};
  if (d.kind === 'binary') return value ? 1 : 0;
  if (d.kind === 'int') {
    const n = hi - lo + 1;
    const v = Math.max(lo, Math.min(hi, Math.round(value)));
    return (v - lo + 0.5) / n; // bin centre
  }
  if (type === 'log') {
    const clamped = Math.max(lo, Math.min(hi, value));
    return Math.log(clamped / lo) / Math.log(hi / lo);
  }
  const clamped = Math.max(lo, Math.min(hi, value));
  return (clamped - lo) / (hi - lo);
}

// Convenience for tests / logging: number of not-kill switches that are "on",
// i.e. the complexity measure used by parsimony (§7.4) and logged as `complexity`
// (§14.1). "Complexity = count of not-kill switches" (vault). We read it as the
// count of switches currently ON, since that is what expresses structure.
export function complexity(genome) {
  let c = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) {
    for (const name of SWITCH_NAMES) {
      if (genome.isOn(w, name)) c++;
    }
  }
  return c;
}
