// synthesis.js — GENOME → SAMPLES (§4). Deterministic, many-to-one, headless.
//
// This is the AUDIO engine minus the audio: it fills a Float32Array with the raw
// mixed output (Σ out[i], §4.2). Loudness normalisation (§4.7) is applied
// afterwards by loudness.js, and everything downstream — descriptors, perceptual
// distance, the visualiser — reads the NORMALISED buffer (§4.7). Keeping this
// module DOM-free is what lets Gates 2a/2b run under plain node (README).
//
// The per-sample recurrence is exactly §4.2. The only subtlety is modulation
// routing (§4.3): a wave may modulate another, cycles are allowed (including
// self-modulation), and a back-edge in the routing graph reads its source's
// value from the PREVIOUS sample (δ = 1) so the recurrence stays computable.

import {
  WAVE_SLOTS, WAVE_SCHEMA, WAVE_INDEX, ENV_MAX_NODES,
} from './genome.js';

const TWO_PI = Math.PI * 2;

function dB2lin(dB) {
  return Math.pow(10, dB / 20);
}

// Shape family (§3.1). `p` is a phase in CYCLES; only its fractional part matters.
// Output is the sum of enabled shapes weighted by their gene values, normalised
// by the enabled-weight sum (§3.1). All disabled / all-zero → silence.
function shapeValue(p, dec) {
  const frac = p - Math.floor(p);
  let sum = 0;
  const w = dec.shapeW;
  if (dec.shapeOn[0]) sum += w[0] * Math.sin(TWO_PI * p);               // sine
  if (dec.shapeOn[1]) sum += w[1] * (1 - 4 * Math.abs(frac - 0.5));      // triangle
  if (dec.shapeOn[2]) sum += w[2] * (2 * frac - 1);                      // saw
  if (dec.shapeOn[3]) sum += w[3] * (frac < 0.5 ? 1 : -1);              // square
  return dec.shapeWSum > 0 ? sum / dec.shapeWSum : 0;
}

// Envelope curve shape (§3.1): y = x^(2^curve), with `tension` blending between
// that ease and its mirror so convex/linear/concave and their asymmetries lie on
// one continuum. x, output in [0,1].
function curveShape(x, curve, tension) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const exp = Math.pow(2, curve);           // curve∈[−1,1] → exp∈[0.5,2]
  const ease = Math.pow(x, exp);
  const mirror = 1 - Math.pow(1 - x, exp);
  return (1 - tension) * ease + tension * mirror;
}

// Piecewise envelope over normalised render time t∈[0,1]. `nodes` is {level[],
// time[], curve[], tension[], n}. Node positions are the sum-normalised cumulative
// `time` proportions (§3.1: "normalised by the sum across active nodes"), so
// mutating one time redistributes the rest rather than sliding off the end.
function envValue(t, nodes) {
  const n = nodes.n;
  const pos = nodes.pos; // precomputed cumulative-normalised positions, length n
  if (t <= pos[0]) return nodes.level[0];
  if (t >= pos[n - 1]) return nodes.level[n - 1];
  // Find the segment [pos[j], pos[j+1]] containing t. n≤8 so a linear scan is fine.
  let j = 0;
  while (j < n - 1 && t > pos[j + 1]) j++;
  const span = pos[j + 1] - pos[j];
  const x = span > 1e-9 ? (t - pos[j]) / span : 0;
  const shaped = curveShape(x, nodes.curve[j], nodes.tension[j]);
  return nodes.level[j] + (nodes.level[j + 1] - nodes.level[j]) * shaped;
}

// Decode one wave's genes into a fast per-sample struct. Called once per render.
function decodeWave(gn, w, sampleRate) {
  const base = w * WAVE_SCHEMA.length;
  const raw = (name) => gn.data[base + WAVE_INDEX[name]];
  const val = (name) => gn.getWave(w, name);

  const dec = {};
  dec.gainOutLin = (raw('gain_out_on') >= 0.5) ? dB2lin(val('gain_out')) : 0;
  dec.gainMod = (raw('gain_mod_on') >= 0.5) ? val('gain_mod') : 0;

  dec.shapeOn = [
    raw('shape_sine_on') >= 0.5, raw('shape_triangle_on') >= 0.5,
    raw('shape_saw_on') >= 0.5, raw('shape_square_on') >= 0.5,
  ];
  dec.shapeW = [val('shape_sine'), val('shape_triangle'), val('shape_saw'), val('shape_square')];
  dec.shapeWSum = 0;
  for (let k = 0; k < 4; k++) if (dec.shapeOn[k]) dec.shapeWSum += dec.shapeW[k];

  dec.phase0 = val('phase');
  dec.pitchMaster = val('pitch_master');

  // Timing gate in samples (§4.2). Guard each to at least 1 sample.
  dec.preSamp = Math.max(0, Math.round(val('pre_wait') * sampleRate));
  dec.durSamp = Math.max(1, Math.round(val('duration') * sampleRate));
  dec.midSamp = Math.max(1, Math.round(val('mid_wait') * sampleRate));
  dec.midOn = raw('mid_wait_on') >= 0.5;

  // Amp / pitch envelopes.
  dec.ampOn = raw('amp_env_on') >= 0.5;
  dec.pitchOn = raw('pitch_env_on') >= 0.5;
  dec.ampNodes = decodeNodes(gn, w, 'amp', val('amp_env_n_nodes'));
  dec.pitchNodes = decodeNodes(gn, w, 'pitch', val('pitch_env_n_nodes'));

  // Modulation.
  dec.pmOn = raw('pm_on') >= 0.5;
  dec.amOn = raw('am_on') >= 0.5;
  dec.pmSource = val('pm_source');
  dec.amSource = val('am_source');
  dec.pmDepth = val('pm_depth');
  dec.amDepth = val('am_depth');

  dec.phaseAcc = 0; // running phase accumulator in cycles
  return dec;
}

