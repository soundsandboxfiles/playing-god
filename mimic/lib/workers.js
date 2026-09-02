// workers.js — a worker_threads pool implementing the evaluator interface.
//
// Same async  evaluate(genomes) -> results[]  contract as makeSerialEvaluator, so
// the algorithms do not know or care whether they run on one core or eight
// (owner brief, step 6). Genomes in a batch are independent, so evaluation is
// embarrassingly parallel. Chunks are dispatched DYNAMICALLY (each worker asks for
// more when it finishes) so the variable per-genome render cost — a 1-wave genome
// is far cheaper than a 40-wave one — load-balances itself.

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GENOME_SIZE } from '../../src/genome.js';
import { similarityOf } from './fitness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, 'eval-worker.js');

export function makeWorkerPool(plan, { withDescriptors = false, nWorkers = 4, maxChunk = 32, metric = 'sse' } = {}) {
  const workers = [];
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(WORKER_PATH, {
      workerData: {
        sampleRate: plan.sampleRate,
        totalLengthS: plan.totalLengthS,
        N: plan.N,
        startSample: plan.startSample,
        winLen: plan.winLen,
        target: plan.target,          // structured-cloned into the worker once
        withDescriptors,
        metric,
      },
    });
    w.on('error', (err) => { pool._onWorkerError(err); });
    workers.push(w);
  }

  // Single in-flight batch at a time (algorithms await each evaluate fully), so a
  // simple per-pool state machine suffices.
  let state = null; // { genomes, results, next, completed, resolve, reject }

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
    worker.on('message', (msg) => {
      if (msg.type !== 'result' || !state) return;
      const { start, sse, dev, harm } = msg;
      const count = sse.length;
      for (let i = 0; i < count; i++) {
        state.results[start + i] = {
          sse: sse[i],
          similarity: similarityOf(sse[i]),
          dev: dev ? (Number.isFinite(dev[i]) ? dev[i] : null) : null,
          harm: harm ? (Number.isFinite(harm[i]) ? harm[i] : null) : null,
          renderError: sse[i] === Infinity ? 'render-failed-or-infinite' : null,
        };
      }
      state.completed += count;
      if (state.completed >= state.genomes.length) {
        const done = state;
        state = null;
        done.resolve(done.results);
        return;
      }
      assign(worker); // keep this worker busy
    });
  }

  const pool = {
    kind: 'workers',
    withDescriptors,
    plan,
    nWorkers,
    _onWorkerError(err) { if (state) { const s = state; state = null; s.reject(err); } },
    async evaluate(genomes) {
      if (genomes.length === 0) return [];
      // Aim for ~4 chunks per worker for balance, capped by maxChunk.
      const chunkSize = Math.max(1, Math.min(maxChunk, Math.ceil(genomes.length / (nWorkers * 4))));
      return new Promise((resolve, reject) => {
        state = { genomes, results: new Array(genomes.length), next: 0, completed: 0, chunkSize, resolve, reject };
        // Prime every worker (dynamic dispatch refills as they finish).
        for (const worker of workers) if (!assign(worker)) break;
      });
    },
    async close() {
      await Promise.all(workers.map((w) => new Promise((res) => {
        w.once('exit', res);
        w.postMessage({ type: 'close' });
        // Fallback: terminate if it does not exit promptly.
        setTimeout(() => { w.terminate().finally(res); }, 500);
      })));
    },
  };
  return pool;
}
