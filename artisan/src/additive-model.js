// additive-model.js — a fast, cached scorer that exploits the engine's linearity.
//
// When no AM/PM couples the waves, the mixed render is exactly Σ_slot basis_slot
// (DECISIONS 2026-09-03; additivity confirmed vs the true engine to <1e-6). So we
// can cache each active wave's windowed render and, when refinement changes ONE
// wave's genes, re-render only that wave and update the reconstruction/SSE
// incrementally. That turns a coordinate-descent trial from a full K-wave render
// into a single-wave render — the difference between minutes and hours.
//
// The model is always reconciled against the true engine at commit points
// (trueSSE); if a change ever introduces modulation and breaks additivity, the
// caller falls back to true-engine scoring. For ARTISAN's additive genomes it
// never does.

import { renderWaveWindow, activeCount } from './genome-build.js';
import { WAVE_SLOTS } from './engine.js';
import { scoreGenome } from './score.js';

export class AdditiveModel {
  constructor(genome, plan) {
    this.genome = genome.clone();
    this.plan = plan;
    this.winLen = plan.winLen;
    this.target = plan.target;
    this.bases = new Map();      // slot -> Float64Array(winLen)
    this.recon = new Float64Array(this.winLen);
    this.slots = [];
    for (let w = 0; w < WAVE_SLOTS; w++) {
      if (this.genome.getWave(w, 'active') >= 0.5) {
        const b = renderWaveWindow(this.genome, w, plan);
        this.bases.set(w, b);
        this.slots.push(w);
        for (let n = 0; n < this.winLen; n++) this.recon[n] += b[n];
      }
    }
    this._sse = this._computeSSE();
  }

  _computeSSE() {
    let sse = 0;
    for (let n = 0; n < this.winLen; n++) { const d = this.recon[n] - this.target[n]; sse += d * d; }
    return sse;
  }

  sse() { return this._sse; }

  // Re-render one wave and update recon + SSE. If the wave is (now) inactive its
  // basis becomes zero. Returns the new SSE.
  updateWave(slot) {
    const old = this.bases.get(slot);
    const active = this.genome.getWave(slot, 'active') >= 0.5;
    const neu = active ? renderWaveWindow(this.genome, slot, this.plan) : new Float64Array(this.winLen);
    if (old) { for (let n = 0; n < this.winLen; n++) this.recon[n] += neu[n] - old[n]; }
    else { for (let n = 0; n < this.winLen; n++) this.recon[n] += neu[n]; if (!this.slots.includes(slot)) this.slots.push(slot); }
    this.bases.set(slot, neu);
    this._sse = this._computeSSE();
    return this._sse;
  }

  // Convenience: set a stored gene value on a wave and re-render it.
  setStoredAndUpdate(slot, name, stored) {
    this.genome.setWaveStored(slot, name, stored);
    return this.updateWave(slot);
  }

  // The current genome (a live reference; clone if you need a snapshot).
  current() { return this.genome; }
  snapshot() { return this.genome.clone(); }

  activeCount() { return activeCount(this.genome); }

  // Reconcile with the true engine — the arbiter. Returns { modelSSE, trueSSE, gap }.
  reconcile() {
    const t = scoreGenome(this.genome, this.plan);
    return { modelSSE: this._sse, trueSSE: t.sse, gap: Math.abs(t.sse - this._sse), samples: t.samples };
  }
}
