// descriptors.js — the two archive axes (§7.1) and the §5.2 sanity metrics.
//
// The axes are INSTRUMENTS (§2.2). They are chosen against the four neutral
// criteria in §7.1 — computed from SAMPLES, audible, a dimension variety is
// wanted along, approximately independent of fitness — and NOTHING ELSE. Neither
// axis is a prediction that sounds at any point on it will score better (§2.3):
// a drone may be tedious or transcendent, a developing sound engaging or chaotic.
// The axes exist to guarantee variety and make the archive legible, not to guess
// what wins. Descriptors outside the axis ranges are CLAMPED into edge cells,
// never discarded (§7.1, §2.1).

import { mfccSequence, meanVector, vecDist, fft } from './mfcc.js';

const N_COEFFS = 13;   // §7.1: "13-coefficient MFCC"
const N_SEGMENTS = 8;  // §7.1: "Divide the render into 8 equal segments"
const N_BINS = 16;     // §7.1: "16 bins" per axis → 16×16 = 256 cells

// ── Axis 1: temporal development (§7.1) ──────────────────────────────────────
// Mean pairwise Euclidean distance between the 8 segments' mean MFCC vectors.
// One end is a static drone (all segments alike → ~0), the other a sound whose
// character changes across its length.
export function developmentRaw(samples, sampleRate) {
  const frames = mfccSequence(samples, sampleRate, { nCoeffs: N_COEFFS });
  return developmentFromFrames(frames);
}

