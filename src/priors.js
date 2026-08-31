// priors.js — initialisation (§5) and the undesigned priors of §5.1.
//
// GOVERNING RULE (§2.1, vastness-is-the-point): every value here biases the
// INITIAL DRAW only. None of it removes a region from reach. The declared gene
// ranges in genome.js define the space; these draws only decide where the search
// starts looking. Wherever a choice was genuinely absent from the spec (§5.1),
// it is marked "§5.1(n) CHOICE" and is PROVISIONAL — reproduced in the report so
// the owner can overrule it. The system's whole premise is that we do not know
// what will score, so these are bets on where to *start*, never on what wins.

import {
  Genome, WAVE_SLOTS, ENV_MAX_NODES, WAVE_SCHEMA, WAVE_INDEX, GLOBAL_SCHEMA,
  GLOBAL_INDEX, inverseMap,
} from './genome.js';

// P1 (V2-PROPOSALS): provisional init for the ratio-jump bias. p_ratio_jump_wave
// is init to this (the per-wave probability that a mutated pitch/time gene takes a
// structured ratio jump); p_ratio_jump_scale is init 1.0 (neutral global scale).
// PROVISIONAL — the Gate 2b sweep {0, 0.05, 0.15, 0.3} chooses the shipped default,
// which is written back here. Recorded in the v2 report and SPEC-DELTA-V2.
export const P_RATIO_JUMP_INIT = 0.3;   // Gate 2b sweep default: largest value passing with margin
export const P_RATIO_JUMP_SCALE_INIT = 1.0;

// ── helpers ──────────────────────────────────────────────────────────────────

// Write a declared-unit value into a per-wave gene by inverting the map.
function setWave(gn, w, name, value) {
  const d = WAVE_SCHEMA[WAVE_INDEX[name]];
  gn.data[w * WAVE_SCHEMA.length + WAVE_INDEX[name]] = inverseMap(d, value);
}
function setWaveStored(gn, w, name, stored) {
  gn.data[w * WAVE_SCHEMA.length + WAVE_INDEX[name]] = stored;
}
function setGlobal(gn, name, value) {
  const d = GLOBAL_SCHEMA[GLOBAL_INDEX[name]];
  gn.data[WAVE_SLOTS * WAVE_SCHEMA.length + GLOBAL_INDEX[name]] = inverseMap(d, value);
}

// Convert a frequency in Hz to "cents above 0.01 Hz" (the pitch_master unit, §3.1).
function hzToCents(hz) {
  return 1200 * Math.log2(hz / 0.01);
}

// A Gaussian draw in a declared unit, reflected into [lo, hi] via clamp-free
// folding, then handed to the caller. Used for the envelope-node priors so that
// a bias toward (say) audible levels does not make quiet or loud levels
// unreachable — the tails still reach the whole declared range.
function foldGaussian(rng, mean, sd, lo, hi) {
  let v = mean + sd * rng.gaussian();
  // Fold into [lo,hi] (reflection in declared units mirrors §3's stored-space rule).
  const span = hi - lo;
  let x = (v - lo) % (2 * span);
  if (x < 0) x += 2 * span;
  v = x <= span ? lo + x : hi - (x - span);
  return v;
}

// ── the shape prior (§5.1(3) CHOICE) ─────────────────────────────────────────
// Favour FEW enabled shapes. Enabling all four at p=0.5 with uniform weights
// makes most waves a blend that averages toward the sine-ish (§5.1(3)), which is
// a far narrower timbral palette than it looks. Drawing a small count of enabled
// shapes yields more distinct timbres at generation zero. Every combination
// remains reachable by switch flips, so this narrows nothing (§2.1).
const SHAPE_NAMES = ['sine', 'triangle', 'saw', 'square'];
function drawShapes(rng, gn, w) {
  // Number of enabled shapes: 1 (.60), 2 (.30), 3 (.08), 4 (.02).
  const r = rng.next();
  let nEnabled = 1;
  if (r > 0.98) nEnabled = 4;
  else if (r > 0.90) nEnabled = 3;
  else if (r > 0.60) nEnabled = 2;
  // Choose which shapes are enabled, uniformly without replacement.
  const idx = [0, 1, 2, 3];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const enabled = new Set(idx.slice(0, nEnabled));
  for (let k = 0; k < 4; k++) {
    const name = SHAPE_NAMES[k];
    setWave(gn, w, `shape_${name}_on`, enabled.has(k) ? 1 : 0);
    // Enabled weight in [0.3,1] so an enabled shape actually contributes; a
    // disabled shape still carries a neutral weight it can express if flipped on.
    setWave(gn, w, `shape_${name}`, enabled.has(k) ? rng.uniform(0.3, 1.0) : rng.uniform(0, 1));
  }
}

