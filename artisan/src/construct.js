// construct.js — the constructive pass: greedy matching pursuit with per-atom
// SHAPE selection and a global least-squares gain re-solve at every step.
//
// The brief's non-binding sketch (BRIEF §6): "fit the single best wave-atom to the
// residual, subtract, repeat." ARTISAN's version adds two decisive twists:
//
//   • Per-atom shape selection. At each step we don't just place a sine — we try
//     all four engine shapes (sine, triangle, saw, square) at the residual's
//     strongest frequency and keep whichever captures the most residual energy.
//     A saw target is then ONE saw wave, not a pile of sine harmonics: recover-2wave
//     (a single gated saw) collapses to machine-zero with one atom, where a
//     sine-only additive model plateaus (the aliased saw spreads energy across many
//     folded harmonics). Sine uses its analytic phase; the others get a quick phase
//     search. (DECISIONS 2026-09-03.)
//   • Global LS re-solve. After adding each atom we re-solve ALL gains at once
//     (linfit.js) — exact, because the additive mix is linear in the gains.
//
// It also emits the progressive assembly artifact the owner wants to hear (BRIEF
// §7/§8): the reconstruction after 1 wave, 1–2, ….

import { spectralPeaks, projectAt, refineFreq, lowFreqAtom } from './analysis.js';
import { leastSquaresGains } from './linfit.js';
import {
  blankGenome, setShapeWave, renderWaveWindow, setGainLin, setSwitch, setGateSamples,
} from './genome-build.js';
import { measureAmpTrack, fitDbEnvelope, applyAmpEnvelope, trackDynamicRange } from './envelope.js';
import { trackRidge, fitPitchEnvelope, applyPitchEnvelope, ridgeDriftCents, cheapDriftCents } from './pitch-track.js';
import { detectRepeatingGate } from './gate-repeat.js';
import { GENES_PER_WAVE } from './engine.js';

const TWO_PI = Math.PI * 2;
const wrap01 = (x) => ((x % 1) + 1) % 1;
const SHAPES = ['sine', 'triangle', 'saw', 'square'];

// Detect the target's overall gate. For a genome-rendered target the signal is
// EXACTLY zero outside its gate, so the exact boundary is the first/last sample
// above a tiny threshold. If the active region covers essentially the whole window
// (real sustained audio like the chimes), returns null (the waves sound
// throughout). Returns { preSamp, durSamp, midSamp, midOn, onsetWin, offsetWin }.
export function detectGate(target, plan, { coversFrac = 0.985 } = {}) {
  const winLen = plan.winLen;
  let peak = 0;
  for (let i = 0; i < winLen; i++) { const a = Math.abs(target[i]); if (a > peak) peak = a; }
  if (peak <= 0) return null;
  const eps = Math.max(1e-8, 1e-6 * peak);
  let on = 0; while (on < winLen && Math.abs(target[on]) < eps) on++;
  let off = winLen - 1; while (off > on && Math.abs(target[off]) < eps) off--;
  const coverage = (off - on + 1) / winLen;
  if (coverage >= coversFrac) return null; // sounds throughout — no useful gate
  return {
    preSamp: plan.startSample + on,
    durSamp: Math.max(1, off - on + 1),
    midSamp: 1, midOn: false,
    onsetWin: on, offsetWin: off,
  };
}

// Build a scratch single-wave genome for cheap candidate rendering.
function scratchWave(shape, freq, phaseCycles, gate, sampleRate) {
  const g = blankGenome();
  setShapeWave(g, 0, { shape, freq, phaseCycles, gainLin: 1, gate, sampleRate });
  return g;
}

// Captured residual energy if we add basis `b` alone: (b·r)² / (b·b).
function captured(b, r) {
  let br = 0, bb = 0;
  for (let n = 0; n < b.length; n++) { br += b[n] * r[n]; bb += b[n] * b[n]; }
  if (bb <= 0) return { energy: 0, gain: 0 };
  return { energy: (br * br) / bb, gain: br / bb };
}