function decodeNodes(gn, w, kind, nNodes) {
  const n = Math.max(2, Math.min(ENV_MAX_NODES, nNodes));
  const level = new Float64Array(n), time = new Float64Array(n),
    curve = new Float64Array(n), tension = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    level[k] = gn.getWave(w, `${kind}_node${k}_level`);
    time[k] = gn.getWave(w, `${kind}_node${k}_time`);
    curve[k] = gn.getWave(w, `${kind}_node${k}_curve`);
    tension[k] = gn.getWave(w, `${kind}_node${k}_tension`);
  }
  // Cumulative-normalised positions in [0,1].
  const pos = new Float64Array(n);
  let acc = 0, total = 0;
  for (let k = 0; k < n; k++) total += Math.max(1e-6, time[k]);
  for (let k = 0; k < n; k++) { acc += Math.max(1e-6, time[k]); pos[k] = acc / total; }
  return { level, time, curve, tension, n, pos };
}

// Build the modulation routing order (§4.3). Returns:
//   order   — active-wave indices in an evaluation order where forward-edge
//             sources precede the waves that read them;
//   delayed — a Set of "reader,source" pairs that are back-edges (δ=1);
//   nBackEdges — count, logged as an anomaly diagnostic (§14.6).
// WHY DFS with grey/back-edge marking: it is the standard, cheap way to give a
// cyclic graph a well-defined per-sample update — cycles are permitted and
// musically wanted (§4.3, self-modulation → saw/noise), they just cost one
// sample of delay on the edge that closes the loop.
function buildRoutingOrder(decoded, activeSet) {
  const color = new Map();   // slot → 'grey' | 'black'
  const order = [];
  const delayed = new Set();
  let nBackEdges = 0;

  function inputsOf(i) {
    const d = decoded[i];
    const ins = [];
    if (d.pmOn && activeSet.has(d.pmSource)) ins.push(d.pmSource);
    if (d.amOn && activeSet.has(d.amSource)) ins.push(d.amSource);
    return ins;
  }

  // Iterative DFS to avoid stack limits (up to 64 nodes is small, but keep it safe).
  function visit(start) {
    const stack = [{ node: start, ins: inputsOf(start), idx: 0 }];
    color.set(start, 'grey');
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.idx < frame.ins.length) {
        const s = frame.ins[frame.idx++];
        const c = color.get(s);
        if (c === undefined) {
          color.set(s, 'grey');
          stack.push({ node: s, ins: inputsOf(s), idx: 0 });
        } else if (c === 'grey') {
          // Back edge: `frame.node` depends on `s`, an ancestor still on the stack.
          delayed.add(frame.node + ',' + s);
          nBackEdges++;
        }
        // black → forward/cross edge, already ordered, nothing to do.
      } else {
        color.set(frame.node, 'black');
        order.push(frame.node);
        stack.pop();
      }
    }
  }

  for (const i of activeSet) if (color.get(i) === undefined) visit(i);
  return { order, delayed, nBackEdges };
}

