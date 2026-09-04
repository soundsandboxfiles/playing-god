// analysis.js — turn a target waveform into wave-atoms ARTISAN can build genes
// from. This is the measuring half of "sighted design": where MIMIC mutated
// blindly and stalled at the silence floor, ARTISAN reads frequency, amplitude,
// phase and time-envelope straight off the target (BRIEF §6).
//
// An ATOM is a stationary sinusoidal component described in COSINE convention:
//   x_component[n] ≈ amp · cos(2π·freq·n/rate + phase)
// with `freq` in Hz, `amp` a peak linear amplitude, `phase` in radians at n=0.
// (The engine's shapes are phase-accumulated sines; genome-build.js maps this
// cosine description onto the engine's `phase` gene, fitting the half-sample and
// sin-vs-cos offsets against the true engine.)

import { magnitudeSpectrum, parabolicPeak, hann, nextPow2 } from './fft.js';

const TWO_PI = Math.PI * 2;

// Direct projection of `signal` onto a complex exponential at `freq`. Returns the
// component's complex amplitude A = (2/N)·Σ x[n]·e^{-iω n}, so |A| is the peak
// amplitude of the cosine and arg(A) its phase at n=0. O(N); exact at any (sub-bin)
// frequency, no windowing bias — this is how we read amplitude/phase precisely.
export function projectAt(signal, freq, sampleRate, n0 = 0, n1 = signal.length) {
  const w = TWO_PI * freq / sampleRate;
  let re = 0, im = 0;
  for (let n = n0; n < n1; n++) {
    const c = Math.cos(w * n), s = Math.sin(w * n);
    re += signal[n] * c;
    im -= signal[n] * s;
  }
  const N = n1 - n0;
  re *= 2 / N; im *= 2 / N;
  return { re, im, amp: Math.hypot(re, im), phase: Math.atan2(im, re) };
}

// The squared energy captured by a component at `freq` (∝ |A|²·N). Used as the
// objective for frequency refinement: maximise the energy this frequency explains.
function projEnergy(signal, freq, sampleRate) {
  const a = projectAt(signal, freq, sampleRate);
  return a.amp * a.amp;
}

// Golden-section search for the frequency in [lo, hi] that maximises captured
// energy. Sub-bin accurate — drives the FFT's coarse peak to the true frequency,
// which is exactly the "needle" MIMIC could not thread by mutation.
export function refineFreq(signal, sampleRate, lo, hi, iters = 60) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = projEnergy(signal, c, sampleRate), fd = projEnergy(signal, d, sampleRate);
  for (let i = 0; i < iters; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = projEnergy(signal, c, sampleRate); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = projEnergy(signal, d, sampleRate); }
    if (b - a < 1e-7) break;
  }
  return 0.5 * (a + b);
}

// Find the strongest `maxPeaks` spectral peaks of `signal`, each refined to
// sub-bin frequency and measured for amplitude+phase. A Hann window makes peak
// DETECTION robust to leakage; amplitude/phase are then read by unwindowed
// projection at the refined frequency (leakage-free). Peaks below `minFreq` or
// within `minSepBins` of a stronger peak are dropped.
//   returns [{ freq, amp, phase, energy }] sorted by energy desc.
export function spectralPeaks(signal, sampleRate, {
  maxPeaks = 32, minFreq = 0.5, maxFreqFrac = 0.999, padFactor = 4, minSepHz = 0, padCap = 262144,
} = {}) {
  const N = signal.length;
  const win = hann(N);
  const wsig = new Float64Array(N);
  for (let n = 0; n < N; n++) wsig[n] = signal[n] * win[n];
  // Zero-pad for sub-bin peak resolution, but cap the transform size so a long
  // target (e.g. the 9.5 s chimes, ~210k samples) doesn't cost a multi-million-
  // point FFT every atom. refineFreq gives the sub-bin accuracy regardless.
  const P = Math.min(Math.max(nextPow2(N), nextPow2(N) * padFactor), Math.max(nextPow2(N), padCap));
  const { mag } = magnitudeSpectrum(wsig, P);
  const half = mag.length - 1;
  const binHz = sampleRate / P;
  const nyq = sampleRate / 2;
  const maxFreq = maxFreqFrac * nyq;

  // collect local maxima
  const cands = [];
  for (let k = 1; k < half; k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
      const { delta } = parabolicPeak(mag, k);
      const freq = (k + delta) * binHz;
      if (freq < minFreq || freq > maxFreq) continue;
      cands.push({ k, freq, coarseMag: mag[k] });
    }
  }
  cands.sort((a, b) => b.coarseMag - a.coarseMag);

  const chosen = [];
  const minSep = minSepHz || binHz * 2;
  for (const cand of cands) {
    if (chosen.length >= maxPeaks) break;
    if (chosen.some((c) => Math.abs(c.seedFreq - cand.freq) < minSep)) continue;
    // refine within ±1.5 coarse bins of the parabolic estimate
    const lo = Math.max(minFreq, cand.freq - 1.5 * binHz);
    const hi = Math.min(maxFreq, cand.freq + 1.5 * binHz);
    const freq = refineFreq(signal, sampleRate, lo, hi);
    const a = projectAt(signal, freq, sampleRate);
    chosen.push({ freq, amp: a.amp, phase: a.phase, energy: a.amp * a.amp, seedFreq: cand.freq });
  }
  chosen.sort((a, b) => b.energy - a.energy);
  return chosen.map(({ freq, amp, phase, energy }) => ({ freq, amp, phase, energy }));
}

