// loudness.js — integrated-loudness normalisation (§4.7).
//
// WHY this is not cosmetic (§4.7): without it, dwell would partly measure
// loudness, loudness is trivially evolvable (a few gain genes moving together),
// and the search would discover "louder holds attention" and let it swamp every
// structural discovery. Normalising to a fixed integrated loudness removes that
// confound. It is a MEASUREMENT SAFEGUARD, an instrument (§2.2) — so it must not
// encode any taste about which sounds win, and it does not: it standardises how
// a Creature is PRESENTED, never what can be produced (§4.7 invariant check).
//
// Loudness, not peak (§4.7): this design deliberately produces wide density
// variation, so peak normalisation would make sparse Creatures inaudible and
// dense ones blaring at the same peak. Integrated loudness with BS.1770 gating
// measures "how loud it is WHEN it is making sound", which is the right instrument
// for sparse material.
//
// Hand-rolled per the no-dependency rule (§12). The K-weighting biquad
// coefficients are generated for the actual sample rate (bilinear transform of
// the ITU analog prototype), so this is correct at 44.1 kHz and 22.05 kHz, not
// just the 48 kHz the standard tabulates.

const ABS_GATE_LUFS = -70;       // BS.1770 absolute gate
const REL_GATE_LU = -10;         // BS.1770 relative gate, −10 LU below ungated
const TARGET_LUFS = -20;         // §4.7 target
const TRUE_PEAK_CEIL_DBTP = -1;  // §4.7 true-peak ceiling
const SILENCE_FLOOR_LUFS = -60;  // §4.7 near-silence floor

// Build the two K-weighting biquads for a given sample rate. Direct-form
// transposed II coefficients (b0,b1,b2,a1,a2), a0 normalised to 1.
function kWeightingFilters(fs) {
  // Stage 1 — high-shelf ("pre-filter", models the head).
  const db = 3.999843853973347;
  const f0 = 1681.9744509555319;
  const Q1 = 0.7071752369554193;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, db / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q1 + K * K;
  const s1 = {
    b0: (Vh + (Vb * K) / Q1 + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q1 + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q1 + K * K) / a0,
  };
  // Stage 2 — high-pass (RLB weighting).
  const f0b = 38.13547087613982;
  const Q2 = 0.5003270373253953;
  K = Math.tan(Math.PI * f0b / fs);
  a0 = 1 + K / Q2 + K * K;
  const s2 = {
    b0: 1.0,
    b1: -2.0,
    b2: 1.0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q2 + K * K) / a0,
  };
  return [s1, s2];
}

function biquad(x, c) {
  const y = new Float64Array(x.length);
  let z1 = 0, z2 = 0; // transposed direct form II state
  for (let n = 0; n < x.length; n++) {
    const xn = x[n];
    const yn = c.b0 * xn + z1;
    z1 = c.b1 * xn - c.a1 * yn + z2;
    z2 = c.b2 * xn - c.a2 * yn;
    y[n] = yn;
  }
  return y;
}

// Mean-square per 400 ms block, 75% overlap (100 ms step). Returns arrays of
// block mean-squares and their loudnesses in LUFS.
function blockLoudness(z, fs, blockS, stepS) {
  const blockN = Math.max(1, Math.round(blockS * fs));
  const stepN = Math.max(1, Math.round(stepS * fs));
  const ms = [];
  const l = [];
  for (let start = 0; start + blockN <= z.length; start += stepN) {
    let acc = 0;
    for (let n = start; n < start + blockN; n++) acc += z[n] * z[n];
    const m = acc / blockN;
    ms.push(m);
    // Mono, single channel weight 1.0. −0.691 is the BS.1770 offset.
    l.push(m > 0 ? -0.691 + 10 * Math.log10(m) : -Infinity);
  }
  return { ms, l, blockN, stepN };
}

// Gated integrated loudness (§4.7). Returns null if undefined (no block passes
// the absolute gate — genuinely silent), which the caller treats as near_silent.
function integratedLoudness(z, fs) {
  const { ms, l } = blockLoudness(z, fs, 0.4, 0.1);
  if (ms.length === 0) return null;
  // Absolute gate.
  const passAbs = [];
  for (let i = 0; i < l.length; i++) if (l[i] >= ABS_GATE_LUFS) passAbs.push(i);
  if (passAbs.length === 0) return null;
  // Relative gate = −10 LU below the mean loudness of abs-gated blocks.
  let meanZ = 0;
  for (const i of passAbs) meanZ += ms[i];
  meanZ /= passAbs.length;
  const relThresh = (-0.691 + 10 * Math.log10(meanZ)) + REL_GATE_LU;
  const passRel = [];
  for (const i of passAbs) if (l[i] >= relThresh) passRel.push(i);
  if (passRel.length === 0) return null;
  let meanZ2 = 0;
  for (const i of passRel) meanZ2 += ms[i];
  meanZ2 /= passRel.length;
  return -0.691 + 10 * Math.log10(meanZ2);
}

