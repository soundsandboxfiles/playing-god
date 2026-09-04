// genome-build.js — set engine genes directly from analysis (BRIEF §4 explicitly
// permits setting genes with no mutation/variation). Turns wave-atoms into a valid
// genome, and renders each wave's contribution alone so linfit.js can solve the
// optimal linear gains in closed form.
//
// Everything here uses the empirically-confirmed engine laws (DECISIONS 2026-09-03):
//   • single sine:  out[n] = G·sin(2π·((n+1)·f/rate + phase0))
//   • f from pitch_master cents:  cents = 1200·log2(f / 0.01),  f = 0.01·2^(cents/1200)
//   • phaseAcc runs from n=0 regardless of the gate, so an atom's cosine phase φ
//     maps to phase0 = (φ + π/2)/(2π) − f/rate  (mod 1)
//   • globals are phenotype-inert (render() never reads them) → left at 0.

import {
  Genome, WAVE_SCHEMA, WAVE_INDEX, WAVE_SLOTS, ENV_MAX_NODES, inverseMap,
  renderRaw,
} from './engine.js';

const TWO_PI = Math.PI * 2;
const wrap01 = (x) => ((x % 1) + 1) % 1;

// Set a per-wave gene from a DECLARED value (Hz, dB, seconds, proportion) — the
// inverse of the schema's map, so it round-trips through the engine's read.
export function setDecl(g, slot, name, value) {
  const d = WAVE_SCHEMA[WAVE_INDEX[name]];
  g.setWaveStored(slot, name, inverseMap(d, value));
}
export function setSwitch(g, slot, name, on) {
  g.setWaveStored(slot, name, on ? 1 : 0);
}

// A blank genome: every wave inactive, globals irrelevant (inert). Waves default
// to a benign state so an accidentally-activated slot is silent, not noisy.
export function blankGenome() {
  const g = new Genome();
  for (let w = 0; w < WAVE_SLOTS; w++) setSwitch(g, w, 'active', false);
  return g;
}

// cents for a frequency, clamped to the pitch_master declared range (0..25100).
function centsForFreq(freq) {
  const cents = 1200 * Math.log2(Math.max(1e-9, freq) / 0.01);
  return Math.max(0, Math.min(25100, cents));
}

// Set a wave's gate from integer sample counts. period/duty/pre_prop are chosen so
// the engine's round() recovers (preSamp, durSamp, midSamp). midOn=false → plays
// once (gate = local < durSamp). Float32 quantisation can shift a boundary by ±1
// sample; refinement (optimize.js) locks it exactly where it matters.
export function setGateSamples(g, slot, { preSamp = 0, durSamp, midSamp = 1, midOn = false, sampleRate }) {
  const preS = preSamp / sampleRate;
  const durS = Math.max(1, durSamp) / sampleRate;
  const midS = Math.max(1, midSamp) / sampleRate;
  const period = durS + midS;
  setDecl(g, slot, 'period', period);
  setDecl(g, slot, 'duty', durS / period);
  setDecl(g, slot, 'pre_prop', Math.max(1e-6, preS / period));
  setSwitch(g, slot, 'mid_wait_on', midOn);
}

const SHAPES = ['sine', 'triangle', 'saw', 'square'];

// Configure `slot` as a single oscillator of a given basic shape. Frequency in Hz,
// phase in CYCLES (0..1), unit linear gain by default (LS overwrites the gain
// later). Optional gate in samples; default = sounds over the whole render.
export function setShapeWave(g, slot, {
  shape = 'sine', freq, phaseCycles = 0, gainLin = 1, gate = null, sampleRate,
}) {
  setSwitch(g, slot, 'active', true);
  setSwitch(g, slot, 'gain_out_on', true);
  setSwitch(g, slot, 'gain_mod_on', false);
  for (const s of SHAPES) setSwitch(g, slot, `shape_${s}_on`, s === shape);
  setDecl(g, slot, `shape_${shape}`, 1);
  setSwitch(g, slot, 'amp_env_on', false);
  setSwitch(g, slot, 'pitch_env_on', false);
  setSwitch(g, slot, 'pm_on', false);
  setSwitch(g, slot, 'am_on', false);
  g.setWaveStored(slot, 'pitch_master', inverseMap(WAVE_SCHEMA[WAVE_INDEX['pitch_master']], centsForFreq(freq)));
  g.setWaveStored(slot, 'phase', wrap01(phaseCycles));
  setGainLin(g, slot, gainLin);
  if (gate) setGateSamples(g, slot, { ...gate, sampleRate });
  else {
    // sound over the whole render: long duration, play once, no pre-wait.
    // period ≤ ~22s keeps pre_prop floor from creating a pre-wait sample.
    const durS = 20;
    setDecl(g, slot, 'period', durS);
    setDecl(g, slot, 'duty', 1);
    setDecl(g, slot, 'pre_prop', 1e-6);
    setSwitch(g, slot, 'mid_wait_on', false);
  }
  return g;
}

// Back-compat sine helper.
export function setSineWave(g, slot, opts) {
  return setShapeWave(g, slot, { ...opts, shape: 'sine' });
}

