// f3-pactive-batches.js — three Gate-1a-style audition batches at different init
// p_active (F3, V2-PROPOSALS). Owner instinct (2026-08-31): 1–3 wave creatures get
// samey; render batches at p_active 0.03 / 0.06 / 0.10 so the owner's ears set the
// constant tonight. Caveat carried (F3): some sameyness may live in the envelope /
// timing priors, not wave count — the comparison shows which. Each batch also gets a
// lightweight §5.2-style sanity summary over its 100 genomes (near-silent count,
// active-wave distribution), re-run per batch per F3.
//
// These are BIASES on the initial draw only (§2.1): a higher p_active starts more
// waves audible; it removes nothing from reach — a muted wave unmutes under
// selection regardless. This script judges NOTHING; Gate 1a needs ears (BUILD-ORDER).
//
// Run: node gates/f3-pactive-batches.js
// Output: output/gate-artefacts/f3-pactive-00{3,6}/ and -010/ (git-ignored; reach
// the host via sync-back). Serve each over localhost (F1) and audition audio-only.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { renderNormalized } from '../src/render.js';
import { encodeWav } from '../src/wav.js';
import { sanityMetrics } from '../src/descriptors.js';
import { ARTEFACT_DIR, ensureDir, writeArtefact } from './_util.js';
import { genomeSummary, harnessHtml } from './render-batch.js';

const N = 100;
const LENGTH_S = 30;        // as Gate 1a — long enough to judge "past 5 s", kind over 100
const SAMPLE_RATE = 44100;

// Distinct, recorded seeds per batch (F3: "distinct recorded seeds").
const BATCHES = [
  { pActive: 0.03, seed: 0xF30003, dir: 'f3-pactive-003' },
  { pActive: 0.06, seed: 0xF30006, dir: 'f3-pactive-006' },
  { pActive: 0.10, seed: 0xF30010, dir: 'f3-pactive-010' },
];

function stageBatch(cfg) {
  const batchDir = join(ARTEFACT_DIR, cfg.dir);
  ensureDir(batchDir);
  const rng = new RNG(cfg.seed);
  const manifest = [];
  const activeCounts = [];
  let nearSilent = 0;
  const silenceFracs = [];
  const t0 = Date.now();

  for (let i = 0; i < N; i++) {
    const g = randomGenome(rng, { pActive: cfg.pActive });
    const r = renderNormalized(g, { sampleRate: SAMPLE_RATE, lengthS: LENGTH_S });
    const name = `creature-${String(i).padStart(3, '0')}.wav`;
    if (r.renderError) { manifest.push({ index: i, filename: null, genome_id: g.id, render_error: r.renderError }); continue; }
    writeFileSync(join(batchDir, name), encodeWav(r.samples, SAMPLE_RATE));
    // §5.2-style sanity on the (trimmed, normalised) render the listener will hear.
    const m = sanityMetrics(r.samples, SAMPLE_RATE);
    activeCounts.push(r.activeWaves);
    silenceFracs.push(m.silence_frac);
    if (r.loudness && r.loudness.near_silent) nearSilent++;
    manifest.push({
      index: i, filename: name, genome_id: g.id,
      active_wave_count: r.activeWaves, has_feedback_cycle: r.hasFeedbackCycle,
      near_silent: r.loudness ? r.loudness.near_silent : null,
      leading_trim_s: Math.round(r.leading_trim_s * 1000) / 1000,
      waves: genomeSummary(g),
    });
  }

  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const hist = {};
  for (const c of activeCounts) hist[c] = (hist[c] || 0) + 1;
  const sanity = {
    p_active: cfg.pActive, seed: '0x' + cfg.seed.toString(16), n: N,
    near_silent_count: nearSilent,
    active_wave_count_mean: mean(activeCounts),
    active_wave_count_hist: hist,
    silence_frac_mean: mean(silenceFracs),
  };

  const manifestPayload = {
    gate: `1a-style audition (F3 p_active=${cfg.pActive}) — this script judges nothing`,
    length_s: LENGTH_S, sample_rate: SAMPLE_RATE, n: N,
    p_active: cfg.pActive, seed: sanity.seed,
    pass_condition: 'Owner ears (F5 threshold: hold past 5 s). Compare sameyness across p_active batches.',
    sanity_summary: sanity,
    clips: manifest,
  };
  // F1: manifest in the batch dir (harness fetches it there) + a committed copy.
  writeFileSync(join(batchDir, 'gate1a-batch-manifest.json'), JSON.stringify(manifestPayload, null, 2));
  writeArtefact(`f3-pactive-${String(cfg.pActive).replace('.', '')}-manifest.json`, manifestPayload);
  writeFileSync(join(batchDir, 'index.html'), harnessHtml(manifest.filter((m) => m.filename).length));

  console.log(`  [${cfg.dir}] p_active=${cfg.pActive}: ${manifest.filter((m) => m.filename).length}/${N} wavs, ` +
    `mean active waves=${sanity.active_wave_count_mean.toFixed(2)}, near-silent=${nearSilent}, ` +
    `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return sanity;
}

function main() {
  console.log('── F3: p_active comparison batches (0.03 / 0.06 / 0.10) ──');
  const sanities = BATCHES.map(stageBatch);
  // A combined summary artefact so the owner can compare wave-count distributions
  // without opening three manifests.
  writeArtefact('f3-pactive-summary.json', {
    note: 'F3 p_active comparison. Owner auditions ~20 of each on the host (audio-only) and picks the p_active. Sameyness that persists across p_active lives in the envelope/timing priors, not wave count (F3 caveat).',
    batches: sanities,
  });
  console.log('  On the HOST, for each dir: python3 -m http.server 8000, open http://localhost:8000/ (F1).');
  console.log('  Audio-only by default. Compare how samey each p_active feels. Judges nothing (BUILD-ORDER).');
}

main();