// ── the envelope-node prior (§5.1(2) CHOICE) ─────────────────────────────────
// The spec calls this "the largest single gap" because the sine-wave-speech
// argument (§12) puts sonic complexity in time-varying envelopes, and the
// default (uniform in stored space) puts the average amplitude node at ≈ −28 dB
// with enormous variance — i.e. mostly near-silent. CHOICES:
//   amp level:  Gaussian in dB, mean 0 dB, sd 12 dB  → audible but varied
//   amp curve:  Gaussian mean 0, sd 0.4              → mostly near-linear
//   amp tension:Gaussian mean 0.5, sd 0.2
//   pitch level:Gaussian in cents, mean 0, sd 200    → mostly small pitch motion
//   node times: uniform (they are sum-normalised anyway, §3.1)
// All are folded into their declared ranges, so the extremes (−80 dB, ±9600
// cents) remain reachable — the bias is on where to start, not on what exists.
function drawEnvNodes(rng, gn, w, kind /* 'amp' | 'pitch' */) {
  const isAmp = kind === 'amp';
  const prefix = isAmp ? 'amp_node' : 'pitch_node';
  for (let k = 0; k < ENV_MAX_NODES; k++) {
    if (isAmp) {
      setWave(gn, w, `${prefix}${k}_level`, foldGaussian(rng, 0, 12, -80, 24)); // dB
    } else {
      setWave(gn, w, `${prefix}${k}_level`, foldGaussian(rng, 0, 200, -9600, 9600)); // cents
    }
    setWaveStored(gn, w, `${prefix}${k}_time`, rng.next());                  // uniform proportion
    setWave(gn, w, `${prefix}${k}_curve`, foldGaussian(rng, 0, 0.4, -1, 1));
    setWave(gn, w, `${prefix}${k}_tension`, foldGaussian(rng, 0.5, 0.2, 0, 1));
  }
}

// ── the pitch prior (§5, mixture) ────────────────────────────────────────────
// r ∝ 1/r over the stated harmonic ratio set (§5).
const HARM_RATIOS = [1, 2, 3, 4, 5, 6, 7, 8, 1 / 2, 1 / 3, 1 / 4, 3 / 2, 5 / 4, 5 / 3];
const HARM_WEIGHTS = HARM_RATIOS.map((r) => 1 / r);
function drawPitchMaster(rng, gn, w, fundamentalCents) {
  const u = rng.next();
  let cents;
  if (u < 0.65) {
    // Harmonic: fundamental + 1200·log2(r).
    const r = HARM_RATIOS[rng.weightedIndex(HARM_WEIGHTS)];
    cents = fundamentalCents + 1200 * Math.log2(r);
  } else if (u < 0.90) {
    // Uniform over the ENTIRE declared range (§5: "no pitch is unreachable").
    cents = rng.uniform(0, 25100);
  } else {
    // Log-uniform 0.01–20 Hz sub-audio / audio band.
    cents = hzToCents(rng.logUniform(0.01, 20));
  }
  setWave(gn, w, 'pitch_master', cents);
}

// ── the time prior (§5), v2 (P3) ─────────────────────────────────────────────
// The v2 timing genes are period / duty / pre_prop, but the PRIOR is still
// expressed in the v1 (pre_wait, duration, mid_wait) terms and then converted, so
// generation-zero timing has exactly the v1 distribution — P3 changes the MUTATION
// geometry (§6), not where the search starts (§5). Keeping the init distribution
// identical avoids introducing an unreviewed timing prior and keeps the §5.2 sanity
// numbers comparable to v1. PROVISIONAL choice, recorded in the v2 report.
//
// A wait draw: with prob 0.6 snap to (60/tempo)·q, else log-uniform full range.
const TIME_QUANTA = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 1, 3 / 2, 2, 3, 4];
function drawWaitSeconds(rng, tempoBpm, maxS) {
  if (rng.bool(0.6)) {
    const q = rng.pick(TIME_QUANTA);
    let v = (60 / tempoBpm) * q;
    if (v > maxS) v = maxS; // fold into range (declared max)
    return v;
  }
  return rng.logUniform(0.0005, maxS);
}

