// target.js — resolve the thing ARTISAN is trying to match into concrete samples
// and a scored-window plan.
//
// Two sources:
//   • a .wav file on disk  → decoded with MIMIC's wavio conventions (BRIEF §2):
//     16/24-bit PCM, stereo averaged to mono, linear-resampled to 22050 Hz.
//   • a built-in benchmark name → MIMIC's own `benchmarkSuite` (BRIEF §10.2 says
//     reuse ../mimic/lib/targets.js), covering the recoverability targets
//     (recover-2wave/6wave/seedpick, where SSE=0 provably exists) and the
//     synthetic ones (sine-220, chirp-110-880, decay-440).
//
// The scored window is [y, y+x) where x = target length in samples and y = offset
// (BRIEF §2). Default render length = the shortest length covering the window
// (offset + target length), which maximises envelope resolution inside the window
// (BRIEF §2 off-canvas rule; DECISIONS 2026-09-03).

import { readFileSync, existsSync } from 'node:fs';
import { decodeWav, benchmarkSuite, ENGINE_RATE } from './engine.js';
import { makePlan, silenceFloor } from './score.js';

const BUILTIN_NAMES = new Set([
  'recover-2wave', 'recover-6wave', 'recover-seedpick',
  'sine-220', 'chirp-110-880', 'decay-440',
]);

export function isBuiltinTarget(name) {
  return BUILTIN_NAMES.has(name);
}

// Load the target samples + solution (if any) for a config's `target` field.
// Returns { name, kind, samples, sampleRate, solutionGenome, source }.
function loadTargetSamples(target, sampleRate) {
  // A file path (contains a slash, ends .wav, or exists on disk) → decode WAV.
  const looksLikePath = typeof target === 'string' &&
    (target.includes('/') || target.toLowerCase().endsWith('.wav') || existsSync(target));
  if (looksLikePath) {
    if (!existsSync(target)) throw new Error(`target WAV not found: "${target}"`);
    const bytes = readFileSync(target);
    const dec = decodeWav(bytes, sampleRate);
    return {
      name: basename(target),
      kind: 'wav',
      samples: dec.samples,
      sampleRate: dec.sampleRate,
      solutionGenome: null,
      source: {
        path: target,
        sourceRate: dec.sourceRate,
        sourceChannels: dec.sourceChannels,
        sourceBits: dec.sourceBits,
        durationS: dec.durationS,
      },
    };
  }

  // Otherwise a built-in benchmark name.
  if (!BUILTIN_NAMES.has(target)) {
    throw new Error(
      `unknown target "${target}". Give a path to a .wav file, or one of: ` +
      [...BUILTIN_NAMES].join(', '));
  }
  const suite = benchmarkSuite();
  const entry = suite.find((e) => e.name === target);
  if (!entry) throw new Error(`built-in target "${target}" is unavailable (mimic suite lacks it)`);
  return {
    name: entry.name,
    kind: entry.kind,
    samples: entry.make(),
    sampleRate: ENGINE_RATE,
    solutionGenome: entry.solution || null,   // recoverability targets carry the genome
    source: { builtin: true, note: entry.note || null },
  };
}

function basename(p) {
  const parts = String(p).split('/');
  return parts[parts.length - 1] || String(p);
}

// Resolve a whole config into a target descriptor + scoring plan.
// Returns { name, kind, target (Float32Array), sampleRate, offsetSamples,
//   renderLengthS, plan, silenceFloor, solutionGenome, source }.
export function resolveTarget(cfg) {
  const sampleRate = cfg.sampleRate || ENGINE_RATE;
  const t = loadTargetSamples(cfg.target, sampleRate);
  const target = t.samples;
  const x = target.length;                       // window length in samples

  // y (offset): samples override seconds if given.
  const offsetSamples = cfg.offsetSamples != null
    ? Math.round(cfg.offsetSamples)
    : Math.round((cfg.offset || 0) * sampleRate);
  if (offsetSamples < 0) throw new Error('offset must be ≥ 0');
  const offsetS = offsetSamples / sampleRate;

  // Render length: default = shortest length covering the window (offset + x).
  const minLenS = (offsetSamples + x) / sampleRate;
  let renderLengthS = cfg.renderLength != null ? cfg.renderLength : minLenS;
  if (renderLengthS < minLenS - 1e-12) {
    throw new Error(
      `--render-length ${renderLengthS}s is shorter than the window end ` +
      `${minLenS.toFixed(6)}s (offset + target length). It must be ≥ that.`);
  }

  const plan = makePlan({ target, renderLengthS, offsetS, sampleRate });

  return {
    name: t.name,
    kind: t.kind,
    target,
    sampleRate,
    offsetSamples,
    offsetS,
    renderLengthS: plan.totalLengthS,   // may have been extended by makeScorePlan
    plan,
    silenceFloor: silenceFloor(plan),
    solutionGenome: t.solutionGenome,
    source: t.source,
  };
}
