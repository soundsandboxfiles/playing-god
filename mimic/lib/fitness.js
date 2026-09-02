// fitness.js — the owner's fitness. THE SPEC, NOT A PLACEHOLDER.
//
// Owner, verbatim intent (sound-mimic.md): "Similarity = 1 / (sum of squared
// sample-by-sample differences) over the scored window", computed on RAW float
// samples at the engine rate. No normalisation, no alignment tolerance, no
// spectral substitution. It heavily penalises identical-but-quieter and
// identical-but-offset waveforms, and the owner wants exactly that ("a blunt
// tool — if I just wanted fidelity then mp3 coding already exists").
//
// Implementation: minimise SSE internally (guard SSE = 0), report similarity as
// 1/SSE. Alternative metrics are OPTIONAL, off by default, documented
// (docs/FITNESS.md) — they never replace the SSE that drives selection unless the
// owner explicitly asks for one via --metric.
//
// WINDOWING (owner's spec): the config gives total_length_s and window_start_s.
// The target has its own length (target_length_s). The scored region is
//   [window_start_s, window_start_s + target_length_s)
// Outside that region the genome's output is UNCONSTRAINED — free tails on
// either side. We render the FULL total length (see render-raw.js on why we do
// not truncate) and sum squared error only over the scored window.

import { renderRaw, ENGINE_RATE } from './render-raw.js';

// SSE = 0 is theoretically reachable (a recovered genome). Guard so similarity
// stays finite and comparisons stay ordered: a perfect match reports this
// sentinel similarity and SSE 0.
export const PERFECT_SIMILARITY = Number.MAX_VALUE;

// Convert an SSE to the owner's reported similarity (1/SSE, guarded).
export function similarityOf(sse) {
  if (!(sse > 0)) return PERFECT_SIMILARITY;      // sse === 0 (or -0/NaN guard)
  return 1 / sse;
}

// Build a scoring plan once per run (it depends only on config + target length):
//   total_length_s  — full render/audition length
//   window_start_s  — where the scored window begins
//   target          — Float32Array of the target at the engine rate
// Returns { sampleRate, totalLengthS, N, startSample, winLen, target }.
// If the window would run past the render end we EXTEND the render length to
// cover it (never silently drop target samples) and record the adjustment.
export function makeScorePlan({ target, totalLengthS, windowStartS = 0, sampleRate = ENGINE_RATE }) {
  const winLen = target.length;                     // scored window = target length
  const startSample = Math.round(windowStartS * sampleRate);
  const neededS = (startSample + winLen) / sampleRate;
  let effTotalS = totalLengthS;
  let extended = false;
  if (effTotalS < neededS) { effTotalS = neededS; extended = true; }
  const N = Math.round(effTotalS * sampleRate);
  return {
    sampleRate,
    totalLengthS: effTotalS,
    requestedTotalLengthS: totalLengthS,
    extendedToFitWindow: extended,
    N,
    startSample,
    winLen,
    windowStartS,
    target,
  };
}

// Core SSE over the scored window, given already-rendered samples. The window is
// [startSample, startSample+winLen). If the render is shorter than the window
// (should not happen when the plan drove the render), missing samples are
// treated as 0 (silence) so the comparison is still total and blunt.
export function sseWindowed(samples, plan) {
  const { startSample, winLen, target } = plan;
  let sse = 0;
  for (let i = 0; i < winLen; i++) {
    const s = samples[startSample + i];             // undefined → treat as 0
    const d = (s === undefined ? 0 : s) - target[i];
    sse += d * d;
  }
  return sse;
}