// Same measure, given a precomputed MFCC frame sequence — lets callers (Gate 2b)
// compute MFCC once and reuse it for development, heterogeneity and mean vectors.
export function developmentFromFrames(frames) {
  if (frames.length === 0) return 0;
  // Assign frames to segments by their index proportion.
  const segFrames = Array.from({ length: N_SEGMENTS }, () => []);
  for (let i = 0; i < frames.length; i++) {
    let seg = Math.floor((i / frames.length) * N_SEGMENTS);
    if (seg >= N_SEGMENTS) seg = N_SEGMENTS - 1;
    segFrames[seg].push(frames[i]);
  }
  // Mean vector per segment. A segment with no frames (very short render) inherits
  // a zero vector, which is a legitimate "no content here" and not special-cased.
  const segVecs = segFrames.map((f) => meanVector(f, N_COEFFS));
  let sum = 0, count = 0;
  for (let a = 0; a < N_SEGMENTS; a++) {
    for (let b = a + 1; b < N_SEGMENTS; b++) {
      sum += vecDist(segVecs[a], segVecs[b]);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ── Axis 2: harmonicity via spectral flatness (§7.1) ─────────────────────────
// Geometric mean of the power spectrum divided by its arithmetic mean, averaged
// over frames (Wiener entropy). One end pitched/tonal (flatness→0), the other
// noisy (flatness→1).
//
// v2.1 (V2-REPORT §5, HARM-AXIS FIX). This is an INSTRUMENT-LEGIBILITY fix, NOT a
// judgement about sound (§2.2, vastness-is-the-point): it changes only how the
// harmonicity axis READS near-pure tones, and narrows/rejects nothing.
//
// The v2 estimator added a FIXED absolute floor (eps = 1e-10) to every bin's power
// before the geometric mean. On a near-pure tone almost every bin is genuinely
// ~0 power, so the geometric mean collapsed onto eps itself and the flatness read
// ~1e-9 — the numerical floor of the estimator, not a harmonicity value. ~6% of
// random genomes piled onto that floor (measured), the harm distribution went
// bimodal, and the calibrated log axis stretched into estimator noise, so most
// mid-range sounds compressed into the top harm bins (§5). The fix is a RELATIVE
// noise floor: floor each bin at `HARM_FLOOR_REL × (mean raw bin power of the
// frame)` before both means. That makes a pure tone read a STABLE flatness of
// ≈ HARM_FLOOR_REL (scale-invariant — independent of the render's amplitude),
// comfortably above estimator noise, while a genuinely noisy frame (all bins
// comparable) is essentially unchanged. No value is snapped or quantised; the axis
// is only made legible. Belt-and-braces: the axis calibration also floors harm.min
// (HARM_AXIS_MIN_FLOOR) so a residual pure-tone reading still clamps cleanly into
// the drone/tonal edge bin instead of anchoring the log scale on noise.
export const HARM_FLOOR_REL = 1e-3;   // relative per-frame flatness floor (pure tone ≈ this)
export const HARM_AXIS_MIN_FLOOR = 1e-4; // belt-and-braces min for the harm axis calibration
export function harmonicityRaw(samples, sampleRate, opts = {}) {
  const win = opts.win || 1024;
  const hop = opts.hop || 512;
  const relFloor = opts.floorRel != null ? opts.floorRel : HARM_FLOOR_REL;
  const hann = hannWindow(win);
  const re = new Float64Array(win), im = new Float64Array(win);
  const pow = new Float64Array(win / 2 + 1);
  let flatnessSum = 0, nFrames = 0;
  for (let start = 0; start + win <= samples.length; start += hop) {
    for (let i = 0; i < win; i++) { re[i] = samples[start + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const nBins = win / 2 + 1;
    const nUsed = nBins - 1;
    // First pass: raw bin powers (skip DC) and their mean, to set a RELATIVE floor
    // that scales with this frame's energy (so the estimator is amplitude-invariant).
    let rawSum = 0;
    for (let k = 1; k < nBins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      pow[k] = p;
      rawSum += p;
    }
    // SILENT FRAMES CARRY NO HARMONIC INFORMATION, so they are EXCLUDED from the
    // average (not counted as tonal, not counted as noisy) — the harm axis then
    // reads the tonal↔noisy character of the AUDIBLE content only. This matters
    // because most renders are majority-silence (§5.2: median silence fraction
    // ~0.73): the v2 estimator's fixed eps made a silent frame read flatness 1
    // (noisy), so silence-dominated genomes wrongly piled at the noisy end; a naive
    // "silent→0" would just move the pile to the tonal end. Excluding them removes
    // both artefacts. Legibility only — nothing about what may exist (§2.2).
    const SILENT_FRAME_POW = 1e-12; // post-normalisation; real audio frames ≫ this
    if (!(rawSum / nUsed > SILENT_FRAME_POW)) continue; // silent frame → not averaged
    const meanRaw = rawSum / nUsed;
    // Absolute backstop keeps log() finite if a frame is all-but-silent.
    const floorP = Math.max(relFloor * meanRaw, 1e-30);
    let logSum = 0, arithSum = 0;
    for (let k = 1; k < nBins; k++) {
      const p = pow[k] > floorP ? pow[k] : floorP; // relative noise floor, both means
      logSum += Math.log(p);
      arithSum += p;
    }
    const geo = Math.exp(logSum / nUsed);
    const arith = arithSum / nUsed;
    const flatness = arith > 0 ? geo / arith : 0;
    flatnessSum += flatness;
    nFrames++;
  }
  return nFrames > 0 ? flatnessSum / nFrames : 0;
}

// Both descriptors together, for a normalised buffer.
export function computeDescriptors(samples, sampleRate) {
  return {
    development_raw: developmentRaw(samples, sampleRate),
    harmonicity_raw: harmonicityRaw(samples, sampleRate),
  };
}

// ── Axis binning (§7.1: log-scaled, 16 bins) ─────────────────────────────────
// Bin ranges are calibrated from observed distributions over random genomes
// (BUILD-ORDER "Archive axis ranges need calibrating"), passed in as `cal`:
//   cal = { dev: {min, max}, harm: {min, max} }  (both min>0 for log scaling).
// A value below min or above max clamps to the edge bin (§7.1), never discarded.
export function binLog(value, min, max, nBins = N_BINS) {
  if (!(value > 0)) return 0;               // ≤0 → first (drone / silent) bin
  if (value <= min) return 0;
  if (value >= max) return nBins - 1;
  const t = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
  let b = Math.floor(t * nBins);
  if (b < 0) b = 0; if (b >= nBins) b = nBins - 1;
  return b;
}

export function cellOf(development_raw, harmonicity_raw, cal) {
  const x = binLog(development_raw, cal.dev.min, cal.dev.max);
  const y = binLog(harmonicity_raw, cal.harm.min, cal.harm.max);
  const clamped =
    development_raw <= cal.dev.min || development_raw >= cal.dev.max ||
    harmonicity_raw <= cal.harm.min || harmonicity_raw >= cal.harm.max;
  return { cell_x: x, cell_y: y, clamped_to_edge: clamped };
}

// ── §5.2 sanity metrics ──────────────────────────────────────────────────────
// A PLUMBING CHECK, not a quality judgement (§5.2): raw distributions only, no
// verdict. Computed on the RAW render (pre-normalisation), because peak, clip and
// silence-fraction are properties of what the genome actually produces before the
// loudness safeguard rescales it.
export function sanityMetrics(samples, sampleRate) {
  const N = samples.length;
  let peak = 0, sumSq = 0, belowFloor = 0;
  const floorLin = Math.pow(10, -60 / 20); // −60 dBFS
  for (let n = 0; n < N; n++) {
    const a = Math.abs(samples[n]);
    if (a > peak) peak = a;
    sumSq += samples[n] * samples[n];
    if (a < floorLin) belowFloor++;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, N));
  const silenceFrac = belowFloor / Math.max(1, N);
  return {
    peak,
    rms,
    silence_frac: silenceFrac,
    onsets: countOnsets(samples, sampleRate),
    spectral_centroid_hz: spectralCentroid(samples, sampleRate),
    clipped: peak > 1.0,
    // "Effectively silent": integrated energy negligible. Threshold at RMS below
    // −60 dBFS, matching the loudness near-silence intent (§4.7) at the sample level.
    silent: rms < floorLin,
  };
}

// Mean spectral centroid in Hz (a §5.2 metric and a visualiser input, §11).
export function spectralCentroid(samples, sampleRate, opts = {}) {
  const win = opts.win || 1024;
  const hop = opts.hop || 512;
  const hann = hannWindow(win);
  const re = new Float64Array(win), im = new Float64Array(win);
  let centroidSum = 0, nFrames = 0;
  const binHz = sampleRate / win;
  for (let start = 0; start + win <= samples.length; start += hop) {
    for (let i = 0; i < win; i++) { re[i] = samples[start + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const nBins = win / 2 + 1;
    let num = 0, den = 0;
    for (let k = 0; k < nBins; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      num += k * binHz * mag;
      den += mag;
    }
    if (den > 0) { centroidSum += num / den; nFrames++; }
  }
  return nFrames > 0 ? centroidSum / nFrames : 0;
}

// Onset count via spectral flux with adaptive peak-picking. A §5.2 metric only;
// deliberately simple. Not a quality signal — it counts events, it does not judge
// them.
export function countOnsets(samples, sampleRate, opts = {}) {
  const win = opts.win || 1024;
  const hop = opts.hop || 512;
  const hann = hannWindow(win);
  const re = new Float64Array(win), im = new Float64Array(win);
  const flux = [];
  let prevMag = null;
  for (let start = 0; start + win <= samples.length; start += hop) {
    for (let i = 0; i < win; i++) { re[i] = samples[start + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const nBins = win / 2 + 1;
    const mag = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    if (prevMag) {
      let f = 0;
      for (let k = 0; k < nBins; k++) { const d = mag[k] - prevMag[k]; if (d > 0) f += d; }
      flux.push(f);
    }
    prevMag = mag;
  }
  if (flux.length < 3) return 0;
  // Adaptive threshold: local mean over a window plus a fraction of the global std.
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const varr = flux.reduce((a, b) => a + (b - mean) * (b - mean), 0) / flux.length;
  const std = Math.sqrt(varr);
  const thresh = mean + 0.5 * std;
  let count = 0;
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] > thresh && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) count++;
  }
  return count;
}

// ── shared ───────────────────────────────────────────────────────────────────
const _hannCache = new Map();
function hannWindow(win) {
  let h = _hannCache.get(win);
  if (!h) {
    h = new Float64Array(win);
    for (let i = 0; i < win; i++) h[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
    _hannCache.set(win, h);
  }
  return h;
}

export { N_COEFFS, N_SEGMENTS, N_BINS };
