// engine.js — ARTISAN's single READ-ONLY boundary onto the Playing God engine.
//
// EVERY import of `../src/*` (the unmodified engine) and `../mimic/lib/*` (MIMIC's
// read-only toolkit) funnels through this one file. Nothing in ARTISAN reaches
// around it. WHY: BRIEF §3.2 requires a one-way, read-only dependency — Artisan
// imports the engine, never modifies it, and nothing in Playing God/MIMIC ever
// imports Artisan. Keeping the boundary in one module makes that auditable at a
// glance and means a future schema bump (BRIEF §9) touches only the re-exports
// here, never Artisan's internals.
//
// Path note: this file lives at artisan/src/engine.js, so the engine is two
// directories up (../../src) and MIMIC's lib is ../../mimic/lib.
//
// NOTHING here is hard-coded to 64/96/23/6167 (BRIEF §9). Slot count and layout
// come from the loaded schema; the codec's tag rejects unknown versions loudly.

// ── genome schema + genotype (the "cage") ────────────────────────────────────
export {
  Genome,
  GENOME_SIZE,
  WAVE_SLOTS,
  GENES_PER_WAVE,
  GLOBAL_COUNT,
  ENV_MAX_NODES,
  WAVE_SCHEMA,
  GLOBAL_SCHEMA,
  WAVE_INDEX,
  GLOBAL_INDEX,
  SWITCH_NAMES,
  mapValue,
  inverseMap,
  reflect01,
  complexity,
} from '../../src/genome.js';

// ── the unmodified synthesis engine (§4) — the SOLE ARBITER (BRIEF §5) ────────
export { render } from '../../src/synthesis.js';

// ── raw phenotype path (never normalised) + the engine sample rate ───────────
// BRIEF §2: score/deliver via the raw render(), never renderNormalized.
export { renderRaw, ENGINE_RATE } from '../../mimic/lib/render-raw.js';

// ── PG2 genome-string codec (float32 quantisation happens on decode) ─────────
export { encodeGenomeString, decodeGenomeString, TAG, PREFIX } from '../../mimic/lib/genome-string.js';

// ── WAV I/O: decoder for arbitrary targets, engine's own 16-bit encoder ──────
export { decodeWav, encodeWav, mixToMono, resampleLinear } from '../../mimic/lib/wavio.js';

// ── fitness: the owner's blunt SSE (BRIEF §2, mimic's spec) ───────────────────
export { makeScorePlan, sseWindowed, similarityOf, PERFECT_SIMILARITY, evaluate } from '../../mimic/lib/fitness.js';

// ── recover-target helpers (BRIEF §10.2 reuses mimic/lib/targets.js) ─────────
export { knownGenome, benchmarkSuite, fromGenome } from '../../mimic/lib/targets.js';
