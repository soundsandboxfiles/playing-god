#!/usr/bin/env node
// make-targets.mjs — the target library's build tool. Verbs:
//   analyze [id...]  decode each raw source, score candidate windows per the manifest's
//                    window.strategy, write proposals to windows.json (top-3 per clip)
//   build   [id...]  cut the chosen window (windows.json overrides > manifest startSec),
//                    resample to house format via ffmpeg, 5 ms edge fades, peak-normalize
//                    to -1 dBFS, write <id>.wav + sha256, update manifest measured fields,
//                    regenerate MANIFEST.md
//   verify           load every built target through ../mimic/lib/wavio.js (the loader the
//                    programs actually use), re-hash, and check against the manifest
// Requires: node >= 18, ffmpeg on PATH. Zero npm dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 22050;
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const winPath = join(ROOT, 'windows.json');
const windows = existsSync(winPath) ? JSON.parse(readFileSync(winPath, 'utf8')) : {};

const decode = (p) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', p, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
};

// ── analysis primitives ─────────────────────────────────────────────────────
const HOP = Math.round(SR * 0.05), WIN = 1024; // 50 ms hop, 46 ms FFT
function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function frames(x) { // per-frame: rms, flatness, flux, peakiness
  const out = [];
  let prevMag = null;
  const re = new Float64Array(WIN), im = new Float64Array(WIN);
  for (let a = 0; a + WIN <= x.length; a += HOP) {
    let e = 0;
    for (let i = 0; i < WIN; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WIN);
      re[i] = x[a + i] * w; im[i] = 0; e += x[a + i] * x[a + i];
    }
    fft(re, im);
    const half = WIN / 2, mag = new Float64Array(half);
    let sum = 0, logSum = 0, mx = 0;
    for (let i = 1; i < half; i++) {
      mag[i] = Math.hypot(re[i], im[i]);
      sum += mag[i]; logSum += Math.log(mag[i] + 1e-12); mx = Math.max(mx, mag[i]);
    }
    const flat = Math.exp(logSum / (half - 1)) / (sum / (half - 1) + 1e-12); // 1=noise, ->0=tonal
    let flux = 0;
    if (prevMag) for (let i = 1; i < half; i++) { const d = mag[i] - prevMag[i]; if (d > 0) flux += d; }
    prevMag = mag.slice();
    out.push({ rms: Math.sqrt(e / WIN), flat, flux, peak: mx / (sum / (half - 1) + 1e-12) });
  }
  return out;
}
function onsetsIn(fr, i0, i1) {
  let n = 0;
  for (let i = Math.max(1, i0); i < i1; i++) if (fr[i].rms > fr[i - 1].rms * 1.6 && fr[i].rms > 0.01) n++;
  return n;
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function scoreWindow(strategy, fr, i0, i1) {
  const seg = fr.slice(i0, i1);
  const e = mean(seg.map(f => f.rms));
  const eVar = mean(seg.map(f => (f.rms - e) ** 2)) / (e * e + 1e-12);
  switch (strategy) {
    case 'densest-song': case 'densest-onsets': return onsetsIn(fr, i0, i1) * (0.5 + e);
    case 'densest-stationary': return e / (1 + 4 * eVar);
    case 'first-clean-sentence': return e > 0.02 ? e / (1 + eVar) - i0 * 1e-4 : -1; // earliest sustained speech
    case 'loudest-sustained': return e / (1 + 2 * eVar);
    case 'most-stationary': return (mean(seg.map(f => f.flat)) * e) / (1 + 8 * eVar);
    case 'mixed-tonal-broadband': return e * mean(seg.map(f => f.flat)) * mean(seg.map(f => f.peak));
    default: return e;
  }
}

const args = process.argv.slice(2);
const verb = args[0];
const only = new Set(args.slice(1));
const pick = (c) => (only.size === 0 || only.has(c.id));
const rawPath = (c) => c.source && c.source.raw ? join(ROOT, c.source.raw) : null;

if (verb === 'analyze') {
  for (const c of manifest.clips) {
    if (!pick(c) || !c.window || !rawPath(c) || !existsSync(rawPath(c))) continue;
    const strat = c.window.strategy;
    if (strat === 'fixed' || strat === 'manual') continue;
    const x = decode(rawPath(c));
    const fr = frames(x);
    const wFrames = Math.round(c.window.seconds * SR / HOP);
    const scored = [];
    for (let i0 = 0; i0 + wFrames <= fr.length; i0 += 4) // 200 ms grid
      scored.push({ startSec: +(i0 * HOP / SR).toFixed(2), score: scoreWindow(strat, fr, i0, i0 + wFrames) });
    scored.sort((a, b) => b.score - a.score);
    // top-3, mutually >2 s apart
    const top = [];
    for (const s of scored) {
      if (top.every(t => Math.abs(t.startSec - s.startSec) > 2)) top.push(s);
      if (top.length === 3) break;
    }
    windows[c.id] = { chosen: top[0].startSec, seconds: c.window.seconds, strategy: strat, candidates: top };
    console.log(`${c.id}: raw ${(x.length / SR).toFixed(1)} s -> windows ${top.map(t => t.startSec + 's(' + t.score.toFixed(3) + ')').join(', ')}`);
  }
  writeFileSync(winPath, JSON.stringify(windows, null, 2));
  console.log('wrote windows.json (edit "chosen" to override, then re-run build)');
} else if (verb === 'build') {
  for (const c of manifest.clips) {
    if (!pick(c) || !c.window) continue;
    const rp = rawPath(c);
    if (c.status === 'canonical' || c.status === 'reserved-self-record') continue;
    if (!rp || !existsSync(rp)) { console.log(`${c.id}: raw missing, skipped`); continue; }
    const start = windows[c.id]?.chosen ?? c.window.startSec ?? 0;
    const dur = windows[c.id]?.seconds ?? c.window.seconds;
    const x = decode(rp);
    let a0 = Math.round(start * SR), n = Math.round(dur * SR);
    if (a0 + n > x.length) { a0 = Math.max(0, x.length - n); n = Math.min(n, x.length); }
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = x[a0 + i];
    const fadeN = Math.round(0.005 * SR);
    for (let i = 0; i < fadeN; i++) {
      const g = 0.5 * (1 - Math.cos(Math.PI * i / fadeN));
      y[i] *= g; y[n - 1 - i] *= g;
    }
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
    const g = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;
    let rms = 0;
    const pcm = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const v = y[i] * g; rms += v * v;
      let q = Math.round(v * 32767); if (q > 32767) q = 32767; if (q < -32768) q = -32768;
      pcm.writeInt16LE(q, i * 2);
    }
    rms = Math.sqrt(rms / n);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
    hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
    hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
    hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    const wav = Buffer.concat([hdr, pcm]);
    writeFileSync(join(ROOT, c.file), wav);
    c.built = {
      startSec: +start.toFixed(2), seconds: +(n / SR).toFixed(3),
      peakDbfs: -1.0, rmsDbfs: +(20 * Math.log10(rms)).toFixed(2),
      sha256: createHash('sha256').update(wav).digest('hex'),
      builtAt: new Date().toISOString().slice(0, 10)
    };
    c.status = 'pending-audition';
    console.log(`${c.id}: built ${c.file} [${start}s +${(n / SR).toFixed(2)}s] rms ${c.built.rmsDbfs} dBFS`);
  }
  writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  regenerateMd();
} else if (verb === 'verify') {
  (async () => {
    const { decodeWav } = await import(join(ROOT, '..', 'mimic', 'lib', 'wavio.js'));
    let ok = 0, bad = 0;
    for (const c of manifest.clips) {
      const p = join(ROOT, c.file);
      if (!existsSync(p)) {
        if (c.status === 'awaiting-download' || c.status === 'awaiting-synthesis') console.log(`${c.id}: awaiting raw (${c.status}) — not yet built`);
        else if (c.status !== 'reserved-self-record') { console.log(`${c.id}: MISSING ${c.file}`); bad++; }
        continue;
      }
      const bytes = readFileSync(p);
      if (c.built) {
        const h = createHash('sha256').update(bytes).digest('hex');
        if (h !== c.built.sha256) { console.log(`${c.id}: sha256 MISMATCH`); bad++; continue; }
      }
      try {
        const dec = decodeWav(bytes, SR);
        const mono = dec.samples;
        let peak = 0; for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
        console.log(`${c.id}: OK via wavio — ${dec.durationS.toFixed(2)} s (src ${dec.sourceRate} Hz/${dec.sourceChannels}ch/${dec.sourceBits}bit), peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS${c.status === 'canonical' ? ' (canonical)' : ''}`);
        ok++;
      } catch (e) { console.log(`${c.id}: wavio FAILED — ${e.message}`); bad++; }
    }
    console.log(`\n${ok} OK, ${bad} problems`);
    process.exit(bad ? 1 : 0);
  })();
} else {
  console.log('usage: node tools/make-targets.mjs analyze|build|verify [clipId...]');
}