// Time-varying amplitude of the component at `freq`, measured by a short-time
// projection over overlapping frames. Returns { times (s), amps (linear peak) }.
// Used to fit each wave's amplitude envelope (≤8 nodes) in genome-build.js.
export function amplitudeEnvelope(signal, sampleRate, freq, {
  frameS = 0.05, hopS = 0.0125,
} = {}) {
  const frame = Math.max(4, Math.round(frameS * sampleRate));
  const hop = Math.max(1, Math.round(hopS * sampleRate));
  const times = [], amps = [];
  for (let start = 0; start < signal.length; start += hop) {
    const end = Math.min(signal.length, start + frame);
    const a = projectAt(signal, freq, sampleRate, start, end);
    times.push((start + (end - start) / 2) / sampleRate);
    amps.push(a.amp);
    if (end >= signal.length) break;
  }
  return { times, amps };
}

// Block-average decimation: shrink a signal by an integer factor by averaging
// each block. Crude anti-aliasing, but ample for locating a sub-Hz spectral peak
// cheaply on a long target (the low-frequency atom search). Returns
// { sig, rate } at the decimated sample rate.
export function decimate(signal, sampleRate, factor) {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return { sig: signal, rate: sampleRate };
  const n = Math.floor(signal.length / f);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; const base = i * f;
    for (let k = 0; k < f; k++) s += signal[base + k];
    out[i] = s / f;
  }
  return { sig: out, rate: sampleRate / f };
}

// Search the low-frequency band [fLo, fHi] for the single frequency capturing the
// most energy, cheaply, by working on a decimated copy (default ~200 Hz effective
// rate). Returns the best frequency in Hz, or null if the band holds little energy
// relative to `refEnergy` (so pure-tone targets like bells skip it fast).
export function lowFreqAtom(signal, sampleRate, {
  fLo = 0.02, fHi = 5, decRate = 200, refEnergy = 0,
} = {}) {
  const factor = Math.max(1, Math.floor(sampleRate / decRate));
  const { sig, rate } = decimate(signal, sampleRate, factor);
  let bf = fLo, be = -1;
  for (let f = fLo; f < fHi; f *= 1.05) {
    const a = projectAt(sig, f, rate);
    const e = a.amp * a.amp;
    if (e > be) { be = e; bf = f; }
  }
  if (be <= 0) return null;
  if (refEnergy > 0 && be < 1e-4 * refEnergy) return null; // negligible low band
  return refineFreq(sig, rate, Math.max(fLo, bf * 0.95), bf * 1.05, 70);
}

// The overall RMS-amplitude envelope of the whole signal (frequency-agnostic),
// for targets where we fit a single broadband wave's loudness shape.
export function loudnessEnvelope(signal, sampleRate, { frameS = 0.03, hopS = 0.0075 } = {}) {
  const frame = Math.max(4, Math.round(frameS * sampleRate));
  const hop = Math.max(1, Math.round(hopS * sampleRate));
  const times = [], amps = [];
  for (let start = 0; start < signal.length; start += hop) {
    const end = Math.min(signal.length, start + frame);
    let e = 0;
    for (let n = start; n < end; n++) e += signal[n] * signal[n];
    times.push((start + (end - start) / 2) / sampleRate);
    amps.push(Math.sqrt(e / (end - start)));
    if (end >= signal.length) break;
  }
  return { times, amps };
}