// Draw the v1 (pre_wait, duration, mid_wait) seconds exactly as v1 did, then write
// the v2 period/duty/pre_prop that reproduce them (period = dur+mid, duty =
// dur/period, pre_prop = pre/period — the P3 migration, applied at draw time).
function drawTiming(rng, gn, w, tempoBpm) {
  const preS = drawWaitSeconds(rng, tempoBpm, 30);
  const midS = drawWaitSeconds(rng, tempoBpm, 30);
  // duration: bimodal 50% short (5–200 ms) / 50% long (0.5–120 s), as v1.
  const durS = rng.bool(0.5) ? rng.logUniform(0.005, 0.200) : rng.logUniform(0.5, 120);
  const period = durS + midS;
  setWave(gn, w, 'period', period);
  setWave(gn, w, 'duty', period > 0 ? durS / period : 1);
  setWave(gn, w, 'pre_prop', period > 0 ? preS / period : 0);
}

// ── the main entry point ─────────────────────────────────────────────────────

// Init activation probability (§5, Appendix P_ACTIVE_AT_INIT). Retained for the F3
// comparison batches (which pass an explicit `pActive` to compare per-slot rates);
// NO LONGER the default generation-zero path — F10 (below) replaces the default.
export const P_ACTIVE_AT_INIT = 0.03;

// F10 (owner ruling, V2-PROPOSALS "Owner rulings, 2026-08-31 evening"): the
// generation-zero wave count is an explicit RANGE draw, not a per-slot coin. The
// owner's F3 audition found 1–3-wave creatures samey and wanted denser starts on
// the table. Default init now draws n_active uniform in 1..10, then chooses which
// slots — a bet on where to START (more waves audible at generation zero), never a
// change to what can exist (§2.1, vastness-is-the-point): every wave-count and
// every slot combination stays reachable, the per-wave kill-switch stays evolvable,
// and the MIN_ACTIVE = 1 floor is untouched (n_active ≥ 1). PROVISIONAL bound (1..10).
export const N_ACTIVE_MIN = 1;
export const N_ACTIVE_MAX = 10;

