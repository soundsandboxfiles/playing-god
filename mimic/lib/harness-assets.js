// harness-assets.js — the listening-harness files written into every run dir.
//
// Kept as string templates so deliverable.js can drop a self-contained harness
// into output/<run>/. The harness is AUDIO-ONLY (owner brief, step 8): it plays
// the per-generation fittest WAVs in order so the owner HEARS the convergence.

// The player page. Audio-only: a big play/stop, prev/next, "auto-advance", and a
// readout of generation + SSE + similarity. It fetches manifest.json (cache-busted
// per the F6 lesson) and steps through gen-*.wav.
export const PLAYER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MIMIC — hear the convergence</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background:#111; color:#eee; margin:0; padding:24px; }
  h1 { font-size:18px; font-weight:600; margin:0 0 4px; }
  .sub { color:#999; font-size:13px; margin-bottom:20px; }
  .now { font-size:15px; margin:16px 0; }
  .now b { color:#6cf; }
  button { font-size:15px; padding:10px 16px; margin:4px 6px 4px 0; border:0; border-radius:8px;
           background:#2a2a2a; color:#eee; cursor:pointer; }
  button:hover { background:#3a3a3a; }
  button.primary { background:#2563eb; }
  #list { margin-top:20px; max-height:50vh; overflow:auto; border-top:1px solid #333; }
  .row { display:flex; justify-content:space-between; padding:6px 8px; font-size:13px; cursor:pointer; border-bottom:1px solid #222; }
  .row:hover { background:#1c1c1c; }
  .row.active { background:#123; color:#6cf; }
  .row .sse { color:#9c9; font-variant-numeric: tabular-nums; }
  label { font-size:14px; color:#ccc; }
  #bar { height:6px; background:#333; border-radius:3px; margin-top:14px; overflow:hidden; }
  #barfill { height:100%; width:0; background:#2563eb; transition:width .1s linear; }
</style>
</head>
<body>
  <h1>MIMIC — hear the convergence</h1>
  <div class="sub" id="runsub">loading…</div>

  <div>
    <button class="primary" id="playAll">▶ Play all in order</button>
    <button id="prev">◀ Prev</button>
    <button id="next">Next ▶</button>
    <button id="stop">■ Stop</button>
    <label><input type="checkbox" id="auto" checked> auto-advance</label>
  </div>

  <div class="now" id="now">—</div>
  <div id="bar"><div id="barfill"></div></div>

  <div id="list"></div>

  <audio id="audio"></audio>

<script>
const audio = document.getElementById('audio');
let gens = [], idx = 0, playingAll = false;

function fmtSim(s){ return s === 'PERFECT' ? 'PERFECT' : (typeof s === 'number' ? s.toExponential(3) : s); }

async function load(){
  // cache-bust (F6 lesson): never serve a stale manifest.
  const r = await fetch('manifest.json?t=' + Date.now());
  const m = await r.json();
  gens = m.generations;
  document.getElementById('runsub').textContent =
    m.run + ' — ' + gens.length + ' generations saved. Earliest first; press play to hear it improve.';
  renderList();
  select(0, false);
}

function renderList(){
  const list = document.getElementById('list');
  list.innerHTML = '';
  gens.forEach((g, i) => {
    const div = document.createElement('div');
    div.className = 'row' + (i===idx?' active':'');
    div.innerHTML = '<span>gen ' + g.generation + '</span><span class="sse">SSE ' +
      (typeof g.sse==='number'? g.sse.toExponential(3): g.sse) + ' · sim ' + fmtSim(g.similarity) + '</span>';
    div.onclick = () => { playingAll=false; select(i, true); };
    list.appendChild(div);
  });
}

function select(i, play){
  idx = Math.max(0, Math.min(gens.length-1, i));
  const g = gens[idx];
  audio.src = g.file + '?t=' + Date.now();
  document.getElementById('now').innerHTML =
    'Now: <b>generation ' + g.generation + '</b> — SSE ' +
    (typeof g.sse==='number'? g.sse.toExponential(4): g.sse) + ', similarity ' + fmtSim(g.similarity);
  [...document.querySelectorAll('.row')].forEach((r,j)=>r.classList.toggle('active', j===idx));
  const active = document.querySelector('.row.active'); if (active) active.scrollIntoView({block:'nearest'});
  if (play) audio.play().catch(()=>{});
}

document.getElementById('playAll').onclick = () => { playingAll = true; select(0, true); };
document.getElementById('prev').onclick = () => { playingAll=false; select(idx-1, true); };
document.getElementById('next').onclick = () => { playingAll=false; select(idx+1, true); };
document.getElementById('stop').onclick = () => { playingAll=false; audio.pause(); };

audio.addEventListener('ended', () => {
  const auto = document.getElementById('auto').checked;
  if ((playingAll || auto) && idx < gens.length-1) select(idx+1, true);
  else playingAll = false;
});
audio.addEventListener('timeupdate', () => {
  const f = audio.duration ? (audio.currentTime/audio.duration*100) : 0;
  document.getElementById('barfill').style.width = f + '%';
});

load();
</script>
</body>
</html>
`;

// A one-command localhost static server for the run dir. No dependencies.
export const SERVE_JS = `// serve.js — play this run's convergence in a browser.
// Usage:  node serve.js         (then open the printed http://localhost:… URL)
//         node serve.js 9000    (to pick a different port)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8080;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.wav':'audio/wav', '.txt':'text/plain' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/player.html';
    const full = normalize(join(DIR, p));
    if (!full.startsWith(DIR)) { res.writeHead(403); res.end('no'); return; }
    await stat(full);
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full)] || 'application/octet-stream',
      // Cache-busting: the harness appends ?t=…; also tell the browser not to cache.
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
server.listen(PORT, () => {
  console.log('MIMIC listening harness: open  http://localhost:' + PORT + '/');
  console.log('Press Ctrl-C to stop.');
});
`;

// Plain-English "how to listen" for a non-programmer.
export const README_TXT = (runName, summary) => `MIMIC run: ${runName}
================================================================

WHAT THIS FOLDER IS
Every file here is the result of evolving sounds to match your target.
The interesting ones to your ears:

  * gen-0000.wav, gen-0001.wav, …  — the best sound found at each saved
    generation. Play them in order and you HEAR the search improving.
  * fittest.wav        — the single best sound found (exactly as it was scored).
  * fittest-listen.wav — the same, turned up to a comfortable volume.

HOW TO HEAR THE WHOLE ASCENT (easiest way)
  1. Open a terminal in this folder.
  2. Type:   node serve.js
  3. It prints a web address like  http://localhost:8080/  — open that in a
     browser and press "Play all in order". No internet needed.

WHAT THE NUMBERS MEAN
  * SSE  = how far the sound is from your target. LOWER is better; 0 is perfect.
  * similarity = 1 / SSE. HIGHER is better.
  Final best SSE: ${summary.finalBestSSE}
  Final similarity: ${summary.finalBestSimilarity}
  Best found at generation: ${summary.bestFoundAtGeneration}
${summary.silenceFloorSSE != null ? `  (For reference, total silence scores SSE ${summary.silenceFloorSSE} against this
  target — anything below that is genuinely matching the sound, not just going quiet.)\n` : ''}
SHARE A SOUND
  fittest.pg2.txt holds the winning "genome" as a text string starting "PG2:".
  Paste it into the MIMIC app to hear or evolve it further on any machine.

Settings used: algorithm=${summary.algorithm}, population=${summary.population},
generations=${summary.generations}, seed=${summary.seed}, workers=${summary.workers}.
`;
