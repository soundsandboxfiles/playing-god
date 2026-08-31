// render-batch.js — stage the Gate 1a listening batch (BUILD-ORDER step 2 / §13.1).
//
// Gate 1a asks whether the GENERATOR is producing anything worth hearing, and it
// CANNOT be automated: any proxy metric would be a claim about what sounds are
// good written into the machinery (BUILD-ORDER, §2.3). So this script only
// PREPARES the audition — it renders 100 random genomes to WAV and writes a
// listening harness — and judges NOTHING. The human runs it on the host (the
// container has no audio device).
//
// Audio-only is the DEFAULT and visuals are a toggle (handover): "visuals would
// change what is being judged", and the delta between the audio-only verdict and
// the audio+visual verdict is itself informative (vault). The pass condition
// (BUILD-ORDER) is: at least 10 of the 100 hold a listener past 10 seconds.
//
// Run: node gates/render-batch.js

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { renderNormalized } from '../src/render.js';
import { encodeWav } from '../src/wav.js';
import { WAVE_SLOTS } from '../src/genome.js';
import { ARTEFACT_DIR, ensureDir, writeArtefact, SESSION_ID, SPEC_VERSION } from './_util.js';

const N = 100;
const LENGTH_S = 30;      // long enough to judge "past 10 s"; kinder than 60 s over 100 clips
const SAMPLE_RATE = 44100; // full audio quality for a human verdict

// Compact per-active-wave summary so the harness's (optional) visuals can draw
// the genome slow-channel — the one structural advantage this project has over a
// generic visualiser (§11). Pitch → hue, gain → size, slot → position.
export function genomeSummary(g) {
  const waves = [];
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (g.getWave(w, 'active') < 0.5) continue;
    const cents = g.getWave(w, 'pitch_master');
    const hz = 0.01 * Math.pow(2, cents / 1200);
    waves.push({
      slot: w,
      pitch_hz: Math.round(hz * 100) / 100,
      gain_out_db: Math.round(g.getWave(w, 'gain_out') * 10) / 10,
      carrier: g.getWave(w, 'gain_out_on') >= 0.5,
      modulator: g.getWave(w, 'gain_mod_on') >= 0.5,
    });
  }
  return waves;
}

