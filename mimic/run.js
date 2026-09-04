// run.js — the MIMIC CLI runner (owner brief, step 7).
//
//   node run.js --config configs/chimes.json
//   node run.js --target /path/to/your.wav --generations 200 --population 300
//   node run.js --help
//
// Everything the owner asked to control is settable: target, algorithm,
// population, generations, elitism, mutation scale, total length, window start,
// seed, workers — via a JSON config, CLI flags, or both (CLI overrides config).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { decodeWav } from './lib/wavio.js';
import { sine, chirp, decayingTone, benchmarkSuite } from './lib/targets.js';
import { runEvolution } from './lib/run-core.js';
import { streamStart, streamSavedGen, streamFinalize } from './lib/deliverable.js';
import { METRICS } from './lib/fitness.js';
import { decodeGenomeString } from './lib/genome-string.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── defaults ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  target: null,            // path to a WAV; if null, targetName is used
  targetName: 'chimes',    // chimes | sine-220 | chirp-110-880 | decay-440 | recover-2wave | recover-6wave | recover-seedpick
  algorithm: 'ga',         // ga | island | mapelites — GA won the race 5/6 targets (see report §4)
  population: 300,
  generations: 200,
  elitism: 2,
  mutationScale: 1.0,
  crossoverRate: 0.5,
  totalLength: null,       // seconds; null → window-start + target length
  windowStart: 0,          // seconds
  seed: 1,
  workers: 8,
  saveEvery: 0,            // 0 → auto (~60 files)
  maxMinutes: 0,           // 0 → no wall-clock cap; else stop cleanly after N minutes
  metric: 'sse',
  seedGenome: null,        // path to a file holding a "PG2:" genome string; injected into gen 0
  seedCopies: 1,           // how many copies of that genome to inject
  run: null,               // run label; null → auto from target + algorithm
  out: null,               // output dir; null → output/<run>/
  // algorithm extras
  islands: 4, migrationInterval: 10, migrants: 1, tournamentK: 3, mapNx: 16, mapNy: 16,
};

const HELP = `
MIMIC — evolve sounds to match a target waveform.

USAGE
  node run.js --config <file.json>         run from a config file
  node run.js --target <file.wav> [opts]   run against a WAV
  node run.js --target-name chimes [opts]  run against the built-in Big Ben chimes
  node run.js --help

WHAT IT DOES
  A population of "genomes" (parametric sound recipes) is bred over many
  generations. Each is scored by how closely its waveform matches your target
  (lower SSE = closer; 0 = perfect). The best of each saved generation is written
  as a .wav so you can HEAR the search improve, plus the final best as a WAV and a
  shareable "PG2:" genome string.

THE CONTROLS (all optional; sensible defaults shown)
  --target <path.wav>       Your target sound. 16- or 24-bit PCM WAV, any rate.
  --target-name <name>      Use a built-in target instead of a file. One of:
                              chimes  sine-220  chirp-110-880  decay-440
                              recover-2wave  recover-6wave  recover-seedpick
  --algorithm <name>        ga | island | mapelites        (default: ${DEFAULTS.algorithm})
                              ga        : one big population, elitism + tournament
                              island    : 4 sub-populations that swap migrants
                              mapelites : a diverse archive (best deception hedge)
  --population <n>          Herd size.                       (default: ${DEFAULTS.population})
  --generations <n>        How many rounds of breeding.      (default: ${DEFAULTS.generations})
  --elitism <n>            How many best always survive.     (default: ${DEFAULTS.elitism})
  --mutation-scale <x>     Bigger = wilder mutations.        (default: ${DEFAULTS.mutationScale})
  --crossover-rate <p>     Chance two parents mix (0..1).    (default: ${DEFAULTS.crossoverRate})
  --total-length <sec>     Length of the sound rendered.     (default: fits the target)
  --window-start <sec>     Where in that length the target is matched; the rest is
                           free/unconstrained.               (default: ${DEFAULTS.windowStart})
  --seed <n>               Random seed (same seed = same run).(default: ${DEFAULTS.seed})
  --seed-genome <path>     Start the search FROM a known sound instead of from
                           noise: a file holding a "PG2:" genome string (e.g. a
                           previous run's fittest.pg2.txt, or ARTISAN's
                           genome.pg2.txt). It joins generation zero verbatim —
                           elitism keeps it alive — and the rest of the herd is
                           random. Works with ga and island (island 0 gets it).
  --seed-copies <n>        Copies of that genome to inject.    (default: ${DEFAULTS.seedCopies})
  --workers <n>            CPU cores to use (1 = single core).(default: ${DEFAULTS.workers})
  --save-every <n>         Save a WAV every n generations.   (default: auto ~60 files)
  --max-minutes <m>        Stop cleanly after m minutes, keeping everything saved
                           so far (0 = no cap).              (default: ${DEFAULTS.maxMinutes})
  --metric <name>          sse (owner's spec, default) or a diagnostic:
                              ${Object.keys(METRICS).join('  ')}
                           (Non-'sse' metrics are OFF the owner's spec — see
                            docs/FITNESS.md. Use only for curiosity.)
  --run <label>            Name for this run's output folder.
  --out <dir>              Output directory. (default: output/<run>/)

ALGORITHM EXTRAS (rarely needed)
  --islands <n> --migration-interval <g> --migrants <n>
  --tournament-k <n> --map-nx <n> --map-ny <n>

EXAMPLES
  node run.js --config configs/chimes.json
  node run.js --target-name chimes --algorithm ga --population 200 --generations 100
  node run.js --target song.wav --window-start 2 --total-length 13.5 --seed 7
`;

