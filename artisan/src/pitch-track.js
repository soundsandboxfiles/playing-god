// pitch-track.js — pitch-envelope recovery by ridge tracking (BRIEF-2 §4b.2).
//
// A stationary sine can only sit at one frequency. Real partials glide: speech
// formants sweep, struck-bell partials drift, a chirp is nothing BUT glide. v1
// spent a stationary wave per frequency it passed through; the engine's 35-gene
// pitch envelope lets ONE wave follow the whole glide. The engine reads
// instantaneous cents = pitch_master + pitch_env(t), turns it into a frequency
// (0.01·2^(cents/1200)) and ACCUMULATES phase — so if we recover the frequency
// track f(t), the engine integrates it back into the right phase progression.
//
// Like amplitude envelopes, a pitch envelope does NOT break additivity: the wave's
// basis is still a fixed vector once its genes are set. So the LS gain solve and the
// additive fast-scorer keep working. (CONTINUATION-v2 DECISIONS 2026-09-04.)
//
// Method:
//   1. trackRidge — follow the local spectral energy peak frame-by-frame, starting
//      from a seed frequency, refining within a small band around the previous
//      frame's frequency. Yields f(t) and the amplitude a(t) along the ridge.
//   2. fitPitchEnvelope — convert f(t) to cents, choose a pitch_master reference,
//      and fit ≤8 cents nodes (energy-weighted, shared picker with the amp fitter).
//   3. applyPitchEnvelope — write pitch_master + the cents nodes into the genes.

import { ENV_MAX_NODES, WAVE_SCHEMA, WAVE_INDEX, inverseMap } from './engine.js';
import { projectAt } from './analysis.js';
import { pickNodes } from './envelope.js';
import { setDecl, setSwitch } from './genome-build.js';

const EPS = 1e-9;
const centsOf = (freq) => 1200 * Math.log2(Math.max(1e-9, freq) / 0.01);

// Golden-section search for the frequency in [lo,hi] maximising energy captured
// OVER THE FRAME [n0,n1] only. (analysis.refineFreq projects over the whole signal,
// which is wrong for tracking a moving ridge — it always returns the band centre.)
function refineFreqLocal(signal, rate, lo, hi, n0, n1, iters = 40) {
  const gr = (Math.sqrt(5) - 1) / 2;
  const e = (f) => { const a = projectAt(signal, f, rate, n0, n1); return a.amp * a.amp; };
  let a = lo, b = hi;
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = e(c), fd = e(d);
  for (let i = 0; i < iters; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = e(c); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = e(d); }
    if (b - a < 1e-5) break;
  }
  return 0.5 * (a + b);
}

// Track the frequency ridge of a partial through the signal. Returns
// { props, freqs, amps } over render-time proportions. `seedFreq` anchors the first
// frame; each later frame refines within ±`bandCents` of the previous frequency, so
// the tracker follows a glide but won't jump to a louder neighbour partial.
export function trackRidge(signal, plan, seedFreq, region = null, {
  frameS = null, hopS = null, bandCents = 200, minFrames = 6,
} = {}) {
  const rate = plan.sampleRate;
  const winLen = plan.winLen;
  const on = region ? region.on : 0;
  const off = region ? region.off : winLen;
  const cyc = 12 / Math.max(1e-6, seedFreq);           // resolve freq: ~12 cycles
  let frameN = Math.max(8, Math.round((frameS != null ? frameS : Math.min(0.06, Math.max(0.02, cyc))) * rate));
  const span = off - on;
  if (frameN > span / 2) frameN = Math.max(8, Math.floor(span / 2));
  let hopN = hopS != null ? Math.max(1, Math.round(hopS * rate)) : Math.max(1, Math.round(frameN / 4));
  while ((span - frameN) / hopN + 1 < minFrames && hopN > 1) hopN = Math.max(1, Math.floor(hopN / 2));

  const props = [], freqs = [], amps = [];
  const startSample = plan.startSample;
  const denom = Math.max(1, plan.N - 1);
  let prevF = seedFreq;
  for (let s = on; s + frameN <= off || props.length === 0; s += hopN) {
    const e = Math.min(off, s + frameN);
    const lo = prevF * Math.pow(2, -bandCents / 1200);
    const hi = prevF * Math.pow(2, bandCents / 1200);
    const f = refineFreqLocal(signal, rate, Math.max(1e-4, lo), hi, s, e, 40);
    const a = projectAt(signal, f, rate, s, e);
    const centerWin = s + (e - s) / 2;
    props.push(Math.min(1, Math.max(0, (startSample + centerWin) / denom)));
    freqs.push(f);
    amps.push(a.amp);
    prevF = f;
    if (e >= off) break;
  }
  return { props, freqs, amps };
}

