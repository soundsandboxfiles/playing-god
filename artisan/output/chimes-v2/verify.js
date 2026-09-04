// verify.js — the independent proof that an ARTISAN run held the one hard
// constraint (BRIEF §3.1, §7). ZERO external dependencies: it uses only Node
// built-ins plus the UNMODIFIED Playing God engine, which it locates by walking
// up to the repo root — so it runs from any depth and never needs `npm install`.
//
// A run is NOT done until this passes (BRIEF §10.1). What it proves, end to end:
//
//   1. genome.pg2.txt decodes as a valid PG2 genome (every gene a float32 in the
//      current schema) — the deliverable really is expressible in the format.
//   2. Rendering that genome through the true engine at the recorded length, then
//      16-bit-encoding it with the engine's own encoder, reproduces final.wav
//      BYTE FOR BYTE — the delivered WAV is exactly the engine's render, with no
//      surrogate, no post-processing, no drift (the surrogate-drift tripwire).
//   3. Recomputing the blunt SSE (raw float samples, over the scored window)
//      against the losslessly-stored scored target reproduces the reported SSE —
//      the headline number was measured honestly.
//
// Usage:  node verify.js            (run from inside the run folder)
//         node verify.js <run-dir>  (or point it at one)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ── locate this script's run directory and the repo root ─────────────────────
const scriptDir = dirname(fileURLToPath(import.meta.url));
const runDir = resolve(process.argv[2] || scriptDir);

// Walk up from the run dir to find the Playing God repo root (has src/synthesis.js
// and mimic/lib/genome-string.js). Robust to where the run folder lives.
function findRepoRoot(start) {
  let d = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'src', 'synthesis.js')) &&
        existsSync(join(d, 'mimic', 'lib', 'genome-string.js'))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error(
    'could not find the Playing God engine (src/synthesis.js) above ' + start +
    '. Run verify.js from inside its run folder in the repo.');
}

async function main() {
  const metaPath = join(runDir, 'meta.json');
  if (!existsSync(metaPath)) {
    fail(`no meta.json in ${runDir} — is this an ARTISAN run folder?`);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const root = findRepoRoot(runDir);

  // Import the UNMODIFIED engine + codec by absolute file URL (zero npm deps).
  const { render } = await import(pathToFileURL(join(root, 'src', 'synthesis.js')));
  const { decodeGenomeString } =
    await import(pathToFileURL(join(root, 'mimic', 'lib', 'genome-string.js')));
  const { encodeWav } = await import(pathToFileURL(join(root, 'src', 'wav.js')));

  console.log('ARTISAN verify — proving the delivered run is exactly what it claims.\n');
  console.log(`  run folder : ${runDir}`);
  console.log(`  engine     : ${join(root, 'src', 'synthesis.js')}`);
  console.log(`  target     : ${meta.targetName}`);
  console.log(`  render     : ${meta.renderLengthS}s @ ${meta.sampleRate} Hz  (window ` +
    `[${meta.offsetSamples}, ${meta.offsetSamples + meta.winLen}))\n`);

  let ok = true;

  // 1. Decode the genome string.
  const genomeStr = readFileSync(join(runDir, meta.files.genome), 'utf8').trim();
  let genome;
  try {
    genome = decodeGenomeString(genomeStr);
    console.log('  [1/3] genome.pg2.txt decodes as a valid genome ............. PASS');
  } catch (e) {
    console.log('  [1/3] genome.pg2.txt decodes as a valid genome ............. FAIL');
    console.log('        ' + e.message);
    return done(false);
  }

  // 2. Render via the true engine and reproduce final.wav byte-for-byte.
  const r = render(genome, { sampleRate: meta.sampleRate, lengthS: meta.renderLengthS });
  if (r.renderError) { console.log('  [2/3] engine render ....................................... FAIL (' + r.renderError + ')'); return done(false); }
  const reWav = encodeWav(r.samples, meta.sampleRate);
  const finalWav = new Uint8Array(readFileSync(join(runDir, meta.files.finalWav)));
  const identical = reWav.length === finalWav.length && bytesEqual(reWav, finalWav);
  if (identical) {
    console.log('  [2/3] final.wav is byte-identical to a fresh engine render . PASS');
  } else {
    ok = false;
    const dev = maxWavDeviation(reWav, finalWav);
    console.log('  [2/3] final.wav is byte-identical to a fresh engine render . FAIL');
    console.log(`        byte lengths ${reWav.length} vs ${finalWav.length}; max 16-bit sample deviation ${dev}`);
  }

  // 3. Recompute the blunt SSE over the window against the lossless scored target.
  const targetRaw = readF32(join(runDir, meta.files.targetRaw));
  let sse = 0;
  for (let i = 0; i < meta.winLen; i++) {
    const s = r.samples[meta.offsetSamples + i];
    const d = (s === undefined ? 0 : s) - targetRaw[i];
    sse += d * d;
  }
  const reported = meta.reportedSSE;
  // Same-machine renders are bit-identical → exact match. Allow a hair of slack for
  // cross-platform Math.sin ULP differences, reported transparently.
  const absDiff = Math.abs(sse - reported);
  const relDiff = reported > 0 ? absDiff / reported : absDiff;
  const sseOk = absDiff <= 1e-6 || relDiff <= 1e-9;
  if (sseOk) {
    console.log('  [3/3] recomputed SSE matches the reported SSE ............. PASS');
  } else {
    ok = false;
    console.log('  [3/3] recomputed SSE matches the reported SSE ............. FAIL');
  }
  console.log(`        reported SSE ${reported}`);
  console.log(`        recomputed   ${sse}`);
  if (!sseOk) console.log(`        difference   ${absDiff} (relative ${relDiff})`);

  // Plain-English summary for a non-programmer.
  console.log('');
  const sim = sse > 0 ? (1 / sse) : Infinity;
  console.log(`  Scored SSE ${fmt(sse)}  (similarity ${sim === Infinity ? 'PERFECT' : fmt(sim)}).`);
  if (meta.silenceFloor != null) {
    const ratio = sse > 0 ? meta.silenceFloor / sse : Infinity;
    console.log(`  Silence floor for this target is ${fmt(meta.silenceFloor)} — this render is ` +
      `${ratio === Infinity ? 'infinitely' : fmt(ratio) + '×'} better than silence.`);
  }
  return done(ok);
}

function done(ok) {
  console.log('');
  if (ok) {
    console.log('  VERDICT: PASS — the genome string, the delivered WAV, and the reported');
    console.log('           score all agree. This run is exactly what it claims to be.');
    process.exit(0);
  } else {
    console.log('  VERDICT: FAIL — see the failing check above. Do NOT trust this run until fixed.');
    process.exit(1);
  }
}

function fail(msg) { console.error('verify.js: ' + msg); process.exit(2); }

function bytesEqual(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

// Max absolute difference between the 16-bit samples of two WAVs (diagnostic only).
function maxWavDeviation(a, b) {
  const n = Math.min(a.length, b.length);
  let mx = 0;
  for (let o = 44; o + 1 < n; o += 2) {
    const va = (a[o] | (a[o + 1] << 8)) << 16 >> 16;
    const vb = (b[o] | (b[o + 1] << 8)) << 16 >> 16;
    mx = Math.max(mx, Math.abs(va - vb));
  }
  return mx;
}

// Read a little-endian Float32 raw file into a Float32Array.
function readF32(path) {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = Math.floor(buf.byteLength / 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

function fmt(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) return x.toExponential(4);
  return x.toFixed(x < 1 ? 6 : 3);
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
