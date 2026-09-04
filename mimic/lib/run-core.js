// run-core.js — the evolution loop, reusable and IO-free.
//
// runEvolution() wires target → plan → evaluator → algorithm and drives the
// generations, recording the fitness curve and a snapshot of the best genome at
// every saved generation (so the deliverable can render "hear the convergence"
// WAVs). It does no file IO — run.js does that — which keeps this callable from
// tests, the showcase harness, and the race benchmark.

import { RNG } from '../../src/rng.js';
import { makeScorePlan } from './fitness.js';
import { makeSerialEvaluator } from './evaluator.js';
import { makeWorkerPool } from './workers.js';
import { makeAlgorithm, needsDescriptors } from './algorithms/index.js';

// Choose how often to snapshot a generation so a run yields ~targetFiles WAVs.
export function chooseSaveEvery(generations, targetFiles = 60) {
  if (generations <= targetFiles) return 1;
  return Math.max(1, Math.round(generations / targetFiles));
}

// opts: {
//   target: Float32Array, totalLengthS, windowStartS, sampleRate,
//   algorithm, population, generations, elitism, mutationScale, crossoverRate,
//   seed, workers, saveEvery, algoConfig (extra: islands, migrationInterval,...),
//   onGeneration(stats) callback (optional)
// }
export async function runEvolution(opts) {
  const {
    target, totalLengthS, windowStartS = 0, sampleRate = 22050,
    algorithm = 'ga', population = 300, generations = 200,
    elitism = 2, mutationScale = 1, crossoverRate = 0.5,
    seed = 1, workers = 8, onGeneration = null, onSaved = null, algoConfig = {}, metric = 'sse',
    maxWallMs = Infinity, seedGenomes = [],
  } = opts;

  const plan = makeScorePlan({ target, totalLengthS, windowStartS, sampleRate });
  const saveEvery = opts.saveEvery || chooseSaveEvery(generations);
  const withDesc = needsDescriptors(algorithm);

  const evaluator = (workers && workers > 1)
    ? makeWorkerPool(plan, { withDescriptors: withDesc, nWorkers: workers, metric })
    : makeSerialEvaluator(plan, { withDescriptors: withDesc, metric });

  const rng = new RNG(seed >>> 0);
  const config = {
    population, elitism, mutationScale, crossoverRate, seedGenomes,
    ...algoConfig,
  };
  const alg = makeAlgorithm(algorithm, { config, plan, rng, evaluate: evaluator.evaluate });

  const curve = [];         // per-generation stats
  const savedGens = [];     // [{ generation, data, sse, similarity }]
  const wallStart = process.hrtime.bigint();

  const snapshot = (stats) => {
    curve.push({ ...stats, wallMs: Number(process.hrtime.bigint() - wallStart) / 1e6 });
    if (onGeneration) onGeneration(stats, curve[curve.length - 1]);
  };
  const saveIfDue = (gen) => {
    if (gen === 0 || gen === generations || gen % saveEvery === 0) {
      const entry = {
        generation: gen,
        data: Float32Array.from(alg.best.data),
        sse: alg.best.sse,
        similarity: alg.best.similarity,
        foundAtGeneration: alg.best.generation,
        island: alg.best.island,     // which island bred it (island algorithm only)
      };
      savedGens.push(entry);
      // Stream the snapshot out immediately so a crash mid-run keeps a playable
      // partial deliverable (the previous run lost 8 h of work by only writing at
      // the end). ctx gives the streaming writer the metadata it needs.
      if (onSaved) onSaved(entry, { plan, meta: liveMeta(gen) });
    }
  };

  const liveMeta = (gen) => ({
    algorithm, population, generations, elitism, mutationScale, crossoverRate,
    windowStartS, totalLengthS: plan.totalLengthS, sampleRate, seed, workers,
    saveEvery, metric, currentGeneration: gen,
  });

  const forceSave = (gen) => {
    const entry = {
      generation: gen, data: Float32Array.from(alg.best.data),
      sse: alg.best.sse, similarity: alg.best.similarity, foundAtGeneration: alg.best.generation,
      island: alg.best.island,
    };
    savedGens.push(entry);
    if (onSaved) onSaved(entry, { plan, meta: liveMeta(gen) });
  };

  let stoppedEarly = false;
  let generationsReached = 0;
  const s0 = await alg.init();
  snapshot(s0);
  saveIfDue(0);

  for (let g = 1; g <= generations; g++) {
    const s = await alg.step();
    snapshot(s);
    saveIfDue(g);
    generationsReached = g;
    if (Number(process.hrtime.bigint() - wallStart) / 1e6 > maxWallMs) {
      stoppedEarly = true;
      // Force-save the final generation reached (may not be on the saveEvery grid).
      if (savedGens[savedGens.length - 1].generation !== g) forceSave(g);
      break;
    }
  }

  await evaluator.close();

  return {
    plan,
    curve,
    savedGens,
    best: { data: Float32Array.from(alg.best.data), sse: alg.best.sse, similarity: alg.best.similarity, foundAtGeneration: alg.best.generation, island: alg.best.island },
    meta: {
      algorithm, population, generations, elitism, mutationScale, crossoverRate,
      windowStartS, totalLengthS: plan.totalLengthS, requestedTotalLengthS: plan.requestedTotalLengthS,
      extendedToFitWindow: plan.extendedToFitWindow, sampleRate, seed, workers,
      saveEvery, evaluatorKind: evaluator.kind, withDescriptors: withDesc, metric,
      totalRenders: alg.renders,
      wallMs: Number(process.hrtime.bigint() - wallStart) / 1e6,
      stoppedEarly, generationsReached, requestedGenerations: generations,
    },
  };
}
