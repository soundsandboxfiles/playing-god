// seedpicks.js — build seed genomes from the owner's Gate 1a picks (F2, §5).
//
// F2 (V2-PROPOSALS) amends the §5 seeded initial batch. v1 seeded from ONE random
// genome plus 31 mutations of it. v2 seeds from the SEVEN creatures the owner
// picked at the Gate 1a audition (16, 34, 40, 45, 46, 49, 74 of the seed-0x1A0000
// batch — gate1a-verdict.md), each plus σ=0.2 mutants to fill 32. This keeps the
// coherence rationale of the seeded batch (§5: "a near-identical starting batch
// improves early archive coherence and gives recombination homologous material")
// while starting the search from material a human has already judged worth hearing
// rather than from a random draw — a stronger, not a narrower, start (nothing is
// made unreachable; §2.1).
//
// The heard-before-insert pending-queue rule (§5, §7.5) is UNCHANGED — the engine
// still plays each seed in sequence and inserts it only after it has been heard.
//
// This module is DOM-free so the gates (node) and the app (browser) share it. The
// picks are stored as raw gene arrays in output/gate-artefacts/seed-picks.json,
// which is v2-schema after the P3 migration (make-seed-picks.js writes it).

import { Genome, WAVE_SLOTS, GENOME_SIZE } from './genome.js';

// Build a Genome from a raw stored-gene array (as serialised in seed-picks.json).
// The array is already in the CURRENT schema (the migration, if any, happened when
// seed-picks.json was written — see make-seed-picks.js), so this is a plain load.
export function genomeFromRaw(raw) {
  const g = new Genome();
  const src = raw instanceof Float32Array ? raw : Float32Array.from(raw);
  if (src.length !== GENOME_SIZE) {
    throw new Error(`seed pick has ${src.length} genes, expected ${GENOME_SIZE} — schema mismatch (did make-seed-picks run for this schema?)`);
  }
  g.data.set(src);
  g.id = g.hash();
  // Seeds are roots for provenance (§8.2): all-prime src, no ancestors.
  g.src = new Int8Array(WAVE_SLOTS);
  g.contrib = {};
  g.parentIds = [];
  return g;
}

// Given a parsed seed-picks.json object, return the array of seed-parent Genomes.
export function genomesFromSeedPicks(json) {
  if (!json || !Array.isArray(json.genomes)) return [];
  return json.genomes.map((entry) => genomeFromRaw(entry.data));
}
