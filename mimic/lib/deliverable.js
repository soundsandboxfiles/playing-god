// deliverable.js — writes the owner's per-run deliverable (owner brief, step 8).
//
// output/<run>/ contains:
//   gen-NNNN.wav        fittest-so-far at every saved generation (hear convergence)
//   fittest.wav         the final fittest, faithful raw render (what was scored)
//   fittest-listen.wav  the final fittest, peak-normalised for comfortable ears
//   fittest.pg2.txt     the final fittest as a PG2 genome string
//   curve.json/.csv     the fitness curve (SSE + similarity per generation)
//   summary.json        run metadata + result
//   manifest.json       the generation list the listening harness reads
//   player.html         the listening harness (audio-only, plays gens in order)
//   serve.js            a one-command localhost server for the harness
//   README.txt          plain-English "how to listen", for a non-programmer
//
// GEN-WAV LOUDNESS POLICY (recorded): the gen WAVs share ONE gain across the whole
// run, chosen only to prevent clipping (gain = min(1, 0.97/globalPeak)); it never
// BOOSTS. So a quieter genome stays audibly quieter — preserving the owner's
// "quieter-is-punished" cue as you listen to the ascent — while a loud genome no
// longer clips. This is presentation only; scoring always used the raw samples.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderRaw } from './render-raw.js';
import { encodeWav } from './wavio.js';
import { encodeGenomeString } from './genome-string.js';
import { genomeFromData } from './algorithms/common.js';
import { PLAYER_HTML, SERVE_JS, README_TXT } from './harness-assets.js';

function pad4(n) { return String(n).padStart(4, '0'); }

// ── STREAMING API (crash-survivable) ─────────────────────────────────────────
// A long run streams each saved generation to disk the moment it is produced, so
// a crash keeps a playable partial deliverable (the previous 8-hour run wrote only
// at the end and lost everything when it died). streamStart() lays down the
// harness; streamSavedGen() writes one gen WAV and rewrites the manifest;
// streamFinalize() writes the final fittest + curves + summary.

export function streamStart(outDir, extra = {}) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'player.html'), PLAYER_HTML);
  writeFileSync(join(outDir, 'serve.js'), SERVE_JS);
  return { outDir, runName: extra.runName || 'run', gens: [], extra };
}

