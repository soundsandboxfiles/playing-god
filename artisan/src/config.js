// config.js — configuration: defaults, JSON config files, and CLI overrides.
//
// ARTISAN's CLI mirrors MIMIC's shape (BRIEF §12): `node run.js --config <file>`
// plus overrides. Everything a run needs is resolved here into one plain object,
// so run.js stays thin and the same resolution is testable without spawning a CLI.
//
// Precedence (low → high): built-in DEFAULTS  <  --config file  <  individual CLI
// flags. A CLI flag always wins, so the owner can nudge one dial without editing
// a file.

import { readFileSync } from 'node:fs';
import { WAVE_SLOTS } from './engine.js';

// The knobs, each with a plain-English help line (surfaced by run.js --help).
// `null` means "resolve later" (e.g. render length defaults to the window length).
export const OPTION_HELP = {
  target: 'What to match. A path to a .wav file, OR a built-in target name: ' +
    'recover-2wave, recover-6wave, recover-seedpick, sine-220, chirp-110-880, decay-440.',
  offset: 'y — where the scored window begins in the render, in SECONDS (default 0). ' +
    'The render is scored over [offset, offset + target-length).',
  offsetSamples: 'y in SAMPLES instead of seconds (advanced; overrides --offset if set).',
  renderLength: 'Total render length in SECONDS. Default: the shortest length that ' +
    'covers the window (offset + target length), which maximises envelope resolution ' +
    'inside the window. Must be ≥ offset + target length.',
  maxWaves: `Most waves ARTISAN may switch on (default ${WAVE_SLOTS} = every slot). No minimum.`,
  maxMinutes: 'Wall-clock cap in MINUTES. The run stops cleanly and keeps everything ' +
    'saved when it hits this (default: no cap — the method converges on its own).',
  workers: 'How many CPU cores to use for parallel scoring (default: auto = cores − 1).',
  run: 'Name for this run\'s output folder under output/ (default: derived from the target).',
  seed: 'Random seed, so a run is reproducible (default 1). All randomness logs its seed.',
  // method dials (sensible defaults; the owner rarely touches these)
  maxAtoms: 'Cap on how many wave-atoms the constructive pass places (default: maxWaves).',
  shapeSearch: 'Try all four oscillator shapes per wave, not just sine (default true). ' +
    'Great for shaped/harmonic sounds (a sawtooth becomes ONE saw wave); worth turning ' +
    'off for pure-tone sounds like bell chimes, where it only costs time.',
  ampEnv: 'Fit a per-wave amplitude (loudness-over-time) envelope so one wave can track ' +
    'a decaying or swelling partial (default true). The single biggest win for struck/enveloped sounds.',
  pitchEnv: 'Let a wave glide in pitch to follow a sweeping partial, kept only when it ' +
    'measurably beats a fixed-pitch wave (default true).',
  gateRepeat: 'Let one wave repeat as a burst train (for pulsing/comb-like sounds), kept ' +
    'only when it measurably beats the alternatives (default true).',
  refineRounds: 'How many polishing rounds after construction (default 6; the anytime ' +
    'scheduler mostly supersedes this).',
  cmaes: 'Whether to run the CMA-ES polish stage at the end (default true).',
  cmaesIters: 'Max CMA-ES iterations in the polish stage (default 400).',
  sampleRate: 'Engine sample rate (default 22050). Changing this is advanced and off-spec.',
  quiet: 'Print less progress (default false).',
};

export const DEFAULTS = {
  target: 'recover-2wave',
  offset: 0,            // seconds
  offsetSamples: null,  // overrides offset when set
  renderLength: null,   // resolved to window length in target.js
  maxWaves: WAVE_SLOTS,
  maxMinutes: null,     // no cap
  workers: null,        // auto
  run: null,            // derived
  seed: 1,
  maxAtoms: null,       // = maxWaves
  shapeSearch: true,
  ampEnv: true,
  pitchEnv: true,
  gateRepeat: true,
  refineRounds: 6,
  cmaes: true,
  cmaesIters: 400,
  sampleRate: 22050,
  quiet: false,
};

// Coerce a raw CLI/JSON value to the type implied by the default.
function coerce(key, value) {
  const d = DEFAULTS[key];
  if (typeof d === 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`--${key} expects a number, got "${value}"`);
    return n;
  }
  if (typeof d === 'boolean') {
    if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
    if (value === false || value === 'false' || value === '0' || value === 'no') return false;
    throw new Error(`--${key} expects true/false, got "${value}"`);
  }
  // number-or-null / string-or-null fields: accept numbers where they parse.
  if ((key === 'renderLength' || key === 'offsetSamples' || key === 'maxMinutes' ||
       key === 'workers' || key === 'maxAtoms' || key === 'cmaesIters') && value !== null && value !== '') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return value;
}

// Parse argv (after `node run.js`) into { flags, positional }. Supports
// `--key value`, `--key=value`, and boolean `--flag` (implicit true).
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let key = a.slice(2), value;
      const eq = key.indexOf('=');
      if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { value = argv[++i]; }
      else { value = true; } // bare flag
      flags[key] = value;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

// Resolve DEFAULTS < config file < CLI flags into one config object.
export function resolveConfig(flags = {}) {
  const cfg = { ...DEFAULTS };

  // config file first (so CLI flags can override it)
  if (flags.config) {
    let raw;
    try { raw = readFileSync(flags.config, 'utf8'); }
    catch (e) { throw new Error(`could not read --config file "${flags.config}": ${e.message}`); }
    let obj;
    try { obj = JSON.parse(raw); }
    catch (e) { throw new Error(`--config file "${flags.config}" is not valid JSON: ${e.message}`); }
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in DEFAULTS)) throw new Error(`config file has unknown key "${k}"`);
      cfg[k] = coerce(k, v);
    }
  }

  // CLI flags last
  for (const [k, v] of Object.entries(flags)) {
    if (k === 'config' || k === 'help') continue;
    if (!(k in DEFAULTS)) throw new Error(`unknown option --${k}. Run --help to see options.`);
    cfg[k] = coerce(k, v);
  }

  // fill dependent defaults
  if (cfg.maxAtoms == null) cfg.maxAtoms = cfg.maxWaves;
  return cfg;
}
