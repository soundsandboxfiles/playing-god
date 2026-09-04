// mixer.js — generate the per-run "mixer": a self-contained HTML listening app
// (BRIEF §8). It loops the final render, shows one row per active wave with an
// on/off toggle and a graphic of that wave's loudness envelope (scored window
// shaded), and — crucially — re-renders HONESTLY when you toggle a wave, using the
// REAL engine inlined into the page (mimic's app-worker precedent, but zero-server:
// the engine source is embedded so the file opens straight from disk).
//
// Honesty note (BRIEF §8): muting a wave is NOT blind stem subtraction — a muted
// modulator would change its carrier. ARTISAN's genomes are purely additive (no
// PM/AM edges between waves), so a stem sum IS the exact engine render of the
// enabled subset; but rather than rely on that, the mixer literally rebuilds the
// genome with the enabled waves and renders it through the embedded engine, so
// what you hear is always the true phenotype. The page self-checks additivity and
// says so.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encodeGenomeString, WAVE_SLOTS, WAVE_SCHEMA, WAVE_INDEX } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PG_ROOT = join(__dirname, '..', '..');

// Strip ES module syntax so several engine files can share one <script> scope.
function inlineModule(src) {
  return src
    .replace(/import\s+[^;]*?from\s*['"][^'"]*['"];?/gs, '')       // drop imports
    .replace(/^export\s+(const|function|class|let|var)\s/gm, '$1 ') // export decl → decl
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');                    // drop export lists
}

function buildEngineBundle() {
  const genome = readFileSync(join(PG_ROOT, 'src', 'genome.js'), 'utf8');
  const synth = readFileSync(join(PG_ROOT, 'src', 'synthesis.js'), 'utf8');
  const gstr = readFileSync(join(PG_ROOT, 'mimic', 'lib', 'genome-string.js'), 'utf8');
  // Order matters: genome (schema+Genome) → synthesis (render) → codec (decode).
  return [inlineModule(genome), inlineModule(synth), inlineModule(gstr)].join('\n\n');
}

// Base64 (browser atob-friendly) of a Float32Array as little-endian bytes.
function f32ToBase64(arr) {
  const bytes = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) bytes.writeFloatLE(arr[i], i * 4);
  return bytes.toString('base64');
}

// Write mixer.html into runDir. `genome` = the delivered genome; `target` =
// resolveTarget result; `activeSlots` optional list (else derived).
export function writeMixer(runDir, genome, target, cfg) {
  const engineBundle = buildEngineBundle();
  const genomeStr = encodeGenomeString(genome);
  const active = [];
  for (let w = 0; w < WAVE_SLOTS; w++) if (genome.getWave(w, 'active') >= 0.5) active.push(w);

  const meta = {
    name: target.name,
    sampleRate: target.sampleRate,
    renderLengthS: target.renderLengthS,
    offsetSamples: target.offsetSamples,
    winLen: target.plan.winLen,
    startSample: target.plan.startSample,
    silenceFloor: target.silenceFloor,
    activeSlots: active,
  };
  // target over the window, decimated for the SSE/overlay (full-res not needed in-page)
  const targetB64 = f32ToBase64(Float32Array.from(target.target));

  const html = MIXER_TEMPLATE
    .replace('/*__ENGINE__*/', () => engineBundle)
    .replace('__GENOME__', genomeStr)
    .replace('__META__', JSON.stringify(meta))
    .replace('__TARGET_B64__', targetB64);
  writeFileSync(join(runDir, 'mixer.html'), html);
}

