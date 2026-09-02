// eval-worker.js — a worker_threads evaluation worker (node backend).
//
// Thin shell around score-core.js's shared kernel (that shared kernel is what
// guarantees the CLI and the browser app agree on fitness). Receives the plan once
// via workerData, then per batch a packed Float32Array of genome gene-arrays;
// returns the SSE (and optionally the §7 descriptor axes) per genome.

import { parentPort, workerData } from 'node:worker_threads';
import { makeScorer, GENOME_SIZE } from './score-core.js';

const plan = {
  sampleRate: workerData.sampleRate,
  totalLengthS: workerData.totalLengthS,
  N: workerData.N,
  startSample: workerData.startSample,
  winLen: workerData.winLen,
  target: workerData.target,               // Float32Array (structured-cloned in)
};
const withDescriptors = !!workerData.withDescriptors;
const scoreOne = makeScorer(plan, { withDescriptors, metric: workerData.metric });

parentPort.on('message', (msg) => {
  if (msg.type === 'close') { process.exit(0); return; }
  const packed = new Float32Array(msg.buffer);
  const count = msg.count;
  const sse = new Float64Array(count);
  const dev = withDescriptors ? new Float64Array(count) : null;
  const harm = withDescriptors ? new Float64Array(count) : null;
  for (let i = 0; i < count; i++) {
    const res = scoreOne(packed, i * GENOME_SIZE);
    sse[i] = res.sse;
    if (withDescriptors) { dev[i] = res.dev; harm[i] = res.harm; }
  }
  const transfer = [sse.buffer];
  const out = { type: 'result', start: msg.start, sse };
  if (withDescriptors) { out.dev = dev; out.harm = harm; transfer.push(dev.buffer, harm.buffer); }
  parentPort.postMessage(out, transfer);
});
