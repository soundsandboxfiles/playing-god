// pool.js — parallel refinement via independent multi-start (BRIEF-2 §4b.8).
//
// The scheduler's dominant move (coordinate descent) is inherently sequential — each
// gene step is accepted/rejected against the SSE the previous step produced — so
// wall-clock speedup of ONE descent from more cores is limited. The trivially
// parallel win the brief points at ("CMA-ES populations parallelise trivially") is
// realised here as INDEPENDENT MULTI-START: run `workers` complete construct+schedule
// pipelines at once, each with a different seed (so their stochastic stages —
// CMA-ES, reallocation order — diverge), share the same wall-clock budget, and keep
// the single best genome. This converts cores → a better answer in the same time,
// and every worker is a fully self-verified run (no shared-memory hazards).
//
// Each worker is a separate `node run.js` child (clean memory isolation — important:
// 64-wave enveloped renders are allocation-heavy and several in one heap risks OOM).
// The parent picks the lowest-SSE child by its meta.json and copies it into the main
// run dir, then the normal verify step re-proves it.

import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_JS = join(__dirname, '..', 'run.js');

// Run `n` child pipelines in parallel and return the best child's run dir.
//   cfgPath   — the --config file the parent was given (children reuse it)
//   baseArgs  — extra CLI args to pass every child (e.g. --target, --maxMinutes)
//   runName   — the parent run name; children get runName__wK
//   n         — worker count (already capped by the caller for compute courtesy)
export function runMultiStart(cfgPath, baseArgs, runName, n, { onLog = null, seed = 1 } = {}) {
  const log = onLog || (() => {});
  const outDir = join(__dirname, '..', 'output');
  const children = [];
  for (let i = 0; i < n; i++) {
    const childRun = `${runName}__w${i}`;
    const args = [RUN_JS];
    if (cfgPath) args.push('--config', cfgPath);
    for (const a of baseArgs) args.push(a);
    args.push('--workers', '1', '--seed', String(seed + i), '--run', childRun, '--quiet', 'true');
    log(`  worker ${i}: seed ${seed + i} → output/${childRun}/`);
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ARTISAN_CHILD: '1' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    children.push({ i, childRun, child, dir: join(outDir, childRun) });
  }

  return new Promise((resolve) => {
    let done = 0;
    for (const c of children) {
      c.child.on('exit', (code) => {
        c.code = code;
        done++;
        if (done === children.length) resolve(pickBest(children, log, outDir, runName));
      });
    }
  });
}

function readSSE(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).reportedSSE; }
  catch (e) { return Infinity; }
}

function pickBest(children, log, outDir, runName) {
  let best = null;
  for (const c of children) {
    const sse = readSSE(c.dir);
    log(`  worker ${c.i} (${c.childRun}): SSE ${Number.isFinite(sse) ? sse.toExponential(4) : 'FAILED'}`);
    if (best === null || sse < best.sse) best = { ...c, sse };
  }
  if (!best || !Number.isFinite(best.sse)) return null;
  // copy the winning child's files into the parent run dir
  const parentDir = join(outDir, runName);
  mkdirSync(parentDir, { recursive: true });
  copyTree(best.dir, parentDir);
  log(`  best worker: ${best.childRun} (SSE ${best.sse.toExponential(4)}) → output/${runName}/`);
  return { bestDir: parentDir, bestSSE: best.sse, bestChild: best.childRun, all: children.map((c) => ({ run: c.childRun, sse: readSSE(c.dir) })) };
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, name.name), d = join(dst, name.name);
    if (name.isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}
