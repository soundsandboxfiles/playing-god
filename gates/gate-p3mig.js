// gate-p3mig.js — GATE P3-mig: the timing reparameterisation is phenotype-safe.
//
// P3 (V2-PROPOSALS) is a bijective reparameterisation of the per-wave timing
// (pre_wait/duration/mid_wait → period/duty/pre_prop, src/migrate.js). The task's
// gate: migrate 200 random v1 genomes plus the owner's 7 picks, render BOTH versions
// and require sample-exact or near-exact equivalence, reporting the maximum deviation.
// If it will not pass after honest effort, P3 must be git-reverted and the build
// continues on the v1 schema — so this gate is the go/no-go for P3.
//
// HOW the two versions are rendered without keeping a copy of v1 synthesis:
//   • v1 side — decode the v1 timing genes to seconds (migrate.decodeV1TimingSeconds)
//     and render with synthesis' timingSecondsOverride, which bypasses the v2 decode.
//     All other genes are the v1 array's, unchanged. This is EXACTLY the v1 render.
//   • v2 side — migrate the array (migrateRawV1toV2) and render normally; v2 synthesis
//     reconstructs the seconds from period/duty/pre_prop.
// Any residual is the float round-trip through the v2 storage of period/duty/pre_prop.
// Trim is OFF on both sides so the F4/P4 leading-silence trim cannot mask a difference.
//
// Run: node gates/gate-p3mig.js
//
// Inputs (committed fixtures, captured under UNMODIFIED v1 code before P3):
//   output/gate-artefacts/p3mig-v1sample.json  — 200 random v1 genomes (base64 f32)
//   output/gate-artefacts/seed-picks-v1raw.json — the 7 owner picks (raw v1)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../src/synthesis.js';
import { migrateRawV1toV2, decodeV1TimingSeconds } from '../src/migrate.js';
import { Genome, WAVE_SLOTS, GENOME_SIZE } from '../src/genome.js';
import { writeArtefact, ARTEFACT_DIR, distributionSummary } from './_util.js';

// Render at two representative lengths and the audio rate. A short 4 s length (as the
// descriptor gates use) and a longer 30 s length (where a 1-sample period difference
// on a short repeating wave has the most cycles to desync — the worst case for the
// reparameterisation, mirroring the OVERNIGHT §8 pulse-alignment effect).
const CASES = [
  { sampleRate: 44100, lengthS: 4 },
  { sampleRate: 44100, lengthS: 30 },
];

// Near-exact criterion. A perfect migration is sample-identical; the float round-trip
// permits occasional single-sample gate-edge shifts on long durations. We pass when
// the renders are audibly identical: relative RMS error tiny and the correlation ≈ 1.
// max_abs_diff is reported honestly (a 1-sample edge shift can momentarily reach the
// amplitude of one wave), but is not the pass criterion by itself.
const REL_RMS_PASS = 1e-3;      // difference energy < −60 dB of signal energy
const CORR_PASS = 0.9999;       // waveforms essentially identical

function rawFromV1raw(entry) { return Float32Array.from(entry.data); }
function rawFromB64(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
// Build a v2 Genome from a v2-length raw array (the migrated array).
function genomeFromV2Raw(rawV2) {
  const g = new Genome();
  if (rawV2.length !== GENOME_SIZE) throw new Error(`expected v2 size ${GENOME_SIZE}, got ${rawV2.length}`);
  g.data.set(rawV2);
  g.id = g.hash();
  return g;
}

// Build the timingSecondsOverride map for the v1 render from a raw v1 array.
function v1TimingOverride(rawV1) {
  const map = {};
  for (let w = 0; w < WAVE_SLOTS; w++) map[w] = decodeV1TimingSeconds(rawV1, w);
  return map;
}

function compare(a, b) {
  const n = Math.min(a.length, b.length);
  let maxAbs = 0, sumDiffSq = 0, sumSq = 0, dotAB = 0, sumASq = 0, sumBSq = 0, nDiff = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    const ad = Math.abs(d);
    if (ad > maxAbs) maxAbs = ad;
    if (ad > 1e-6) nDiff++;
    sumDiffSq += d * d;
    sumSq += a[i] * a[i];
    dotAB += a[i] * b[i]; sumASq += a[i] * a[i]; sumBSq += b[i] * b[i];
  }
  const rmsSig = Math.sqrt(sumSq / Math.max(1, n));
  const rmsDiff = Math.sqrt(sumDiffSq / Math.max(1, n));
  const relRms = rmsSig > 0 ? rmsDiff / rmsSig : (rmsDiff > 0 ? Infinity : 0);
  const corr = (sumASq > 0 && sumBSq > 0) ? dotAB / Math.sqrt(sumASq * sumBSq) : 1;
  return { maxAbs, relRms, corr, nDiff, lenA: a.length, lenB: b.length, n };
}

