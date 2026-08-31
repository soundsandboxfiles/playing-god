// mfcc.js — hand-rolled MFCC (§13.2, and the descriptor axes §7.1).
//
// Hand-rolled per the build constraints: "Hand-roll the MFCC implementation
// rather than adding a dependency" (handover prompt). It is ~120 lines and keeps
// the container hermetic (no npm, §12). MFCC is used in three places, all of
// which must agree bit-for-bit or the gates are not comparable:
//   • perceptual distance for the genotypic-locality gate (§13.2)
//   • axis 1, temporal development: 8-segment MFCC mean pairwise distance (§7.1)
//   • H_cell, within-cell heterogeneity (§13.3)
//
// This is an INSTRUMENT (§2.2): it measures and organises, and carries no
// assumption about what will score. It is deliberately a standard, neutral
// front-end — Hann window, mel filterbank, log, DCT-II — with no tuning aimed at
// any kind of sound.

// ── FFT (iterative radix-2, in place) ────────────────────────────────────────
// n must be a power of two. re/im are Float64Array of length n.
export function fft(re, im) {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Danielson–Lanczos.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wpr = Math.cos(ang), wpi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr; wr = nwr;
      }
    }
  }
}

// ── mel scale ────────────────────────────────────────────────────────────────
function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
function melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

// Precompute a triangular mel filterbank as a list of {start, weights} so the
// per-frame application is a sparse dot product.
function melFilterbank(nMels, fftSize, sampleRate, fmin, fmax) {
  const nBins = fftSize / 2 + 1;
  const melMin = hzToMel(fmin), melMax = hzToMel(fmax);
  const points = new Float64Array(nMels + 2);
  for (let i = 0; i < points.length; i++) {
    const mel = melMin + ((melMax - melMin) * i) / (nMels + 1);
    points[i] = Math.floor(((fftSize + 1) * melToHz(mel)) / sampleRate);
  }
  const filters = [];
  for (let m = 1; m <= nMels; m++) {
    const left = points[m - 1], center = points[m], right = points[m + 1];
    const weights = [];
    let start = left;
    for (let k = left; k <= right; k++) {
      if (k < 0 || k >= nBins) { weights.push(0); continue; }
      let w = 0;
      if (k < center && center > left) w = (k - left) / (center - left);
      else if (k >= center && right > center) w = (right - k) / (right - center);
      weights.push(Math.max(0, w));
    }
    filters.push({ start, weights });
  }
  return filters;
}

// ── DCT-II ───────────────────────────────────────────────────────────────────
// Direct evaluation; nMels (~26) is small so this is cheap and exact.
function dctII(input, nCoeffs) {
  const M = input.length;
  const out = new Float64Array(nCoeffs);
  for (let k = 0; k < nCoeffs; k++) {
    let sum = 0;
    for (let m = 0; m < M; m++) {
      sum += input[m] * Math.cos((Math.PI * k * (m + 0.5)) / M);
    }
    out[k] = sum;
  }
  return out;
}

const DEFAULTS = { win: 1024, hop: 512, nMels: 26, nCoeffs: 13 };

// Cache filterbanks and Hann windows keyed by (win, sampleRate).
const _fbCache = new Map();
function getBank(win, sampleRate, nMels) {
  const key = `${win}:${sampleRate}:${nMels}`;
  let b = _fbCache.get(key);
  if (!b) {
    const hann = new Float64Array(win);
    for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
    b = {
      hann,
      filters: melFilterbank(nMels, win, sampleRate, 0, sampleRate / 2),
    };
    _fbCache.set(key, b);
  }
  return b;
}

// Compute the MFCC frame sequence of a signal. Returns an array of Float64Array
// (length nCoeffs) — one per frame. Coefficients are c0..c(nCoeffs−1) (c0 is
// overall log-energy; kept, since after loudness normalisation §4.7 it carries
// within-render energy-distribution information rather than absolute level).
export function mfccSequence(samples, sampleRate, opts = {}) {
  const { win, hop, nMels, nCoeffs } = { ...DEFAULTS, ...opts };
  const { hann, filters } = getBank(win, sampleRate, nMels);
  const re = new Float64Array(win), im = new Float64Array(win);
  const frames = [];
  const logEps = 1e-10;

  for (let start = 0; start + win <= samples.length; start += hop) {
    // Window into the FFT buffers.
    for (let i = 0; i < win; i++) { re[i] = samples[start + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    // Power spectrum (bins 0..win/2).
    const nBins = win / 2 + 1;
    const power = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    // Mel energies.
    const mel = new Float64Array(nMels);
    for (let m = 0; m < nMels; m++) {
      const f = filters[m];
      let acc = 0;
      for (let w = 0; w < f.weights.length; w++) {
        const bin = f.start + w;
        if (bin >= 0 && bin < nBins) acc += power[bin] * f.weights[w];
      }
      mel[m] = Math.log(acc + logEps);
    }
    frames.push(dctII(mel, nCoeffs));
  }
  // Edge case: signal shorter than one window → a single zero-padded frame, so
  // callers always get at least one vector to compare.
  if (frames.length === 0) {
    for (let i = 0; i < win; i++) { re[i] = (i < samples.length ? samples[i] : 0) * hann[i]; im[i] = 0; }
    fft(re, im);
    const nBins = win / 2 + 1;
    const power = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    const mel = new Float64Array(nMels);
    for (let m = 0; m < nMels; m++) {
      const f = filters[m];
      let acc = 0;
      for (let w = 0; w < f.weights.length; w++) {
        const bin = f.start + w;
        if (bin >= 0 && bin < nBins) acc += power[bin] * f.weights[w];
      }
      mel[m] = Math.log(acc + logEps);
    }
    frames.push(dctII(mel, nCoeffs));
  }
  return frames;
}

// Euclidean distance between two equal-length MFCC vectors.
export function vecDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

// Mean Euclidean distance between two MFCC frame SEQUENCES (§13.2 perceptual
// distance). If the sequences differ in length (they will not, for equal render
// lengths, but be safe), compare over the shorter and it is exact for the gates.
export function sequenceDistance(seqA, seqB) {
  const n = Math.min(seqA.length, seqB.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += vecDist(seqA[i], seqB[i]);
  return s / n;
}

// Mean MFCC vector over a set of frames (used for axis-1 segment vectors, §7.1).
export function meanVector(frames, nCoeffs) {
  const out = new Float64Array(nCoeffs);
  if (frames.length === 0) return out;
  for (const f of frames) for (let i = 0; i < nCoeffs; i++) out[i] += f[i];
  for (let i = 0; i < nCoeffs; i++) out[i] /= frames.length;
  return out;
}
