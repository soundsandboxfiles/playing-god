// residual.js — characterise what's LEFT after a fit, so a missed numeric gate can
// be reported as a measured, spectral, quantified ceiling (BRIEF-2 §5.6, the escape
// hatch) rather than a shrug. Given a genome and the scored target, it computes the
// residual (target − engine render over the window) and reports:
//   • total residual SSE and how it splits into a "tonal" part (energy at discrete
//     spectral peaks) vs a "broadband" part (everything else — strike transients,
//     reverberant noise, content a 64-oscillator bank cannot hold);
//   • the loudest residual peaks (frequency + how much SSE each would cost to leave);
//   • the fraction of residual energy above ~half-Nyquist (near the format's ceiling).
// The tonal/broadband split is the key ceiling evidence: tonal residual means "more
// waves / better search would help"; broadband residual means "the format itself
// can't hold this" — an honest, different verdict.

import { renderRaw } from './engine.js';
import { spectralPeaks } from './analysis.js';

export function analyzeResidual(genome, plan, { topPeaks = 12 } = {}) {
  const rate = plan.sampleRate;
  const winLen = plan.winLen;
  const start = plan.startSample;
  const r = renderRaw(genome, { lengthS: plan.totalLengthS, sampleRate: rate });
  const resid = new Float64Array(winLen);
  let sse = 0;
  for (let i = 0; i < winLen; i++) {
    const s = r.samples[start + i]; const d = (s === undefined ? 0 : s) - plan.target[i];
    resid[i] = d; sse += d * d;
  }
  // tonal energy: sum of the energy captured by the strongest resolved peaks.
  const peaks = spectralPeaks(resid, rate, { maxPeaks: 64, minFreq: 1 });
  // each peak's captured energy ≈ |A|²·N/2 (Parseval for one sinusoid over N samples)
  let tonal = 0;
  const peakRows = [];
  for (const p of peaks) {
    const e = 0.5 * p.amp * p.amp * winLen; // approx SSE contribution if removed
    tonal += e;
    if (peakRows.length < topPeaks) peakRows.push({ freq: +p.freq.toFixed(1), approxSSE: +e.toFixed(2) });
  }
  tonal = Math.min(tonal, sse);
  const broadband = Math.max(0, sse - tonal);
  // energy above half-Nyquist (near the 11 kHz format ceiling)
  let hi = 0; for (const p of peaks) if (p.freq > rate / 4) hi += 0.5 * p.amp * p.amp * winLen;

  return {
    sse,
    tonalSSE: tonal, tonalFrac: tonal / sse,
    broadbandSSE: broadband, broadbandFrac: broadband / sse,
    highFreqFrac: Math.min(1, hi / sse),
    topPeaks: peakRows,
    nResidualPeaks: peaks.length,
  };
}