// Write one saved generation's WAV (raw; encodeWav hard-clamps for safety) and
// rewrite manifest.json. Returns the peak for logging.
export function streamSavedGen(state, savedGen, meta) {
  const sr = meta.sampleRate;
  const { samples, peak } = renderFull(savedGen.data, meta.totalLengthS, sr);
  const wavName = `gen-${pad4(savedGen.generation)}.wav`;
  writeFileSync(join(state.outDir, wavName), encodeWav(samples, sr));
  // Owner request (2026-09-03): every saved generation keeps its genome beside its
  // WAV, matched by number, so any point on the ascent can be replayed, inspected
  // or reseeded later. Same PG2 string format as the final fittest.
  const pg2Name = `gen-${pad4(savedGen.generation)}.pg2.txt`;
  writeFileSync(join(state.outDir, pg2Name), encodeGenomeString(genomeFromData(savedGen.data)) + '\n');
  state.gens.push({
    generation: savedGen.generation, file: wavName, genomeFile: pg2Name, sse: savedGen.sse,
    similarity: savedGen.similarity === Number.MAX_VALUE ? 'PERFECT' : savedGen.similarity, peak,
  });
  const manifest = { run: state.runName, streaming: true, gain: 1,
    currentGeneration: meta.currentGeneration, generations: state.gens };
  writeFileSync(join(state.outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return peak;
}

// Finalize: fittest WAVs, genome string, curves, summary, README. Called once the
// run ends (normally or early-stopped). `result` is runEvolution's return value.
export function streamFinalize(state, result, extra = {}) {
  const { meta, curve, best } = result;
  const sr = meta.sampleRate;
  const fin = renderFull(best.data, meta.totalLengthS, sr);
  writeFileSync(join(state.outDir, 'fittest.wav'), encodeWav(fin.samples, sr));
  const listenGain = fin.peak > 0 ? 0.97 / fin.peak : 1;
  writeFileSync(join(state.outDir, 'fittest-listen.wav'), encodeWav(applyGain(fin.samples, listenGain), sr));
  const genomeString = encodeGenomeString(genomeFromData(best.data));
  writeFileSync(join(state.outDir, 'fittest.pg2.txt'), genomeString + '\n');

  writeFileSync(join(state.outDir, 'curve.json'), JSON.stringify(curve, null, 1));
  const csvRows = ['generation,renders,bestSSE,bestSimilarity,meanSSE,wallMs'];
  for (const c of curve) {
    const sim = c.bestSimilarity === Number.MAX_VALUE ? 'inf' : c.bestSimilarity;
    csvRows.push([c.generation, c.renders, c.bestSSE, sim, c.meanSSE, Math.round(c.wallMs || 0)].join(','));
  }
  writeFileSync(join(state.outDir, 'curve.csv'), csvRows.join('\n') + '\n');

  const summary = {
    ...meta, runName: state.runName, target: extra.target || null,
    finalBestSSE: best.sse,
    finalBestSimilarity: best.similarity === Number.MAX_VALUE ? 'PERFECT (SSE=0)' : best.similarity,
    bestFoundAtGeneration: best.foundAtGeneration,
    scoredWindowSamples: result.plan.winLen,
    genomeString, savedGenerations: state.gens.length,
    silenceFloorSSE: extra.silenceFloorSSE ?? null, notes: extra.notes || [],
  };
  writeFileSync(join(state.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(state.outDir, 'README.txt'), README_TXT(state.runName, summary));
  // Final manifest (mark not-streaming so the harness shows it complete).
  writeFileSync(join(state.outDir, 'manifest.json'), JSON.stringify(
    { run: state.runName, streaming: false, gain: 1, generations: state.gens }, null, 1));
  return { outDir: state.outDir, summary, genomeString, manifest: { generations: state.gens } };
}

// Render a genome (raw) to full length; returns { samples, peak }.
function renderFull(data, lengthS, sampleRate) {
  const g = genomeFromData(data);
  const r = renderRaw(g, { lengthS, sampleRate });
  let peak = 0;
  for (let i = 0; i < r.samples.length; i++) { const a = Math.abs(r.samples[i]); if (a > peak) peak = a; }
  return { samples: r.samples, peak };
}

function applyGain(samples, gain) {
  if (gain === 1) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

export function writeRun(outDir, result, extra = {}) {
  mkdirSync(outDir, { recursive: true });
  const { meta, curve, savedGens, best, plan } = result;
  const sr = meta.sampleRate;
  const fullLen = meta.totalLengthS;

  // ── render every saved generation once, find the global peak for anti-clip gain ──
  const rendered = savedGens.map((sg) => ({ sg, ...renderFull(sg.data, fullLen, sr) }));
  let globalPeak = 0;
  for (const r of rendered) if (r.peak > globalPeak) globalPeak = r.peak;
  const genGain = globalPeak > 0.97 ? 0.97 / globalPeak : 1;

  // ── gen-NNNN.wav ──
  const manifest = { run: extra.runName || 'run', gain: genGain, globalPeak, generations: [] };
  for (const r of rendered) {
    const wavName = `gen-${pad4(r.sg.generation)}.wav`;
    const samples = applyGain(r.samples, genGain);
    writeFileSync(join(outDir, wavName), encodeWav(samples, sr));
    manifest.generations.push({
      generation: r.sg.generation,
      file: wavName,
      sse: r.sg.sse,
      similarity: r.sg.similarity === Number.MAX_VALUE ? 'PERFECT' : r.sg.similarity,
      peak: r.peak,
    });
  }

  // ── final fittest: faithful raw + peak-normalised listening copy ──
  const fin = renderFull(best.data, fullLen, sr);
  writeFileSync(join(outDir, 'fittest.wav'), encodeWav(fin.samples, sr));
  const listenGain = fin.peak > 0 ? 0.97 / fin.peak : 1;
  writeFileSync(join(outDir, 'fittest-listen.wav'), encodeWav(applyGain(fin.samples, listenGain), sr));

  // ── genome string ──
  const genomeString = encodeGenomeString(genomeFromData(best.data));
  writeFileSync(join(outDir, 'fittest.pg2.txt'), genomeString + '\n');

  // ── fitness curve (json + csv) ──
  writeFileSync(join(outDir, 'curve.json'), JSON.stringify(curve, null, 1));
  const csvRows = ['generation,renders,bestSSE,bestSimilarity,meanSSE,wallMs'];
  for (const c of curve) {
    const sim = c.bestSimilarity === Number.MAX_VALUE ? 'inf' : c.bestSimilarity;
    csvRows.push([c.generation, c.renders, c.bestSSE, sim, c.meanSSE, Math.round(c.wallMs || 0)].join(','));
  }
  writeFileSync(join(outDir, 'curve.csv'), csvRows.join('\n') + '\n');

  // ── summary ──
  const summary = {
    ...meta,
    runName: extra.runName || null,
    target: extra.target || null,
    finalBestSSE: best.sse,
    finalBestSimilarity: best.similarity === Number.MAX_VALUE ? 'PERFECT (SSE=0)' : best.similarity,
    bestFoundAtGeneration: best.foundAtGeneration,
    windowStartS: meta.windowStartS,
    scoredWindowSamples: plan.winLen,
    genomeString,
    savedGenerations: manifest.generations.length,
    silenceFloorSSE: extra.silenceFloorSSE ?? null,
    notes: extra.notes || [],
  };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // ── listening harness ──
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  writeFileSync(join(outDir, 'player.html'), PLAYER_HTML);
  writeFileSync(join(outDir, 'serve.js'), SERVE_JS);
  writeFileSync(join(outDir, 'README.txt'), README_TXT(extra.runName || 'run', summary));

  return { outDir, manifest, summary, genomeString };
}
