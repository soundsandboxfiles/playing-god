#!/usr/bin/env node
// gene-convergence.mjs — birth-aligned gene-convergence analysis for a MIMIC run.
//
// Usage:  node mimic/tools/gene-convergence.mjs <run-dir> [--min-active N]
//
// Reads every gen-*.pg2.txt saved genome in <run-dir>, and for each continuous
// gene that is (a) expressed in the final creature, (b) active for a final
// on-stretch >= MIN_ACTIVE saves, and (c) actually moved (displacement above an
// absolute floor AND above its own step-noise), computes the normalized
// trajectory: shifted so the final value = 0, scaled so the start = +1 (the
// sign-flip Jon specified is automatic in (v-e)/(s-e)).
//
// It re-bases each gene to its OWN activation time (the event-study / peri-event
// alignment — see CONTEXT/personal/independent-derivations.md, 2026-09-04) so
// founding and late-onset genes share an origin, then writes:
//   <run-dir>/gene-convergence-data.json   the aggregates + sampled traces
//   <run-dir>/gene-convergence.html        self-contained report (template filled)
//
// First established on speechsignalprocessing-island-p600g9999999-s903
// (2026-09-04). See mimic/docs/FINDINGS.md for what it showed.
//
// Engine read-only: imports ../lib and ../../src, writes only into <run-dir>.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));           // mimic/tools
const { decodeGenomeString } = await import(join(HERE, '../lib/genome-string.js'));
const G = await import(join(HERE, '../../src/genome.js'));
const { WAVE_SCHEMA, GLOBAL_SCHEMA, WAVE_INDEX, GENES_PER_WAVE, WAVE_SLOTS } = G;
const GLOBAL_BASE = WAVE_SLOTS * GENES_PER_WAVE;

const RUN = resolve(process.argv[2] || '');
if (!RUN || !existsSync(RUN)) {
  console.error('Usage: node mimic/tools/gene-convergence.mjs <run-dir> [--min-active N]');
  process.exit(1);
}
const mi = process.argv.indexOf('--min-active');
const MIN_ACTIVE = mi > -1 ? +process.argv[mi + 1] : 4;        // generous: >= 4 saves (~75 gens+)

const files = readdirSync(RUN).filter(f => /^gen-\d+\.pg2\.txt$/.test(f))
  .map(f => ({ f, g: +f.match(/\d+/)[0] })).sort((a, b) => a.g - b.g);
if (files.length < 6) { console.error(`Only ${files.length} saved genomes in ${RUN}; need more for a convergence curve.`); process.exit(1); }
const gens = files.map(x => x.g);
const D = files.map(x => decodeGenomeString(readFileSync(join(RUN, x.f), 'utf8').trim()).data);
const T = D.length;

const steps = [];
for (let t = 1; t < T; t++) { let s = 0; for (let i = 0; i < D[t].length; i++) { const d = D[t][i] - D[t - 1][i]; s += d * d; } steps.push([gens[t], Math.sqrt(s)]); }
const stepMed = [...steps.map(s => s[1])].sort((a, b) => a - b)[steps.length >> 1];
const crown = steps.filter(s => s[1] > stepMed * 1.6).map(s => s[0]);

const ACT = WAVE_INDEX['active'];
const roleOf = (n) => {
  if (/^amp_node\d+_level$/.test(n)) return 'env levels';
  if (/^amp_node\d+_time$/.test(n)) return 'env times';
  if (/^(amp|pitch)_node\d+_(curve|tension)$/.test(n)) return 'env shape';
  if (/^pitch_node\d+_level$/.test(n)) return 'pitch nodes';
  if (/^pitch_node\d+_time$/.test(n)) return 'env times';
  if (/period|duty|phase|pre_prop|pitch_master/.test(n)) return 'pitch/period';
  if (/gain/.test(n)) return 'gain';
  if (/depth/.test(n)) return 'mod depth';
  return 'other';
};
const contWave = WAVE_SCHEMA.map((d, i) => ({ d, i })).filter(x => x.d.kind === 'cont');
const contGlob = GLOBAL_SCHEMA.map((d, i) => ({ d, i })).filter(x => x.d.kind === 'cont');

function normWindow(traj, a, b) {
  const len = b - a + 1, aN = Math.max(1, Math.min(3, len >> 1));
  const mean = idx => idx.reduce((s, k) => s + traj[k], 0) / idx.length;
  const si = [], ei = []; for (let k = 0; k < aN; k++) { si.push(a + k); ei.push(b - k); }
  const s = mean(si), e = mean(ei);
  let sa = []; for (let t = a + 1; t <= b; t++) sa.push(Math.abs(traj[t] - traj[t - 1])); sa.sort((x, y) => x - y);
  const wig = sa[sa.length >> 1] || 0, disp = Math.abs(s - e);
  if (disp < 0.06 || disp < 3 * wig + 1e-9) return null;
  const out = []; for (let t = a; t <= b; t++) out.push((traj[t] - e) / (s - e));
  return out;
}
function finalRun(w) { if (D[T - 1][w * GENES_PER_WAVE + ACT] < 0.5) return -1; let a = T - 1; while (a - 1 >= 0 && D[a - 1][w * GENES_PER_WAVE + ACT] >= 0.5) a--; return a; }