// CHEAP drift estimate: refine the partial's frequency over the first vs the last
// third of the region (two windowed golden searches) and return |cents| between
// them. ~2 projections instead of trackRidge's dozens of frames, so it can gate the
// expensive ridge tracking — a near-stationary partial (bell chime) skips tracking
// entirely, which is the dominant construction speed-up on long targets.
export function cheapDriftCents(signal, plan, freq, region = null) {
  const rate = plan.sampleRate;
  const on = region ? region.on : 0;
  const off = region ? region.off : plan.winLen;
  const span = off - on;
  if (span < 12) return 0;
  const third = Math.floor(span / 3);
  const lo = freq * Math.pow(2, -300 / 1200), hi = freq * Math.pow(2, 300 / 1200);
  const f1 = refineFreqLocal(signal, rate, lo, hi, on, on + third, 30);
  const f2 = refineFreqLocal(signal, rate, lo, hi, off - third, off, 30);
  return Math.abs(1200 * Math.log2(Math.max(1e-9, f2) / Math.max(1e-9, f1)));
}

// Total pitch drift of a ridge in cents (max − min). Used to decide whether a wave
// wants a pitch envelope at all — a stationary partial keeps a single pitch_master.
export function ridgeDriftCents(track) {
  let lo = Infinity, hi = -Infinity;
  for (const f of track.freqs) { const c = centsOf(f); if (c < lo) lo = c; if (c > hi) hi = c; }
  return hi - lo;
}

// Fit a pitch envelope to a frequency ridge. Chooses pitch_master as the cents of
// the energy-weighted median frequency (a stable reference), then fits ≤8 cents
// OFFSET nodes to the cents track. Returns { pitchMasterCents, props, levelsCents,
// nNodes }.
export function fitPitchEnvelope(track, { maxNodes = ENV_MAX_NODES } = {}) {
  const { props, freqs, amps } = track;
  const M = props.length;
  const cents = new Float64Array(M);
  for (let i = 0; i < M; i++) cents[i] = centsOf(freqs[i]);
  const w = new Float64Array(M);
  for (let i = 0; i < M; i++) w[i] = amps[i] * amps[i];
  // energy-weighted mean cents as the master reference
  let sw = 0, sc = 0;
  for (let i = 0; i < M; i++) { sw += w[i]; sc += w[i] * cents[i]; }
  const master = sw > 0 ? sc / sw : (M ? cents[0] : 0);
  if (M < 2) return { pitchMasterCents: master, props: [0, 1], levelsCents: [0, 0], nNodes: 2 };
  const chosen = pickNodes(props, cents, w, maxNodes);
  const outProps = chosen.map((i) => props[i]);
  const outLevels = chosen.map((i) => cents[i] - master); // offsets from master
  return { pitchMasterCents: master, props: outProps, levelsCents: outLevels, nNodes: outProps.length };
}

// Write a pitch envelope into a wave. Sets pitch_master (clamped to its declared
// range) and the cents-offset nodes (clamped to ±9600). Node-time encoding matches
// the amp envelope (cumulative deltas). curve=0 → linear-in-cents interpolation.
export function applyPitchEnvelope(g, slot, fit, { curve = 0, tension = 0.5 } = {}) {
  const { pitchMasterCents, props, levelsCents } = fit;
  const K = Math.max(2, Math.min(ENV_MAX_NODES, props.length));
  setDecl(g, slot, 'pitch_master', Math.max(0, Math.min(25100, pitchMasterCents)));
  setSwitch(g, slot, 'pitch_env_on', true);
  setDecl(g, slot, 'pitch_env_n_nodes', K);
  const timeDesc = WAVE_SCHEMA[WAVE_INDEX['pitch_node0_time']];
  let prev = 0;
  for (let k = 0; k < K; k++) {
    const p = props[k];
    const dt = k === 0 ? Math.max(1e-6, p) : Math.max(1e-6, p - prev);
    prev = p;
    setDecl(g, slot, `pitch_node${k}_level`, Math.max(-9600, Math.min(9600, levelsCents[k])));
    g.setWaveStored(slot, `pitch_node${k}_time`, inverseMap(timeDesc, Math.min(1, dt)));
    setDecl(g, slot, `pitch_node${k}_curve`, curve);
    setDecl(g, slot, `pitch_node${k}_tension`, tension);
  }
}
