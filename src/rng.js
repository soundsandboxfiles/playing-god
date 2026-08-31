// rng.js — a small, seedable pseudo-random generator.
//
// WHY this exists at all: the gates (§13) are the whole point of the build, and
// a gate you cannot re-run on the same numbers is not evidence, it is an
// anecdote. Every random draw in the system flows through one of these objects,
// so a gate can be handed a fixed seed and reproduced exactly by a cold
// evaluator (§15.1). It also keeps the build headless — no dependency on the
// platform's Math.random, which cannot be seeded.
//
// WHY mulberry32: it is ~6 lines, has no external dependency (the spec forbids
// packages, §12), and its statistical quality is far more than enough for
// sampling priors and mutations. Nothing here is cryptographic.

export class RNG {
  // A 32-bit seed is plenty; distinct integer seeds give independent streams.
  constructor(seed = 0x9e3779b9) {
    // Force to an unsigned 32-bit integer so the arithmetic below stays in range.
    this._s = seed >>> 0;
  }

  // Uniform float in [0, 1). The bit-twiddling is the standard mulberry32 step.
  next() {
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Uniform float in [lo, hi).
  uniform(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  // Log-uniform in [lo, hi). Used wherever the spec asks for a log draw — pitch,
  // durations, waits, modulation depth (§13.2 table). Requires lo > 0.
  logUniform(lo, hi) {
    const l = Math.log(lo);
    const h = Math.log(hi);
    return Math.exp(l + (h - l) * this.next());
  }

  // Integer in [0, n).
  int(n) {
    return Math.floor(this.next() * n);
  }

  // Bernoulli: true with probability p.
  bool(p) {
    return this.next() < p;
  }

  // Standard normal via Box–Muller. Self-adaptive ES (§6.2) is defined in terms
  // of N(0,1) draws, so this is used heavily in mutation.
  gaussian() {
    // Guard u away from 0 so log() is finite.
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Pick one element of an array uniformly.
  pick(arr) {
    return arr[this.int(arr.length)];
  }

  // Weighted categorical draw: given an array of non-negative weights, return an
  // index with probability proportional to its weight. Used by the partner
  // kernel (§6.6) and by any prior that mixes components with stated weights.
  weightedIndex(weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    // If every weight is zero, fall back to uniform rather than dividing by zero.
    if (total <= 0) return this.int(weights.length);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1; // floating-point fallthrough
  }
}

// Convenience: a default generator for callers that do not care about
// reproducibility. Gates always construct their own seeded RNG instead.
export function defaultRNG() {
  // A time-independent constant seed keeps even the "default" path reproducible
  // within a process; callers wanting variety pass their own seed.
  return new RNG(0x1234abcd);
}
