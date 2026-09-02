// score-core.js — the render-and-score kernel shared by BOTH worker backends.
//
// The node worker (eval-worker.js, worker_threads) and the browser worker
// (app-worker.js, Web Worker) live in different module environments, but they must
// compute byte-for-byte the same SSE — otherwise the app and the CLI would
// disagree about fitness. So the actual work lives here, imported by both, and is
// node-testable (test/all.js proves the node worker == the serial path, and the
// serial path uses the same METRICS loss).

import { render } from '../../src/synthesis.js';
import { Genome, GENOME_SIZE } from '../../src/genome.js';
import { computeDescriptors } from '../../src/descriptors.js';
import { METRICS } from './fitness.js';

export { GENOME_SIZE };

// Build a scorer bound to a plan. `plan` = { sampleRate, totalLengthS, startSample,
// winLen, target(Float32Array) }. Returns scoreOne(packed, offset) -> {sse,dev,harm},
// where `packed` is a Float32Array holding one or more genomes' genes and `offset`
// is the start index of the genome to score.
export function makeScorer(plan, { withDescriptors = false, metric = 'sse' } = {}) {
  const lossFn = (METRICS[metric] || METRICS.sse).loss;
  const scratch = new Genome();               // reused; only .data feeds render
  return function scoreOne(packed, offset) {
    for (let k = 0; k < GENOME_SIZE; k++) scratch.data[k] = packed[offset + k];
    const r = render(scratch, { sampleRate: plan.sampleRate, lengthS: plan.totalLengthS });
    if (r.renderError) return { sse: Infinity, dev: NaN, harm: NaN };
    const sse = lossFn(r.samples, plan);
    let dev = NaN, harm = NaN;
    if (withDescriptors) {
      const win = r.samples.subarray(plan.startSample, plan.startSample + plan.winLen);
      const dd = computeDescriptors(win, plan.sampleRate);
      dev = dd.development_raw;
      harm = dd.harmonicity_raw;
    }
    return { sse, dev, harm };
  };
}
