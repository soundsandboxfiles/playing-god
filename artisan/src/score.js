// score.js — ARTISAN's scoring surface. Thin layer over MIMIC's fitness so the
// metric is byte-identical to MIMIC's (BRIEF §10.4 asks for fitness parity), plus
// the couple of extras ARTISAN's optimiser needs.
//
// The metric is the owner's blunt SSE (BRIEF §2): sum of squared sample-by-sample
// differences over the scored window [y, y+x), on RAW float samples at 22050 Hz,
// reported as similarity = 1/SSE with the PERFECT_SIMILARITY guard. No
// normalisation, no alignment, no spectral substitution.

import { renderRaw, ENGINE_RATE, makeScorePlan, sseWindowed, similarityOf } from './engine.js';

export { ENGINE_RATE };

// Build the scoring plan for a target + window.
//   target        Float32Array at ENGINE_RATE (the scored window's samples)
//   renderLengthS total render length in seconds (see BRIEF §2 off-canvas rule)
//   offsetS       y, the window start in seconds (default 0)
// The window is [offsetS, offsetS + target.length/rate). If renderLength is too
// short to cover the window, makeScorePlan extends it (never drops target samples).
export function makePlan({ target, renderLengthS, offsetS = 0, sampleRate = ENGINE_RATE }) {
  return makeScorePlan({
    target,
    totalLengthS: renderLengthS,
    windowStartS: offsetS,
    sampleRate,
  });
}

// Render a genome to raw samples at the plan's length + rate. Returns the raw
// render result ({ samples, N, activeWaves, renderError }).
export function renderForPlan(genome, plan) {
  return renderRaw(genome, { lengthS: plan.totalLengthS, sampleRate: plan.sampleRate });
}

// Score a genome against the plan. Returns { sse, similarity, activeWaves,
// renderError, samples }. `samples` is the full raw render (handy for streaming a
// deliverable WAV without a second render). A failed render is maximally bad.
export function scoreGenome(genome, plan) {
  const r = renderForPlan(genome, plan);
  if (r.renderError) {
    return { sse: Infinity, similarity: 0, activeWaves: r.activeWaves, renderError: r.renderError, samples: r.samples };
  }
  const sse = sseWindowed(r.samples, plan);
  return { sse, similarity: similarityOf(sse), activeWaves: r.activeWaves, renderError: null, samples: r.samples };
}

// SSE of an already-rendered sample buffer against the plan's window. Used by the
// linear-LS solver and the mixer, which render once and score many subsets.
export function sseOf(samples, plan) {
  return sseWindowed(samples, plan);
}

// The silence floor: SSE of an all-silent render = the target's own energy over
// the window. This is the number every result is measured against (BRIEF §6, §7).
export function silenceFloor(plan) {
  const { target, winLen } = plan;
  let e = 0;
  for (let i = 0; i < winLen; i++) e += target[i] * target[i];
  return e;
}
