# Genome string format (P11 / "PG2:")

A version-tagged text encoding of a genome, so a creature can be copied,
shared person-to-person, and pasted back. MIMIC saves the fittest genome of
every run in this format alongside its WAV. This is the reference implementation
of the main project's P11 proposal (`docs/V2-PROPOSALS.md`).

## Grammar

```
genome-string := TAG ":" base64
TAG           := "PG2"
base64        := standard MIME base64 (A–Z a–z 0–9 + /) with "=" padding
```

The base64 payload is the genome's gene array — `GENOME_SIZE` (6167) IEEE-754
**float32** values — written **little-endian**, 4 bytes each, in gene index
order. Payload is therefore `6167 × 4 = 24668` bytes → `32892`-char base64;
the whole string (with `PG2:`) is `32896` chars.

## The tag is the schema version — and it is mandatory

`PG2` means **Playing God schema v2**: the current 6167-gene layout (64 wave
slots × 96 per-wave genes + 23 globals, defined in `../src/genome.js`). The tag
is not decoration:

- The schema *will* change (the v1→v2 P3 migration is precedent).
- When it does, new strings become `PG3:` and **this decoder rejects them
  loudly** rather than silently mis-loading genes into the wrong slots.
- A migration path (like `../src/migrate.js`) would translate `PG2` → `PG3`.

## Endianness — why explicit little-endian

The codec writes/reads bytes with `DataView.setFloat32(o, v, true)` /
`getFloat32(o, true)`, forcing little-endian regardless of the host platform.
This makes a string produced on one machine decode identically on any other, and
makes the node and browser implementations byte-for-byte identical. (Base64 is
hand-rolled in `lib/genome-string.js` for the same reason — no `Buffer`, no
`btoa`/`atob`, so node and browser share one code path.)

## Guarantees

- **Bit-exact round-trip.** `decodeGenomeString(encodeGenomeString(g))` yields a
  genome with the identical gene array and identical content hash (`g.hash()`).
  Verified in `test/`.
- **Validation on decode.** Wrong tag → error naming the tag. Wrong byte count
  (corrupt/truncated string, or wrong schema) → error naming the mismatch. A
  decoded genome is re-rooted for provenance (all-prime `src`, fresh `id`).

## Usage

```js
import { encodeGenomeString, decodeGenomeString } from './lib/genome-string.js';
const str = encodeGenomeString(genome);   // "PG2:AAAA…"
const genome2 = decodeGenomeString(str);  // Genome
```

In the CLI, the fittest genome string is written to
`output/<run>/fittest.pg2.txt`. In `app.html`, "Export genome string" copies it
and the paste box decodes it back into a playable/auditionable creature.
