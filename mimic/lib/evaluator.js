// evaluator.js — the scoring path shared by all three algorithms.
//
// An "evaluator" is an async function  evaluate(genomes) -> results[]  where each
// result is { sse, similarity, dev, harm, renderError, activeWaves }. Making it
// async and genome-list-shaped is what lets the SAME algorithm code run over a
// serial evaluator (this file) or a worker-thread pool (workers.js) with no
// change — parallelism is orthogonal to the search (owner brief, step 6).
//
// `dev`/`harm` (the §7 descriptor axes) are computed only when the evaluator is
// built withDescriptors:true — MAP-Elites needs them for its behaviour space; GA
// and Island do not, so they pay only the render + SSE.

import { renderRaw } from './render-raw.js';
import { similarityOf, METRICS } from './fitness.js';
import { computeDescriptors } from '../../src/descriptors.js';

// Score ONE genome against the plan. Pure, synchronous, dependency of every
// evaluator (serial here; re-implemented identically inside the worker).
// `metric` names the loss the algorithms minimise; default 'sse' is the owner's
// spec. Non-default metrics are off-by-default diagnostics (see docs/FITNESS.md);
// for them the returned `sse`/`similarity` fields carry the generic loss / 1÷loss.
export function evaluateGenome(genome, plan, withDescriptors = false, metric = 'sse') {
  const lossFn = (METRICS[metric] || METRICS.sse).loss;
  const r = renderRaw(genome, { lengthS: plan.totalLengthS, sampleRate: plan.sampleRate });
  if (r.renderError) {
    return { sse: Infinity, similarity: 0, dev: null, harm: null,
      renderError: r.renderError, activeWaves: r.activeWaves };
  }
  const sse = lossFn(r.samples, plan);
  let dev = null, harm = null;
  if (withDescriptors) {
    // Descriptors of the SCORED WINDOW only, so the behaviour axis describes the
    // part of the sound being matched (not the free tails).
    const win = r.samples.subarray(plan.startSample, plan.startSample + plan.winLen);
    const d = computeDescriptors(win, plan.sampleRate);
    dev = d.development_raw;
    harm = d.harmonicity_raw;
  }
  return { sse, similarity: similarityOf(sse), dev, harm, renderError: null, activeWaves: r.activeWaves };
}

// A serial (single-core) evaluator. `plan` is the score plan; `withDescriptors`
// is set by the algorithm that needs behaviour axes.
export function makeSerialEvaluator(plan, { withDescriptors = false, metric = 'sse' } = {}) {
  return {
    kind: 'serial',
    withDescriptors,
    metric,
    plan,
    nWorkers: 1,
    async evaluate(genomes) {
      const out = new Array(genomes.length);
      for (let i = 0; i < genomes.length; i++) out[i] = evaluateGenome(genomes[i], plan, withDescriptors, metric);
      return out;
    },
    async close() {},
  };
}
