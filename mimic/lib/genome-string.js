// genome-string.js — P11 genome ⇄ text string (owner brief, step 4).
//
// Format (shared with the main project's P11 proposal, docs/V2-PROPOSALS.md):
//
//     PG2:<base64 of the little-endian Float32 gene array>
//
// The "PG2" tag is BOTH the format version AND the schema generation: it means
// "Playing God schema v2" — the current 6167-gene genome (64×96 per-wave + 23
// globals; see ../src/genome.js). The tag is MANDATORY (the brief: "schema will
// change; the P3 migration is precedent"). A future schema bump becomes "PG3:"
// and this decoder rejects it loudly rather than mis-loading.
//
// Portability: this module is imported by BOTH node (run.js) and the browser
// (app.html), so it does not use Buffer or btoa/atob. Bytes are written
// little-endian via DataView (deterministic on any platform) and base64 is
// hand-rolled. Encode→decode round-trips a genome bit-exactly.

import { Genome, GENOME_SIZE, WAVE_SLOTS } from '../../src/genome.js';

export const TAG = 'PG2';
export const PREFIX = TAG + ':';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = (() => { const m = new Int16Array(128).fill(-1); for (let i = 0; i < B64.length; i++) m[B64.charCodeAt(i)] = i; return m; })();

// bytes (Uint8Array) → base64 string. Standard MIME base64 with '=' padding.
function bytesToBase64(bytes) {
  let out = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const b = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + B64[b & 63];
  }
  const rem = n - i;
  if (rem === 1) {
    const b = bytes[i] << 16;
    out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + '==';
  } else if (rem === 2) {
    const b = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + '=';
  }
  return out;
}

// base64 string → Uint8Array. Ignores whitespace; tolerant of missing padding.
function base64ToBytes(str) {
  const s = str.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = s.indexOf('=') === -1 ? s.length : s.indexOf('=');
  const outLen = Math.floor((len * 6) / 8);
  const out = new Uint8Array(outLen);
  let bits = 0, acc = 0, o = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_INV[s.charCodeAt(i)];
    if (v < 0) throw new Error('genome string: invalid base64 character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xff; }
  }
  return out;
}

// Genome (or raw Float32Array of GENOME_SIZE genes) → "PG2:…" string.
export function encodeGenomeString(genomeOrData) {
  const data = genomeOrData instanceof Float32Array ? genomeOrData
    : (genomeOrData && genomeOrData.data instanceof Float32Array ? genomeOrData.data : null);
  if (!data) throw new Error('encodeGenomeString: expected a Genome or Float32Array');
  if (data.length !== GENOME_SIZE) {
    throw new Error(`encodeGenomeString: gene array length ${data.length} != GENOME_SIZE ${GENOME_SIZE}`);
  }
  const bytes = new Uint8Array(data.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < data.length; i++) view.setFloat32(i * 4, data[i], true); // little-endian
  return PREFIX + bytesToBase64(bytes);
}

// "PG2:…" string → Genome. Validates the tag and the gene count. Reconstructs the
// provenance metadata as a fresh root (all-prime src, id = content hash).
export function decodeGenomeString(str) {
  if (typeof str !== 'string') throw new Error('decodeGenomeString: expected a string');
  const trimmed = str.trim();
  const colon = trimmed.indexOf(':');
  if (colon < 0) throw new Error('genome string: missing "TAG:" prefix');
  const tag = trimmed.slice(0, colon);
  if (tag !== TAG) {
    throw new Error(`genome string: unsupported version tag "${tag}" (this build reads "${TAG}"). ` +
      `A newer/older schema needs its migration path — refusing to mis-load.`);
  }
  const bytes = base64ToBytes(trimmed.slice(colon + 1));
  if (bytes.length !== GENOME_SIZE * 4) {
    throw new Error(`genome string: decoded ${bytes.length} bytes, expected ${GENOME_SIZE * 4} ` +
      `(${GENOME_SIZE} float32 genes). Corrupt or wrong-schema string.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const g = new Genome();
  for (let i = 0; i < GENOME_SIZE; i++) g.data[i] = view.getFloat32(i * 4, true);
  g.src = new Int8Array(WAVE_SLOTS);   // all-prime root
  g.parentIds = [];
  g.contrib = {};
  g.id = g.hash();
  return g;
}
