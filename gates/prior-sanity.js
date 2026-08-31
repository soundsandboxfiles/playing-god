// prior-sanity.js — the §5.2 prior sanity check.
//
// A PLUMBING CHECK, NOT A QUALITY JUDGEMENT (§5.2). It renders 1,000 random
// genomes and reports the raw distributions of peak, RMS, silence fraction,
// onset count and spectral centroid, plus counts of clipping and effectively
// silent renders. It answers factual questions about the priors ("are 80% of
// random genomes silent?") — NOT questions about what will score well. The
// artefact carries NO verdict, by design (§5.2): a verdict here would be a claim
// about what generation zero *ought* to sound like, which is the failure mode the
// whole project guards against (§2.3).
//
// Rendered at L_init = 60 s (Appendix), the length a listener actually hears
// first, and at the descriptor sample rate (22.05 kHz, §12). Sanity metrics are
// computed on the RAW (pre-normalisation) buffer, since peak/clip/silence are
// properties of what the genome produces before the loudness safeguard rescales
// it (§4.7). The loudness pass is still run to report lufs_before and the
// near-silent count, which are factual readouts on the priors.
//
// Run: node gates/prior-sanity.js

import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { render } from '../src/synthesis.js';
import { normalizeLoudness } from '../src/loudness.js';
import { sanityMetrics } from '../src/descriptors.js';
import { complexity } from '../src/genome.js';
import { writeArtefact, distributionSummary } from './_util.js';

const N_GENOMES = 1000;   // §5.2
const LENGTH_S = 60;      // L_init (Appendix) — the first-listen length
const SAMPLE_RATE = 22050;

function main() {
  const rng = new RNG(0x5A17);
  const cols = {
    peak: [], rms: [], silence_frac: [], onsets: [], spectral_centroid_hz: [],
    lufs_before: [], active_wave_count: [], complexity: [], back_edges: [],
  };
  let nClipped = 0, nSilent = 0, nNearSilent = 0, nRenderErrors = 0, nNonFinite = 0;

  const t0 = Date.now();
  for (let i = 0; i < N_GENOMES; i++) {
    const g = randomGenome(rng);
    const r = render(g, { sampleRate: SAMPLE_RATE, lengthS: LENGTH_S });
    if (r.renderError) { nRenderErrors++; continue; }
    if (r.hadNonFinite) nNonFinite++;
    // Sanity metrics on the RAW buffer (before normalisation mutates it).
    const m = sanityMetrics(r.samples, SAMPLE_RATE);
    cols.peak.push(m.peak);
    cols.rms.push(m.rms);
    cols.silence_frac.push(m.silence_frac);
    cols.onsets.push(m.onsets);
    cols.spectral_centroid_hz.push(m.spectral_centroid_hz);
    cols.active_wave_count.push(r.activeWaves);
    cols.complexity.push(complexity(g));
    cols.back_edges.push(r.nBackEdges);
    if (m.clipped) nClipped++;
    if (m.silent) nSilent++;
    // Loudness pass (mutates a copy of the raw buffer) for lufs_before / near_silent.
    const loud = normalizeLoudness(Float32Array.from(r.samples), SAMPLE_RATE);
    if (loud.lufs_before !== null) cols.lufs_before.push(loud.lufs_before);
    if (loud.near_silent) nNearSilent++;

    if ((i + 1) % 200 === 0) console.log(`  ...${i + 1}/${N_GENOMES} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const distributions = {};
  for (const [k, v] of Object.entries(cols)) distributions[k] = distributionSummary(v);

  const payload = {
    gate: 'prior-sanity (§5.2)',
    note: 'PLUMBING CHECK — raw distributions only, no verdict (§5.2). Not a claim about what will score well.',
    config: { n_genomes: N_GENOMES, length_s: LENGTH_S, sample_rate: SAMPLE_RATE, seed: '0x5A17' },
    counts: {
      rendered: N_GENOMES - nRenderErrors,
      render_errors: nRenderErrors,
      non_finite_repaired: nNonFinite,
      clipped_raw: nClipped,
      effectively_silent_raw: nSilent,
      near_silent_loudness: nNearSilent,
    },
    distributions,
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('prior-sanity.json', payload);

  console.log('── §5.2 prior sanity check (1000 genomes, 60 s) ──');
  console.log('  counts:', JSON.stringify(payload.counts));
  for (const [k, d] of Object.entries(distributions)) {
    if (d.count === 0) { console.log(`  ${k}: (no data)`); continue; }
    console.log(`  ${k}: min=${fmt(d.min)} p50=${fmt(d.percentiles.p50)} mean=${fmt(d.mean)} p90=${fmt(d.percentiles.p90)} max=${fmt(d.max)}`);
  }
  console.log('  (no verdict — plumbing check, §5.2)');
  console.log('  artefact:', path);
}

function fmt(x) {
  if (x === null || x === undefined) return 'na';
  if (Math.abs(x) >= 1000 || (Math.abs(x) < 0.01 && x !== 0)) return x.toExponential(2);
  return x.toFixed(3);
}

main();
