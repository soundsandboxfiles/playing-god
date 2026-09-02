// index.js — algorithm registry / factory.

import { GA } from './ga.js';
import { Island } from './island.js';
import { MapElites } from './mapelites.js';

export const ALGORITHMS = {
  ga: GA,
  island: Island,
  mapelites: MapElites,
};

export const ALGORITHM_NAMES = Object.keys(ALGORITHMS);

// Does this algorithm need the descriptor axes computed during evaluation?
export function needsDescriptors(name) {
  const A = ALGORITHMS[name];
  if (!A) throw new Error(`unknown algorithm "${name}" (choices: ${ALGORITHM_NAMES.join(', ')})`);
  return !!A.needsDescriptors;
}

// Construct an algorithm instance. `deps` = { config, plan, rng, evaluate }.
export function makeAlgorithm(name, deps) {
  const A = ALGORITHMS[name];
  if (!A) throw new Error(`unknown algorithm "${name}" (choices: ${ALGORITHM_NAMES.join(', ')})`);
  return new A(deps);
}