function regenerateMd() {
  const rows = manifest.clips.map(c => {
    const dur = c.built ? c.built.seconds.toFixed(2) : (c.status === 'canonical' ? '—' : '');
    const sha = c.built ? c.built.sha256.slice(0, 12) : '';
    return `| ${c.id} | ${c.tier} | ${c.status} | ${dur} | ${(c.licence || '').split('(')[0].trim()} | ${sha} |`;
  }).join('\n');
  const attribs = manifest.clips.filter(c => c.attribution).map(c => `- **${c.id}**: ${c.attribution}${(c.licence || '').includes('CC-BY') ? ' — CC-BY 4.0, attribution required' : ''}`).join('\n');
  const md = `# Target library — manifest

*GENERATED by tools/make-targets.mjs from manifest.json — do not edit by hand.
Design rationale: LIBRARY-DESIGN.md. House format: 22050 Hz mono 16-bit WAV,
peak −1 dBFS, ≤10 s (tier A new clips ≤4 s). Canonical clips are bit-identical
copies of the historical files in ../mimic/targets/ and are exempt.*

| id | tier | status | dur (s) | licence | sha256 |
|---|---|---|---|---|---|
${rows}

## The pipeline

1. \`bash tools/fetch-raw.sh\` — on the Mac (needs internet): downloads raw sources into \`_raw/\`.
2. \`node tools/synth-protocol.mjs\` — synthesizes the dtmf-modem raw deterministically.
3. \`node tools/make-targets.mjs analyze\` — proposes excerpt windows by measurement (windows.json).
4. \`node tools/make-targets.mjs build\` — cuts, resamples, normalizes, hashes, updates this file.
5. \`node tools/make-targets.mjs verify\` — loads every target through MIMIC's own wavio loader.
6. **Audition (Jon)** — listen to every built clip. Veto or move windows: edit the \`chosen\`
   field in windows.json (candidate alternatives are listed there), re-run \`build <id>\`,
   or swap in an alternate source from manifest.json. When a clip passes, flip its status
   from \`pending-audition\` to \`accepted\` in manifest.json.

## Self-record upgrade slots

- **voice-sung** (reserved): a slow sustained sung phrase with natural vibrato, ~5–8 s.
- **whisper** / **castanets** upgrades: a whispered full sentence; a dry claves/woodblock/clap
  burst. Both replace 128k MP3 previews whose compression touches exactly the axis being tested.
Drop recordings (any format) into \`_raw/\`, point the manifest entry's \`source.raw\` at them,
set the window, and re-run \`build <id>\`.

## Attribution ledger

${attribs}
`;
  writeFileSync(join(ROOT, 'MANIFEST.md'), md);
  console.log('regenerated MANIFEST.md');
}