const MIXER_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ARTISAN mixer</title>
<style>
  :root { --bg:#12141a; --panel:#1b1e27; --ink:#e8ebf2; --muted:#8b93a7; --accent:#7cc7ff; --win:#2b3a4a; --on:#3a7; --off:#444; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; }
  header { padding:18px 22px; border-bottom:1px solid #262a36; }
  h1 { margin:0 0 4px; font-size:18px; font-weight:650; }
  .sub { color:var(--muted); font-size:13px; }
  .controls { display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:14px 22px; border-bottom:1px solid #262a36; }
  button { background:var(--panel); color:var(--ink); border:1px solid #333846; border-radius:8px; padding:8px 14px; cursor:pointer; font-size:13px; }
  button:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); color:#04121f; border-color:var(--accent); font-weight:600; }
  .stat { color:var(--muted); font-size:13px; margin-left:auto; }
  .stat b { color:var(--ink); }
  .rows { padding:10px 22px 40px; }
  .row { display:flex; align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid #20232e; }
  .toggle { width:44px; height:24px; border-radius:12px; background:var(--off); position:relative; cursor:pointer; flex:0 0 auto; transition:background .15s; }
  .toggle.on { background:var(--on); }
  .knob { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#fff; transition:left .15s; }
  .toggle.on .knob { left:22px; }
  .wlabel { width:132px; flex:0 0 auto; font-variant-numeric:tabular-nums; color:var(--muted); }
  .wlabel b { color:var(--ink); }
  canvas.env { flex:1 1 auto; height:34px; width:100%; background:#0e1016; border-radius:6px; }
  .overlay { padding:0 22px 30px; }
  canvas#wave { width:100%; height:150px; background:#0e1016; border-radius:8px; }
  .legend { color:var(--muted); font-size:12px; margin-top:6px; }
  .swatch { display:inline-block; width:11px; height:11px; border-radius:2px; vertical-align:middle; margin:0 4px 0 12px; }
  code { background:#0e1016; padding:2px 6px; border-radius:5px; color:var(--accent); }
</style>
</head>
<body>
<header>
  <h1>ARTISAN mixer — <span id="tname"></span></h1>
  <div class="sub">Loops the final render. Toggle any wave to hear it drop out — the page re-renders the genome through the <b>real engine</b>, so what you hear is always the true sound (muting a <i>modulator</i> changes its carrier, and this honest re-render captures that — it is never blind stem subtraction). Tags: <span style="color:#7cc7ff">[env]</span> amplitude envelope · <span style="color:#7cc7ff">[glide]</span> pitch glide · <span style="color:#7cc7ff">[rep]</span> repeating burst · <span style="color:#7cc7ff">[modulator]</span> shapes another wave, no direct sound. The shaded band is the scored window.</div>
</header>
<div class="controls">
  <button class="primary" id="play">▶ Play render</button>
  <button id="playTarget">▶ Play target</button>
  <button id="all">All on</button>
  <button id="none">All off</button>
  <div class="stat">SSE now: <b id="sse">—</b> · vs silence <b id="ratio">—</b>× · waves on <b id="count">—</b></div>
</div>
<div class="overlay">
  <canvas id="wave" width="1200" height="150"></canvas>
  <div class="legend"><span class="swatch" style="background:#7cc7ff"></span>current render<span class="swatch" style="background:#e0a</span><span class="swatch" style="background:#e0a75a"></span>target<span class="swatch" style="background:#2b3a4a"></span>scored window</div>
</div>
<div class="rows" id="rows"></div>

<script>
/*__ENGINE__*/
</script>
<script>
const GENOME_STR = "__GENOME__";
const META = __META__;
const TARGET_B64 = "__TARGET_B64__";

function b64ToF32(b64){ const bin=atob(b64); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i); return new Float32Array(bytes.buffer); }
const TARGET = b64ToF32(TARGET_B64);

const baseGenome = decodeGenomeString(GENOME_STR);
const enabled = new Map(META.activeSlots.map(s=>[s,true]));

function buildGenome(){
  const g = baseGenome.clone();
  for(const s of META.activeSlots) g.setWaveStored(s,'active', enabled.get(s)?1:0);
  return g;
}
function renderFull(g){
  const r = render(g,{sampleRate:META.sampleRate,lengthS:META.renderLengthS});
  return r.samples;
}
function windowed(samples){
  const out=new Float32Array(META.winLen);
  for(let i=0;i<META.winLen;i++){const s=samples[META.startSample+i]; out[i]=s===undefined?0:s;}
  return out;
}
function sseOf(win){ let s=0; for(let i=0;i<META.winLen;i++){const d=win[i]-TARGET[i]; s+=d*d;} return s; }

// audio
let ac=null, srcNode=null, curBuf=null, playing=false, playingTarget=false;
function ensureAC(){ if(!ac) ac=new (window.AudioContext||window.webkitAudioContext)(); return ac; }
function toAudioBuffer(samples, rate){ const ac=ensureAC(); const b=ac.createBuffer(1,samples.length,rate); b.copyToChannel(Float32Array.from(samples),0); return b; }
function stop(){ if(srcNode){try{srcNode.stop()}catch(e){} srcNode=null;} playing=false; playingTarget=false; document.getElementById('play').textContent='▶ Play render'; document.getElementById('playTarget').textContent='▶ Play target'; }
function loop(buf){ const ac=ensureAC(); stop(); srcNode=ac.createBufferSource(); srcNode.buffer=buf; srcNode.loop=true; srcNode.connect(ac.destination); srcNode.start(); }

let curSamples=null;
function refresh(){
  const g=buildGenome();
  curSamples=renderFull(g);
  const win=windowed(curSamples);
  const sse=sseOf(win);
  document.getElementById('sse').textContent = sse.toExponential(3);
  document.getElementById('ratio').textContent = (META.silenceFloor/sse).toExponential(2);
  let on=0; for(const v of enabled.values()) if(v) on++;
  document.getElementById('count').textContent = on+' / '+META.activeSlots.length;
  drawWave(win);
  if(playing){ curBuf=toAudioBuffer(curSamples,META.sampleRate); loop(curBuf); document.getElementById('play').textContent='⏸ Stop'; }
}

// per-wave amplitude envelope (solo render), scored-window shaded
function drawEnv(canvas, slot){
  const g=baseGenome.clone();
  for(const s of META.activeSlots) g.setWaveStored(s,'active', s===slot?1:0);
  const samples=renderFull(g);
  const ctx=canvas.getContext('2d'); const W=canvas.width=canvas.clientWidth||600, H=canvas.height=34;
  ctx.clearRect(0,0,W,H);
  // shade scored window
  const N=samples.length; const x0=Math.floor(W*META.startSample/N), x1=Math.ceil(W*(META.startSample+META.winLen)/N);
  ctx.fillStyle='#2b3a4a'; ctx.fillRect(x0,0,x1-x0,H);
  // envelope (peak per column)
  ctx.strokeStyle='#7cc7ff'; ctx.beginPath();
  const step=Math.max(1,Math.floor(N/W));
  for(let x=0;x<W;x++){ let pk=0; const b=Math.floor(x*N/W); for(let k=0;k<step;k++){const v=Math.abs(samples[b+k]||0); if(v>pk)pk=v;} const y=H-Math.min(1,pk)*H; if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); }
  ctx.stroke();
}

function drawWave(win){
  const c=document.getElementById('wave'); const ctx=c.getContext('2d'); const W=c.width=c.clientWidth, H=c.height=150;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#2b3a4a'; ctx.fillRect(0,0,W,H); // whole panel is the scored window
  const mid=H/2; const N=win.length; const step=Math.max(1,Math.floor(N/W));
  // target (amber)
  ctx.strokeStyle='#e0a75a'; ctx.globalAlpha=0.8; ctx.beginPath();
  for(let x=0;x<W;x++){ const b=Math.floor(x*N/W); let v=TARGET[b]||0; const y=mid-v*mid*0.95; if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
  // render (blue)
  ctx.strokeStyle='#7cc7ff'; ctx.globalAlpha=0.9; ctx.beginPath();
  for(let x=0;x<W;x++){ const b=Math.floor(x*N/W); let v=win[b]||0; const y=mid-v*mid*0.95; if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);} ctx.stroke();
  ctx.globalAlpha=1;
}

// build rows
function fmtFreq(slot){ const cents=baseGenome.getWave(slot,'pitch_master'); const f=0.01*Math.pow(2,cents/1200); const shapes=['sine','triangle','saw','square'].filter(s=>baseGenome.isOn(slot,'shape_'+s+'_on')); return {f, shapes}; }
// Describe a wave's active powers honestly, so the graphic isn't a lie about what
// the wave actually does: [env] amplitude envelope, [glide] pitch envelope,
// [rep] repeating gate (mid_wait), [mod] pure modulator (no direct audio — it
// shapes a carrier), and any PM/AM edges into another slot.
function waveTags(slot){
  const tags=[];
  const outOn=baseGenome.isOn(slot,'gain_out_on'), modOn=baseGenome.isOn(slot,'gain_mod_on');
  if(baseGenome.isOn(slot,'amp_env_on')) tags.push('env');
  if(baseGenome.isOn(slot,'pitch_env_on')) tags.push('glide');
  if(baseGenome.isOn(slot,'mid_wait_on') && baseGenome.getWave(slot,'duty')<0.999) tags.push('rep');
  if(!outOn && modOn) tags.push('modulator');
  const edges=[];
  if(baseGenome.isOn(slot,'pm_on')) edges.push('PM→'+baseGenome.getWave(slot,'pm_source'));
  if(baseGenome.isOn(slot,'am_on')) edges.push('AM→'+baseGenome.getWave(slot,'am_source'));
  return {tags, edges, isModulator:(!outOn&&modOn)};
}
function buildRows(){
  const rows=document.getElementById('rows');
  for(const slot of META.activeSlots){
    const {f,shapes}=fmtFreq(slot);
    const {tags,edges,isModulator}=waveTags(slot);
    const row=document.createElement('div'); row.className='row';
    const tog=document.createElement('div'); tog.className='toggle on'; tog.innerHTML='<div class="knob"></div>';
    tog.onclick=()=>{ const now=!enabled.get(slot); enabled.set(slot,now); tog.classList.toggle('on',now); refresh(); };
    const lab=document.createElement('div'); lab.className='wlabel';
    const tagHtml=(tags.length?' <span style="color:#7cc7ff">['+tags.join('][')+']</span>':'')+(edges.length?' <span style="color:#e0a75a">'+edges.join(' ')+'</span>':'');
    lab.innerHTML='<b>wave '+slot+(isModulator?' (mod)':'')+'</b><br>'+f.toFixed(f<10?3:1)+' Hz · '+(shapes.join('+')||'—')+tagHtml;
    const cv=document.createElement('canvas'); cv.className='env';
    row.appendChild(tog); row.appendChild(lab); row.appendChild(cv);
    rows.appendChild(row);
    requestAnimationFrame(()=>drawEnv(cv,slot));
  }
}

document.getElementById('tname').textContent = META.name;
document.getElementById('play').onclick=()=>{ if(playing){stop();} else { playing=true; playingTarget=false; curBuf=toAudioBuffer(curSamples,META.sampleRate); loop(curBuf); document.getElementById('play').textContent='⏸ Stop'; } };
document.getElementById('playTarget').onclick=()=>{ if(playingTarget){stop();} else { stop(); playingTarget=true; loop(toAudioBuffer(TARGET,META.sampleRate)); document.getElementById('playTarget').textContent='⏸ Stop'; } };
document.getElementById('all').onclick=()=>{ for(const s of META.activeSlots)enabled.set(s,true); document.querySelectorAll('.toggle').forEach(t=>t.classList.add('on')); refresh(); };
document.getElementById('none').onclick=()=>{ for(const s of META.activeSlots)enabled.set(s,false); document.querySelectorAll('.toggle').forEach(t=>t.classList.remove('on')); refresh(); };

buildRows();
refresh();
window.addEventListener('resize',()=>{ if(curSamples)drawWave(windowed(curSamples)); document.querySelectorAll('.row').forEach((r,i)=>drawEnv(r.querySelector('canvas'),META.activeSlots[i])); });
</script>
</body>
</html>`;