// Map an analysis atom {freq, amp, phase(cosine, rad)} onto a sine wave in `slot`.
// The gain is left at unit (LS fills it); phase uses the derived cosine→engine map.
// `startSample` = the scored window's start in render samples (plan.startSample):
// the atom's phase is measured referenced to the window start, while the engine's
// phaseAcc runs from render n=0, so the mapping carries a (startSample+1) term.
// Derivation (DECISIONS 2026-09-03): phase0 = (φ+π/2)/(2π) − (startSample+1)·f/rate.
export function atomToSineWave(g, slot, atom, { gate = null, sampleRate, startSample = 0 }) {
  const f = atom.freq;
  const phase0 = wrap01((atom.phase + Math.PI / 2) / TWO_PI - (startSample + 1) * f / sampleRate);
  return setSineWave(g, slot, { freq: f, phaseCycles: phase0, gainLin: 1, gate, sampleRate });
}

// Set a wave's linear output gain. Negative gains are represented by a half-cycle
// phase flip (sin(x+π) = −sin(x)) so the stored gain stays a positive dB. Gains
// are clamped to the engine's dB range [−80, +6] dB ⇒ linear [1e-4, ~1.995].
const GAIN_LIN_MAX = Math.pow(10, 6 / 20);
const GAIN_LIN_MIN = Math.pow(10, -80 / 20);
export function setGainLin(g, slot, a) {
  let mag = Math.abs(a);
  if (a < 0) g.setWaveStored(slot, 'phase', wrap01(g.getWaveStored(slot, 'phase') + 0.5));
  if (mag < GAIN_LIN_MIN) { // effectively silent — turn the wave's audio output off
    setSwitch(g, slot, 'gain_out_on', false);
    return;
  }
  setSwitch(g, slot, 'gain_out_on', true);
  mag = Math.min(GAIN_LIN_MAX, mag);
  setDecl(g, slot, 'gain_out', 20 * Math.log10(mag));
}

// Render only `slot` active (all others forced inactive) and return the windowed
// samples as a Float64Array — the LS basis vector for that wave.
export function renderWaveWindow(g, slot, plan) {
  const solo = g.clone();
  for (let w = 0; w < WAVE_SLOTS; w++) if (w !== slot) setSwitch(solo, w, 'active', false);
  setSwitch(solo, slot, 'active', true);
  const r = renderRaw(solo, { lengthS: plan.totalLengthS, sampleRate: plan.sampleRate });
  const out = new Float64Array(plan.winLen);
  const off = plan.startSample;
  for (let i = 0; i < plan.winLen; i++) { const s = r.samples[off + i]; out[i] = s === undefined ? 0 : s; }
  return out;
}

// Count active waves.
export function activeCount(g) {
  let c = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) if (g.getWave(w, 'active') >= 0.5) c++;
  return c;
}

// Fit a piecewise amplitude envelope (≤ ENV_MAX_NODES nodes, in dB) to an
// amplitude track {times(s), amps(linear)} over the render, and switch the wave's
// amp envelope on. `refLin` is the linear amplitude that maps to 0 dB (the wave's
// own output gain), so the envelope encodes the RELATIVE shape. Node times are the
// engine's cumulative-normalised proportions of the whole render length.
export function setAmpEnvelope(g, slot, track, { renderLengthS, refLin = 1, nNodes = ENV_MAX_NODES }) {
  const K = Math.max(2, Math.min(ENV_MAX_NODES, nNodes));
  // sample the track at K evenly spaced render-time proportions
  const tmax = renderLengthS;
  const props = [];
  for (let k = 0; k < K; k++) props.push(K === 1 ? 0 : k / (K - 1));
  setSwitch(g, slot, 'amp_env_on', true);
  setDecl(g, slot, 'amp_env_n_nodes', K);
  // equal time spacing → each node's stored `time` equal (cumulative-normalised)
  for (let k = 0; k < K; k++) {
    const tprop = props[k];
    const lin = sampleTrack(track, tprop * tmax);
    const rel = Math.max(1e-4, lin / Math.max(1e-9, refLin));
    let dB = 20 * Math.log10(rel);
    dB = Math.max(-80, Math.min(24, dB));
    setDecl(g, slot, `amp_node${k}_level`, dB);
    setDecl(g, slot, `amp_node${k}_time`, 1); // equal spacing after normalisation
    setDecl(g, slot, `amp_node${k}_curve`, 0);
    setDecl(g, slot, `amp_node${k}_tension`, 0.5);
  }
  // any unused node slots keep prior values but n_nodes caps how many are read
}

function sampleTrack(track, t) {
  const { times, amps } = track;
  if (times.length === 0) return 0;
  if (t <= times[0]) return amps[0];
  if (t >= times[times.length - 1]) return amps[amps.length - 1];
  let j = 0;
  while (j < times.length - 1 && t > times[j + 1]) j++;
  const span = times[j + 1] - times[j];
  const frac = span > 1e-12 ? (t - times[j]) / span : 0;
  return amps[j] + (amps[j + 1] - amps[j]) * frac;
}
