// w1-exploration.js — the W1 high-wave EXPLORATION batch (owner wishlist, V2-PROPOSALS
// "Owner rulings, 2026-08-31 evening"; F10/W1).
//
// NOT A GATE. This judges NOTHING and has no pass condition. The owner wanted to
// HEAR what dense territory sounds like — creatures forced to many active waves,
// past where the F10 init draw (1..10) normally goes — purely as an exploration
// listen. It renders 25 creatures at each of the forced counts n_active ∈ {8,16,32,64}
// (64 = the WAVE_SLOTS max) and writes a plain audio-only harness so the owner can
// step through them by density on the host.
//
// This is a RENDERING exercise, not a prior change (V2-PROPOSALS W1): opts.nActive
// forces the count for THIS batch only; it changes nothing about the shipped priors,
// the gates, or what can exist (§2.1). Renders go through renderNormalized, so they
// carry the v2.1 leading-silence trim (0.25 s threshold) exactly like the app.
//
// Run: node gates/w1-exploration.js
// Output: output/gate-artefacts/w1-exploration/ (git-ignored — large, regenerable,
// reaches the host via sync-back, like the Gate 1a / F3 batches) + a committed
// manifest artefact.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { renderNormalized } from '../src/render.js';
import { encodeWav } from '../src/wav.js';
import { sanityMetrics } from '../src/descriptors.js';
import { ARTEFACT_DIR, ensureDir, writeArtefact } from './_util.js';
import { genomeSummary } from './render-batch.js';

const PER = 25;            // 25 creatures per forced density (owner: "25 creatures each")
const LENGTH_S = 30;       // long enough to sit in the texture; kind over 100 clips
const SAMPLE_RATE = 44100; // full audio quality for a human listen

// Forced active-wave counts, with distinct recorded seeds per density (W1).
const DENSITIES = [
  { nActive: 8,  seed: 0x510008 },
  { nActive: 16, seed: 0x510016 },
  { nActive: 32, seed: 0x510032 },
  { nActive: 64, seed: 0x510064 },
];

