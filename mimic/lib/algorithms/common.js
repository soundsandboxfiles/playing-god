// common.js — shared helpers for the three contenders.
//
// The algorithms differ only in how they SELECT and STRUCTURE the population; the
// engine's variation operators (breed = crossover+duplication+mutation) and the
// scoring path are shared. Keeping them here keeps each algorithm file about its
// one idea.

import {
  Genome, WAVE_SLOTS, GENES_PER_WAVE, GLOBAL_INDEX, WAVE_INDEX,
} from '../../../src/genome.js';
import { randomGenome } from '../../../src/priors.js';
import { breed } from '../../../src/variation.js';
import { medianDistance } from '../../../src/distance.js';

// Build a Genome from a raw Float32Array of genes (used to rehydrate genomes sent
// to/from workers, and to clone). Re-roots provenance.
export function genomeFromData(data) {
  const g = new Genome();
  g.data.set(data);
  g.src = new Int8Array(WAVE_SLOTS);
  g.parentIds = [];
  g.id = g.hash();
  return g;
}

// Generation-zero population from the engine priors. `nActiveRange` is optional;
// when absent the priors' F10 default (1..10 active waves) is used.
export function randomPopulation(n, rng, opts = {}) {
  const pop = [];
  for (let i = 0; i < n; i++) pop.push(randomGenome(rng, opts));
  return pop;
}

// Apply an initial mutation-step scale to a genome by scaling its self-adaptive
// sigma genes (sigma_global + every wave's sigma_wave). This is MIMIC's
// `--mutation-scale` knob: it sets how big the INITIAL ES steps are; the engine's
// self-adaptation then evolves them from there. scale=1 leaves the priors' init.
export function applyMutationScale(genome, scale) {
  if (scale === 1 || !(scale > 0)) return genome;
  const clampStored = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // sigma genes are mapped linear 0.002..0.5; scaling the STORED value scales the
  // step proportionally near the low end where inits live. Simple and monotone.
  const g = genome;
  const gBase = WAVE_SLOTS * GENES_PER_WAVE;
  const sgi = GLOBAL_INDEX['sigma_global'];
  g.data[gBase + sgi] = clampStored(g.data[gBase + sgi] * scale);
  const swi = WAVE_INDEX['sigma_wave'];
  for (let w = 0; w < WAVE_SLOTS; w++) {
    const b = w * GENES_PER_WAVE;
    g.data[b + swi] = clampStored(g.data[b + swi] * scale);
  }
  return g;
}

// Tournament selection: pick `k` random members, return the one with the lowest
// SSE. `pop` is an array of { genome, sse }. Ties broken by first draw.
export function tournamentSelect(pop, k, rng) {
  let best = pop[rng.int(pop.length)];
  for (let i = 1; i < k; i++) {
    const c = pop[rng.int(pop.length)];
    if (c.sse < best.sse) best = c;
  }
  return best;
}

// Median compatibility distance over the population's genomes, for the partner
// kernel used by crossover (breed). Returns 0 for <2 genomes (crossover then
// silently declines and breeding is mutation-only, per breed()).
export function popMedianDistance(pop, rng) {
  if (pop.length < 2) return 0;
  return medianDistance(pop.map((m) => m.genome), rng, Math.min(200, pop.length * 4));
}

// One breeding event using the engine operators. `prime` is the selected parent
// genome; `candidates` are genomes eligible as crossover partners; `dMed` the
// median distance; `crossoverRate` the probability crossover is attempted.
export function breedChild(prime, candidates, dMed, crossoverRate, rng) {
  const { child } = breed(prime, rng, {
    crossoverRate,
    partnerCandidates: candidates,
    dMed,
  });
  return child;
}