// ── tiny arg parser: --key value, --key=value, --flag ────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) continue;
    a = a.slice(2);
    let key, val;
    const eq = a.indexOf('=');
    if (eq >= 0) { key = a.slice(0, eq); val = a.slice(eq + 1); }
    else {
      key = a;
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) val = true;   // bare flag
      else { val = nxt; i++; }
    }
    out[camel(key)] = val;
  }
  return out;
}
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function loadConfig(path) {
  const full = resolve(process.cwd(), path);
  return JSON.parse(readFileSync(full, 'utf8'));
}

// Resolve the target Float32Array + a label + the source note.
function resolveTarget(cfg) {
  if (cfg.target) {
    const full = resolve(process.cwd(), cfg.target);
    const t = decodeWav(readFileSync(full));
    return { samples: t.samples, label: basename(full).replace(/\.wav$/i, ''),
      source: `WAV ${cfg.target} (${t.sourceRate}Hz ${t.sourceChannels}ch ${t.sourceBits}bit → 22050 mono)` };
  }
  const name = cfg.targetName || 'chimes';
  if (name === 'chimes') {
    const full = join(__dirname, 'targets', 'westminster-chimes.wav');
    const t = decodeWav(readFileSync(full));
    return { samples: t.samples, label: 'chimes', source: 'targets/westminster-chimes.wav' };
  }
  if (name === 'sine-220') return { samples: sine({ lengthS: 2 }), label: 'sine-220', source: 'synthetic sine 220Hz' };
  if (name === 'chirp-110-880') return { samples: chirp({ lengthS: 2 }), label: 'chirp', source: 'synthetic chirp 110→880Hz' };
  if (name === 'decay-440') return { samples: decayingTone({ lengthS: 2 }), label: 'decay-440', source: 'synthetic decaying tone 440Hz' };
  const suite = benchmarkSuite();
  const b = suite.find((x) => x.name === name);
  if (b) return { samples: b.make(), label: name, source: `recoverability target ${name}` };
  throw new Error(`unknown --target-name "${name}". Choices: chimes, sine-220, chirp-110-880, decay-440, recover-2wave, recover-6wave, recover-seedpick, or use --target <file.wav>.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) { console.log(HELP); process.exit(0); }

  // Merge: defaults < config file < CLI.
  let cfg = { ...DEFAULTS };
  if (args.config) cfg = { ...cfg, ...loadConfig(args.config) };
  // CLI overrides (only keys the user actually passed).
  const map = {
    target: 'target', targetName: 'targetName', algorithm: 'algorithm',
    population: 'population', generations: 'generations', elitism: 'elitism',
    mutationScale: 'mutationScale', crossoverRate: 'crossoverRate',
    totalLength: 'totalLength', windowStart: 'windowStart', seed: 'seed',
    workers: 'workers', saveEvery: 'saveEvery', maxMinutes: 'maxMinutes', metric: 'metric', run: 'run', out: 'out',
    seedGenome: 'seedGenome', seedCopies: 'seedCopies',
    islands: 'islands', migrationInterval: 'migrationInterval', migrants: 'migrants',
    tournamentK: 'tournamentK', mapNx: 'mapNx', mapNy: 'mapNy',
  };
  for (const k of Object.keys(map)) if (args[k] !== undefined) cfg[k] = args[k];

  // Coerce numerics.
  for (const k of ['population', 'generations', 'elitism', 'seed', 'workers', 'saveEvery', 'seedCopies',
    'islands', 'migrationInterval', 'migrants', 'tournamentK', 'mapNx', 'mapNy']) cfg[k] = Math.round(num(cfg[k], DEFAULTS[k]));
  for (const k of ['mutationScale', 'crossoverRate', 'windowStart', 'maxMinutes']) cfg[k] = num(cfg[k], DEFAULTS[k]);
  cfg.totalLength = cfg.totalLength == null || cfg.totalLength === '' ? null : num(cfg.totalLength, null);

  if (!METRICS[cfg.metric]) { console.error(`Unknown --metric "${cfg.metric}". Choices: ${Object.keys(METRICS).join(', ')}`); process.exit(1); }
  if (cfg.metric !== 'sse') {
    console.warn(`\n!! --metric ${cfg.metric} departs from the owner's fitness spec (SSE). ` +
      `This is a diagnostic; results are NOT the owner's blunt similarity. See docs/FITNESS.md.\n`);
  }

  // Optional seed genome: decoded here so a bad path/string fails BEFORE the run.
  let seedGenomes = [];
  if (cfg.seedGenome) {
    const full = resolve(process.cwd(), cfg.seedGenome);
    const text = readFileSync(full, 'utf8');
    const m = text.match(/PG2:[A-Za-z0-9+/=]+/);
    if (!m) { console.error(`--seed-genome ${cfg.seedGenome}: no "PG2:" genome string found in that file.`); process.exit(1); }
    const g = decodeGenomeString(m[0]);
    const n = Math.max(1, cfg.seedCopies || 1);
    for (let i = 0; i < n; i++) seedGenomes.push(g);
  }

  const tgt = resolveTarget(cfg);
  const targetLenS = tgt.samples.length / 22050;
  const totalLengthS = cfg.totalLength != null ? cfg.totalLength : (cfg.windowStart + targetLenS);
  const runName = cfg.run || `${tgt.label}-${cfg.algorithm}-p${cfg.population}g${cfg.generations}-s${cfg.seed}`;
  const outDir = cfg.out ? resolve(process.cwd(), cfg.out) : join(__dirname, 'output', runName);

  // Silence-floor reference (target energy) — the SSE any silent genome scores.
  let silenceFloor = 0; for (const x of tgt.samples) silenceFloor += x * x;

  console.log(`\nMIMIC run: ${runName}`);
  console.log(`  target:      ${tgt.source}  (${targetLenS.toFixed(2)}s, ${tgt.samples.length} samples)`);
  console.log(`  algorithm:   ${cfg.algorithm}   population ${cfg.population} × generations ${cfg.generations}`);
  console.log(`  window:      score [${cfg.windowStart.toFixed(2)}s, ${(cfg.windowStart + targetLenS).toFixed(2)}s) of a ${totalLengthS.toFixed(2)}s render`);
  console.log(`  workers:     ${cfg.workers}   seed ${cfg.seed}   metric ${cfg.metric}`);
  if (seedGenomes.length) console.log(`  seeded:      ${seedGenomes.length}× genome from ${cfg.seedGenome} (gen 0 starts from this sound)`);
  console.log(`  silence-floor SSE (reference): ${silenceFloor.toExponential(4)}`);
  console.log(`  output:      ${outDir}\n`);

  // Streaming deliverable: lay down the harness now and write each saved gen WAV
  // the moment it is produced, so a crash mid-run leaves a playable partial.
  const stream = streamStart(outDir, { runName, target: tgt.source, silenceFloorSSE: silenceFloor });

  const t0 = Date.now();
  let lastLog = 0;
  const result = await runEvolution({
    target: tgt.samples,
    totalLengthS,
    windowStartS: cfg.windowStart,
    sampleRate: 22050,
    algorithm: cfg.algorithm,
    population: cfg.population,
    generations: cfg.generations,
    elitism: cfg.elitism,
    mutationScale: cfg.mutationScale,
    crossoverRate: cfg.crossoverRate,
    seed: cfg.seed,
    workers: cfg.workers,
    seedGenomes,
    saveEvery: cfg.saveEvery || 0,
    metric: cfg.metric,
    maxWallMs: cfg.maxMinutes > 0 ? cfg.maxMinutes * 60000 : Infinity,
    algoConfig: {
      islands: cfg.islands, migrationInterval: cfg.migrationInterval, migrants: cfg.migrants,
      tournamentK: cfg.tournamentK, mapNx: cfg.mapNx, mapNy: cfg.mapNy,
    },
    onSaved: (savedGen, ctx) => {
      const peak = streamSavedGen(stream, savedGen, { ...ctx.meta, sampleRate: 22050, totalLengthS });
      const isl = savedGen.island !== undefined ? `, island ${savedGen.island}` : '';
      process.stdout.write(`    ↳ saved gen-${String(savedGen.generation).padStart(4)} WAV (peak ${peak.toFixed(3)}${isl})\n`);
    },
    onGeneration: (stats) => {
      const now = Date.now();
      if (now - lastLog > 1500 || stats.generation === cfg.generations) {
        lastLog = now;
        const sim = stats.bestSimilarity === Number.MAX_VALUE ? 'PERFECT' : stats.bestSimilarity.toExponential(3);
        const belowFloor = stats.bestSSE < silenceFloor ? ' ↓below-silence' : '';
        process.stdout.write(`  gen ${String(stats.generation).padStart(4)}/${cfg.generations}  ` +
          `bestSSE ${stats.bestSSE.toExponential(4)}  sim ${sim}  renders ${stats.renders}${belowFloor}\n`);
      }
    },
  });

  const write = streamFinalize(stream, result, {
    target: tgt.source, silenceFloorSSE: silenceFloor,
    notes: [
      cfg.metric !== 'sse' ? `metric ${cfg.metric} is a diagnostic, not the owner's SSE spec` : 'owner SSE spec',
      result.meta.extendedToFitWindow ? 'render length extended to cover the scored window' : null,
      result.meta.stoppedEarly ? `stopped early at gen ${result.meta.generationsReached}/${result.meta.requestedGenerations} on the ${cfg.maxMinutes}-min cap` : null,
    ].filter(Boolean),
  });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const finalSim = result.best.similarity === Number.MAX_VALUE ? 'PERFECT (SSE=0)' : result.best.similarity.toExponential(4);
  const stoppedMsg = result.meta.stoppedEarly ? ` (stopped early at gen ${result.meta.generationsReached}/${cfg.generations} on ${cfg.maxMinutes}-min cap)` : '';
  console.log(`\nDone in ${secs}s${stoppedMsg}. Best SSE ${result.best.sse.toExponential(4)} (similarity ${finalSim}), found at gen ${result.best.foundAtGeneration}.`);
  console.log(`Below silence floor? ${result.best.sse < silenceFloor ? 'YES — genuinely matching the sound.' : 'no — did not beat silence (see report on phase deception).'}`);
  console.log(`\nHEAR IT:  cd ${outDir}  &&  node serve.js   → open the printed http://localhost URL`);
  console.log(`Fittest genome string: ${basename(outDir)}/fittest.pg2.txt`);
  console.log(`Wrote ${write.manifest.generations.length} generation WAVs + curves + summary.\n`);
}

main().catch((e) => { console.error('\nMIMIC error:', e.message); process.exit(1); });
