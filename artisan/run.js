// run.js — ARTISAN's command line. Mirrors MIMIC's shape (BRIEF §12):
//   node run.js --config <file>  [--target …] [--offset …] [--max-waves …] …
//
// Written for a non-programmer (BRIEF §5): `node run.js --help` explains every
// option in plain English, and the run prints a plain-English summary and points
// at the one file that matters (genome.pg2.txt).

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, resolveConfig, OPTION_HELP, DEFAULTS } from './src/config.js';
import { runPipeline } from './src/pipeline.js';
import { runMultiStart } from './src/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function printHelp() {
  console.log(`
ARTISAN — make a Playing God genome that sounds like a target, as closely as possible.

  Give ARTISAN a sound (a .wav file, or one of the built-in test sounds) and it
  designs a genome whose render matches it sample-for-sample as well as it can.
  You get back a genome string you can paste into Playing God, the matching audio,
  and a plain-English report.

USAGE
  node run.js --config configs/quick-demo.json      # a fast demo (minutes)
  node run.js --target /path/to/your-sound.wav      # match your own sound
  node run.js --target recover-2wave                # a built-in test target
  node run.js --help

OPTIONS  (every one is optional; flags override the --config file)
${Object.entries(OPTION_HELP).map(([k, v]) => `  --${k}${pad(k)}${v}`).join('\n')}

  --config <file>   Load settings from a JSON file first (then flags override it).

WHAT YOU GET  (in output/<run>/)
  genome.pg2.txt      ← THE PRIZE: the genome as text. Paste it into Playing God.
  final.wav           The sound ARTISAN made (the engine's own render of that genome).
  target-scored.wav   The target exactly as ARTISAN scored it, for A/B listening.
  report.md           What it achieved, in plain English.
  mixer.html          Open in a browser: solo/mute each wave and hear it assemble.
  verify.js           Proof: run \`node verify.js\` in that folder to re-check everything.
`);
}

function pad(k) { const n = 18 - k.length; return ' '.repeat(Math.max(1, n)); }

async function main() {
  const argv = process.argv.slice(2);
  const { flags } = parseArgs(argv);
  if (flags.help || argv.length === 0 && !flags.config) { printHelp(); process.exit(0); }

  let cfg;
  try { cfg = resolveConfig(flags); }
  catch (e) { console.error('Configuration error: ' + e.message); process.exit(1); }

  const runName = cfg.run || deriveRunName(cfg.target);
  const runDir = resolve(join(__dirname, 'output', runName));
  mkdirSync(runDir, { recursive: true });

  // Parallel refinement via independent multi-start (BRIEF-2 §4b.8). Only for
  // budgeted runs (a wall-clock budget to share) and only at the top level (a child
  // sets ARTISAN_CHILD=1 and runs a single pipeline). Workers are capped here for
  // compute courtesy: leave the machine ~half free while other jobs may be running.
  const COURTESY_CAP = 4;
  const nWorkers = Math.min(cfg.workers || 1, COURTESY_CAP);
  if (process.env.ARTISAN_CHILD !== '1' && nWorkers > 1 && cfg.maxMinutes) {
    console.log(`ARTISAN — run "${runName}" (parallel multi-start × ${nWorkers}, ≤${COURTESY_CAP} for compute courtesy)`);
    console.log('─'.repeat(60));
    const t0 = Date.now();
    const baseArgs = [];
    if (cfg.maxMinutes) baseArgs.push('--maxMinutes', String(cfg.maxMinutes));
    if (cfg.target) baseArgs.push('--target', String(cfg.target));
    if (cfg.maxWaves) baseArgs.push('--maxWaves', String(cfg.maxWaves));
    const best = await runMultiStart(flags.config || null, baseArgs, runName, nWorkers, { onLog: (m) => console.log(m), seed: cfg.seed || 1 });
    console.log('─'.repeat(60));
    if (!best) { console.error('All workers failed.'); process.exit(1); }
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Best SSE ${best.bestSSE.toExponential(4)} from ${best.bestChild}.`);
    console.log('\nVerifying the best run…');
    const v = spawnSync(process.execPath, [join(runDir, 'verify.js')], { stdio: 'inherit' });
    process.exit(v.status === 0 ? 0 : 1);
  }

  console.log(`ARTISAN — run "${runName}"`);
  console.log('─'.repeat(60));
  const t0 = Date.now();

  let result;
  try {
    result = runPipeline(cfg, runDir, { onLog: (m) => console.log(m) });
  } catch (e) {
    console.error('\nRun failed: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  }

  const { sse, mimicSSE, target } = result;
  const floor = target.silenceFloor;
  console.log('─'.repeat(60));
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  console.log(`  Scored SSE:   ${fmt(sse)}   (0 = perfect; lower is better)`);
  console.log(`  vs silence:   ${fmt(floor / sse)}× better than a silent render`);
  if (mimicSSE != null) console.log(`  vs MIMIC:     ${fmt(mimicSSE / sse)}× better than MIMIC's best on this target`);
  console.log(`  Genome:       ${join('output', runName, 'genome.pg2.txt')}   ← paste this into Playing God`);
  console.log(`  Everything:   output/${runName}/  (report.md, final.wav, mixer.html, verify.js)`);

  // Prove it with the zero-dep verifier (BRIEF §10.1: a run is not done until this passes).
  console.log('\nVerifying…');
  const v = spawnSync(process.execPath, [join(runDir, 'verify.js')], { stdio: 'inherit' });
  if (v.status !== 0) {
    console.error('\n⚠️  verify.js did not pass — do not trust this run. (This should never happen.)');
    process.exit(1);
  }
  process.exit(0);
}

function deriveRunName(target) {
  const base = String(target).split('/').pop().replace(/\.wav$/i, '').replace(/[^A-Za-z0-9_-]/g, '_');
  return base || 'run';
}

function fmt(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x === Number.MAX_VALUE) return 'PERFECT';
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) return x.toExponential(3);
  return x.toFixed(x < 1 ? 6 : 3);
}

main().catch((e) => { console.error('\nRun failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