// Choose the best shape+phase for a wave at `freq` fitting the residual over the
// window. Sine uses its analytic phase; saw/square/triangle get a coarse phase
// scan + golden refine — but ONLY when the residual is harmonically rich at this
// frequency (energy at 2f/3f), so pure-tone targets like bells stay sine-only and
// fast. Returns { shape, phaseCycles, basis, energy }.
function fitAtomWave(residual, freq, gate, plan, region, { harmonicGate = 0.08 } = {}) {
  const rate = plan.sampleRate;
  const gateObj = gate ? { preSamp: gate.preSamp, durSamp: gate.durSamp, midSamp: gate.midSamp, midOn: gate.midOn } : null;
  let best = null;
  const renderCand = (shape, phase) => {
    const g = scratchWave(shape, freq, phase, gateObj, rate);
    return renderWaveWindow(g, 0, plan);
  };

  // sine: analytic phase (cosine atom → engine phase), referenced to window start
  const a0 = projectAt(residual, freq, rate, region.on, region.off);
  {
    const phase0 = wrap01((a0.phase + Math.PI / 2) / TWO_PI - (plan.startSample + 1) * freq / rate);
    const b = renderCand('sine', phase0);
    const c = captured(b, residual);
    best = { shape: 'sine', phaseCycles: phase0, basis: b, energy: c.energy };
  }

  // harmonic-richness test: does the residual carry energy at 2f, 3f? If not, this
  // is a near-pure tone → sine is optimal and the shape scan is skipped (fast).
  const nyq = rate / 2;
  let rich = 0, base = a0.amp + 1e-12;
  for (const h of [2, 3, 4]) if (h * freq < nyq) rich += projectAt(residual, h * freq, rate, region.on, region.off).amp;
  if (rich / base < harmonicGate) return best;

  // other shapes: phase search. Coarse grid + golden refine. Kept fine (32/16) — a
  // saw target must recover to machine-zero (recover-2wave), which needs the phase
  // needle threaded precisely; the harmonic gate above already skips this whole loop
  // for near-pure tones, so the cost lands only where a shape actually helps.
  for (const shape of ['triangle', 'saw', 'square']) {
    let bp = 0, be = -1, bb = null;
    const COARSE = 32;
    for (let i = 0; i < COARSE; i++) {
      const p = i / COARSE;
      const b = renderCand(shape, p);
      const c = captured(b, residual);
      if (c.energy > be) { be = c.energy; bp = p; bb = b; }
    }
    // golden refine around bp
    let lo = bp - 1 / COARSE, hi = bp + 1 / COARSE;
    for (let it = 0; it < 16; it++) {
      const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
      const e1 = captured(renderCand(shape, m1), residual).energy;
      const e2 = captured(renderCand(shape, m2), residual).energy;
      if (e1 > e2) hi = m2; else lo = m1;
    }
    const p = (lo + hi) / 2;
    const b = renderCand(shape, p);
    const e = captured(b, residual).energy;
    if (e > best.energy) best = { shape, phaseCycles: p, basis: b, energy: e };
  }
  return best;
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// Choose the frequency capturing the most of `residual`'s energy over `region`,
// render-free (analytic projection). Combines the FFT's strongest resolved peak
// (refined sub-bin) with an explicit sub-Hz low-frequency search. Returns a Hz
// value or null when the residual holds nothing worth fitting.
export function chooseFrequency(residual, plan, region, {
  minFreq = 0.02, maxFreqFrac = 0.999,
} = {}) {
  const rate = plan.sampleRate;
  const seg = residual.subarray(region.on, region.off);
  if (seg.length < 8) return null;
  const capE = (freq) => { const a = projectAt(residual, freq, rate, region.on, region.off); return a.amp * a.amp; };
  const cands = [];
  const peaks = spectralPeaks(seg, rate, { maxPeaks: 1, minFreq: Math.max(minFreq, 5), maxFreqFrac });
  let peakE = 0;
  if (peaks.length) {
    const binHz = rate / nextPow2(seg.length);
    const rf = refineFreq(residual, rate, Math.max(minFreq, peaks[0].freq - 3 * binHz), Math.min(maxFreqFrac * rate / 2, peaks[0].freq + 3 * binHz));
    cands.push(rf); peakE = capE(rf);
  }
  const lf = lowFreqAtom(residual, rate, { fLo: Math.max(minFreq, 0.02), fHi: 5, refEnergy: peakE });
  if (lf != null) cands.push(refineFreq(residual, rate, lf * 0.98, lf * 1.02, 60));
  if (!cands.length) return null;
  let freq = cands[0], bestE = capE(cands[0]);
  for (const f of cands.slice(1)) { const e = capE(f); if (e > bestE) { bestE = e; freq = f; } }
  return bestE > 0 ? freq : null;
}

// Fit ONE wave-atom into `slot` of `genome` to explain `residual`: pick shape+phase
// (or sine), fit an amplitude envelope, and A/B a pitch-envelope alternative. This
// is the shared unit used both by the constructive pass and by the scheduler's
// reallocation ("wave stealing", BRIEF-2 §4b.7). Sets the slot's genes at unit gain
// (the caller re-solves gains by LS). Returns { basis, atom } or null if no atom.
export function fitOneAtom(genome, slot, residual, plan, region, gate, {
  minFreq = 0.02, maxFreqFrac = 0.999, shapeSearch = true, harmonicGate = 0.15,
  ampEnv = true, envMinDynRange = 1.6, envMaxNodes = 8,
  pitchEnv = true, pitchMinDrift = 40, pitchPhaseSteps = 32, pitchMargin = 1.02,
  gateRepeat = true, gatePhaseSteps = 32, gateMargin = 1.02,
  freq = null,
} = {}) {
  const rate = plan.sampleRate;
  if (freq == null) freq = chooseFrequency(residual, plan, region, { minFreq, maxFreqFrac });
  if (freq == null) return null;
  const gateObj = gate ? { preSamp: gate.preSamp, durSamp: gate.durSamp, midSamp: gate.midSamp, midOn: gate.midOn } : null;

  let chosen;
  if (shapeSearch) {
    chosen = fitAtomWave(residual, freq, gate, plan, region, { harmonicGate });
  } else {
    const a = projectAt(residual, freq, rate, region.on, region.off);
    const phase0 = wrap01((a.phase + Math.PI / 2) / TWO_PI - (plan.startSample + 1) * freq / rate);
    const scratch = scratchWave('sine', freq, phase0, gateObj, rate);
    chosen = { shape: 'sine', phaseCycles: phase0, basis: renderWaveWindow(scratch, 0, plan) };
  }

  setShapeWave(genome, slot, {
    shape: chosen.shape, freq, phaseCycles: chosen.phaseCycles, gainLin: 1,
    gate: gateObj, sampleRate: rate,
  });

  // Amplitude envelope (§4b.1). Non-stationary partials only; preserves additivity.
  let envInfo = null;
  if (ampEnv) {
    const track = measureAmpTrack(residual, plan, freq, region);
    const dr = trackDynamicRange(track.amps);
    if (dr >= envMinDynRange) {
      const fit = fitDbEnvelope(track, { maxNodes: envMaxNodes });
      applyAmpEnvelope(genome, slot, fit);
      chosen.basis = renderWaveWindow(genome, slot, plan);
      envInfo = { nodes: fit.nNodes, dynRange: dr };
    }
  }

  // Pitch envelope (§4b.2), per-atom A/B — kept only if it captures more residual
  // energy than the stationary version (self-rejects phase-incoherent glide fits).
  let pitchInfo = null;
  // Cheap drift pre-check gates the expensive ridge tracking: a near-stationary
  // partial (dominant case on bell/chime targets) skips trackRidge entirely.
  if (pitchEnv && cheapDriftCents(residual, plan, freq, region) >= pitchMinDrift * 0.5) {
    const base = slot * GENES_PER_WAVE;
    const eStat = captured(chosen.basis, residual).energy;
    const ridge = trackRidge(residual, plan, freq, region);
    if (ridgeDriftCents(ridge) >= pitchMinDrift) {
      const snapshot = genome.data.slice(base, base + GENES_PER_WAVE);
      applyPitchEnvelope(genome, slot, fitPitchEnvelope(ridge, { maxNodes: envMaxNodes }));
      applyAmpEnvelope(genome, slot, fitDbEnvelope({ props: ridge.props, amps: ridge.amps }, { maxNodes: envMaxNodes }));
      let bestPh = 0, bestE = -1, bestBasis = null;
      for (let i = 0; i < pitchPhaseSteps; i++) {
        const ph = i / pitchPhaseSteps;
        genome.setWaveStored(slot, 'phase', ph);
        const b = renderWaveWindow(genome, slot, plan);
        const e = captured(b, residual).energy;
        if (e > bestE) { bestE = e; bestPh = ph; bestBasis = b; }
      }
      if (bestE > eStat * pitchMargin) {
        genome.setWaveStored(slot, 'phase', bestPh);
        chosen.basis = bestBasis;
        pitchInfo = { nodes: fitPitchEnvelope(ridge).nNodes, driftCents: Math.round(ridgeDriftCents(ridge)) };
      } else {
        genome.data.set(snapshot, base);
      }
    }
  }

  // Repeating-gate (mid_wait) A/B — BRIEF-2 §4b.3. A bursting partial (the real key
  // to recover-6wave's comb) is one gated carrier repeating on a period, which an
  // amplitude envelope cannot represent and stationary sines waste a slot-per-comb-
  // line on. Detect the burst period/duty from the residual and, if it captures more
  // energy than the incumbent, keep a single mid_wait wave for the whole comb.
  let gateInfo = null;
  if (gateRepeat) {
    const base = slot * GENES_PER_WAVE;
    const eIncumbent = captured(chosen.basis, residual).energy;
    const det = detectRepeatingGate(residual, rate, freq, region.on, region.off, {});
    if (det) {
      const snapshot = genome.data.slice(base, base + GENES_PER_WAVE);
      setShapeWave(genome, slot, { shape: chosen.shape, freq, phaseCycles: chosen.phaseCycles, gainLin: 1, gate: null, sampleRate: rate });
      setGateSamples(genome, slot, {
        preSamp: det.preSamp, durSamp: det.durSamp,
        midSamp: Math.max(1, det.periodSamp - det.durSamp), midOn: true, sampleRate: rate,
      });
      let bestPh = 0, bestE = -1, bestBasis = null;
      for (let i = 0; i < gatePhaseSteps; i++) {
        const ph = i / gatePhaseSteps;
        genome.setWaveStored(slot, 'phase', ph);
        const b = renderWaveWindow(genome, slot, plan);
        const e = captured(b, residual).energy;
        if (e > bestE) { bestE = e; bestPh = ph; bestBasis = b; }
      }
      if (bestE > eIncumbent * gateMargin) {
        genome.setWaveStored(slot, 'phase', bestPh);
        chosen.basis = bestBasis;
        gateInfo = { periodS: +(det.periodSamp / rate).toFixed(4), duty: +det.duty.toFixed(3), strength: +det.strength.toFixed(2) };
      } else {
        genome.data.set(snapshot, base);
      }
    }
  }

  return { basis: chosen.basis, atom: { freq, shape: chosen.shape, phaseCycles: chosen.phaseCycles, env: envInfo, pitch: pitchInfo, gate: gateInfo } };
}

// Run the constructive pass.
//   target : windowed target (Float64Array/Float32Array length winLen)
//   plan   : score plan
//   opts.maxWaves     — wave budget (BRIEF §3.4)
//   opts.gate         — override gate (else auto-detected; null forces "no gate")
//   opts.minImprove   — stop when a step improves SSE by less than this fraction
//   opts.shapeSearch  — try all shapes per atom (default true); false = sine only
//   opts.onStep(info) — progress callback per placed wave
// Returns { genome, sse, gains, slots, atoms, gate, assembly }.
export function constructAdditive(target, plan, {
  maxWaves = 64, gate = undefined, minImprove = 1e-5, minFreq = 0.02, maxFreqFrac = 0.999,
  shapeSearch = true, harmonicGate = 0.15, onStep = null,
  ampEnv = true, envMinDynRange = 1.6, envMaxNodes = 8,
  pitchEnv = true, pitchMinDrift = 40, pitchPhaseSteps = 32, pitchMargin = 1.02,
} = {}) {
  const winLen = plan.winLen;
  const rate = plan.sampleRate;
  if (gate === undefined) gate = detectGate(target, plan);
  const region = gate && gate.onsetWin != null
    ? { on: gate.onsetWin, off: gate.offsetWin + 1 }
    : { on: 0, off: winLen };

  const genome = blankGenome();
  const bases = [];
  const slots = [];
  const atoms = [];
  const assembly = [];

  const residual = Float64Array.from(target);
  let prevSSE = Infinity;
  const atomOpts = {
    minFreq, maxFreqFrac, shapeSearch, harmonicGate,
    ampEnv, envMinDynRange, envMaxNodes,
    pitchEnv, pitchMinDrift, pitchPhaseSteps, pitchMargin,
  };

  for (let iter = 0; iter < maxWaves; iter++) {
    const slot = slots.length;
    const fit = fitOneAtom(genome, slot, residual, plan, region, gate, atomOpts);
    if (!fit) break;

    bases.push(fit.basis);
    slots.push(slot);
    atoms.push(fit.atom);

    const { gains, sse } = leastSquaresGains(bases, target);
    const recon = new Float64Array(winLen);
    for (let k = 0; k < bases.length; k++) { const a = gains[k], b = bases[k]; for (let n = 0; n < winLen; n++) recon[n] += a * b[n]; }
    for (let n = 0; n < winLen; n++) residual[n] = target[n] - recon[n];

    assembly.push({ nWaves: bases.length, sse, samples: Float64Array.from(recon), gains: Float64Array.from(gains) });
    if (onStep) onStep({ nWaves: bases.length, sse, freq: fit.atom.freq, shape: fit.atom.shape });

    const improve = prevSSE === Infinity ? 1 : (prevSSE - sse) / Math.max(prevSSE, 1e-30);
    prevSSE = sse;
    if (sse <= 1e-10 || (iter > 0 && improve < minImprove)) break;
  }

  const finalGains = assembly.length ? assembly[assembly.length - 1].gains : new Float64Array(0);
  for (let k = 0; k < slots.length; k++) setGainLin(genome, slots[k], finalGains[k]);
  for (let k = 0; k < slots.length; k++) if (Math.abs(finalGains[k]) < 1e-4) setSwitch(genome, slots[k], 'active', false);

  return { genome, sse: prevSSE === Infinity ? null : prevSSE, gains: finalGains, slots, atoms, gate, assembly };
}