// Render a genome to raw samples.
//   opts.sampleRate  — 44100 for audio, 22050 for descriptors (§12)
//   opts.lengthS     — render length in seconds (the servo's L, or a gate value)
//   opts.captureVisEnv — if true, also return a 60 Hz per-wave amplitude envelope
//                        for the visualiser fast channel (§11). Off for gates.
// Returns { samples, sampleRate, lengthS, activeWaves, nBackEdges, samplePeak,
//           clipped, hasFeedbackCycle, visEnv?, visEnvHz?, renderError }.
export function render(gn, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const lengthS = opts.lengthS || 60;
  const N = Math.max(1, Math.round(lengthS * sampleRate));
  const samples = new Float32Array(N);

  // Decode only ACTIVE waves; inactive slots contribute nothing (§4.2, `active[i]`
  // factor) and act as constant-0 modulation sources.
  const decoded = {};
  const activeSet = new Set();
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (gn.getWave(w, 'active') >= 0.5) {
      decoded[w] = decodeWave(gn, w, sampleRate);
      activeSet.add(w);
    }
  }
  const activeWaves = activeSet.size;

  const routing = buildRoutingOrder(decoded, activeSet);
  const order = routing.order;

  // Modulation-signal buffers, indexed by absolute slot (§4.2 modsig[]).
  const modCur = new Float64Array(WAVE_SLOTS);
  const modPrev = new Float64Array(WAVE_SLOTS);

  // Precompute, per wave in `order`, whether its pm/am edges are delayed.
  for (const i of order) {
    const d = decoded[i];
    d.pmDelayed = routing.delayed.has(i + ',' + d.pmSource);
    d.amDelayed = routing.delayed.has(i + ',' + d.amSource);
    d.pmSourceActive = activeSet.has(d.pmSource);
    d.amSourceActive = activeSet.has(d.amSource);
  }

  // Optional 60 Hz per-wave visual envelope (§11 fast channel). One value per
  // active wave per 1/60 s frame; captured free during synthesis.
  let visEnv = null, visHopSamp = 0, visFrames = 0;
  const VIS_HZ = 60;
  if (opts.captureVisEnv) {
    visHopSamp = Math.max(1, Math.round(sampleRate / VIS_HZ));
    visFrames = Math.ceil(N / visHopSamp);
    visEnv = {}; // slot → Float32Array(visFrames)
    for (const i of order) visEnv[i] = new Float32Array(visFrames);
  }

  let renderError = null;
  let peak = 0;
  let clipped = false;

  try {
    const invSR = 1 / sampleRate;
    for (let n = 0; n < N; n++) {
      const t = N > 1 ? n / (N - 1) : 0; // normalised render position for envelopes
      let out = 0;

      for (let oi = 0; oi < order.length; oi++) {
        const i = order[oi];
        const d = decoded[i];

        // Pitch → frequency → phase accumulation (§4.2).
        let cents = d.pitchMaster;
        if (d.pitchOn) cents += envValue(t, d.pitchNodes);
        const freq = 0.01 * Math.pow(2, cents / 1200);
        d.phaseAcc += freq * invSR;

        // Amplitude envelope (multiplicative, §4.4). Levels are dB → linear.
        const env = d.ampOn ? dB2lin(envValue(t, d.ampNodes)) : 1;

        // Gate (§4.2): pre_wait silence, duration on, mid_wait off, repeating
        // while mid_wait_on.
        let gate;
        if (n < d.preSamp) gate = 0;
        else {
          const local = n - d.preSamp;
          if (!d.midOn) gate = local < d.durSamp ? 1 : 0;
          else {
            const period = d.durSamp + d.midSamp;
            gate = (local % period) < d.durSamp ? 1 : 0;
          }
        }

        // Phase modulation (§4.1: PM not FM). mod_phase is in cycles, matching the
        // phase accumulator's units (§4.2 writes `phase[i] + mod_phase`).
        let modPhase = 0;
        if (d.pmOn && d.pmSourceActive) {
          const src = d.pmDelayed ? modPrev[d.pmSource] : modCur[d.pmSource];
          modPhase = d.pmDepth * src;
        }
        const raw = shapeValue(d.phaseAcc + d.phase0 + modPhase, d);

        // Amplitude modulation (multiplicative, clamped ≥0 per §4.2).
        let am = 1;
        if (d.amOn && d.amSourceActive) {
          const src = d.amDelayed ? modPrev[d.amSource] : modCur[d.amSource];
          am = Math.max(0, 1 + d.amDepth * src);
        }

        const activity = raw * env * gate;
        modCur[i] = activity * d.gainMod;       // modsig[i] (§4.2); gainMod=0 if off
        out += activity * d.gainOutLin * am;    // out[i] (§4.2); gainOutLin=0 if off

        if (visEnv && (n % visHopSamp) === 0) {
          visEnv[i][(n / visHopSamp) | 0] = Math.abs(activity * d.gainOutLin);
        }
      }

      samples[n] = out;
      const a = Math.abs(out);
      if (a > peak) peak = a;
      if (a > 1) clipped = true; // pre-normalisation clip flag (§14.1 sample_peak/clipped)

      // Advance the one-sample delay line for back-edges.
      modPrev.set(modCur);
    }
  } catch (e) {
    // Synthesis must never take the whole run down; a failed render is logged as
    // an anomaly (§14.6) and the Creature is skipped by the caller.
    renderError = String(e && e.message ? e.message : e);
  }

  // Guard against NaN/Inf leaking into descriptors or the audio device (§14.6).
  let hadNonFinite = false;
  for (let n = 0; n < N; n++) {
    if (!Number.isFinite(samples[n])) { samples[n] = 0; hadNonFinite = true; }
  }

  return {
    samples, sampleRate, lengthS, N,
    activeWaves,
    nBackEdges: routing.nBackEdges,
    hasFeedbackCycle: routing.nBackEdges > 0,
    samplePeak: peak,
    clipped,
    hadNonFinite,
    visEnv, visEnvHz: VIS_HZ, visFrames,
    renderError,
  };
}
