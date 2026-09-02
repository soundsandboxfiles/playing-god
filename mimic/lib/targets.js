// targets.js — benchmark targets for the algorithm race (owner brief, step 5).
//
// Two families:
//   RECOVERABILITY targets — rendered from a KNOWN genome. A perfect solution
//     provably exists (the genome itself), so "how close can the search get to
//     re-finding a known sound" is a fair, answerable question. Built from the
//     engine's own priors/seed-picks so they are real engine phenotypes.
//   SYNTHETIC targets — pure sine / chirp / decaying tone. These are simple,
//     legible waveforms that a genome CANNOT necessarily reproduce exactly, so
//     they probe how the SSE landscape behaves when perfection is out of reach.
//
// All targets are raw Float32 at the engine rate, same units as renderRaw — the
// owner's SSE compares them like-for-like.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RNG } from '../../src/rng.js';
import { randomGenome } from '../../src/priors.js';
import { genomeFromRaw } from '../../src/seedpicks.js';
import { renderRaw, ENGINE_RATE } from './render-raw.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PG_ROOT = join(__dirname, '..', '..');       // playing-god/
const SEED_PICKS = join(PG_ROOT, 'output', 'gate-artefacts', 'seed-picks.json');

const TWO_PI = Math.PI * 2;

// ── synthetic waveforms ──────────────────────────────────────────────────────

// Pure sine at `freq` Hz, `amp` peak, `lengthS` seconds.
export function sine({ freq = 220, amp = 0.6, lengthS = 2, sampleRate = ENGINE_RATE } = {}) {
  const N = Math.round(lengthS * sampleRate);
  const s = new Float32Array(N);
  for (let n = 0; n < N; n++) s[n] = amp * Math.sin(TWO_PI * freq * n / sampleRate);
  return s;
}

// Linear-frequency chirp from f0 to f1 over the render.
export function chirp({ f0 = 110, f1 = 880, amp = 0.6, lengthS = 2, sampleRate = ENGINE_RATE } = {}) {
  const N = Math.round(lengthS * sampleRate);
  const s = new Float32Array(N);
  const dur = N / sampleRate;
  for (let n = 0; n < N; n++) {
    const t = n / sampleRate;
    // instantaneous freq f(t) = f0 + (f1-f0) t/dur; phase = integral.
    const phase = TWO_PI * (f0 * t + 0.5 * (f1 - f0) * t * t / dur);
    s[n] = amp * Math.sin(phase);
  }
  return s;
}

// Exponentially decaying tone: a struck-string / bell-ish envelope on a sine.
export function decayingTone({ freq = 440, amp = 0.9, tau = 0.6, lengthS = 2, sampleRate = ENGINE_RATE } = {}) {
  const N = Math.round(lengthS * sampleRate);
  const s = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const t = n / sampleRate;
    s[n] = amp * Math.exp(-t / tau) * Math.sin(TWO_PI * freq * t);
  }
  return s;
}

// ── recoverability: render a known genome ────────────────────────────────────

// Render a genome to raw samples (the target a search will try to recover).
export function fromGenome(genome, { lengthS = 2, sampleRate = ENGINE_RATE } = {}) {
  const r = renderRaw(genome, { lengthS, sampleRate });
  if (r.renderError) throw new Error('target genome failed to render: ' + r.renderError);
  return r.samples;
}

// A known n-wave genome drawn from the engine priors with a fixed seed. Because
// the search uses the same priors + operators, a perfect recovery exists.
export function knownGenome({ nActive = 2, seed = 0xC0FFEE } = {}) {
  const rng = new RNG(seed);
  return randomGenome(rng, { nActive });
}

// A seed-pick "favourite" genome (owner's Gate-1a picks). Returns null with a
// note if the artefact is absent, so benchmarks degrade gracefully.
export function seedPickGenome(index = 0) {
  let json;
  try {
    json = JSON.parse(readFileSync(SEED_PICKS, 'utf8'));
  } catch (e) {
    return { genome: null, note: 'seed-picks.json not found: ' + e.message };
  }
  const entry = json.genomes && json.genomes[index];
  if (!entry) return { genome: null, note: `seed-picks.json has no genome[${index}]` };
  // The stored data array can contain nulls (engine artefact quirk); genomeFromRaw
  // → Float32Array.from coerces them to 0, exactly as the engine's own loader does.
  const genome = genomeFromRaw(entry.data);
  return { genome, note: `seed-pick "${entry.index}" (v1_id ${entry.v1_id || '?'})` };
}

// The default benchmark suite: a spread of easy→hard targets. Each entry is
// { name, kind, lengthS, make() -> Float32Array, solution? }. `solution` is the
// genome for recoverability targets (so a run can report distance-to-solution).
export function benchmarkSuite({ recoverLengthS = 2.0 } = {}) {
  const suite = [];

  // Synthetic.
  suite.push({ name: 'sine-220', kind: 'synthetic', lengthS: 2.0,
    make: () => sine({ freq: 220, amp: 0.6, lengthS: 2.0 }) });
  suite.push({ name: 'chirp-110-880', kind: 'synthetic', lengthS: 2.0,
    make: () => chirp({ f0: 110, f1: 880, amp: 0.6, lengthS: 2.0 }) });
  suite.push({ name: 'decay-440', kind: 'synthetic', lengthS: 2.0,
    make: () => decayingTone({ freq: 440, amp: 0.9, tau: 0.6, lengthS: 2.0 }) });

  // Recoverability — 2-wave. Seed 14 renders a clean audible 2-wave phenotype
  // (peak 0.50, rms 0.19; scanned so the target is neither silent nor clipping).
  const g2 = knownGenome({ nActive: 2, seed: 14 });
  suite.push({ name: 'recover-2wave', kind: 'recoverability', lengthS: recoverLengthS,
    solution: g2, make: () => fromGenome(g2, { lengthS: recoverLengthS }) });

  // Recoverability — ~6-wave. Seed 4 renders an audible 6-wave phenotype
  // (peak 0.94, rms 0.32).
  const g6 = knownGenome({ nActive: 6, seed: 4 });
  suite.push({ name: 'recover-6wave', kind: 'recoverability', lengthS: recoverLengthS,
    solution: g6, make: () => fromGenome(g6, { lengthS: recoverLengthS }) });

  // Recoverability — seed-pick favourite (if available).
  const sp = seedPickGenome(0);
  if (sp.genome) {
    suite.push({ name: 'recover-seedpick', kind: 'recoverability', lengthS: recoverLengthS,
      solution: sp.genome, note: sp.note,
      make: () => fromGenome(sp.genome, { lengthS: recoverLengthS }) });
  }

  return suite;
}