const genesArr = [];
for (const { d, i } of contWave) for (let w = 0; w < WAVE_SLOTS; w++) {
  const a = finalRun(w); if (a < 0 || T - a < MIN_ACTIVE) continue;
  const traj = D.map(g => g[w * GENES_PER_WAVE + i]); const nv = normWindow(traj, a, T - 1); if (!nv) continue;
  genesArr.push({ role: roleOf(d.name), s: a, v: nv });
}
for (const { d, i } of contGlob) { const traj = D.map(g => g[GLOBAL_BASE + i]); const nv = normWindow(traj, 0, T - 1); if (nv) genesArr.push({ role: roleOf(d.name), s: 0, v: nv }); }
const N = genesArr.length;
if (!N) { console.error('No qualifying genes (run may be too short or nothing moved yet).'); process.exit(1); }

const maxLen = Math.max(...genesArr.map(q => q.v.length));
const birth = { off: [], median: [], q25: [], q75: [], mean: [], count: [] };
for (let k = 0; k < maxLen; k++) {
  const c = []; for (const q of genesArr) if (k < q.v.length) c.push(q.v[k]);
  if (c.length < 20) break; c.sort((a, b) => a - b);
  birth.off.push(k * 25); birth.count.push(c.length);
  birth.median.push(+c[c.length >> 1].toFixed(4)); birth.q25.push(+c[Math.floor(c.length * 0.25)].toFixed(4)); birth.q75.push(+c[Math.floor(c.length * 0.75)].toFixed(4));
  birth.mean.push(+(c.reduce((s, x) => s + x, 0) / c.length).toFixed(4));
}
const abs = { median: [], q25: [], q75: [], mean: [], live: [] };
for (let t = 0; t < T; t++) {
  const c = []; for (const q of genesArr) if (t >= q.s && t < q.s + q.v.length) c.push(q.v[t - q.s]);
  abs.live.push(c.length); c.sort((a, b) => a - b);
  abs.median.push(c.length ? +c[c.length >> 1].toFixed(4) : null); abs.q25.push(c.length ? +c[Math.floor(c.length * 0.25)].toFixed(4) : null);
  abs.q75.push(c.length ? +c[Math.floor(c.length * 0.75)].toFixed(4) : null); abs.mean.push(c.length ? +(c.reduce((s, x) => s + x, 0) / c.length).toFixed(4) : null);
}
const SAMP = Math.min(260, N), idx = []; for (let k = 0; k < SAMP; k++) idx.push(Math.floor(k * N / SAMP));
const sampleBirth = idx.map(j => genesArr[j].v.map(v => Math.round(v * 1000) / 1000));
const sampleAbs = idx.map(j => ({ s: genesArr[j].s, v: genesArr[j].v.map(v => Math.round(v * 1000) / 1000) }));
let hk = birth.off.length - 1; for (let k = 0; k < birth.mean.length; k++) if (birth.mean[k] <= 0.5) { hk = k; break; }
const tau = Math.max(1, birth.off[hk]) / Math.log(2);
const roles = {}; for (const q of genesArr) (roles[q.role] = roles[q.role] || []).push(q);
const roleMed = {};
for (const [r, arr] of Object.entries(roles)) { const m = []; for (let k = 0; k < birth.off.length; k++) { const c = []; for (const q of arr) if (k < q.v.length) c.push(q.v[k]); c.sort((a, b) => a - b); m.push(c.length ? +c[c.length >> 1].toFixed(4) : null); } roleMed[r] = { n: arr.length, med: m }; }
const onsetGens = [...new Set(genesArr.map(q => gens[q.s]))].sort((a, b) => a - b);
const wl = genesArr.map(q => q.v.length).sort((a, b) => a - b);

const out = {
  run: RUN.split('/').pop(), gens, N, crown, minActive: MIN_ACTIVE, tau,
  birth, abs, roleMed, sampleBirth, sampleAbs,
  onset: { count: onsetGens.length, early: genesArr.filter(q => gens[q.s] <= 200).length, mid: genesArr.filter(q => gens[q.s] > 200 && gens[q.s] <= 1000).length, late: genesArr.filter(q => gens[q.s] > 1000).length },
  winLens: { min: wl[0], med: wl[wl.length >> 1], max: wl[wl.length - 1] },
};
writeFileSync(join(RUN, 'gene-convergence-data.json'), JSON.stringify(out));

// fill the self-contained HTML template
const tpl = readFileSync(join(HERE, 'gene-convergence.template.html'), 'utf8');
writeFileSync(join(RUN, 'gene-convergence.html'), tpl.replace('__DATA__', JSON.stringify(out)));

console.log(`${out.run}: ${N} genes | onset early ${out.onset.early}/mid ${out.onset.mid}/late ${out.onset.late} | tau≈${Math.round(tau)} gens | half at gen+${birth.off[birth.median.findIndex(v => v <= 0.5)] ?? '—'}`);
console.log(`wrote ${join(RUN, 'gene-convergence-data.json')} and gene-convergence.html`);
