// test/all.js — MIMIC self-tests. Plain node, no framework. Run: node test/all.js
//
// Covers the DOM-free contracts (owner brief asks the app's DOM-free parts be
// node-tested; these lib tests cover the shared core the app also uses).

import { RNG } from '../../src/rng.js';
import { randomGenome } from '../../src/priors.js';
import { decodeWav, resampleLinear, mixToMono } from '../lib/wavio.js';
import { encodeGenomeString, decodeGenomeString } from '../lib/genome-string.js';
import { benchmarkSuite } from '../lib/targets.js';
import { makeScorePlan, sseWindowed, similarityOf, evaluate as fitEval } from '../lib/fitness.js';
import { makeSerialEvaluator } from '../lib/evaluator.js';
import { makeWorkerPool } from '../lib/workers.js';
import { makeAlgorithm, needsDescriptors } from '../lib/algorithms/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIMIC = join(__dirname, '..');

let passed = 0, failed = 0;
function ok(cond, name) { if (cond) { passed++; console.log('  ok  ' + name); } else { failed++; console.log('FAIL  ' + name); } }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }

async function main() {
  // ── genome string round-trip ──
  {
    const g = randomGenome(new RNG(42), { nActive: 5 });
    const s = encodeGenomeString(g);
    const g2 = decodeGenomeString(s);
    let maxdiff = 0; for (let i = 0; i < g.data.length; i++) maxdiff = Math.max(maxdiff, Math.abs(g.data[i] - g2.data[i]));
    ok(maxdiff === 0, 'genome-string round-trip is bit-exact');
    ok(g.hash() === g2.hash(), 'genome-string round-trip preserves hash');
    let threw = false; try { decodeGenomeString('PG3:AAAA'); } catch { threw = true; }
    ok(threw, 'genome-string rejects wrong version tag');
    threw = false; try { decodeGenomeString('PG2:AAAA'); } catch { threw = true; }
    ok(threw, 'genome-string rejects wrong byte count');
  }

  // ── wav resampler / mixer ──
  {
    const mono = new Float32Array([0, 1, 0, -1]);
    const up = resampleLinear(mono, 4, 8);
    ok(up.length === 8, 'resampleLinear doubles length on 2x');
    const stereo = mixToMono([new Float32Array([1, 1]), new Float32Array([-1, 1])]);
    ok(stereo[0] === 0 && stereo[1] === 1, 'mixToMono averages channels');
    const t = decodeWav(readFileSync(join(MIMIC, 'targets', 'westminster-chimes.wav')));
    ok(t.sampleRate === 22050 && t.sourceChannels === 1 && t.sourceBits === 16, 'target WAV decodes (22050 mono 16-bit)');
    ok(Math.abs(t.durationS - 9.5) < 0.01, 'target WAV duration ~9.5s');
  }

  // ── fitness: owner spec ──
  {
    const target = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    const plan = makeScorePlan({ target, totalLengthS: target.length / 22050, windowStartS: 0 });
    // identical -> SSE 0 -> PERFECT
    ok(sseWindowed(target, plan) === 0, 'SSE of identical is 0');
    ok(similarityOf(0) === Number.MAX_VALUE, 'similarity guards SSE=0');
    // quieter-but-identical is penalised (owner intent)
    const half = Float32Array.from(target, (x) => x * 0.5);
    ok(sseWindowed(half, plan) > 0, 'quieter-but-identical is penalised (SSE>0)');
    // offset-but-identical is penalised
    const offset = new Float32Array([0, 0.5, -0.5, 0.25]);
    ok(sseWindowed(offset, plan) > 0, 'offset-but-identical is penalised (SSE>0)');
  }

  // ── recoverability: self-SSE must be 0 ──
  {
    const suite = benchmarkSuite();
    for (const tt of suite.filter((x) => x.solution)) {
      const plan = makeScorePlan({ target: tt.make(), totalLengthS: tt.lengthS });
      const r = fitEval(tt.solution, plan);
      ok(r.sse === 0, `recoverability self-SSE=0 for ${tt.name}`);
    }
  }

  // ── worker pool == serial ──
  {
    const tt = benchmarkSuite().find((x) => x.name === 'recover-6wave');
    const plan = makeScorePlan({ target: tt.make(), totalLengthS: tt.lengthS });
    const rng = new RNG(5);
    const genomes = Array.from({ length: 40 }, () => randomGenome(rng, { nActive: 4 }));
    const serial = makeSerialEvaluator(plan, { withDescriptors: true });
    const sres = await serial.evaluate(genomes);
    const pool = makeWorkerPool(plan, { withDescriptors: true, nWorkers: 4 });
    const pres = await pool.evaluate(genomes);
    let maxSSE = 0, maxDev = 0;
    for (let i = 0; i < genomes.length; i++) {
      maxSSE = Math.max(maxSSE, Math.abs(sres[i].sse - pres[i].sse));
      if (sres[i].dev != null && pres[i].dev != null) maxDev = Math.max(maxDev, Math.abs(sres[i].dev - pres[i].dev));
    }
    ok(maxSSE === 0, 'worker-pool SSE identical to serial');
    ok(maxDev < 1e-9, 'worker-pool descriptors identical to serial');
    await pool.close();
  }

  // ── score-core (the shared worker kernel) == serial evaluateGenome ──
  {
    const { makeScorer, GENOME_SIZE } = await import('../lib/score-core.js');
    const { evaluateGenome } = await import('../lib/evaluator.js');
    const tt = benchmarkSuite().find((x) => x.name === 'recover-6wave');
    const plan = makeScorePlan({ target: tt.make(), totalLengthS: tt.lengthS });
    const rng = new RNG(11);
    const genomes = Array.from({ length: 12 }, () => randomGenome(rng, { nActive: 4 }));
    const scoreOne = makeScorer(plan, { withDescriptors: true, metric: 'sse' });
    const packed = new Float32Array(genomes.length * GENOME_SIZE);
    genomes.forEach((g, i) => packed.set(g.data, i * GENOME_SIZE));
    let maxDiff = 0;
    for (let i = 0; i < genomes.length; i++) {
      const a = scoreOne(packed, i * GENOME_SIZE);
      const b = evaluateGenome(genomes[i], plan, true, 'sse');
      maxDiff = Math.max(maxDiff, Math.abs(a.sse - b.sse));
    }
    ok(maxDiff === 0, 'score-core scorer SSE == serial evaluateGenome (worker kernel is faithful)');
  }

  // ── the app's import surface all resolves in node (DOM-free breakage guard) ──
  {
    let allImported = true;
    try {
      await import('../lib/browser-pool.js');   // Worker only touched at call time
      await import('../lib/wavio.js');
      await import('../lib/fitness.js');
      await import('../lib/genome-string.js');
      await import('../lib/algorithms/index.js');
      await import('../lib/algorithms/common.js');
      await import('../lib/evaluator.js');
    } catch (e) { allImported = false; console.log('   import error: ' + e.message); }
    ok(allImported, 'app import surface resolves under node');
  }

  // ── each algorithm runs and never worsens its best ──
  {
    const tt = benchmarkSuite().find((x) => x.name === 'recover-2wave');
    const plan = makeScorePlan({ target: tt.make(), totalLengthS: tt.lengthS });
    for (const algo of ['ga', 'island', 'mapelites']) {
      const evaluator = makeSerialEvaluator(plan, { withDescriptors: needsDescriptors(algo) });
      const alg = makeAlgorithm(algo, { config: { population: 24, elitism: 2, crossoverRate: 0.5 }, plan, rng: new RNG(9), evaluate: evaluator.evaluate });
      await alg.init();
      let prev = alg.best.sse;
      let monotone = true;
      for (let g = 0; g < 4; g++) { await alg.step(); if (alg.best.sse > prev + 1e-12) monotone = false; prev = alg.best.sse; }
      ok(monotone, `${algo}: best-SSE is monotone non-increasing (elitism)`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
