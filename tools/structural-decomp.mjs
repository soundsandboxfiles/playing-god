#!/usr/bin/env node
// structural-decomp.mjs — split a genome's fit to its target into STRUCTURE vs
// LOUDNESS, and read off the "how hard is this target" signal that the
// %-of-floor curve hides. Works across the whole lineage: point it at a MIMIC
// run dir, an ARTISAN output dir, or any lone genome + target WAV.
//
// Usage:
//   node tools/structural-decomp.mjs <dir>            [--curve] [--json] [--window-start S]
//   node tools/structural-decomp.mjs --genome <pg2> --target <wav> [--window-start S]
//   optional target override for a run dir: [--target <wav> | --target-name chimes|speech]
//
// INPUT IT UNDERSTANDS (auto-detected):
//   * MIMIC run dir      — has manifest.json + saved gen-*.pg2.txt. Scores the
//                          champion (lowest SSE); --curve does every saved gen.
//                          Target auto-resolves from configs/<run>.json if present.
//   * ARTISAN output dir — has genome.pg2.txt + target-scored.wav (+ meta.json).
//                          Scores that one genome; target & window come from the dir.
//   * lone genome        — --genome <pg2> --target <wav>. For IMPRESSIONIST outputs
//                          (once built) and any ad-hoc genome.
//
// WHAT IT REPORTS:
//   %floor (raw)  = SSE / silence-floor — the axis the dashboards plot; = the
//                   `sse-normalized` metric; ≈ 1 − corr² in practice.
//   struct 1-r^2  = gain-optimal residual: error left after the single best global
//                   loudness is removed. The loudness-FREE, phase-sensitive mismatch.
//   loudness gap  = %floor − struct. Observed ~0 on real champions (k*→1): the GA
//                   fixes global gain for free, so the descent is all structure.
//   corr          = waveform correlation with the target (phase-sensitive).
//   k*            = the loudness the render should have had (1.0 = spot on).
//
// WHY: %floor is scale-free (1 − R²), so it is BLIND to absolute difficulty — two
// targets of very different length/loudness can share an early %floor curve and
// plateau miles apart. The honest difficulty signal is the CORRELATION CEILING:
// run to plateau and read `corr`. See mimic/docs/FINDINGS.md, "Cross-target
// normalised-curve overlay" (2026-09-05).
//
// NOTE for IMPRESSIONIST / IMPRESSIONIST-MIMIC: this is an SSE-space diagnostic,
// NOT their objective. There the perceptual metric is the arbiter; structural-
// decomp is the blunt-SSE baseline you compare the perceptual view against.
//
// Engine read-only. Writes nothing unless --json (then <dir>/structural-decomp.json).

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));                 // <project-root>/tools
const { decodeGenomeString } = await import(join(HERE, '../mimic/lib/genome-string.js'));
const { decodeWav } = await import(join(HERE, '../mimic/lib/wavio.js'));
const { renderRaw } = await import(join(HERE, '../mimic/lib/render-raw.js'));
const RATE = 22050;

const argv = process.argv.slice(2);
const positional = argv.find(a => !a.startsWith('--'));
const opt = (name, def=null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? (argv[i+1] && !argv[i+1].startsWith('--') ? argv[i+1] : true) : def;
};
const wantCurve = !!opt('curve', false);
const wantJson  = !!opt('json', false);
const NAMED = {
  chimes: join(HERE, '../mimic/targets/westminster-chimes.wav'),
  speech: join(HERE, '../mimic/targets/SpeechSignalProcessing.wav'),
};
const fail = m => { console.error(m); process.exit(1); };

