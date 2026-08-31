// logging.js — the §14 logging substrate, DOM-free.
//
// §14 is not optional and is derived from the gates, diagnostics and invariants,
// not from what looks interesting (§14 preamble). The hard test (§14, §14.7) is
// that the LOGS ALONE can answer the gate questions and can EXACTLY reconstruct
// any genome. This module provides:
//   • GenomeStore — delta-against-prime storage with every-100th full resync,
//     and exact reconstruction (§14 "Genome storage");
//   • Logger — separate append-only streams per store (listens, snapshots, servo,
//     notes, anomalies) that serialise to JSON Lines (§14 "Format").
//
// The browser build (app/index.html) mirrors these stores into IndexedDB; this
// node-side version writes .jsonl, so the two share one schema and the export
// path (docs/EXPORTING-LOGS.md) round-trips.
//
// EVERY record carries timestamp_ms and session_id (§14 hard rule). The caller
// supplies both; helpers here refuse to omit them.

import { GENOME_SIZE } from './genome.js';

export const RESYNC_EVERY = 100; // §14: "Every 100th genome is stored in full"

// Store genomes as deltas against their prime parent, with periodic full resync.
// A genome is reconstructible if its prime chain resolves to a full entry — and
// primes are always logged before their children (they were heard first), so the
// chain always terminates.
export class GenomeStore {
  constructor() {
    this.entries = new Map(); // id → { full:[...] } | { prime_id, delta:[[i,v],...] }
    this._recon = new Map();  // memoised reconstructions
    this._count = 0;
  }

  // Record a genome. `primeGenome` may be null (a freshly drawn root, stored full).
  put(genome, primeGenome) {
    if (this.entries.has(genome.id)) return; // already stored (e.g. B replay)
    const full = (this._count % RESYNC_EVERY === 0) || !primeGenome;
    if (full) {
      this.entries.set(genome.id, { full: Array.from(genome.data) });
    } else {
      const delta = [];
      const a = genome.data, b = primeGenome.data;
      for (let i = 0; i < GENOME_SIZE; i++) {
        if (a[i] !== b[i]) delta.push([i, a[i]]);
      }
      this.entries.set(genome.id, { prime_id: primeGenome.id, delta });
    }
    this._count++;
  }

  // Reconstruct the raw gene array for a genome id, or null if unresolvable.
  reconstruct(id) {
    if (this._recon.has(id)) return this._recon.get(id);
    const e = this.entries.get(id);
    if (!e) return null;
    let arr;
    if (e.full) {
      arr = Float32Array.from(e.full);
    } else {
      const base = this.reconstruct(e.prime_id);
      if (!base) return null;
      arr = Float32Array.from(base);
      for (const [i, v] of e.delta) arr[i] = v;
    }
    this._recon.set(id, arr);
    return arr;
  }

  // Serialise for export: one JSONL line per genome entry.
  toJSONL(meta) {
    const lines = [];
    for (const [id, e] of this.entries) {
      lines.push(JSON.stringify({ ...meta, genome_id: id, ...e }));
    }
    return lines.join('\n') + (lines.length ? '\n' : '');
  }
}

// Append-only multi-stream logger. Each stream is an array of records; toJSONL()
// serialises one stream. The sink (file write / IndexedDB) is the caller's job so
// this stays DOM-free and testable.
export class Logger {
  constructor(sessionId, clock) {
    this.sessionId = sessionId;
    // `clock` returns Unix epoch ms. Injected so runs are reproducible/testable
    // and so headless gates need no wall clock unless they want one.
    this.clock = clock || (() => 0);
    this.streams = {
      listens: [], snapshots: [], servo: [], notes: [], anomalies: [],
    };
  }

  // Stamp and append a record. Enforces the §14 universal-timestamp rule.
  append(stream, record) {
    if (!this.streams[stream]) this.streams[stream] = [];
    const stamped = { timestamp_ms: this.clock(), session_id: this.sessionId, ...record };
    this.streams[stream].push(stamped);
    return stamped;
  }

  anomaly(kind, detail) {
    return this.append('anomalies', { kind, ...detail });
  }

  toJSONL(stream) {
    const rows = this.streams[stream] || [];
    return rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  }
}
