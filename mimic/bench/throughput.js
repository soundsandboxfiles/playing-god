// bench/throughput.js — render throughput (single-core then parallel) and the
// wall-time table for the owner's 8-core machine (owner brief, step 6).
//
// Run: node bench/throughput.js
// Writes: output/throughput.json + prints a human table.

import { RNG } from '../../src/rng.js';
import { randomGenome } from '../../src/priors.js';
import { decodeWav } from '../lib/wavio.js';
import { makeScorePlan } from '../lib/fitness.js';
import { makeSerialEvaluator } from '../lib/evaluator.js';
import { makeWorkerPool } from '../lib/workers.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIMIC = join(__dirname, '..');

function fixedGenomes(n, seed) {
  const rng = new RNG(seed);
  // A realistic mix of active-wave counts (cost scales with active waves).
  return Array.from({ length: n }, () => randomGenome(rng, {}));
}

async function timeEvaluate(evaluator, genomes) {
  const t0 = process.hrtime.bigint();
  await evaluator.evaluate(genomes);
  return Number(process.hrtime.bigint() - t0) / 1e6; // ms
}

async function main() {
  const nCores = cpus().length;
  console.log(`Machine: ${nCores} logical cores (owner's is 8).`);

  // The real target: the chimes (9.5 s). Also a 2 s length for the benchmark suite.
  const chimes = decodeWav(readFileSync(join(MIMIC, 'targets', 'westminster-chimes.wav')));
  const lengths = [
    { name: 'chimes-9.5s', target: chimes.samples, totalLengthS: chimes.durationS },
    { name: 'bench-2.0s', target: chimes.samples.subarray(0, Math.round(2.0 * 22050)), totalLengthS: 2.0 },
  ];

  const BATCH = 256;
  const report = { nCores, batch: BATCH, lengths: {} };

  for (const L of lengths) {
    const plan = makeScorePlan({ target: L.target, totalLengthS: L.totalLengthS, windowStartS: 0 });
    const genomes = fixedGenomes(BATCH, 20260902);

    // Single-core (serial), warm once then measure.
    const serial = makeSerialEvaluator(plan, {});
    await serial.evaluate(genomes.slice(0, 16)); // warm JIT
    const serialMs = await timeEvaluate(serial, genomes);
    const serialRps = BATCH / (serialMs / 1000);

    const rows = [{ workers: 1, ms: serialMs, rps: serialRps, speedup: 1 }];
    for (const w of [2, 4, 8].filter((x) => x <= Math.max(8, nCores))) {
      const pool = makeWorkerPool(plan, { withDescriptors: false, nWorkers: w });
      await pool.evaluate(genomes.slice(0, 16)); // warm workers
      const ms = await timeEvaluate(pool, genomes);
      await pool.close();
      rows.push({ workers: w, ms, rps: BATCH / (ms / 1000), speedup: serialMs / ms });
    }

    report.lengths[L.name] = { totalLengthS: L.totalLengthS, rows };

    console.log(`\n== ${L.name} (render length ${L.totalLengthS.toFixed(2)} s) — batch of ${BATCH} renders ==`);
    console.log('workers |   ms  | renders/sec | speedup');
    for (const r of rows) {
      console.log(
        String(r.workers).padStart(7) + ' | ' +
        r.ms.toFixed(0).padStart(5) + ' | ' +
        r.rps.toFixed(1).padStart(11) + ' | ' +
        r.speedup.toFixed(2) + '×');
    }
  }

  // Wall-time table for the chimes at 8 workers: (population × generations) -> minutes.
  const chimesReport = report.lengths['chimes-9.5s'];
  const best = chimesReport.rows[chimesReport.rows.length - 1]; // highest worker count measured
  const rps8 = best.rps;
  report.wallTimeTable = { basisWorkers: best.workers, rendersPerSec: rps8, cells: [] };

  console.log(`\n== WALL-TIME TABLE — chimes (9.5 s), ${best.workers} workers, ${rps8.toFixed(1)} renders/sec ==`);
  const pops = [100, 200, 300, 500];
  const gens = [50, 100, 200, 500, 1000];
  let header = 'pop \\ gen |';
  for (const g of gens) header += String(g).padStart(9);
  console.log(header);
  for (const p of pops) {
    let line = String(p).padStart(9) + ' |';
    for (const g of gens) {
      const renders = p * (g + 1); // +1 for gen-0 init
      const minutes = renders / rps8 / 60;
      report.wallTimeTable.cells.push({ population: p, generations: g, renders, minutes });
      line += (minutes.toFixed(1) + 'm').padStart(9);
    }
    console.log(line);
  }
  console.log('(minutes assume every genome is rendered every generation; ' +
    'the real search re-renders only offspring, so these are upper bounds.)');

  mkdirSync(join(MIMIC, 'output'), { recursive: true });
  writeFileSync(join(MIMIC, 'output', 'throughput.json'), JSON.stringify(report, null, 2));
  console.log('\nWrote output/throughput.json');
}

main();