// ── decomposition core ─────────────────────────────────────────────────────────
function floorOf(t){ let s=0; for (let i=0;i<t.length;i++) s+=t[i]*t[i]; return s; }
function decompose(genomePath, target, startSample, floor) {
  const g = decodeGenomeString(readFileSync(genomePath, 'utf8'));
  const lengthS = (startSample + target.length) / RATE;
  const r = renderRaw(g, { lengthS, sampleRate: RATE });
  if (r.renderError) return { err: r.renderError };
  const s = r.samples;
  let Srt = 0, Srr = 0, SSE = 0;
  for (let i = 0; i < target.length; i++) {
    const rv = (s[startSample + i] === undefined ? 0 : s[startSample + i]), tv = target[i];
    Srt += rv*tv; Srr += rv*rv;
    const d = rv - tv; SSE += d*d;
  }
  const silent = !(Srr > 0);
  return { SSE, residFrac: SSE/floor,
    struct: silent ? 1 : 1 - (Srt*Srt)/(Srr*floor),
    loud: (SSE/floor) - (silent ? 1 : 1 - (Srt*Srt)/(Srr*floor)),
    corr: silent ? 0 : Srt/Math.sqrt(Srr*floor),
    kstar: silent ? 0 : Srt/Srr, activeWaves: r.activeWaves, silent };
}
const pct = x => (x*100).toFixed(1).padStart(7) + '%';
function line(label, d) {
  if (d.err) return console.log(`${label.padEnd(16)} | render error: ${d.err}`);
  console.log(`${label.padEnd(16)} | %floor ${pct(d.residFrac)} | struct ${pct(d.struct)} | loud gap ${pct(d.loud)} | k* ${d.kstar.toFixed(3)} | corr ${d.corr.toFixed(3)} | waves ${d.activeWaves}` + (d.silent ? '  (silent render)' : ''));
}
function readSlots(d, floor, corrLabel) {
  console.log('\nRead:');
  console.log(`  · loudness gap ${pct(d.loud).trim()} (k* ${d.kstar.toFixed(3)}) — this axis ≈ 1 − corr², i.e. structure, not loudness.`);
  console.log(`  · correlation ceiling${corrLabel}: ${d.corr.toFixed(3)}. Compare THIS across targets to rank difficulty, not the %floor curves.`);
}
function selfCheck(rendered, recorded, extra='') {
  if (!recorded) return;
  const drift = Math.abs(rendered - recorded) / recorded;
  console.log(`  self-check: rendered SSE ${rendered.toFixed(1)} vs recorded ${recorded.toFixed(1)}  (${(drift*100).toFixed(2)}% drift)` +
    (drift > 0.01 ? `  ⚠ >1% — check --window-start${extra}` : '  ✓'));
}

// ── resolve mode ────────────────────────────────────────────────────────────────
const explicitGenome = opt('genome');
let out = null;