// Render a genome per the plan and score it. Returns { sse, similarity,
// renderError, activeWaves }. This is the hot path the workers call.
export function evaluate(genome, plan) {
  const r = renderRaw(genome, { lengthS: plan.totalLengthS, sampleRate: plan.sampleRate });
  if (r.renderError) {
    // A failed render is maximally bad: infinite SSE, zero similarity. It is
    // skipped by selection rather than crashing the run.
    return { sse: Infinity, similarity: 0, renderError: r.renderError, activeWaves: r.activeWaves };
  }
  const sse = sseWindowed(r.samples, plan);
  return { sse, similarity: similarityOf(sse), renderError: null, activeWaves: r.activeWaves };
}

// ── OPTIONAL alternative metrics (off by default) ────────────────────────────
// These exist per the brief's allowance ("You may add alternative metrics as
// OPTIONAL flags, off by default"). They are provided for the owner's curiosity
// and for diagnosing phase deception; they DO NOT drive selection unless the
// runner is explicitly told --metric <name>. Each returns a "loss" (lower is
// better) so the algorithms can minimise it uniformly, plus a similarity report.

// Normalised SSE: SSE divided by target energy. Removes the absolute-amplitude
// penalty the owner deliberately wants — hence NOT the default. Diagnostic only.
export function sseNormalized(samples, plan) {
  const { startSample, winLen, target } = plan;
  let sse = 0, te = 0;
  for (let i = 0; i < winLen; i++) {
    const s = samples[startSample + i];
    const d = (s === undefined ? 0 : s) - target[i];
    sse += d * d;
    te += target[i] * target[i];
  }
  return te > 0 ? sse / te : sse;
}

// Spectral SSE: squared error between magnitude spectra (a naive DFT over the
// window, decimated to keep it cheap). Substitutes phase-insensitive matching —
// exactly the "spectral substitution" the owner's spec forbids as the default —
// so it is only ever a diagnostic flag. See docs/FITNESS.md.
export function spectralLoss(samples, plan, { nBins = 256 } = {}) {
  const { startSample, winLen, target } = plan;
  const win = new Float64Array(winLen);
  for (let i = 0; i < winLen; i++) {
    const s = samples[startSample + i];
    win[i] = (s === undefined ? 0 : s);
  }
  const magA = magSpectrum(win, nBins);
  const magB = magSpectrum(target, nBins);
  let sse = 0;
  for (let k = 0; k < nBins; k++) { const d = magA[k] - magB[k]; sse += d * d; }
  return sse;
}

// A cheap magnitude spectrum: nBins evenly spaced frequencies via direct DFT on a
// decimated copy. O(nBins × M) — fine for occasional diagnostics, never the hot
// path. Returns Float64Array(nBins).
function magSpectrum(sig, nBins) {
  const M = Math.min(sig.length, 4096);            // decimation cap
  const stride = Math.max(1, Math.floor(sig.length / M));
  const buf = [];
  for (let i = 0; i < sig.length; i += stride) buf.push(sig[i]);
  const L = buf.length;
  const mag = new Float64Array(nBins);
  for (let k = 0; k < nBins; k++) {
    const w = Math.PI * k / nBins;                  // 0..π
    let re = 0, im = 0;
    for (let n = 0; n < L; n++) { re += buf[n] * Math.cos(w * n); im -= buf[n] * Math.sin(w * n); }
    mag[k] = Math.sqrt(re * re + im * im) / L;
  }
  return mag;
}

// The metric registry the runner consults. Default is the owner's SSE.
export const METRICS = {
  // name: { loss(samples, plan) -> number (minimise), isDefault }
  sse: { loss: (samples, plan) => sseWindowed(samples, plan), isDefault: true,
    describe: 'Owner spec: sum of squared sample-by-sample differences (blunt).' },
  'sse-normalized': { loss: (samples, plan) => sseNormalized(samples, plan), isDefault: false,
    describe: 'DIAGNOSTIC: SSE / target energy. Removes the loudness penalty the owner wants.' },
  spectral: { loss: (samples, plan) => spectralLoss(samples, plan), isDefault: false,
    describe: 'DIAGNOSTIC: magnitude-spectrum SSE. Phase-insensitive (forbidden as default).' },
};
