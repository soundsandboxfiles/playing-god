// deliverable.js — writes a run's output folder and streams best-so-far to disk.
//
// The one incident MIMIC recorded was losing 8.75 hours by writing the deliverable
// only at the end (MIMIC-REPORT §7). ARTISAN never holds a work product in memory:
// the moment the search improves, the new best genome + WAV + curve point hit disk
// (BRIEF §7 "Progress trace, streamed"). A crash at any point leaves a valid,
// verifiable partial run.
//
// Final contents (BRIEF §7): genome.pg2.txt, final.wav, target-scored.wav,
// target-scored.f32 (lossless, for exact verify), meta.json, verify.js, report.md,
// curve.json/csv, assembly WAVs (if constructive), mixer.html.

import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encodeGenomeString, similarityOf } from './engine.js';
import { writeWav, writeF32 } from './io.js';
import { scoreGenome } from './score.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTISAN_ROOT = join(__dirname, '..');

export class Deliverable {
  // target = resolveTarget() result; cfg = resolved config; runDir absolute.
  constructor(runDir, target, cfg) {
    this.runDir = runDir;
    this.target = target;
    this.cfg = cfg;
    this.plan = target.plan;
    this.curve = [];        // [{ t(ms), sse, stage }]
    this.t0 = Date.now();
    this.bestSSE = Infinity;
    this.files = { genome: 'genome.pg2.txt', finalWav: 'final.wav', targetScoredWav: 'target-scored.wav', targetRaw: 'target-scored.f32' };
    mkdirSync(runDir, { recursive: true });
    // The scored target, written once (lossless + listenable).
    writeF32(join(runDir, this.files.targetRaw), target.target);
    writeWav(join(runDir, this.files.targetScoredWav), target.target, target.sampleRate);
  }

  // Stream a new best genome (only writes if it improves SSE). `samples` optional
  // (the windowed/full render) — if absent we re-render. Returns the SSE.
  update(genome, stage = 'run', knownSSE = null, samples = null) {
    let sse = knownSSE, s = samples;
    if (sse == null || s == null) { const r = scoreGenome(genome, this.plan); sse = r.sse; s = r.samples; }
    this.curve.push({ t: Date.now() - this.t0, sse, stage });
    if (sse < this.bestSSE) {
      this.bestSSE = sse;
      this.bestGenome = genome.clone();
      this.bestSamples = s;
      // stream the crown jewel + WAV immediately
      writeFileSync(join(this.runDir, this.files.genome), encodeGenomeString(genome) + '\n');
      writeWav(join(this.runDir, this.files.finalWav), s, this.target.sampleRate);
      this.writeMeta(sse);
      this.writeCurve();
    }
    return sse;
  }

  writeMeta(sse) {
    const meta = {
      targetName: this.target.name,
      targetKind: this.target.kind,
      sampleRate: this.target.sampleRate,
      renderLengthS: this.target.renderLengthS,
      offsetSamples: this.target.offsetSamples,
      winLen: this.plan.winLen,
      reportedSSE: sse,
      reportedSimilarity: similarityOf(sse),
      silenceFloor: this.target.silenceFloor,
      wallMs: Date.now() - this.t0,
      config: this.cfg,
      source: this.target.source,
      files: this.files,
    };
    writeFileSync(join(this.runDir, 'meta.json'), JSON.stringify(meta, null, 2));
    this.meta = meta;
  }

  writeCurve() {
    writeFileSync(join(this.runDir, 'curve.json'), JSON.stringify(this.curve));
    let csv = 'wall_ms,sse,stage\n';
    for (const p of this.curve) csv += `${p.t},${p.sse},${p.stage}\n`;
    writeFileSync(join(this.runDir, 'curve.csv'), csv);
  }

  // Copy the zero-dep verifier into the run folder (BRIEF §7).
  copyVerifier() {
    copyFileSync(join(ARTISAN_ROOT, 'verify.js'), join(this.runDir, 'verify.js'));
  }

