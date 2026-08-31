// make-seed-picks.js — write output/gate-artefacts/seed-picks.json from the
// captured v1 ground-truth picks (F2, V2-PROPOSALS).
//
// The owner's seven Gate 1a picks were captured as RAW v1 genomes in
// seed-picks-v1raw.json (before any v2 schema change, so bit-faithful to what the
// owner auditioned). This script converts them to the CURRENT schema and writes the
// committed seed-picks.json the engine/app seed from.
//
//   • Before P3 (v1 timing schema): conversion is the identity — the arrays already
//     match the current schema.
//   • After  P3 (v2 period/duty schema): each array is migrated wave-by-wave by
//     migrateGenomeV1toV2 (src/migrate.js), which is phenotype-preserving.
//
// Run: node gates/make-seed-picks.js   (re-run after any schema change).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENOME_SIZE } from '../src/genome.js';
import { writeArtefact, ARTEFACT_DIR } from './_util.js';

// The migration is optional so this script runs both before and after P3 lands.
let migrate = null, SCHEMA = 'v1';
try {
  const m = await import('../src/migrate.js');
  migrate = m.migrateRawV1toV2;
  SCHEMA = 'v2';
} catch { /* migrate.js not present yet (pre-P3) → identity, schema v1 */ }

function main() {
  const rawPath = join(ARTEFACT_DIR, 'seed-picks-v1raw.json');
  const v1 = JSON.parse(readFileSync(rawPath, 'utf8'));

  const genomes = v1.genomes.map((entry) => {
    let data = Float32Array.from(entry.data);
    if (migrate) data = migrate(data); // v1 → v2, phenotype-preserving (P3)
    if (data.length !== GENOME_SIZE) throw new Error(`pick ${entry.index}: ${data.length} genes, expected ${GENOME_SIZE}`);
    return {
      index: entry.index,
      v1_id: entry.id,
      data: Array.from(data),
    };
  });

  const path = writeArtefact('seed-picks.json', {
    note: `Owner's 7 Gate 1a picks as seed parents (F2). Schema: ${SCHEMA}. ` +
      'Derived from seed-picks-v1raw.json (immutable v1 ground truth). ' +
      (migrate ? 'Migrated v1→v2 (phenotype-preserving, P3).' : 'Identity (pre-P3, v1 schema).'),
    schema: SCHEMA,
    source_seed: v1.seed,
    picks: v1.picks,
    genome_size: GENOME_SIZE,
    genomes,
  });
  console.log(`seed-picks.json written (${SCHEMA}): ${genomes.length} picks → ${path}`);
  for (const g of genomes) console.log(`  creature ${String(g.index).padStart(3, '0')}: v1_id=${g.v1_id}`);
}

main();
