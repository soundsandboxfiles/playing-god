// fft.js — a small, dependency-free FFT and the spectral helpers ARTISAN's
// analysis needs. Pure Node; no npm. WHY hand-rolled: BRIEF §5 wants the fewest
// moving parts, and an iterative radix-2 Cooley–Tukey is ~40 lines and fast
// enough for our sizes (a few 2^16 transforms per run).
//
// This is the "sight" in "sighted design": an FFT of the target hands us the
// frequency and phase that blind search (MIMIC) could not thread (BRIEF §6).

// Next power of two ≥ n.
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// In-place iterative radix-2 FFT. re/im are Float64Array of length P (power of 2).
// sign = -1 forward, +1 inverse (inverse also scales by 1/P).
export function fftInPlace(re, im, sign = -1) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('fft length must be a power of 2, got ' + n);
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = sign * 2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (sign > 0) { for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; } }
}

// Forward FFT of a real signal, zero-padded to `pad` (default next pow2). Returns
// { re, im, P } of length P. The caller reads bins 0..P/2 for a real signal.
export function rfft(signal, pad) {
  const P = pad || nextPow2(signal.length);
  const re = new Float64Array(P), im = new Float64Array(P);
  re.set(signal.length <= P ? signal : signal.subarray(0, P));
  fftInPlace(re, im, -1);
  return { re, im, P };
}

// Magnitude spectrum (bins 0..P/2) from a real signal.
export function magnitudeSpectrum(signal, pad) {
  const { re, im, P } = rfft(signal, pad);
  const half = P / 2;
  const mag = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]);
  return { mag, P };
}

// Parabolic (quadratic) interpolation around a magnitude peak at bin k. Returns
// { delta, mag } where the true peak is at k+delta (delta∈[-0.5,0.5]) — the
// standard sub-bin refinement (interpolate on log-magnitude for a Gaussian-ish
// main lobe). Guards flat/edge cases.
export function parabolicPeak(magArr, k) {
  if (k <= 0 || k >= magArr.length - 1) return { delta: 0, mag: magArr[k] };
  const l = Math.log(magArr[k - 1] + 1e-300);
  const c = Math.log(magArr[k] + 1e-300);
  const r = Math.log(magArr[k + 1] + 1e-300);
  const denom = (l - 2 * c + r);
  const delta = Math.abs(denom) < 1e-30 ? 0 : 0.5 * (l - r) / denom;
  const mag = Math.exp(c - 0.25 * (l - r) * delta);
  return { delta: Math.max(-0.5, Math.min(0.5, delta)), mag };
}

// A Hann window of length N (for STFT framing).
export function hann(N) {
  const w = new Float64Array(N);
  if (N === 1) { w[0] = 1; return w; }
  for (let n = 0; n < N; n++) w[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1));
  return w;
}
