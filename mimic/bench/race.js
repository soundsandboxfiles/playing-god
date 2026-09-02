// bench/race.js — THE ALGORITHM RACE (owner brief, step 5).
//
// Runs all three contenders on every benchmark target under the SAME render
// budget (same population × generations, same seeds), records best-SSE-vs-renders
// curves, and reports which wins. "Decided by measurement, not argument."
//
// Run:  node bench/race.js [--population N] [--generations G] [--seeds a,b,c]
//                          [--workers W] [--out file.json] [--quick]
//
// Fairness: every algorithm renders population×(generations+1) genomes (init +
// `population` offspring per generation), so the render budget is identical. The
// silence-floor SSE (target energy) is reported per target — beating it means
// genuinely matching the sound rather than fading to quiet.

import { benchmarkSuite } from '../lib/targets.js';
import { runEvolution } from '../lib/run-core.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIMIC = join(__dirname, '..');

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const nxt = argv[i + 1];
    if (nxt === undefined || nxt.startsWith('--')) o[key] = true;
    else { o[key] = nxt; i++; }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const quick = !!args.quick;
  const population = Number(args.population) || (quick ? 40 : 120);
  const generations = Number(args.generations) || (quick ? 20 : 60);
  const workers = Number(args.workers) || 8;
  const seeds = (args.seeds ? String(args.seeds).split(',').map(Number) : (quick ? [1] : [1, 2, 3]));
  const algorithms = ['ga', 'island', 'mapelites'];
  const outFile = args.out ? String(args.out) : join(MIMIC, 'output', 'race-results.json');

  const suite = benchmarkSuite({ recoverLengthS: 2.0 });
  console.log(`RACE — population ${population} × generations ${generations}, seeds [${seeds}], ${workers} workers`);
  console.log(`Targets: ${suite.map((t) => t.name).join(', ')}\n`);

  const report = { params: { population, generations, workers, seeds }, targets: {} };

  for (const target of suite) {
    const samples = target.make();
    let silenceFloor = 0; for (const x of samples) silenceFloor += x * x;
    const tRec = { kind: target.kind, lengthS: target.lengthS, silenceFloorSSE: silenceFloor, algorithms: {} };
    console.log(`── ${target.name}  (${target.kind}, silence-floor SSE ${silenceFloor.toExponential(3)}) ──`);

    for (const algo of algorithms) {
      const runs = [];
      for (const seed of seeds) {
        const res = await runEvolution({
          target: samples, totalLengthS: target.lengthS, windowStartS: 0, sampleRate: 22050,
          algorithm: algo, population, generations, seed, workers,
          crossoverRate: 0.5, mutationScale: 1,
        });
        // compact curve: [ [renders, bestSSE], ... ]
        const curve = res.curve.map((c) => [c.renders, c.bestSSE]);
        runs.push({ seed, finalSSE: res.best.sse, foundAt: res.best.foundAtGeneration,
          belowFloor: res.best.sse < silenceFloor, curve, wallMs: res.meta.wallMs });
      }
      const finals = runs.map((r) => r.finalSSE);
      const best = Math.min(...finals);
      const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
      const escapes = runs.filter((r) => r.belowFloor).length;
      const meanWall = runs.reduce((a, r) => a + r.wallMs, 0) / runs.length;
      tRec.algorithms[algo] = { best, mean, escapes, seeds: seeds.length, meanWallMs: meanWall, runs };
      console.log(`   ${algo.padEnd(10)} bestSSE ${best.toExponential(3)}  meanSSE ${mean.toExponential(3)}  ` +
        `escapes ${escapes}/${seeds.length}  (${(meanWall / 1000).toFixed(1)}s/run)`);
    }
    report.targets[target.name] = tRec;
    console.log('');
  }

  // ── overall scoreboard: rank algorithms per target by best final SSE ──
  const wins = { ga: 0, island: 0, mapelites: 0 };
  const escapeTotals = { ga: 0, island: 0, mapelites: 0 };
  for (const [, tRec] of Object.entries(report.targets)) {
    let winner = null, winVal = Infinity;
    for (const algo of algorithms) {
      const a = tRec.algorithms[algo];
      escapeTotals[algo] += a.escapes;
      if (a.best < winVal) { winVal = a.best; winner = algo; }
    }
    if (winner) wins[winner]++;
  }
  report.scoreboard = { wins, escapeTotals };

  console.log('══ SCOREBOARD ══');
  console.log('per-target wins (lowest final SSE):', JSON.stringify(wins));
  console.log('total escapes below silence floor: ', JSON.stringify(escapeTotals));
  const ranked = algorithms.slice().sort((a, b) =>
    (wins[b] - wins[a]) || (escapeTotals[b] - escapeTotals[a]));
  report.recommendation = ranked[0];
  console.log('→ recommended default:', ranked[0]);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(report, null, 1));
  console.log('\nWrote', outFile);
}

main().catch((e) => { console.error('race error:', e.stack || e.message); process.exit(1); });
