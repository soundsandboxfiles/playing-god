// envelope.js — amplitude-envelope fitting (BRIEF-2 §4b.1, "the flagship").
//
// The single biggest thing v1 left on the floor: the 34-gene per-wave amplitude
// envelope. v1 gave each wave ONE amplitude for the whole render, so a decaying
// chime partial was too loud in the tail and too quiet at the strike — paying SSE
// at both ends. The engine's `amp_env` is a multiplicative, piecewise-linear-in-dB
// envelope over the WHOLE render (t = n/(N-1), independent of the gate). A struck
// decay a(t) = A·e^{-t/τ} is LINEAR in dB, so even two dB nodes reproduce a pure
// exponential decay exactly — which is why this is the cheapest large win.
//
// KEY: adding an amplitude envelope does NOT break additivity. Each wave's basis
// (shape × envelope × gate) is still a fixed vector; the mix is still Σ_k gain_k ·
// basis_k, so linfit.js's closed-form gain solve and additive-model.js's fast
// scorer keep working unchanged. Only cross-wave PM/AM breaks additivity (see
// modulation.js). (CONTINUATION-v2 DECISIONS 2026-09-04.)
//
// Method, per atom:
//   1. measureAmpTrack — short-time complex projection of the (residual) signal
//      onto the atom's frequency gives that partial's amplitude a(t) over time.
//   2. fitDbEnvelope — pick ≤8 nodes on the dB track by weighted recursive max-
//      deviation splitting (energy-weighted Douglas–Peucker). Interpolating, so
//      node levels sit on the track (continuous by construction); coordinate
//      descent then L2-polishes the levels/times against the true engine.
//   3. applyAmpEnvelope — write the nodes into the engine's amp_env genes, placing
//      nodes at arbitrary render-time proportions via the cumulative-time encoding.

import { ENV_MAX_NODES, WAVE_SCHEMA, WAVE_INDEX, inverseMap } from './engine.js';
import { projectAt } from './analysis.js';
import { setDecl, setSwitch } from './genome-build.js';

const EPS = 1e-9;

// Measure a partial's amplitude over time by short-time projection of `signal`
// onto `freq`. Returns { props, amps } where props are RENDER-TIME proportions in
// [0,1] (so they map straight onto the engine's whole-render envelope clock) and
// amps are linear peak amplitudes. `plan` gives the window→render mapping.
//   region  — {on, off} window-sample bounds to measure over (default whole window)
export function measureAmpTrack(signal, plan, freq, region = null, {
  frameS = null, hopS = null, minFrames = 6,
} = {}) {
  const rate = plan.sampleRate;
  const winLen = plan.winLen;
  const on = region ? region.on : 0;
  const off = region ? region.off : winLen;
  // Frame long enough to resolve the frequency (≈8 cycles), but bounded so short
  // windows still yield several frames. Hop = quarter frame for smoothness.
  const cyc = 8 / Math.max(1e-6, freq);
  let frame = frameS != null ? frameS : Math.min(0.08, Math.max(0.012, cyc));
  let frameN = Math.max(4, Math.round(frame * rate));
  const span = off - on;
  if (frameN > span / 2) frameN = Math.max(4, Math.floor(span / 2));
  let hopN = hopS != null ? Math.max(1, Math.round(hopS * rate)) : Math.max(1, Math.round(frameN / 4));
  // ensure at least minFrames
  while ((span - frameN) / hopN + 1 < minFrames && hopN > 1) hopN = Math.max(1, Math.floor(hopN / 2));

  const props = [], amps = [];
  const startSample = plan.startSample;
  const denom = Math.max(1, plan.N - 1);
  for (let s = on; s + frameN <= off || props.length === 0; s += hopN) {
    const e = Math.min(off, s + frameN);
    const a = projectAt(signal, freq, rate, s, e);
    const centerWin = s + (e - s) / 2;              // window-sample centre
    const renderSample = startSample + centerWin;   // render-sample centre
    props.push(Math.min(1, Math.max(0, renderSample / denom)));
    amps.push(a.amp);
    if (e >= off) break;
  }
  return { props, amps };
}

// Dynamic range of an amplitude track: peak / (a robust "typical" level). Used to
// decide whether a wave WANTS an envelope at all — a flat partial (recover-2wave)
// should stay stationary so it doesn't overfit measurement noise and so the
// stationary machine-zero cases are preserved.
export function trackDynamicRange(amps) {
  let peak = 0;
  for (const a of amps) if (a > peak) peak = a;
  if (peak <= 0) return 1;
  const sorted = Float64Array.from(amps).sort();
  const med = sorted[sorted.length >> 1] || EPS;
  return peak / Math.max(EPS, med);
}