  // Write progressive assembly WAVs: render with wave 1, waves 1–2, … (BRIEF §7/§8).
  // `assembly` is construct's assembly array; each entry's reconstruction is an
  // additive partial sum over the window. We write them as listenable WAVs.
  writeAssembly(assembly) {
    if (!assembly || !assembly.length) return;
    const dir = join(this.runDir, 'assembly');
    mkdirSync(dir, { recursive: true });
    const manifest = [];
    for (const step of assembly) {
      const name = `assembly-${String(step.nWaves).padStart(3, '0')}.wav`;
      // place the windowed reconstruction back into a full-length buffer for audition
      const full = new Float32Array(this.plan.N);
      for (let i = 0; i < this.plan.winLen; i++) full[this.plan.startSample + i] = step.samples[i];
      writeWav(join(dir, name), full, this.target.sampleRate);
      manifest.push({ nWaves: step.nWaves, sse: step.sse, file: `assembly/${name}` });
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    this.assemblyManifest = manifest;
  }

  // Human-readable report (BRIEF §7): SSE, similarity, floor, method, time, ceilings.
  writeReport(extra = {}) {
    const m = this.meta;
    const floor = this.target.silenceFloor;
    const sse = this.bestSSE;
    const belowFloor = floor / sse;
    const sim = similarityOf(sse);
    const lines = [];
    lines.push(`# ARTISAN run — ${this.target.name}`);
    lines.push('');
    lines.push(`*Sighted design of a Playing God genome to match this target sample-by-sample.*`);
    lines.push('');
    lines.push('## Result');
    lines.push('');
    lines.push(`- **Scored SSE:** ${fmt(sse)}  (lower is better; 0 = a perfect, sample-identical match)`);
    lines.push(`- **Similarity (1/SSE):** ${sim === Number.MAX_VALUE ? 'PERFECT (SSE = 0)' : fmt(sim)}`);
    lines.push(`- **Silence floor for this target:** ${fmt(floor)} — a silent render scores this. This render is **${fmt(belowFloor)}× better than silence**.`);
    if (extra.mimicSSE != null) lines.push(`- **MIMIC's best on this target:** ${fmt(extra.mimicSSE)} — ARTISAN is **${fmt(extra.mimicSSE / sse)}× better**.`);
    lines.push(`- **Active waves used:** ${extra.activeWaves != null ? extra.activeWaves : '—'} of ${this.cfg.maxWaves} allowed.`);
    lines.push('');
    lines.push('## What was rendered');
    lines.push('');
    lines.push(`- **Render length:** ${m.renderLengthS} s at ${m.sampleRate} Hz (${this.plan.N} samples).`);
    lines.push(`- **Scored window:** samples [${m.offsetSamples}, ${m.offsetSamples + m.winLen}) — i.e. ${(m.offsetSamples / m.sampleRate).toFixed(3)} s to ${((m.offsetSamples + m.winLen) / m.sampleRate).toFixed(3)} s.`);
    lines.push(`- The delivered **final.wav** is the *unmodified engine's* raw render of the genome, 16-bit encoded. **genome.pg2.txt** is the genome as a shareable text string — paste it into Playing God.`);
    lines.push(`- ⚠️ **Length matters.** This genome is tuned for *this* render length. The same genome at another length (e.g. under Playing God's render servo) is a relative, not a twin — its envelopes stretch with the render (BRIEF §2).`);
    lines.push('');
    lines.push('## Method');
    lines.push('');
    lines.push(extra.methodText || defaultMethodText());
    lines.push('');
    lines.push(`- **Wall-clock time:** ${(m.wallMs / 1000).toFixed(1)} s.`);
    if (this.cfg.seed != null) lines.push(`- **Random seed:** ${this.cfg.seed} (reproducible).`);
    if (extra.budgetNote) { lines.push(''); lines.push('### Budget spent (anytime optimiser)'); lines.push(''); lines.push(extra.budgetNote); }
    lines.push('');
    lines.push('## Honesty — ceilings hit');
    lines.push('');
    lines.push(ceilingsText(this.target, extra));
    lines.push('');
    lines.push('## Verify it yourself');
    lines.push('');
    lines.push('```');
    lines.push('node verify.js');
    lines.push('```');
    lines.push('Run from inside this folder. It re-renders the genome through the true engine, confirms the delivered WAV is byte-identical, and recomputes the SSE — printing a plain-English PASS/FAIL.');
    if (extra.surrogate) { lines.push(''); lines.push('## Surrogate parity'); lines.push(''); lines.push(extra.surrogate); }
    writeFileSync(join(this.runDir, 'report.md'), lines.join('\n') + '\n');
  }
}

function fmt(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x === Number.MAX_VALUE) return 'PERFECT';
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) return x.toExponential(4);
  return x.toFixed(x < 1 ? 6 : 3);
}

function defaultMethodText() {
  return [
    'Sighted constructive matching pursuit + closed-form amplitude fitting, then',
    'engine-space refinement. In plain terms: ARTISAN *measures* the target with an',
    'FFT (frequency, phase, amplitude, and a low-frequency search), places one wave',
    'at a time to explain the loudest thing left — choosing the best oscillator',
    'shape for each — and after every wave re-solves all the volumes at once for the',
    'mathematically best fit. It then polishes frequencies, phases and gate timings',
    'directly against the real engine. No blind evolution; the needle MIMIC could',
    'not thread is simply measured.',
  ].join(' ');
}

function ceilingsText(target, extra) {
  const out = [];
  out.push('- Everything above ~11 kHz is unrepresentable at 22050 Hz; stereo targets are collapsed to mono; delivery is 16-bit. These are fixed properties of the format, not search failures.');
  if (target.kind === 'recoverability') {
    out.push('- This is a **recoverability** target: it was itself rendered from a genome, so SSE = 0 provably exists. ARTISAN chases it directly.');
  } else {
    out.push('- For arbitrary real audio, SSE = 0 is reachable essentially only when the target is itself a genome render. The number above is the real floor ARTISAN reached; the residual is whatever the 64-oscillator additive model cannot represent (dense noise, fast inharmonic detail).');
  }
  if (extra.ceilingNote) out.push('- ' + extra.ceilingNote);
  return out.join('\n');
}
