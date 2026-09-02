// wavio.js — hand-rolled WAV I/O for MIMIC.
//
// The engine's ../src/wav.js is a 16-bit *encoder* only (it stages listening
// batches). MIMIC additionally needs to LOAD an arbitrary target WAV, so this
// module hand-rolls a decoder — no external dependency (the house rule) — and
// re-exports the engine's encoder for writing auditioned output.
//
// Decoder scope (owner brief, step 2):
//   • PCM 16-bit and 24-bit, integer samples (the two formats a target is likely
//     to arrive in). 8-bit and 32-bit-float are detected and rejected with a
//     clear message rather than silently mis-decoded.
//   • Mono, or stereo mixed to mono by averaging the channels.
//   • Resampled to the engine rate (default 22050 Hz) by linear interpolation.
//
// Everything returns Float32 samples in the engine's convention: nominally
// [-1, 1], the same units render() produces, so the fitness SSE compares
// like-for-like on raw float samples (owner's spec).

import { encodeWav } from '../../src/wav.js';

export { encodeWav };

export const ENGINE_RATE = 22050;

// ── little-endian readers over a Node Buffer / Uint8Array ────────────────────
function u32(buf, o) { return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] * 0x1000000); }
function u16(buf, o) { return buf[o] | (buf[o + 1] << 8); }
function tag(buf, o) { return String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]); }

// Parse the RIFF/WAVE container into { fmt, dataOffset, dataSize }. Chunks may
// appear in any order and unknown chunks (LIST, fact, bext, …) are skipped, so
// we scan the chunk list rather than assuming the canonical 44-byte header.
function parseChunks(buf) {
  if (buf.length < 12 || tag(buf, 0) !== 'RIFF' || tag(buf, 8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file (bad magic). Is this really a .wav?');
  }
  let fmt = null, dataOffset = -1, dataSize = 0;
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = tag(buf, o);
    const size = u32(buf, o + 4);
    const body = o + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: u16(buf, body),        // 1 = PCM, 3 = IEEE float, 0xFFFE = extensible
        numChannels: u16(buf, body + 2),
        sampleRate: u32(buf, body + 4),
        bitsPerSample: u16(buf, body + 14),
      };
      // WAVE_FORMAT_EXTENSIBLE carries the real format tag in its subformat GUID;
      // its first two bytes are the actual audioFormat.
      if (fmt.audioFormat === 0xfffe && size >= 26) {
        fmt.audioFormat = u16(buf, body + 24);
      }
    } else if (id === 'data') {
      dataOffset = body;
      // Clamp to the real buffer end — some encoders write a bogus size.
      dataSize = Math.min(size, buf.length - body);
    }
    // Chunks are word-aligned: an odd size is followed by one pad byte.
    o = body + size + (size & 1);
  }
  if (!fmt) throw new Error('WAV has no "fmt " chunk.');
  if (dataOffset < 0) throw new Error('WAV has no "data" chunk.');
  return { fmt, dataOffset, dataSize };
}

// Decode the interleaved PCM data chunk into per-channel Float32 arrays.
function decodePCM(buf, fmt, dataOffset, dataSize) {
  const { numChannels, bitsPerSample, audioFormat } = fmt;
  if (audioFormat !== 1) {
    throw new Error(
      `Unsupported WAV encoding (audioFormat=${audioFormat}). MIMIC decodes ` +
      `integer PCM only. Re-export your target as 16- or 24-bit PCM WAV.`);
  }
  if (bitsPerSample !== 16 && bitsPerSample !== 24) {
    throw new Error(
      `Unsupported bit depth ${bitsPerSample}. MIMIC decodes 16- or 24-bit PCM. ` +
      `Re-export your target as 16- or 24-bit PCM WAV.`);
  }
  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = bytesPerSample * numChannels;
  const nFrames = Math.floor(dataSize / frameBytes);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(nFrames));

  const INV16 = 1 / 0x8000;        // 32768
  const INV24 = 1 / 0x800000;      // 8388608
  let p = dataOffset;
  for (let i = 0; i < nFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      if (bitsPerSample === 16) {
        let s = buf[p] | (buf[p + 1] << 8);
        if (s >= 0x8000) s -= 0x10000;         // sign-extend
        channels[c][i] = s * INV16;
        p += 2;
      } else { // 24-bit
        let s = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
        if (s >= 0x800000) s -= 0x1000000;     // sign-extend
        channels[c][i] = s * INV24;
        p += 3;
      }
    }
  }
  return channels;
}

// Mix an array of channel Float32Arrays to a single mono Float32Array by
// averaging. Averaging (not summing) keeps the amplitude convention intact — the
// owner's SSE is sensitive to absolute amplitude, so a stereo target must not
// arrive twice as loud as the same material in mono.
export function mixToMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < channels.length; c++) acc += channels[c][i];
    out[i] = acc * k;
  }
  return out;
}

// Linear-interpolation resampler from srcRate to dstRate. Linear is chosen
// deliberately over a windowed-sinc: the target is a *reference to match*, not
// audio for a listener, and linear resampling is transparent, dependency-free,
// and deterministic. The (small) high-frequency roll-off it introduces is part
// of the fixed target and therefore identical for every genome scored against
// it — it cannot bias the race. Recorded in docs/FITNESS.md.
export function resampleLinear(samples, srcRate, dstRate) {
  if (srcRate === dstRate) return samples;
  const ratio = dstRate / srcRate;
  const nOut = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(nOut);
  const step = srcRate / dstRate;                // src samples advanced per out sample
  for (let i = 0; i < nOut; i++) {
    const srcPos = i * step;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const a = samples[i0] || 0;
    const b = samples[i0 + 1] !== undefined ? samples[i0 + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

// Top-level loader: bytes → mono Float32 at `targetRate`. Returns
// { samples, sampleRate, sourceRate, sourceChannels, sourceBits, durationS }.
export function decodeWav(bytes, targetRate = ENGINE_RATE) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const { fmt, dataOffset, dataSize } = parseChunks(buf);
  const channels = decodePCM(buf, fmt, dataOffset, dataSize);
  const mono = mixToMono(channels);
  const resampled = resampleLinear(mono, fmt.sampleRate, targetRate);
  return {
    samples: resampled,
    sampleRate: targetRate,
    sourceRate: fmt.sampleRate,
    sourceChannels: fmt.numChannels,
    sourceBits: fmt.bitsPerSample,
    durationS: resampled.length / targetRate,
  };
}
