// io.js — small binary helpers shared by the deliverable writer and the tests.
// Zero dependency; only Node's fs.

import { writeFileSync, readFileSync } from 'node:fs';
import { encodeWav } from './engine.js';

export { encodeWav };

// Write a Float32Array as a raw little-endian .f32 file (lossless). Used for
// target-scored.f32 so verify.js can recompute the EXACT reported SSE (a 16-bit
// WAV would quantise the target and shift the number).
export function writeF32(path, arr) {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  writeFileSync(path, buf);
}

export function readF32(path) {
  const buf = readFileSync(path);
  const n = Math.floor(buf.byteLength / 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

// Write a Float32 sample buffer as a 16-bit PCM WAV using the ENGINE's own
// encoder (BRIEF §3.1: delivered WAV = engine's raw render, engine-encoded).
export function writeWav(path, samples, sampleRate) {
  writeFileSync(path, encodeWav(samples, sampleRate));
}
