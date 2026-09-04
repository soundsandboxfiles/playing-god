// gate-repeat.js — recover a REPEATING gate (mid_wait) from the residual
// (BRIEF-2 §4b.3). This is the actual key to recover-6wave — v1's report thought
// its sideband comb came from PM/AM modulation, but a measurement shows the target
// has NO active modulation (CONTINUATION-v2 DECISIONS 2026-09-04): the comb is a
// GATED CARRIER that bursts on a period (its wave w31 is a 426 Hz sine, on for ~7 ms
// every 317 ms). One mid_wait wave reproduces the entire comb; an amplitude envelope
// cannot (a fast pulse train needs far more than 8 nodes), and stationary sines spend
// a slot per comb line. So repetition is its own recovery step.
//
// Method:
//   1. fineAmpTrack — measure the partial's amplitude at high time resolution
//      (short frames), enough to resolve individual bursts.
//   2. detectRepeatingGate — autocorrelate the amplitude track to find the burst
//      period; fold at that period to measure the duty (on-fraction) and the
//      pre-offset (where the first burst starts). Returns null if the partial is
//      not convincingly bursty (so continuous partials keep their envelope instead).
//
// The A/B that decides whether to USE it lives in construct.fitOneAtom: build the
// gated-repeating candidate, keep it only if it captures more residual energy than
// the stationary/enveloped version. Detection here just proposes the gate.

import { projectAt } from './analysis.js';

const EPS = 1e-12;

// High-time-resolution amplitude track of the partial at `freq` over [on,off] window
// samples. Frame ≈ a few cycles but capped short so bursts are resolved; hop = half
// frame. Returns { amps, hopSamp, frameSamp, on } (amps indexed by frame).
export function fineAmpTrack(signal, rate, freq, on, off, { minFrameS = 0.0025, cycles = 3 } = {}) {
  let frameN = Math.max(4, Math.round(Math.max(minFrameS, cycles / Math.max(1e-6, freq)) * rate));
  const span = off - on;
  if (frameN > span / 4) frameN = Math.max(4, Math.floor(span / 4));
  const hopN = Math.max(1, Math.round(frameN / 2));
  const amps = [];
  for (let s = on; s + frameN <= off; s += hopN) {
    const a = projectAt(signal, freq, rate, s, s + frameN);
    amps.push(a.amp);
  }
  return { amps, hopSamp: hopN, frameSamp: frameN, on };
}

// Normalised autocorrelation of a series at integer lag.
function autocorr(x, lag) {
  const n = x.length - lag;
  if (n <= 2) return 0;
  let m = 0; for (const v of x) m += v; m /= x.length;
  let num = 0, d0 = 0, d1 = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - m, b = x[i + lag] - m; num += a * b; }
  for (let i = 0; i < x.length; i++) { const a = x[i] - m; d0 += a * a; }
  d1 = d0;
  return d0 > EPS ? num / Math.sqrt(d0 * d1) : 0;
}

// Detect a repeating gate in a partial. Returns { periodSamp, durSamp, preSamp,
// strength } or null. `minPeriodS`/`maxPeriodS` bound the search; `minAcorr` is the
// autocorrelation strength required to accept periodicity; `maxDuty` rejects
// near-continuous partials (those want an envelope, not a repeating gate).
export function detectRepeatingGate(signal, rate, freq, on, off, {
  minPeriodS = 0.02, maxPeriodS = 1.0, minAcorr = 0.35, maxDuty = 0.6, minBursts = 2.5,
} = {}) {
  const track = fineAmpTrack(signal, rate, freq, on, off);
  const amps = track.amps;
  const M = amps.length;
  if (M < 8) return null;
  let peak = 0; for (const a of amps) if (a > peak) peak = a;
  if (peak <= 0) return null;

  const hopS = track.hopSamp / rate;
  const lagMin = Math.max(2, Math.round(minPeriodS / hopS));
  const lagMax = Math.min(M - 3, Math.round(maxPeriodS / hopS));
  if (lagMax <= lagMin) return null;

  // find the strongest autocorrelation peak in the lag band
  let bestLag = -1, bestA = minAcorr;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const a = autocorr(amps, lag);
    if (a > bestA) { bestA = a; bestLag = lag; }
  }
  if (bestLag < 0) return null;

  const periodSamp = bestLag * track.hopSamp;
  const span = off - on;
  if (span / periodSamp < minBursts) return null; // too few repeats to be sure

  // fold at the period to get one clean burst shape; measure duty + pre-offset.
  const P = bestLag;
  const folded = new Float64Array(P);
  const counts = new Int32Array(P);
  for (let i = 0; i < M; i++) { folded[i % P] += amps[i]; counts[i % P]++; }
  for (let k = 0; k < P; k++) folded[k] = counts[k] ? folded[k] / counts[k] : 0;
  let fpeak = 0; for (const v of folded) if (v > fpeak) fpeak = v;
  if (fpeak <= 0) return null;
  const thresh = 0.35 * fpeak;
  // find the contiguous on-run (wrap-around) — the burst
  let onCount = 0, firstOn = -1;
  for (let k = 0; k < P; k++) if (folded[k] >= thresh) { onCount++; if (firstOn < 0) firstOn = k; }
  const duty = onCount / P;
  if (duty > maxDuty || onCount < 1) return null;

  const durSamp = Math.max(1, Math.round(duty * periodSamp));
  // pre-offset: the first burst's start, in render samples from the window start.
  const preSamp = Math.max(0, on + firstOn * track.hopSamp - Math.round(track.frameSamp / 2));

  return { periodSamp, durSamp, preSamp, strength: bestA, duty };
}