function main() {
  const batchDir = join(ARTEFACT_DIR, 'gate1a-batch');
  ensureDir(batchDir);
  const rng = new RNG(0x1A0000);
  const manifest = [];
  const t0 = Date.now();

  for (let i = 0; i < N; i++) {
    const g = randomGenome(rng);
    const r = renderNormalized(g, { sampleRate: SAMPLE_RATE, lengthS: LENGTH_S });
    const name = `creature-${String(i).padStart(3, '0')}.wav`;
    if (r.renderError) {
      manifest.push({ index: i, filename: null, genome_id: g.id, render_error: r.renderError });
      continue;
    }
    writeFileSync(join(batchDir, name), encodeWav(r.samples, SAMPLE_RATE));
    manifest.push({
      index: i,
      filename: name,
      genome_id: g.id,
      active_wave_count: r.activeWaves,
      has_feedback_cycle: r.hasFeedbackCycle,
      near_silent: r.loudness ? r.loudness.near_silent : null,
      lufs_before: r.loudness ? r.loudness.lufs_before : null,
      waves: genomeSummary(g),
    });
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  // Manifest lives OUTSIDE the (git-ignored) wav dir so it is committed as evidence.
  const manifestPayload = {
    gate: '1a (human audition — this script judges nothing)',
    length_s: LENGTH_S, sample_rate: SAMPLE_RATE, n: N,
    // F5 (V2-PROPOSALS): the owner amended the 1a threshold mid-audition from 10 s
    // to 5 s ("at absolute random 10 seemed like too steep an ask"). Both are
    // recorded; the batch does not judge either — Gate 1a needs ears (BUILD-ORDER).
    pass_condition: 'Owner-amended: at least 10 of 100 hold a listener past 5 seconds (originally 10 s; gate1a-verdict.md, F5).',
    clips: manifest,
  };
  writeArtefact('gate1a-batch-manifest.json', manifestPayload);
  // F1 (V2-PROPOSALS): ALSO write the manifest INTO the batch dir, because the
  // harness fetches './gate1a-batch-manifest.json' (same dir as index.html). v1
  // wrote it only one directory up, so the harness 404'd and a host-side copy was
  // needed as a workaround (2026-08-31). Writing both fixes the pathing at source.
  // The batch-dir copy is git-ignored (the wav dir is), the artefact copy is the
  // committed evidence — same JSON, two locations.
  writeFileSync(join(batchDir, 'gate1a-batch-manifest.json'), JSON.stringify(manifestPayload, null, 2));

  // The harness itself.
  writeFileSync(join(batchDir, 'index.html'), harnessHtml(manifest.length));

  console.log('── Gate 1a batch staged ──');
  console.log(`  ${manifest.filter((m) => m.filename).length}/${N} WAVs written to output/gate-artefacts/gate1a-batch/`);
  console.log('  On the HOST, from the batch dir: python3 -m http.server 8000');
  console.log('  then open http://localhost:8000/ (fetch() is blocked over file://, F1).');
  console.log('  (this script makes NO judgement — Gate 1a needs a human, by construction)');
}

// A single-file harness. Plays the batch in sequence, audio-only by default,
// visuals behind a toggle. Keys let the listener tally how many held them past
// 10 s (the Gate 1a threshold) without the tool judging anything for them.
export function harnessHtml(count) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<!--
  Gate 1a listening harness.

  MUST BE SERVED OVER LOCALHOST, NOT OPENED AS file:// (F1, V2-PROPOSALS). This
  page fetch()es its manifest and the WAVs, and browsers block fetch() from a
  file:// origin (CORS). From the batch directory on the host, run:

      python3 -m http.server 8000

  then open  http://localhost:8000/  in a browser. (Any static server works;
  python3's is always to hand.) The manifest gate1a-batch-manifest.json now sits
  in THIS directory, so the fetch below resolves without a workaround.
-->
<title>Playing God — Gate 1a audition</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0a0a0c; color:#d8d8de; font:14px/1.5 system-ui,sans-serif; }
  #wrap { max-width:900px; margin:0 auto; padding:24px; }
  h1 { font-size:16px; font-weight:600; letter-spacing:.02em; }
  .muted { color:#8a8a94; }
  #stage { display:flex; gap:24px; align-items:flex-start; margin-top:16px; }
  #panel { flex:1; }
  #viz { width:360px; height:360px; background:#050506; border-radius:8px; display:none; }
  #viz.on { display:block; }
  .row { margin:10px 0; }
  .big { font-size:22px; font-weight:600; }
  kbd { background:#1c1c22; border:1px solid #2c2c34; border-radius:4px; padding:1px 6px; font-size:12px; }
  #tally { margin-top:18px; padding:12px; background:#101014; border-radius:8px; }
  progress { width:100%; height:6px; }
  button { background:#1c1c22; color:#d8d8de; border:1px solid #33333c; border-radius:6px; padding:6px 12px; cursor:pointer; }
</style></head>
<body><div id="wrap">
  <h1>Playing God — Gate 1a audition <span class="muted">(audio-only by default)</span></h1>
  <p class="muted">This is the human gate: does the generator make anything worth hearing? Nothing here judges that for you.
     Pass condition: at least <b>10 of 100</b> hold you past <b>10 seconds</b>.</p>
  <div class="row">
    <kbd>Space</kbd> next &nbsp; <kbd>R</kbd> replay &nbsp; <kbd>V</kbd> toggle visuals (off by default) &nbsp;
    <kbd>1</kbd> "held me past 10s" &nbsp; <kbd>0</kbd> "skipped early"
  </div>
  <div id="stage">
    <div id="panel">
      <div class="row big" id="title">—</div>
      <div class="row muted" id="meta"></div>
      <progress id="prog" value="0" max="1"></progress>
      <div class="row"><button id="playbtn">Play ▶</button></div>
      <div id="tally">
        Auditioned: <b id="seen">0</b> / ${count} &nbsp;·&nbsp;
        Held past 10s: <b id="held">0</b> &nbsp;·&nbsp;
        Skipped early: <b id="skip">0</b>
        <div class="muted" id="verdict"></div>
      </div>
    </div>
    <canvas id="viz" width="360" height="360"></canvas>
  </div>
</div>
<script type="module">
const manifest = await fetch('./gate1a-batch-manifest.json').then(r=>r.json());
const clips = manifest.clips.filter(c=>c.filename);
let idx = 0, showViz = false;
const seen = new Set(), marks = {};
const audio = new Audio();
audio.preload = 'auto';
const AC = new (window.AudioContext||window.webkitAudioContext)();
let srcNode, analyser;
function connectAnalyser(){
  if(srcNode) return;
  srcNode = AC.createMediaElementSource(audio);
  analyser = AC.createAnalyser(); analyser.fftSize = 1024;
  srcNode.connect(analyser); analyser.connect(AC.destination);
}
const $ = id => document.getElementById(id);
function load(i){
  idx = (i+clips.length)%clips.length;
  const c = clips[idx];
  audio.src = './'+c.filename;
  $('title').textContent = 'Creature '+String(c.index).padStart(3,'0');
  $('meta').textContent = c.genome_id+' · '+c.active_wave_count+' active wave(s)'
    + (c.has_feedback_cycle?' · feedback':'') + (c.near_silent?' · NEAR-SILENT':'');
  drawGenome(c);
}
function play(){ AC.resume(); connectAnalyser(); audio.currentTime = 0; audio.play(); }
$('playbtn').onclick = play;
audio.ontimeupdate = ()=>{ $('prog').value = audio.duration? audio.currentTime/audio.duration : 0; };
function mark(v){
  const c = clips[idx];
  if(marks[c.index]===undefined){ seen.add(c.index); }
  marks[c.index]=v;
  let held=0, skip=0; for(const k in marks){ marks[k]?held++:skip++; }
  $('seen').textContent = Object.keys(marks).length;
  $('held').textContent = held; $('skip').textContent = skip;
  $('verdict').textContent = held>=10 ? 'Threshold reached: ≥10 held past 10s (informational — your ears decide).' : '';
}
addEventListener('keydown', e=>{
  if(e.code==='Space'){ e.preventDefault(); load(idx+1); play(); }
  else if(e.key==='r'||e.key==='R'){ play(); }
  else if(e.key==='v'||e.key==='V'){ showViz=!showViz; $('viz').classList.toggle('on',showViz); }
  else if(e.key==='1'){ mark(true); load(idx+1); play(); }
  else if(e.key==='0'){ mark(false); load(idx+1); play(); }
});
// Genome slow-channel preview (job 3, family resemblance): one blob per active
// wave, positioned by slot on a ring, hue from pitch, radius from gain. The fast
// channel here is a generic analyser meter — a PREVIEW only; the product's real
// per-wave visualiser is in app/index.html (§11 forbids a generic-FFT visualiser
// as the product, but this throwaway audition tool is allowed a simple one).
const cv = $('viz'), cx = cv.getContext('2d');
let curClip = null;
function drawGenome(c){ curClip = c; }
function frame(){
  requestAnimationFrame(frame);
  if(!showViz) return;
  cx.fillStyle='#050506'; cx.fillRect(0,0,360,360);
  let level=0;
  if(analyser){ const b=new Uint8Array(analyser.frequencyBinCount); analyser.getByteTimeDomainData(b);
    for(let i=0;i<b.length;i++){ const v=(b[i]-128)/128; level+=v*v; } level=Math.sqrt(level/b.length); }
  if(curClip){ const ws=curClip.waves||[]; const R=120;
    ws.forEach((w,i)=>{ const a=(w.slot/64)*Math.PI*2; const x=180+Math.cos(a)*R, y=180+Math.sin(a)*R;
      const hue=(Math.log2(Math.max(1,w.pitch_hz))/14)*360;
      const rad = (8 + (w.gain_out_db+80)/86*40) * (1+level*1.5);
      cx.beginPath(); cx.fillStyle='hsla('+hue+',70%,'+(30+level*40)+'%,0.85)';
      cx.arc(x,y,rad,0,Math.PI*2); cx.fill(); });
  }
}
frame();
load(0);
</script></body></html>`;
}

// Only stage the default Gate 1a batch when run directly — importing this module
// (e.g. from the F3 script) reuses harnessHtml/genomeSummary without side effects.
if (import.meta.url === `file://${process.argv[1]}`) main();
