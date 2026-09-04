// ga.js — contender (a): (μ+λ) generational GA with elitism + tournament.
//
// The textbook evolution strategy. Parents P (size μ = population). Each
// generation breeds λ children from tournament-selected parents (crossover +
// duplication + mutation via the engine's breed()), evaluates them, then keeps
// the best μ of (P ∪ children). Truncation survival makes elitism inherent; we
// additionally guarantee the top `elitism` are never displaced (they are, since
// they are the lowest-SSE members of the pool). Tournament selection chooses who
// breeds.
//
// This is the "just optimise" baseline. Its weakness against phase-deceptive
// landscapes (the whole population can pile into one deceptive basin) is exactly
// what the Island and MAP-Elites contenders hedge against.

import { randomPopulation, applyMutationScale, tournamentSelect, popMedianDistance, breedChild } from './common.js';

export class GA {
  constructor({ config, plan, rng, evaluate }) {
    this.config = config;
    this.plan = plan;
    this.rng = rng;
    this.evaluate = evaluate;               // async (genomes) -> results[]
    this.mu = config.population;
    this.lambda = config.lambda || config.population;
    this.elitism = config.elitism ?? 1;
    this.tournamentK = config.tournamentK || 3;
    this.crossoverRate = config.crossoverRate ?? 0.5;
    this.mutationScale = config.mutationScale ?? 1;
    this.pop = [];                          // [{ genome, sse, similarity }]
    this.generation = 0;
    this.renders = 0;
    this.best = null;                       // { data, sse, similarity, generation }
  }

  static needsDescriptors = false;

  _consider(member, gen) {
    if (!this.best || member.sse < this.best.sse) {
      this.best = {
        data: Float32Array.from(member.genome.data),
        sse: member.sse,
        similarity: member.similarity,
        generation: gen,
      };
    }
  }

  async init() {
    const genomes = randomPopulation(this.mu, this.rng, this.config.priorsOpts || {}, this.config.seedGenomes || []);
    for (const g of genomes) applyMutationScale(g, this.mutationScale);
    const results = await this.evaluate(genomes);
    this.renders += genomes.length;
    this.pop = genomes.map((genome, i) => ({ genome, sse: results[i].sse, similarity: results[i].similarity }));
    this.pop.sort((a, b) => a.sse - b.sse);
    for (const m of this.pop) this._consider(m, 0);
    return this._stats();
  }

  async step() {
    this.generation++;
    const dMed = this.crossoverRate > 0 ? popMedianDistance(this.pop, this.rng) : 0;
    const candidates = this.pop.map((m) => m.genome);

    // Breed λ children from tournament-selected parents.
    const children = [];
    for (let i = 0; i < this.lambda; i++) {
      const prime = tournamentSelect(this.pop, this.tournamentK, this.rng).genome;
      children.push(breedChild(prime, candidates, dMed, this.crossoverRate, this.rng));
    }
    const results = await this.evaluate(children);
    this.renders += children.length;
    const childMembers = children.map((genome, i) => ({ genome, sse: results[i].sse, similarity: results[i].similarity }));

    // (μ+λ) truncation survival.
    const pool = this.pop.concat(childMembers);
    pool.sort((a, b) => a.sse - b.sse);
    this.pop = pool.slice(0, this.mu);
    for (const m of childMembers) this._consider(m, this.generation);
    return this._stats();
  }

  _stats() {
    let sum = 0, n = 0;
    for (const m of this.pop) { if (Number.isFinite(m.sse)) { sum += m.sse; n++; } }
    return {
      algorithm: 'ga',
      generation: this.generation,
      renders: this.renders,
      bestSSE: this.best.sse,
      bestSimilarity: this.best.similarity,
      meanSSE: n ? sum / n : Infinity,
      popBestSSE: this.pop[0].sse,
    };
  }
}
