// island.js — contender (b): Island GA (4 islands, periodic migration).
//
// The population is split into `nIslands` demes, each running its own small
// (μ+λ) GA. Every `migrationInterval` generations, each island sends its best
// `migrants` genomes to the next island in a ring, replacing that island's
// worst. The demes explore semi-independently, so a deceptive basin that
// captures one island need not capture them all — the deception hedge the brief
// names. Same total render budget per generation as the plain GA (Σ island
// offspring = population).

import { randomPopulation, applyMutationScale, tournamentSelect, popMedianDistance, breedChild } from './common.js';

export class Island {
  constructor({ config, plan, rng, evaluate }) {
    this.config = config;
    this.plan = plan;
    this.rng = rng;
    this.evaluate = evaluate;
    this.nIslands = config.islands || 4;
    this.tournamentK = config.tournamentK || 3;
    this.crossoverRate = config.crossoverRate ?? 0.5;
    this.mutationScale = config.mutationScale ?? 1;
    this.migrationInterval = config.migrationInterval || 10;
    this.migrants = config.migrants || 1;
    // Split the population across islands as evenly as possible (≥2 each so
    // (μ+λ) and tournament are meaningful).
    const base = Math.floor(config.population / this.nIslands);
    this.sizes = Array.from({ length: this.nIslands }, (_, i) =>
      Math.max(2, base + (i < config.population - base * this.nIslands ? 1 : 0)));
    this.islands = [];                       // array of populations [{genome,sse,similarity}]
    this.generation = 0;
    this.renders = 0;
    this.best = null;
  }

  static needsDescriptors = false;

  _consider(member, gen) {
    if (!this.best || member.sse < this.best.sse) {
      this.best = { data: Float32Array.from(member.genome.data), sse: member.sse, similarity: member.similarity, generation: gen };
    }
  }

  async init() {
    // Evaluate all islands' gen-0 in one batch (better worker utilisation).
    const all = [];
    const spans = [];
    for (let k = 0; k < this.nIslands; k++) {
      const genomes = randomPopulation(this.sizes[k], this.rng, this.config.priorsOpts || {});
      for (const g of genomes) applyMutationScale(g, this.mutationScale);
      spans.push([all.length, all.length + genomes.length]);
      for (const g of genomes) all.push(g);
    }
    const results = await this.evaluate(all);
    this.renders += all.length;
    this.islands = spans.map(([s, e]) => {
      const pop = [];
      for (let i = s; i < e; i++) pop.push({ genome: all[i], sse: results[i].sse, similarity: results[i].similarity });
      pop.sort((a, b) => a.sse - b.sse);
      return pop;
    });
    for (const pop of this.islands) for (const m of pop) this._consider(m, 0);
    return this._stats();
  }

  async step() {
    this.generation++;
    // Breed every island's children, evaluate in ONE batch, then survive per island.
    const allChildren = [];
    const spans = [];
    const dMeds = [];
    const candList = [];
    for (let k = 0; k < this.nIslands; k++) {
      const pop = this.islands[k];
      const dMed = this.crossoverRate > 0 ? popMedianDistance(pop, this.rng) : 0;
      dMeds.push(dMed);
      const candidates = pop.map((m) => m.genome);
      candList.push(candidates);
      const start = allChildren.length;
      for (let i = 0; i < pop.length; i++) {   // λ = island size
        const prime = tournamentSelect(pop, this.tournamentK, this.rng).genome;
        allChildren.push(breedChild(prime, candidates, dMed, this.crossoverRate, this.rng));
      }
      spans.push([start, allChildren.length]);
    }
    const results = await this.evaluate(allChildren);
    this.renders += allChildren.length;

    for (let k = 0; k < this.nIslands; k++) {
      const [s, e] = spans[k];
      const childMembers = [];
      for (let i = s; i < e; i++) childMembers.push({ genome: allChildren[i], sse: results[i].sse, similarity: results[i].similarity });
      const pool = this.islands[k].concat(childMembers);
      pool.sort((a, b) => a.sse - b.sse);
      this.islands[k] = pool.slice(0, this.sizes[k]);
      for (const m of childMembers) this._consider(m, this.generation);
    }

    // Ring migration.
    if (this.generation % this.migrationInterval === 0) this._migrate();
    return this._stats();
  }

  _migrate() {
    const m = this.migrants;
    // Copy best m of each island i into island (i+1) mod n, replacing its worst m.
    const snapshots = this.islands.map((pop) => pop.slice(0, m).map((x) => ({
      genome: x.genome, sse: x.sse, similarity: x.similarity,
    })));
    for (let k = 0; k < this.nIslands; k++) {
      const dest = (k + 1) % this.nIslands;
      const pop = this.islands[dest];
      // Replace the worst m with clones of the migrants (clone genome so the two
      // islands do not alias the same object).
      for (let j = 0; j < m && j < snapshots[k].length; j++) {
        const mig = snapshots[k][j];
        pop[pop.length - 1 - j] = {
          genome: mig.genome.clone(),
          sse: mig.sse,
          similarity: mig.similarity,
        };
      }
      pop.sort((a, b) => a.sse - b.sse);
    }
  }

  _stats() {
    let sum = 0, n = 0, popBest = Infinity;
    for (const pop of this.islands) {
      for (const mm of pop) { if (Number.isFinite(mm.sse)) { sum += mm.sse; n++; } }
      if (pop[0].sse < popBest) popBest = pop[0].sse;
    }
    return {
      algorithm: 'island',
      generation: this.generation,
      renders: this.renders,
      bestSSE: this.best.sse,
      bestSimilarity: this.best.similarity,
      meanSSE: n ? sum / n : Infinity,
      popBestSSE: popBest,
    };
  }
}