// Loudness range (LRA, EBU Tech 3342) — a diagnostic (§4.7 logs loudness_range_lu).
// Short-term (3 s) loudness, abs gate −70, relative gate −20 LU, then P95−P10.
function loudnessRange(z, fs) {
  const { l } = blockLoudness(z, fs, 3.0, 0.1);
  const passAbs = l.filter((x) => x >= ABS_GATE_LUFS && Number.isFinite(x));
  if (passAbs.length < 2) return 0;
  // Relative gate at −20 LU below the mean of abs-gated short-term blocks.
  const meanLin = passAbs.reduce((a, x) => a + Math.pow(10, x / 10), 0) / passAbs.length;
  const relThresh = 10 * Math.log10(meanLin) - 20;
  const gated = passAbs.filter((x) => x >= relThresh).sort((a, b) => a - b);
  if (gated.length < 2) return 0;
  const pct = (p) => gated[Math.min(gated.length - 1, Math.max(0, Math.round((p / 100) * (gated.length - 1))))];
  return pct(95) - pct(10);
}

// 4× oversampled true peak in dBTP (§4.7, "4× oversampled detection"). Uses a
// short windowed-sinc polyphase interpolation. Approximate but adequate: its only
// effects are a logged value and, if it exceeds the ceiling, a small static gain
// reduction (§4.7) — it is not gate-critical.
function truePeakDbtp(x) {
  const OS = 4;
  // Per-phase half-length. 4 taps (8-tap kernel) is a rough but adequate
  // inter-sample peak estimate: its only effect is a logged value and a small
  // static gain reduction (§4.7), never a gate decision — so accuracy is traded
  // for speed across the many-render gates.
  const TAPS = 4;
  // Precompute polyphase windowed-sinc coefficients.
  const phases = [];
  for (let p = 0; p < OS; p++) {
    const frac = p / OS;
    const coeffs = new Float64Array(2 * TAPS);
    let sum = 0;
    for (let k = -TAPS; k < TAPS; k++) {
      const t = k - frac;
      let s;
      if (Math.abs(t) < 1e-9) s = 1;
      else s = Math.sin(Math.PI * t) / (Math.PI * t);
      // Hann window over the [−TAPS, TAPS) support, tapering the sinc's tails.
      const c = s * (0.5 - 0.5 * Math.cos((Math.PI * (k + TAPS)) / TAPS));
      coeffs[k + TAPS] = c;
      sum += c;
    }
    for (let i = 0; i < coeffs.length; i++) coeffs[i] /= sum || 1; // unity DC gain
    phases.push(coeffs);
  }
  let peak = 0;
  const N = x.length;
  for (let n = 0; n < N; n++) {
    for (let p = 0; p < OS; p++) {
      const c = phases[p];
      let acc = 0;
      for (let k = -TAPS; k < TAPS; k++) {
        const idx = n + k;
        if (idx >= 0 && idx < N) acc += x[idx] * c[k + TAPS];
      }
      const a = Math.abs(acc);
      if (a > peak) peak = a;
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

// Normalise a raw render buffer in place (§4.7). Returns the loudness log fields
// (§14.1) and the possibly-rescaled buffer (same array reference for efficiency).
export function normalizeLoudness(samples, sampleRate) {
  const filters = kWeightingFilters(sampleRate);
  let z = samples;
  for (const c of filters) z = biquad(z, c);

  const lufsBefore = integratedLoudness(z, sampleRate);
  const loudnessRangeLu = lufsBefore === null ? 0 : loudnessRange(z, sampleRate);

  // Near-silence path (§4.7): if integrated loudness is undefined or below the
  // −60 LUFS floor, do NOT normalise — silence must score on its own merits, not
  // be amplified into hiss. Play as-is and flag near_silent.
  if (lufsBefore === null || lufsBefore < SILENCE_FLOOR_LUFS) {
    return {
      samples,
      lufs_before: lufsBefore === null ? null : round2(lufsBefore),
      lufs_after: lufsBefore === null ? null : round2(lufsBefore),
      true_peak_dbtp: round2(truePeakDbtp(samples)),
      gain_applied_db: 0,
      static_reduction_db: 0,
      loudness_range_lu: round2(loudnessRangeLu),
      near_silent: true,
    };
  }

  // Loudness normalisation: one scalar to hit −20 LUFS integrated.
  const gainDb = TARGET_LUFS - lufsBefore;
  const gainLin = Math.pow(10, gainDb / 20);
  for (let n = 0; n < samples.length; n++) samples[n] *= gainLin;

  // True-peak overshoot handled by STATIC gain reduction, never a limiter
  // (§4.7): a limiter would alter timbre selectively on high-crest material —
  // a structural bias on one region of the space, which is the thing this
  // project guards hardest against (§2.1). Static gain is transparent.
  let tpAfter = truePeakDbtp(samples);
  let staticReductionDb = 0;
  if (tpAfter > TRUE_PEAK_CEIL_DBTP) {
    staticReductionDb = TRUE_PEAK_CEIL_DBTP - tpAfter; // negative
    const red = Math.pow(10, staticReductionDb / 20);
    for (let n = 0; n < samples.length; n++) samples[n] *= red;
    tpAfter = TRUE_PEAK_CEIL_DBTP;
  }

  return {
    samples,
    lufs_before: round2(lufsBefore),
    lufs_after: round2(lufsBefore + gainDb + staticReductionDb),
    true_peak_dbtp: round2(tpAfter),
    gain_applied_db: round2(gainDb),
    static_reduction_db: round2(staticReductionDb),
    loudness_range_lu: round2(loudnessRangeLu),
    near_silent: false,
  };
}

function round2(x) {
  if (x === null || !Number.isFinite(x)) return x;
  return Math.round(x * 100) / 100;
}
