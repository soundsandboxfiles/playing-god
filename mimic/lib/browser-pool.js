// browser-pool.js — a Web Worker pool implementing the evaluator interface, for
// app.html. Mirrors lib/workers.js (the node pool) with the same
// evaluate(genomes)->results[] contract, so the algorithm classes drive it
// unchanged. Importing this module in node is harmless (Worker is only touched at
// runtime inside makeBrowserPool); calling it requires a browser.
//
// The dispatch/packing logic is identical to the node pool and is covered by the
// node pool's tests; only the Worker transport differs.

import { similarityOf } from './fitness.js';
import { GENOME_SIZE } from './score-core.js';

// plan: score plan (with target Float32Array). opts.workerUrl points at
// app-worker.js. Returns { evaluate, close, kind, nWorkers }.
export function makeBrowserPool(plan, { withDescriptors = false, nWorkers = 4, metric = 'sse', workerUrl = './app-worker.js', maxChunk = 32 } = {}) {
  const workers = [];
  const ready = [];
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(workerUrl, { type: 'module' });
    workers.push(w);
    ready.push(new Promise((res) => {
      const onReady = (e) => { if (e.data && e.data.type === 'ready') { w.removeEventListener('message', onReady); res(); } };
      w.addEventListener('message', onReady);
    }));
    // Each worker gets its own COPY of the plan (structuredClone; target not
    // transferred so it can be cloned to every worker).
    w.postMessage({ type: 'init', plan, withDescriptors, metric });
  }

  let state = null;
  function assign(worker) {
    if (!state || state.next >= state.genomes.length) return false;
    const start = state.next;
    const end = Math.min(state.genomes.length, start + state.chunkSize);
    state.next = end;
    const count = end - start;
    const buf = new Float32Array(count * GENOME_SIZE);
    for (let i = 0; i < count; i++) buf.set(state.genomes[start + i].data, i * GENOME_SIZE);
    worker.postMessage({ type: 'eval', start, count, buffer: buf.buffer }, [buf.buffer]);
    return true;
  }

  for (const worker of workers) {
    worker.addEventListener('message', (e) => {
      const msg = e.data;
      if (!msg || msg.type !== 'result' || !state) return;
      const { start, sse, dev, harm } = msg;
      const count = sse.length;
      for (let i = 0; i < count; i++) {
        state.results[start + i] = {
          sse: sse[i], similarity: similarityOf(sse[i]),
          dev: dev ? (Number.isFinite(dev[i]) ? dev[i] : null) : null,
          harm: harm ? (Number.isFinite(harm[i]) ? harm[i] : null) : null,
          renderError: sse[i] === Infinity ? 'render-failed-or-infinite' : null,
        };
      }
      state.completed += count;
      if (state.completed >= state.genomes.length) { const d = state; state = null; d.resolve(d.results); return; }
      assign(worker);
    });
  }

  const allReady = Promise.all(ready);

  return {
    kind: 'browser-pool',
    withDescriptors,
    metric,
    plan,
    nWorkers,
    async evaluate(genomes) {
      if (genomes.length === 0) return [];
      await allReady;
      const chunkSize = Math.max(1, Math.min(maxChunk, Math.ceil(genomes.length / (nWorkers * 4))));
      return new Promise((resolve) => {
        state = { genomes, results: new Array(genomes.length), next: 0, completed: 0, chunkSize, resolve };
        for (const worker of workers) if (!assign(worker)) break;
      });
    },
    async close() { for (const w of workers) w.terminate(); },
  };
}