// Draw one genome from the priors. `rng` is a seeded RNG (rng.js) so the draw is
// reproducible. Activation options (all INIT-DRAW BIAS ONLY — none removes a region
// from reach, §2.1):
//   opts.nActive — force an exact active-wave count (W1 exploration batch).
//   opts.pActive — legacy per-slot activation probability (F3 comparison batches).
//   (neither given) — F10 default: n_active uniform in [N_ACTIVE_MIN, N_ACTIVE_MAX].
export function randomGenome(rng, opts = {}) {
  const gn = new Genome();

  // ---- Global genes first (some per-wave priors depend on them) ----

  // §5.1(1) CHOICE — fundamental_cents. Range is the full pitch range 0..25100
  // (declared in genome.js), so nothing is unreachable. INIT DRAW: a fundamental
  // frequency drawn log-uniform in [50, 400] Hz, converted to cents. This seats
  // the harmonic series (65% of pitch draws) in a musical bass/low-mid register
  // where generation-zero material is most likely to be "worth hearing" (Gate
  // 1a), while leaving the whole range reachable by mutation. PROVISIONAL.
  const fundamentalCents = hzToCents(rng.logUniform(50, 400));
  setGlobal(gn, 'fundamental_cents', fundamentalCents);

  // §5.1(5) CHOICE — tempo_bpm log-uniform 30..300 (the natural choice the spec
  // suggests; tempo is perceptually logarithmic). The gene's map is already log,
  // so a uniform stored draw yields a log-uniform tempo.
  setWaveStoredGlobal(gn, 'tempo_bpm', rng.next());
  const tempoBpm = gn.getGlobal('tempo_bpm');

  // §5.1(8) CHOICE — unspecified global inits.
  setGlobal(gn, 'sigma_global', 0.05);            // Appendix SIGMA_INIT
  setGlobal(gn, 'p_duplicate', 0.08);             // §6.3 init
  setGlobal(gn, 'p_switch_flip_scale', 1.0);      // factor 1.0 → base rate unscaled (§6.2b)
  setGlobal(gn, 'n_partners', 1.4);               // §6.8 init
  setGlobal(gn, 'partner_influence', 0.15);       // §6.4 / §6.8 init
  // mutation_fraction init 1.0: neutral material should mutate freely (§2.6), and
  // the effective per-gene rate is mutation_fraction × p_mutate_wave (init 0.3),
  // so a full fraction still only touches ~30% of a wave's genes per event.
  setGlobal(gn, 'mutation_fraction', 1.0);        // §5.1(8) CHOICE, PROVISIONAL
  setGlobal(gn, 'p_ratio_jump_scale', P_RATIO_JUMP_SCALE_INIT); // P1 global scale, init 1.0

  // §5.1(9) CHOICE — visualiser genes. Visual only (no gate reads them). Drawn
  // uniform in their declared ranges; ranges/mappings are the implementer's
  // proposal (§11.1) and reactable. PROVISIONAL.
  for (const d of GLOBAL_SCHEMA) {
    if (d.name.match(/^(hue_|saturation|luminance_|ripple_|bloom_|motion_|particle_|edge_|pitch_to_hue|amp_to_scale|symmetry_|field_blend|background_)/)) {
      setWaveStoredGlobal(gn, d.name, rng.next());
    }
  }

  // ---- Per-wave activation ----
  const activeFlags = new Array(WAVE_SLOTS).fill(false);
  if (opts.pActive != null) {
    // Legacy per-slot draw (F3 comparison batches): each slot active with prob
    // pActive, floor of 1 forced-active slot. Kept only for that comparison.
    let anyActive = false;
    for (let w = 0; w < WAVE_SLOTS; w++) {
      const on = rng.bool(opts.pActive);
      activeFlags[w] = on;
      if (on) anyActive = true;
    }
    if (!anyActive) activeFlags[rng.int(WAVE_SLOTS)] = true; // MIN_ACTIVE = 1
  } else {
    // F10 default (or W1's forced count): draw n_active, then choose that many
    // DISTINCT slots uniformly (partial Fisher–Yates). n_active ≥ 1 is the floor.
    let nActive = opts.nActive != null ? opts.nActive : (N_ACTIVE_MIN + rng.int(N_ACTIVE_MAX - N_ACTIVE_MIN + 1));
    if (nActive < 1) nActive = 1;
    if (nActive > WAVE_SLOTS) nActive = WAVE_SLOTS;
    const idx = Array.from({ length: WAVE_SLOTS }, (_, i) => i);
    for (let i = 0; i < nActive; i++) {
      const j = i + rng.int(WAVE_SLOTS - i);
      [idx[i], idx[j]] = [idx[j], idx[i]];
      activeFlags[idx[i]] = true;
    }
  }

  // ---- Per-wave genes for ALL slots ----
  // Neutral material (muted waves) is drawn from the same priors so that a slot
  // which later unmutes carries sensible content (§2.6 — neutral material is the
  // substrate of the search and must be plausible, not garbage).
  for (let w = 0; w < WAVE_SLOTS; w++) {
    setWave(gn, w, 'active', activeFlags[w] ? 1 : 0);

    // Destination switches (§5): gain_out_on p0.75, gain_mod_on p0.5 — so pure
    // modulators (out off / mod on) arise from the start.
    setWave(gn, w, 'gain_out_on', rng.bool(0.75) ? 1 : 0);
    setWave(gn, w, 'gain_mod_on', rng.bool(0.5) ? 1 : 0);

    // Shapes (§5.1(3) choice above).
    drawShapes(rng, gn, w);

    // Timing (§5). §5.1(6) CHOICE: pre_wait, duration and mid_wait are drawn
    // INDEPENDENTLY — deliberately, per the spec's stated option. Coupling them
    // ("don't emit a 5 ms click once every 30 s") would be a designer assumption
    // about what ought to be audible, i.e. a narrowing. The consequence — a
    // substantial fraction of waves inaudible in practice — is accepted and is
    // exactly what the §5.2 sanity check measures. PROVISIONAL (independence).
    // v2 (P3): drawn in v1 terms then written as period/duty/pre_prop (same
    // distribution, same RNG order — the init draw is unchanged, only the axes are).
    drawTiming(rng, gn, w, tempoBpm);
    // mid_wait_on (§5.1(8) CHOICE, unlisted): p0.5 — half the waves repeat,
    // giving rhythmic material; half play once. PROVISIONAL.
    setWave(gn, w, 'mid_wait_on', rng.bool(0.5) ? 1 : 0);
    // phase (§5.1(7) CHOICE): uniform [0,1].
    setWaveStored(gn, w, 'phase', rng.next());

    // gain_mod (§5): drawn log-uniform over a modest modulation-index range so a
    // wave used as a modulator starts at a usable depth; full range reachable.
    setWave(gn, w, 'gain_mod', rng.logUniform(0.1, 4));

    // Amplitude & pitch envelopes.
    // amp_env_on / pitch_env_on init (§5.1(8) CHOICE, unlisted): amp p0.6 (most
    // waves are shaped over time — the sine-wave-speech argument), pitch p0.25
    // (a minority glide). PROVISIONAL.
    setWave(gn, w, 'amp_env_on', rng.bool(0.6) ? 1 : 0);
    setWave(gn, w, 'pitch_env_on', rng.bool(0.25) ? 1 : 0);
    // Node counts drawn from {2,3} (§5); free to grow to 8 by mutation.
    setWave(gn, w, 'amp_env_n_nodes', rng.bool(0.5) ? 2 : 3);
    setWave(gn, w, 'pitch_env_n_nodes', rng.bool(0.5) ? 2 : 3);
    drawEnvNodes(rng, gn, w, 'amp');
    drawEnvNodes(rng, gn, w, 'pitch');

    // Pitch master (§5 mixture).
    drawPitchMaster(rng, gn, w, fundamentalCents);

    // Modulation (§5): pm_on p0.35, am_on p0.2; pm_depth log-uniform 0.1–2.0.
    // §5.1(8) CHOICE (unlisted): am_depth init log-uniform 0.1–2.0 too (the spec
    // gives no am_depth init; mirrors pm). Sources uniform 0–63. PROVISIONAL.
    setWave(gn, w, 'pm_on', rng.bool(0.35) ? 1 : 0);
    setWave(gn, w, 'am_on', rng.bool(0.2) ? 1 : 0);
    setWave(gn, w, 'pm_depth', rng.logUniform(0.1, 2.0));
    setWave(gn, w, 'am_depth', rng.logUniform(0.1, 2.0));
    setWaveStored(gn, w, 'pm_source', rng.next()); // uniform slot 0–63
    setWaveStored(gn, w, 'am_source', rng.next());

    // Per-wave meta (§3.1 init): sigma_wave 0.05, p_mutate_wave 0.3.
    setWave(gn, w, 'sigma_wave', 0.05);
    setWave(gn, w, 'p_mutate_wave', 0.3);
    // p_ratio_jump_wave (P1): per-wave ratio-jump probability, init provisional.
    setWave(gn, w, 'p_ratio_jump_wave', P_RATIO_JUMP_INIT);
  }

  // ---- Amplitude prior over the ACTIVE set (§5, §5.1(4) CHOICE) ----
  // "linear amplitude ∝ 1/k for the k-th active wave sorted by pitch." CHOICES:
  //   sort ASCENDING by pitch (lowest wave loudest) — a deliberate spectral
  //     decision (§5.1(4) notes it is undecided): loudest-lowest mimics the
  //     natural 1/f rolloff of most acoustic sources;
  //   amplitude_k = 1/k (k starts at 1, so k=1 → 0 dB, the reference);
  //   dB_k = 20·log10(1/k), mapped into the gain_out range [−80,+6] (§3.1).
  // Inactive waves get a neutral gain_out draw (Gaussian mean −12 dB) so an
  // unmuted slot is audible-but-not-dominant. PROVISIONAL (sort direction, k=1).
  const activeSorted = [];
  for (let w = 0; w < WAVE_SLOTS; w++) if (activeFlags[w]) activeSorted.push(w);
  activeSorted.sort((a, b) => gn.getWave(a, 'pitch_master') - gn.getWave(b, 'pitch_master'));
  for (let rank = 0; rank < activeSorted.length; rank++) {
    const k = rank + 1;                       // k=1 for the lowest-pitched wave
    const dB = 20 * Math.log10(1 / k);        // 0, −6.0, −9.5, −12.0, ...
    setWave(gn, activeSorted[rank], 'gain_out', dB);
  }
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (!activeFlags[w]) setWave(gn, w, 'gain_out', foldGaussian(rng, -12, 12, -80, 6));
  }

  gn.id = gn.hash();
  // Mutation-only provenance defaults (§8.2): a freshly drawn genome has no
  // parents; src/contrib are established when it is bred from.
  gn.src = null;
  gn.contrib = {};
  gn.parentIds = [];
  return gn;
}

// Small internal used above because Genome has no by-name global stored setter
// that takes a raw stored value; keep it local to avoid widening the public API.
function setWaveStoredGlobal(gn, name, stored) {
  gn.data[WAVE_SLOTS * WAVE_SCHEMA.length + GLOBAL_INDEX[name]] = stored;
}
