// _synthetic-dwell.js — the ONE honest synthetic noisy-dwell model (work order §4).
//
// There is no listener and no audio in the container, so a race between two archive
// architectures needs a stand-in for dwell. The model must be HONEST about what it is:
// it is an ARBITRARY FIXED "taste landscape" plus censored observation noise. It
// encodes NO claim about what real sound is engaging (§2.3, vastness-is-the-point) —
// it exists only to give the two denoising strategies (deep-grid implicit averaging
// vs adaptive-sampling explicit re-evaluation) a signal to recover under noise, so
// their COST and STRUCTURE can be compared. Nothing here judges a real sound.
//
// Design choices, stated so the race is reproducible and legible:
//
//  • Latent appeal μ(g) is a smooth function of a handful of CHEAP genome features
//    (no render needed): active-wave count, complexity, mean duty, mean pitch, and
//    the ratio-jump bias. Each is squashed to ~[0,1], dotted with a FIXED random
//    weight vector (seeded once — the "hidden taste"), passed through a logistic, and
//    scaled to [MIN_DWELL, L]. Because offspring share most features with their
//    parent, μ varies SMOOTHLY over genome space — i.e. taste has locality, which is
//    what makes denoising meaningful (a cell's residents have similar true appeal).
//
//  • Observed dwell = clamp(μ(g) + Normal(0, σ), MIN_DWELL, L), i.e. a CENSORED
//    Gaussian — censored at L exactly as a real dwell is (§8.3: a listener who plays
//    the whole render reads dwell = L). σ is a documented fraction of the dwell range;
//    the default is deliberately HIGH so the noise is the dominant challenge (that is
//    the regime where the deep grid vs adaptive sampling trade actually bites).
//
//  • `completed` is reported when the (noiseless-or-noisy) observation reaches L, so
//    the servo sees a realistic completion signal.
//
// The taste weights are a pure function of `tasteSeed`, so the SAME landscape can be
// shared across architectures and re-created per seed — the race varies the seed to
// average over landscapes, never to cherry-pick one.

import { RNG } from '../src/rng.js';
import { WAVE_SLOTS, complexity } from '../src/genome.js';

export const DWELL_MIN = 0.35;   // §8.3 MIN_DWELL_S (a shorter dwell is a discard)

// Cheap genome features → an appeal in [0,1] via fixed taste weights.
function features(g) {
  let active = 0, pitchSum = 0, dutySum = 0, n = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (g.getWave(w, 'active') < 0.5) continue;
    active++;
    pitchSum += g.getWave(w, 'pitch_master');
    dutySum += g.getWave(w, 'duty');
    n++;
  }
  const meanPitch = n ? pitchSum / n : 0;
  const meanDuty = n ? dutySum / n : 0.5;
  const cx = complexity(g);
  const ratio = g.getGlobal('p_ratio_jump_scale');
  // Squash each feature to ~[0,1] with generous, fixed scales (documented constants).
  return [
    Math.min(1, active / 10),                 // wave density (F10 range is 1..10)
    Math.min(1, cx / 400),                     // complexity (median ≈305, §5.2)
    meanDuty,                                  // already 0..1
    1 / (1 + Math.exp(-(meanPitch) / 600)),    // mean pitch (cents) → logistic
    Math.min(1, ratio / 4),                    // ratio-jump scale (0..4)
  ];
}

// Build the fixed taste landscape for a given seed. Returns { mu(g), sample(g,rng,L) }.
export function makeTaste(tasteSeed, opts = {}) {
  const wr = new RNG(tasteSeed);
  const W = [0, 0, 0, 0, 0].map(() => wr.gaussian()); // fixed hidden taste weights
  const bias = wr.gaussian() * 0.5;
  const sigmaFrac = opts.sigmaFrac != null ? opts.sigmaFrac : 0.35; // noise = frac of range
  return {
    tasteSeed, sigmaFrac, weights: W, bias,
    // Latent (noiseless) appeal in seconds, given render length L.
    mu(g, L) {
      const f = features(g);
      let z = bias;
      for (let i = 0; i < W.length; i++) z += W[i] * (f[i] - 0.5);
      const t = 1 / (1 + Math.exp(-z));         // logistic → [0,1]
      return DWELL_MIN + t * (L - DWELL_MIN);
    },
    // One noisy, censored observation. `rng` is the observation-noise stream (kept
    // separate from the engine RNG so noise draws don't perturb the search).
    sample(g, rng, L) {
      const m = this.mu(g, L);
      const sigma = this.sigmaFrac * (L - DWELL_MIN);
      let d = m + sigma * rng.gaussian();
      let completed = false;
      if (d >= L) { d = L; completed = true; }
      if (d < DWELL_MIN) d = DWELL_MIN;
      return { dwell_s: d, completed, mu: m };
    },
  };
}

// Pure-drift null (methodological note, V2-PROPOSALS): dwell is uniform random over
// [MIN, L] with NO taste landscape — selection is switched off. Where an archive
// drifts under THIS is the signature of operator bias + priors alone (the drift
// control). Kept here beside the taste model so both share the censoring convention.
export function makeRandomDwell() {
  return {
    sample(g, rng, L) {
      let d = DWELL_MIN + rng.next() * (L - DWELL_MIN);
      const completed = d >= L * 0.999;
      return { dwell_s: d, completed, mu: null };
    },
  };
}