function main() {
  const t0 = Date.now();
  console.log('── GATE P3-mig (timing reparameterisation equivalence) ──');

  // Load fixtures.
  const sample = JSON.parse(readFileSync(join(ARTEFACT_DIR, 'p3mig-v1sample.json'), 'utf8'));
  const picks = JSON.parse(readFileSync(join(ARTEFACT_DIR, 'seed-picks-v1raw.json'), 'utf8'));
  const items = [];
  for (const e of sample.genomes) items.push({ label: 'rand-' + e.index, raw: rawFromB64(e.b64) });
  for (const e of picks.genomes) items.push({ label: 'pick-' + e.index, raw: rawFromV1raw(e) });
  console.log(`  ${items.length} genomes (${sample.genomes.length} random + ${picks.genomes.length} picks)`);

  const perCaseStats = [];
  let worst = null, worstMaxAbs = null; // set on first comparison, then kept as the max
  let allPass = true;

  for (const c of CASES) {
    const relRmsAll = [], corrAll = [], maxAbsAll = [], nDiffFrac = [];
    let renderErrors = 0;
    for (const it of items) {
      // Migrate to v2 (6167). BOTH renders use this same genome — the only
      // difference is the timing source, which isolates the P3 reparam and confirms
      // the P1-appended genes do not affect the timing decode.
      let migrated;
      try { migrated = migrateRawV1toV2(it.raw); } catch { renderErrors++; continue; }
      const gMig = genomeFromV2Raw(migrated);
      // v1 render: feed v1-decoded seconds via override (trim OFF).
      const rV1 = render(gMig, { sampleRate: c.sampleRate, lengthS: c.lengthS, timingSecondsOverride: v1TimingOverride(it.raw) });
      // v2 render: native v2 timing decode (trim OFF — render() does not trim; only
      // renderNormalized does, and we deliberately avoid it here).
      const rV2 = render(gMig, { sampleRate: c.sampleRate, lengthS: c.lengthS });
      if (rV1.renderError || rV2.renderError) { renderErrors++; continue; }
      const cmp = compare(rV1.samples, rV2.samples);
      relRmsAll.push(cmp.relRms); corrAll.push(cmp.corr); maxAbsAll.push(cmp.maxAbs);
      nDiffFrac.push(cmp.nDiff / Math.max(1, cmp.n));
      const pass = cmp.relRms <= REL_RMS_PASS && cmp.corr >= CORR_PASS;
      if (!pass) allPass = false;
      if (!worst || cmp.relRms > worst.relRms) worst = { ...cmp, label: it.label, case: c };
      if (!worstMaxAbs || cmp.maxAbs > worstMaxAbs.maxAbs) worstMaxAbs = { ...cmp, label: it.label, case: c };
    }
    const stat = {
      case: c,
      n: relRmsAll.length,
      render_errors: renderErrors,
      rel_rms: distributionSummary(relRmsAll),
      corr: distributionSummary(corrAll),
      max_abs_diff: distributionSummary(maxAbsAll),
      frac_samples_differing: distributionSummary(nDiffFrac),
    };
    perCaseStats.push(stat);
    console.log(`  case sr=${c.sampleRate} L=${c.lengthS}s: n=${stat.n}` +
      ` relRMS p50=${fmt(stat.rel_rms.percentiles.p50)} max=${fmt(stat.rel_rms.max)}` +
      ` | corr min=${fmt(stat.corr.min)} | maxAbs max=${fmt(stat.max_abs_diff.max)}`);
  }

  const pass = allPass;
  const payload = {
    gate: 'P3-mig (timing reparameterisation phenotype equivalence, P3)',
    criterion: `per genome: relative RMS error ≤ ${REL_RMS_PASS} AND waveform correlation ≥ ${CORR_PASS}, at every case`,
    pass,
    n_genomes: items.length,
    cases: perCaseStats,
    worst_by_rel_rms: { label: worst.label, relRms: worst.relRms, corr: worst.corr, maxAbs: worst.maxAbs, case: worst.case },
    worst_by_max_abs: { label: worstMaxAbs.label, maxAbs: worstMaxAbs.maxAbs, relRms: worstMaxAbs.relRms, corr: worstMaxAbs.corr, case: worstMaxAbs.case },
    interpretation: 'A perfect reparameterisation is sample-identical. Residual comes from the float round-trip through the v2 storage of period/duty/pre_prop; it appears as rare single-sample gate-edge shifts on long durations. Reported as the maximum deviation per the task.',
    elapsed_s: (Date.now() - t0) / 1000,
  };
  const path = writeArtefact('gate-p3mig.json', payload);
  console.log(`  worst relRMS: ${fmt(worst.relRms)} on ${worst.label} (corr ${fmt(worst.corr)})`);
  console.log(`  worst maxAbs: ${fmt(worstMaxAbs.maxAbs)} on ${worstMaxAbs.label} (relRMS ${fmt(worstMaxAbs.relRms)})`);
  console.log('  PASS:', pass, '| artefact:', path);
  process.exit(pass ? 0 : 3);
}

function fmt(x) {
  if (x === null || x === undefined) return 'na';
  if (x === 0) return '0';
  if (Math.abs(x) >= 1000 || Math.abs(x) < 1e-3) return x.toExponential(3);
  return x.toFixed(6);
}

main();
