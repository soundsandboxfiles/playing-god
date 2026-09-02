// mapelites.js — contender (c): MAP-Elites as a pure optimiser.
//
// The engine's §7 archive, repurposed. The behaviour space is the two existing
// descriptor axes (development_raw × harmonicity_raw), binned into an nx×ny grid.
// Each cell keeps ONE elite: the lowest-SSE genome that has ever landed there.
// Selection is UNIFORM over occupied cells — diversity is the deception-fighter:
// even while most of the map is chasing one basin, an off-basin cell keeps a
// foothold that mutation can grow from. "MAP-Elites-as-optimizer" = we read out
// the single best-SSE elite anywhere as the answer.
//
// It pays more per render than GA/Island (it also computes the §7 descriptors),
// so the race reports wall-time as well as render count (owner brief, step 5/6).

import { applyMutationScale, popMedianDistance, breedChild, randomPopulation } from './common.js';
import { cellOf, HARM_AXIS_MIN_FLOOR } from '../../../src/descriptors.js';
import { medianDistance } from '../../../src/distance.js';

export class MapElites {
  constructor({ config, plan, rng, evaluate }) {
    this.config = config;
    this.plan = plan;
    this.rng = rng;
    this.evaluate = evaluate;               // MUST be built withDescriptors:true
    this.batch = config.population;         // evaluations per "generation" (budget parity)
    this.geom = { nx: config.mapNx || 16, ny: config.mapNy || 16 };
    this.crossoverRate = config.crossoverRate ?? 0.5;
    this.mutationScale = config.mutationScale ?? 1;
    this.archive = new Map();               // "x,y" -> { genome, sse, similarity, dev, harm }
    this.cal = null;
    this.generation = 0;
    this.renders = 0;
    this.best = null;
  }

  static needsDescriptors = true;

  _consider(member, gen) {
    if (!this.best || member.sse < this.best.sse) {
      this.best = { data: Float32Array.from(member.genome.data), sse: member.sse, similarity: member.similarity, generation: gen };
    }
  }

  // Calibrate axis ranges from a batch of descriptor readings (min>0 for log bins).
  _calibrate(results) {
    let devMin = Infinity, devMax = -Infinity, harmMin = Infinity, harmMax = -Infinity;
    for (const r of results) {
      if (r.dev > 0 && Number.isFinite(r.dev)) { if (r.dev < devMin) devMin = r.dev; if (r.dev > devMax) devMax = r.dev; }
      if (r.harm > 0 && Number.isFinite(r.harm)) { if (r.harm < harmMin) harmMin = r.harm; if (r.harm > harmMax) harmMax = r.harm; }
    }
    // Fallbacks if a whole axis was degenerate.
    if (!Number.isFinite(devMin)) { devMin = 1e-4; devMax = 1; }
    if (!Number.isFinite(harmMin)) { harmMin = HARM_AXIS_MIN_FLOOR; harmMax = 1; }
    if (devMax <= devMin) devMax = devMin * 10;
    if (harmMax <= harmMin) harmMax = harmMin * 10;
    this.cal = {
      dev: { min: Math.max(1e-6, devMin), max: devMax },
      harm: { min: Math.max(HARM_AXIS_MIN_FLOOR, harmMin), max: harmMax },
    };
  }

  _place(genome, r, gen) {
    if (!(r.dev > 0) || !(r.harm > 0) || !Number.isFinite(r.sse)) {
      // Undescribable / failed render → file in the degenerate corner cell so it
      // can still seed, but it will lose to anything real on SSE.
    }
    const { cell_x, cell_y } = cellOf(r.dev || 0, r.harm || 0, this.cal, this.geom);
    const key = cell_x + ',' + cell_y;
    const cur = this.archive.get(key);
    const member = { genome, sse: r.sse, similarity: r.similarity, dev: r.dev, harm: r.harm };
    if (!cur || r.sse < cur.sse) {
      this.archive.set(key, member);
      this._consider(member, gen);
      return true;
    }
    return false;
  }

  async init() {
    const genomes = randomPopulation(this.batch, this.rng, this.config.priorsOpts || {});
    for (const g of genomes) applyMutationScale(g, this.mutationScale);
    const results = await this.evaluate(genomes);
    this.renders += genomes.length;
    this._calibrate(results);
    for (let i = 0; i < genomes.length; i++) this._place(genomes[i], results[i], 0);
    return this._stats();
  }

  _occupied() { return Array.from(this.archive.values()); }

  async step() {
    this.generation++;
    const elites = this._occupied();
    const candidates = elites.map((m) => m.genome);
    const dMed = this.crossoverRate > 0 && elites.length > 1
      ? medianDistance(candidates, this.rng, Math.min(200, elites.length * 4)) : 0;

    // Produce `batch` children by uniform-cell selection, evaluate in one batch.
    const children = [];
    for (let i = 0; i < this.batch; i++) {
      const prime = elites[this.rng.int(elites.length)].genome;   // uniform over occupied cells
      children.push(breedChild(prime, candidates, dMed, this.crossoverRate, this.rng));
    }
    const results = await this.evaluate(children);
    this.renders += children.length;
    for (let i = 0; i < children.length; i++) this._place(children[i], results[i], this.generation);
    return this._stats();
  }

  _stats() {
    let sum = 0, n = 0;
    for (const m of this.archive.values()) { if (Number.isFinite(m.sse)) { sum += m.sse; n++; } }
    return {
      algorithm: 'mapelites',
      generation: this.generation,
      renders: this.renders,
      bestSSE: this.best.sse,
      bestSimilarity: this.best.similarity,
      meanSSE: n ? sum / n : Infinity,
      occupiedCells: this.archive.size,
    };
  }
}
