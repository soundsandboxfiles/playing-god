// wav.js — minimal 16-bit PCM WAV encoder, DOM-free.
//
// Used only to stage the Gate 1a listening batch (render-batch.js): the container
// has no audio device, so the generator's output is written to files that a HUMAN
// auditions on the host (Gate 1a needs ears, by construction — BUILD-ORDER). No
// dependency, per §12. Returns a Uint8Array the caller writes with fs.

// samples: Float32Array in [−1,1] (post-normalisation true peak ≤ −1 dBTP, §4.7).
export function encodeWav(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let o = 0;
  const writeStr = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)); };
  const writeU32 = (v) => { view.setUint32(o, v, true); o += 4; };
  const writeU16 = (v) => { view.setUint16(o, v, true); o += 2; };

  writeStr('RIFF');
  writeU32(36 + dataSize);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32(16);                    // PCM fmt chunk size
  writeU16(1);                     // audio format = PCM
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(sampleRate * numChannels * bytesPerSample); // byte rate
  writeU16(numChannels * bytesPerSample);              // block align
  writeU16(bitsPerSample);
  writeStr('data');
  writeU32(dataSize);

  for (let i = 0; i < samples.length; i++) {
    let s = samples[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;   // hard safety clamp
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Uint8Array(buffer);
}