if (explicitGenome && explicitGenome !== true) {
  // lone-genome mode
  const t = opt('target'), tn = opt('target-name');
  const targetPath = (t && t!==true) ? resolve(t) : (tn && NAMED[tn]) ? NAMED[tn] : null;
  if (!targetPath || !existsSync(targetPath)) fail('lone-genome mode needs --target <wav> (or --target-name chimes|speech).');
  const target = decodeWav(readFileSync(targetPath)).samples;
  const floor = floorOf(target);
  const startSample = Math.round((Number(opt('window-start',0))||0) * RATE);
  console.log(`\nStructural decomposition — genome ${basename(resolve(explicitGenome))} vs ${basename(targetPath)}`);
  console.log(`target ${(target.length/RATE).toFixed(3)}s / ${target.length} samples @${RATE}Hz · silence floor ${floor.toFixed(1)}`);
  const d = decompose(resolve(explicitGenome), target, startSample, floor);
  line('genome', d); if (!d.err) readSlots(d, floor, ' so far');
  out = { mode:'genome', genome: basename(resolve(explicitGenome)), target: basename(targetPath), floor, result: d };

} else {
  const dir = resolve(positional || fail('Give a run/output dir, or --genome <pg2> --target <wav>.'));
  const isMimic = existsSync(join(dir, 'manifest.json'));
  const isArtisan = !isMimic && existsSync(join(dir, 'genome.pg2.txt'));
  if (!isMimic && !isArtisan) fail(`"${basename(dir)}" is neither a MIMIC run dir (manifest.json) nor an ARTISAN output dir (genome.pg2.txt). Use --genome/--target for a lone genome.`);

  if (isArtisan) {
    // ARTISAN: one genome, exact scored target + meta in the dir
    let meta = {}; try { meta = JSON.parse(readFileSync(join(dir,'meta.json'),'utf8')); } catch {}
    const tOverride = opt('target');
    const targetPath = (tOverride && tOverride!==true) ? resolve(tOverride)
      : existsSync(join(dir,'target-scored.wav')) ? join(dir,'target-scored.wav')
      : (meta.source && meta.source.path) ? resolve(join(dir, meta.source.path)) : null;
    if (!targetPath || !existsSync(targetPath)) fail('ARTISAN dir: could not find target-scored.wav; pass --target <wav>.');
    const target = decodeWav(readFileSync(targetPath)).samples;
    const floor = floorOf(target);
    const startSample = meta.offsetSamples != null ? meta.offsetSamples : Math.round((Number(opt('window-start',0))||0)*RATE);
    console.log(`\nStructural decomposition — ARTISAN "${meta.config?.run || basename(dir)}" vs ${basename(targetPath)}`);
    console.log(`target ${(target.length/RATE).toFixed(3)}s / ${target.length} samples @${RATE}Hz · silence floor ${floor.toFixed(1)}` + (startSample?` · offset ${startSample} samp`:''));
    const d = decompose(join(dir,'genome.pg2.txt'), target, startSample, floor);
    line('genome', d);
    if (!d.err) { selfCheck(d.SSE, meta.reportedSSE, ' / --target'); readSlots(d, floor, ''); }
    out = { mode:'artisan', run: meta.config?.run || basename(dir), target: basename(targetPath), floor, result: d };

  } else {
    // MIMIC run dir (original behaviour)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const tOverride = opt('target'), tn = opt('target-name');
    let targetPath = (tOverride && tOverride!==true) ? resolve(tOverride) : (tn && NAMED[tn]) ? NAMED[tn] : null;
    if (!targetPath) {
      const cfgPath = join(HERE, '../mimic/configs', basename(dir) + '.json');
      if (existsSync(cfgPath)) { const c = JSON.parse(readFileSync(cfgPath,'utf8'));
        if (c.target) targetPath = resolve(join(HERE,'..',c.target));
        else if (c.targetName && NAMED[c.targetName]) targetPath = NAMED[c.targetName]; }
    }
    if (!targetPath || !existsSync(targetPath)) fail('MIMIC run: pass --target <wav> or --target-name chimes|speech (manifest does not record the target).');
    const target = decodeWav(readFileSync(targetPath)).samples;
    const floor = floorOf(target);
    const startSample = Math.round((Number(opt('window-start',0))||0)*RATE);
    const saved = manifest.generations.map(g=>({...g})).sort((a,b)=>a.generation-b.generation);
    const champ = saved.reduce((b,g)=> g.sse<b.sse ? g : b, saved[0]);
    console.log(`\nStructural decomposition — MIMIC run "${manifest.run}" vs ${basename(targetPath)}`);
    console.log(`target ${(target.length/RATE).toFixed(3)}s / ${target.length} samples @${RATE}Hz · silence floor ${floor.toFixed(1)}`);
    const dc = decompose(join(dir, champ.genomeFile), target, startSample, floor);
    console.log('\nCHAMPION (lowest SSE among saved gens):'); line(`gen ${champ.generation}`, dc);
    if (!dc.err) { selfCheck(dc.SSE, champ.sse); readSlots(dc, floor, ' so far'); }
    let curveRows = null;
    if (wantCurve) {
      console.log('\nPER-SAVED-GENERATION (watch corr climb; the plateau is the difficulty verdict):');
      console.log('   gen |  %floor |  struct |  corr  | waves'); curveRows=[];
      for (const g of saved) { const d=decompose(join(dir,g.genomeFile),target,startSample,floor);
        if (d.err){ console.log(`${String(g.generation).padStart(6)} | render error`); continue; }
        console.log(`${String(g.generation).padStart(6)} | ${pct(d.residFrac)} | ${pct(d.struct)} | ${d.corr.toFixed(3)} | ${d.activeWaves}`);
        curveRows.push({generation:g.generation, residFrac:d.residFrac, struct:d.struct, corr:d.corr, kstar:d.kstar, activeWaves:d.activeWaves}); }
    }
    out = { mode:'mimic', run: manifest.run, target: basename(targetPath), floor, champion:{generation:champ.generation, ...dc}, curve:curveRows };
  }
}

if (wantJson && positional) {
  const p = join(resolve(positional), 'structural-decomp.json');
  writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${p}`);
}
console.log('');