function main() {
  const batchDir = join(ARTEFACT_DIR, 'w1-exploration');
  ensureDir(batchDir);
  const t0 = Date.now();
  const clips = [];
  const perDensity = [];

  for (const d of DENSITIES) {
    const rng = new RNG(d.seed);
    let idxInDensity = 0, nearSilent = 0, trimSum = 0, audibleWavesSum = 0, made = 0;
    for (let i = 0; i < PER; i++) {
      // Force the count at init (opts.nActive) — the ONLY thing W1 changes.
      const g = randomGenome(rng, { nActive: d.nActive });
      const r = renderNormalized(g, { sampleRate: SAMPLE_RATE, lengthS: LENGTH_S });
      const name = `w1-n${String(d.nActive).padStart(2, '0')}-${String(idxInDensity).padStart(2, '0')}.wav`;
      idxInDensity++;
      if (r.renderError) { clips.push({ forced_n_active: d.nActive, filename: null, genome_id: g.id, render_error: r.renderError }); continue; }
      writeFileSync(join(batchDir, name), encodeWav(r.samples, SAMPLE_RATE));
      const m = sanityMetrics(r.samples, SAMPLE_RATE);
      if (r.loudness && r.loudness.near_silent) nearSilent++;
      trimSum += r.leading_trim_s || 0;
      audibleWavesSum += r.activeWaves;
      made++;
      clips.push({
        forced_n_active: d.nActive,
        filename: name,
        genome_id: g.id,
        active_wave_count: r.activeWaves,
        has_feedback_cycle: r.hasFeedbackCycle,
        near_silent: r.loudness ? r.loudness.near_silent : null,
        leading_trim_s: Math.round((r.leading_trim_s || 0) * 1000) / 1000,
        silence_frac: Math.round(m.silence_frac * 1000) / 1000,
        waves: genomeSummary(g),
      });
    }
    perDensity.push({
      forced_n_active: d.nActive, seed: '0x' + d.seed.toString(16), n: PER, rendered: made,
      near_silent_count: nearSilent,
      active_wave_count_mean: made ? audibleWavesSum / made : 0,
      leading_trim_s_mean: made ? Math.round((trimSum / made) * 1000) / 1000 : 0,
    });
    console.log(`  n_active=${d.nActive} (seed 0x${d.seed.toString(16)}): ${made}/${PER} wavs, near-silent=${nearSilent}`);
  }

  const manifestPayload = {
    batch: 'W1 high-wave exploration (owner wishlist) — NOT a gate, judges nothing',
    note: 'Forced n_active ∈ {8,16,32,64} (64 = WAVE_SLOTS max), 25 each. An exploration listen so the owner can hear dense territory. opts.nActive forces the count for THIS batch only; the shipped F10 priors (1..10) are unchanged (§2.1). Renders carry the v2.1 leading-silence trim.',
    length_s: LENGTH_S, sample_rate: SAMPLE_RATE, per_density: PER,
    densities: perDensity,
    clips,
  };
  // Manifest in the batch dir (harness fetches it there) + a committed artefact copy.
  writeFileSync(join(batchDir, 'w1-manifest.json'), JSON.stringify(manifestPayload, null, 2));
  writeArtefact('w1-exploration-manifest.json', manifestPayload);
  writeFileSync(join(batchDir, 'index.html'), harnessHtml());

  console.log('── W1 exploration batch staged ──');
  console.log(`  ${clips.filter((c) => c.filename).length}/${DENSITIES.length * PER} WAVs in output/gate-artefacts/w1-exploration/  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log('  On the HOST, from the batch dir: python3 -m http.server 8000, open http://localhost:8000/ (fetch is blocked over file://).');
  console.log('  (exploration only — judges nothing)');
}

// A plain audio-only harness. Groups the batch by forced density so the owner can
// hear each texture; clearly labelled as an EXPLORATION, not a gate. No tallying,
// no pass condition — nothing here judges anything.
function harnessHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<!--
  W1 high-wave EXPLORATION harness. NOT A GATE — it judges nothing and has no pass
  condition. Serve over localhost (fetch is blocked over file://): from this dir,
      python3 -m http.server 8000
  then open http://localhost:8000/ .
-->
<title>Playing God — W1 high-wave exploration</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0a0a0c; color:#d8d8de; font:14px/1.5 system-ui,sans-serif; }
  #wrap { max-width:820px; margin:0 auto; padding:24px; }
  h1 { font-size:16px; font-weight:600; }
  .muted { color:#8a8a94; }
  .row { margin:10px 0; }
  .big { font-size:22px; font-weight:600; }
  kbd { background:#1c1c22; border:1px solid #2c2c34; border-radius:4px; padding:1px 6px; font-size:12px; }
  button { background:#1c1c22; color:#d8d8de; border:1px solid #33333c; border-radius:6px; padding:6px 12px; cursor:pointer; margin-right:6px; }
  progress { width:100%; height:6px; }
  .dens { display:inline-block; padding:2px 8px; border-radius:6px; background:#141420; margin-right:6px; }
</style></head>
<body><div id="wrap">
  <h1>Playing God — W1 high-wave exploration <span class="muted">(audio-only · judges nothing)</span></h1>
  <p class="muted">Forced density, 25 creatures each at <b>8 / 16 / 32 / 64</b> active waves (64 is the max).
     This is an <b>exploration listen</b> — there is no gate, no tally, no pass condition. Just hear what dense territory sounds like.</p>
  <div class="row">
    <span class="muted">jump to density:</span>
    <span id="densjump"></span>
  </div>
  <div class="row">
    <kbd>Space</kbd> next &nbsp; <kbd>R</kbd> replay &nbsp; <kbd>[</kbd> prev &nbsp; <kbd>]</kbd> next
  </div>
  <div class="row big" id="title">—</div>
  <div class="row muted" id="meta"></div>
  <progress id="prog" value="0" max="1"></progress>
  <div class="row"><button id="playbtn">Play ▶</button><span class="muted" id="pos"></span></div>
</div>
<script type="module">
const manifest = await fetch('./w1-manifest.json').then(r=>r.json());
const clips = manifest.clips.filter(c=>c.filename);
let idx = 0;
const audio = new Audio(); audio.preload = 'auto';
const $ = id => document.getElementById(id);
// Density jump buttons.
const firsts = {};
clips.forEach((c,i)=>{ if(firsts[c.forced_n_active]===undefined) firsts[c.forced_n_active]=i; });
$('densjump').innerHTML = Object.keys(firsts).map(n=>'<button data-i="'+firsts[n]+'">'+n+' waves</button>').join('');
$('densjump').onclick = e => { if(e.target.dataset.i!==undefined){ load(+e.target.dataset.i); play(); } };
function load(i){
  idx = (i+clips.length)%clips.length;
  const c = clips[idx];
  audio.src = './'+c.filename;
  $('title').textContent = 'n_active '+c.forced_n_active+'  ·  '+c.active_wave_count+' active wave(s)';
  $('meta').textContent = c.genome_id + (c.has_feedback_cycle?' · feedback':'') + (c.near_silent?' · near-silent':'') + (c.leading_trim_s?(' · trimmed '+c.leading_trim_s+'s'):'');
  $('pos').textContent = ' '+(idx+1)+' / '+clips.length;
}
function play(){ audio.currentTime = 0; audio.play(); }
$('playbtn').onclick = play;
audio.ontimeupdate = ()=>{ $('prog').value = audio.duration ? audio.currentTime/audio.duration : 0; };
addEventListener('keydown', e=>{
  if(e.code==='Space'){ e.preventDefault(); load(idx+1); play(); }
  else if(e.key==='r'||e.key==='R'){ play(); }
  else if(e.key==='['){ load(idx-1); play(); }
  else if(e.key===']'){ load(idx+1); play(); }
});
load(0);
</script></body></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