// Pick ≤ maxNodes breakpoint indices for a piecewise-linear (interpolating) fit of
// `values` over positions `props`, weighted by `weights`. Energy-weighted recursive
// max-deviation splitting: start from the endpoints, then repeatedly insert a node
// where the current interpolating linear fit deviates most (weighted). Interpolating
// (nodes sit on the data) keeps the fit continuous by construction; coordinate
// descent later L2-polishes the levels against the true engine. Returns a sorted
// array of chosen indices (always includes 0 and M-1). Shared by the amplitude (dB)
// and pitch (cents) envelope fitters.
export function pickNodes(props, values, weights, maxNodes) {
  const M = props.length;
  if (M <= 2) return M === 2 ? [0, 1] : [0];
  const chosen = [0, M - 1];
  const K = Math.min(maxNodes, M);
  while (chosen.length < K) {
    let bestIdx = -1, bestErr = 0;
    for (let s = 0; s < chosen.length - 1; s++) {
      const i0 = chosen[s], i1 = chosen[s + 1];
      if (i1 - i0 < 2) continue;
      const t0 = props[i0], t1 = props[i1], d0 = values[i0], d1 = values[i1];
      const span = t1 - t0;
      for (let i = i0 + 1; i < i1; i++) {
        const frac = span > EPS ? (props[i] - t0) / span : 0;
        const fit = d0 + (d1 - d0) * frac;
        const err = Math.abs(values[i] - fit) * Math.sqrt((weights ? weights[i] : 1) + EPS);
        if (err > bestErr) { bestErr = err; bestIdx = i; }
      }
    }
    if (bestIdx < 0 || bestErr <= 0) break;
    let p = 0; while (p < chosen.length && chosen[p] < bestIdx) p++;
    chosen.splice(p, 0, bestIdx);
  }
  return chosen;
}

// Fit ≤ maxNodes nodes to a dB envelope over the amplitude track. Works in dB
// relative to the track peak (so node levels are ≤ 0 dB and the wave's output gain
// carries the absolute level — LS solves it). Node placement is energy-weighted
// (loud regions win nodes). Returns { props, levelsDb, peak, nNodes }.
export function fitDbEnvelope(track, { maxNodes = ENV_MAX_NODES, floorDb = -80 } = {}) {
  const { props, amps } = track;
  const M = props.length;
  let peak = 0;
  for (const a of amps) if (a > peak) peak = a;
  if (M < 2 || peak <= 0) {
    return { props: [0, 1], levelsDb: [0, 0], peak: Math.max(EPS, peak), nNodes: 2 };
  }
  // dB track relative to peak, clamped to the gene's floor.
  const db = new Float64Array(M);
  for (let i = 0; i < M; i++) db[i] = Math.max(floorDb, 20 * Math.log10(Math.max(EPS, amps[i] / peak)));
  const w = new Float64Array(M);
  for (let i = 0; i < M; i++) w[i] = amps[i] * amps[i]; // energy weight

  const chosen = pickNodes(props, db, w, maxNodes);
  const outProps = chosen.map((i) => props[i]);
  const outLevels = chosen.map((i) => db[i]);
  // NOTE: we keep the measured render-time proportions of the first/last frames
  // rather than forcing [0,1]. For a wave that sounds throughout, props already
  // span ~0..1 (env holds the end levels flat over the few ms of attack/tail). For
  // a GATED wave, the frames only cover the gated sub-range of render time, and the
  // envelope must sit exactly there — the gate zeros the wave outside it, so
  // stretching the envelope to [0,1] would misplace the whole decay.
  return { props: outProps, levelsDb: outLevels, peak, nNodes: outProps.length };
}

// Write an amplitude envelope into a wave's amp_env genes. `props` are render-time
// proportions in [0,1] (strictly increasing; first should be 0, last 1); levelsDb
// are the dB levels at those proportions (≤ 0 if peak-relative). The engine encodes
// node positions as cumulative-normalised `time` values: pos[k] = Σ_{j≤k} time[j] /
// Σ time, so time[0] = p0 and time[k] = p_k − p_{k-1} places nodes exactly at the
// requested proportions (CONTINUATION-v2 DECISIONS 2026-09-04). curve = 0 makes the
// interpolation linear-in-dB (⇒ exponential in linear amplitude) regardless of
// tension, which is exactly a segment of a struck decay.
export function applyAmpEnvelope(g, slot, { props, levelsDb }, { curve = 0, tension = 0.5 } = {}) {
  const K = Math.max(2, Math.min(ENV_MAX_NODES, props.length));
  setSwitch(g, slot, 'amp_env_on', true);
  setDecl(g, slot, 'amp_env_n_nodes', K);
  const timeDesc = WAVE_SCHEMA[WAVE_INDEX['amp_node0_time']];
  let prev = 0;
  for (let k = 0; k < K; k++) {
    const p = props[k];
    const dt = k === 0 ? Math.max(1e-6, p) : Math.max(1e-6, p - prev);
    prev = p;
    let dB = levelsDb[k];
    dB = Math.max(-80, Math.min(24, dB));
    setDecl(g, slot, `amp_node${k}_level`, dB);
    // store the cumulative-time delta directly (inverseMap for the linear 0..1 gene)
    g.setWaveStored(slot, `amp_node${k}_time`, inverseMap(timeDesc, Math.min(1, dt)));
    setDecl(g, slot, `amp_node${k}_curve`, curve);
    setDecl(g, slot, `amp_node${k}_tension`, tension);
  }
}

// Convenience: measure + fit + apply in one call, returning the fit (for logging).
// Only applies if the track's dynamic range exceeds `minDynRange` (else the partial
// is effectively stationary and gets no envelope). Returns the fit or null.
export function fitAndApplyAmpEnvelope(g, slot, signal, plan, freq, region, {
  maxNodes = ENV_MAX_NODES, minDynRange = 1.6,
} = {}) {
  const track = measureAmpTrack(signal, plan, freq, region);
  const dr = trackDynamicRange(track.amps);
  if (dr < minDynRange) return null;
  const fit = fitDbEnvelope(track, { maxNodes });
  applyAmpEnvelope(g, slot, fit);
  return { fit, dynRange: dr };
}
