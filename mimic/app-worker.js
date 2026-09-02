// app-worker.js — the in-browser evaluation worker (Web Worker, module type).
//
// Browser counterpart of lib/eval-worker.js. Same shared kernel (score-core.js),
// so the app scores genomes byte-for-byte the same as the CLI. Loaded by
// lib/browser-pool.js as  new Worker('./app-worker.js', { type: 'module' }).
//
// Protocol:
//   { type:'init', plan }                     → configure the scorer (once)
//   { type:'eval', start, count, buffer }     → score a packed batch
//   → { type:'result', start, sse, dev?, harm? }

import { makeScorer, GENOME_SIZE } from './lib/score-core.js';

let scoreOne = null;
let withDescriptors = false;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    withDescriptors = !!msg.withDescriptors;
    scoreOne = makeScorer(msg.plan, { withDescriptors, metric: msg.metric || 'sse' });
    self.postMessage({ type: 'ready' });
    return;
  }
  if (msg.type === 'eval') {
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
    self.postMessage(out, transfer);
  }
};
