#!/usr/bin/env node
// synth-protocol.mjs — deterministically synthesize the dtmf-modem target.
// Zero dependencies. Writes targets/_raw/dtmf-modem.wav (22050 Hz mono 16-bit).
//
// Content (6.0 s):
//   0.00-0.80  US precise dial tone: 350 Hz + 440 Hz          (ITU-T E.180 / Bell)
//   1.00-2.44  DTMF digits "073250", 160 ms on / 80 ms off    (ITU-T Q.23 pairs)
//   2.60-3.20  2100 Hz answer tone                            (ITU-T V.25)
//   3.40-5.80  300-baud phase-continuous FSK, mark 2225 / space 2025 Hz (Bell 103
//              answer channel), deterministic bit pattern from a seeded LCG (seed 73)
//   5.80-6.00  silence tail
// All tone edges get 5 ms raised-cosine fades. Peak-normalized to -1.0 dBFS.
// Deliberate design: the DTMF/dial-tone half is trivially reachable by the engine
// (steady sine dyads) — the library's "engine CAN nail this" calibration anchor;
// the FSK half stresses instantaneous frequency stepping against 8-node envelopes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050, DUR = 6.0, N = Math.round(SR * DUR);
const s = new Float64Array(N);
const TWO_PI = 2 * Math.PI;

function addTone(t0, t1, freqs, amp) {
  const a0 = Math.round(t0 * SR), a1 = Math.round(t1 * SR);
  const fadeN = Math.round(0.005 * SR);
  for (let i = a0; i < a1 && i < N; i++) {
    let v = 0;
    for (const f of freqs) v += Math.sin(TWO_PI * f * (i - a0) / SR);
    v *= amp / freqs.length;
    const rel = i - a0, rem = a1 - 1 - i;
    if (rel < fadeN) v *= 0.5 * (1 - Math.cos(Math.PI * rel / fadeN));
    if (rem < fadeN) v *= 0.5 * (1 - Math.cos(Math.PI * rem / fadeN));
    s[i] += v;
  }
}

// 1. dial tone
addTone(0.0, 0.8, [350, 440], 0.5);

// 2. DTMF "073250" — ITU-T Q.23 row/col pairs
const Q23 = { '0': [941, 1336], '7': [852, 1209], '3': [697, 1477], '2': [697, 1336], '5': [770, 1336] };
let t = 1.0;
for (const d of '073250') { addTone(t, t + 0.16, Q23[d], 0.6); t += 0.24; }

// 3. V.25 answer tone
addTone(2.6, 3.2, [2100], 0.5);

// 4. Bell 103 answer-channel FSK, 300 baud, phase-continuous
let lcg = 73 >>> 0;
const nextBit = () => { lcg = (1664525 * lcg + 1013904223) >>> 0; return (lcg >>> 16) & 1; };
{
  const t0 = 3.4, t1 = 5.8, a0 = Math.round(t0 * SR), a1 = Math.round(t1 * SR);
  const spb = SR / 300; // samples per bit
  const fadeN = Math.round(0.005 * SR);
  let phase = 0, bit = nextBit(), samplesIntoBit = 0;
  for (let i = a0; i < a1; i++) {
    if (samplesIntoBit >= spb) { bit = nextBit(); samplesIntoBit -= spb; }
    const f = bit ? 2225 : 2025;
    phase += TWO_PI * f / SR;
    let v = 0.5 * Math.sin(phase);
    const rel = i - a0, rem = a1 - 1 - i;
    if (rel < fadeN) v *= 0.5 * (1 - Math.cos(Math.PI * rel / fadeN));
    if (rem < fadeN) v *= 0.5 * (1 - Math.cos(Math.PI * rem / fadeN));
    s[i] += v;
    samplesIntoBit += 1;
  }
}

// peak-normalize to -1 dBFS
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(s[i]));
const g = Math.pow(10, -1 / 20) / peak;

// write 16-bit WAV
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  let v = Math.round(s[i] * g * 32767);
  if (v > 32767) v = 32767; if (v < -32768) v = -32768;
  pcm.writeInt16LE(v, i * 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '_raw', 'dtmf-modem.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([hdr, pcm]));
console.log(`wrote ${out} (${DUR} s @ ${SR} Hz, peak -1.0 dBFS)`);
