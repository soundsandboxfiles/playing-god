// render-raw.js — the ONE phenotype path MIMIC scores against.
//
// DELIBERATE DECISION (fitness hygiene — recorded in docs/FITNESS.md):
// MIMIC scores the RAW synthesis output, NOT ../src/render.js's renderNormalized.
// renderNormalized applies §4.7 loudness normalisation and the F4/P4 leading-
// silence trim. Both would sabotage the owner's blunt SSE:
//   • loudness normalisation rescales amplitude — but the owner's fitness is
//     meant to punish "quieter-but-identical". Normalising would erase exactly
//     the penalty the owner asked for.
//   • the leading-silence trim shifts the waveform in time — but the fitness is
//     meant to punish "offset-but-identical". Trimming would hide the offset.
// So MIMIC reaches past renderNormalized to the raw `render()` in synthesis.js.
// This is a READ-ONLY use of the engine (we call it, we do not change it).
//
// ENVELOPE/LENGTH COUPLING (recorded, load-bearing):
// synthesis.render() maps envelope time as t = n/(N-1) over the WHOLE render
// length N. Rendering a shorter buffer than the auditioned length would move
// every envelope and change the phenotype inside the scored window. Therefore
// MIMIC renders at the FULL configured total length for both scoring and
// audition, and windows the SSE afterwards (fitness.js). We do NOT take the
// brief's optional "stop at the scored window's end" shortcut, because for this
// engine that shortcut is not phenotype-preserving. See docs/FITNESS.md.

import { render } from '../../src/synthesis.js';

export const ENGINE_RATE = 22050;

// Render a genome to raw Float32 samples at the engine rate.
//   opts.lengthS     — total render length in seconds (the auditioned length)
//   opts.sampleRate  — default ENGINE_RATE (22050)
// Returns { samples, sampleRate, N, activeWaves, renderError }.
export function renderRaw(genome, opts = {}) {
  const sampleRate = opts.sampleRate || ENGINE_RATE;
  const lengthS = opts.lengthS;
  if (!(lengthS > 0)) throw new Error('renderRaw needs a positive opts.lengthS');
  const r = render(genome, { sampleRate, lengthS });
  return {
    samples: r.samples,
    sampleRate: r.sampleRate,
    N: r.N,
    activeWaves: r.activeWaves,
    renderError: r.renderError,
  };
}
