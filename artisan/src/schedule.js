// schedule.js — the anytime budget-filling optimiser (BRIEF-2 §4a, §4b.7).
//
// v1's complaint: it stopped at ~10 minutes inside a 20-minute cap on a 24-hour
// licence — `refineRounds` ran out and the program left. v2 turns `--max-minutes`
// into a budget to FILL: a portfolio of moves runs in epochs until the budget is
// gone OR measured convergence is reached (no move beats epsilon for `patience`
// epochs — and the report shows that evidence). "My schedule finished" is not
// convergence.
//
// The portfolio, cheapest-first (BRIEF-2 §4a):
//   • gate-lock + global least-squares gain re-solve   (near-free, big early wins)
//   • coordinate descent on the additive-safe genes    (envelope nodes, freq, phase)
//   • reallocation / "wave stealing" (§4b.7)           (kill the least-useful wave,
//         re-spend its slot on the largest unexplained residual — the one structural
//         move coordinate descent can't make, since it can't hop a wave across a
//         spectral valley)
//   • CMA-ES joint polish on the worst waves            (correlated-gene interactions)
//
// Everything runs on the AdditiveModel fast scorer (re-render only the changed
// wave) and is reconciled to the true engine — the sole arbiter — at the end. The
// scheduler streams best-so-far on every improvement, so a kill at any moment
// leaves a valid, verifiable partial (the MIMIC crash lesson).

import { WAVE_SLOTS, GENES_PER_WAVE } from './engine.js';
import { AdditiveModel } from './additive-model.js';
import { collectRefinableGenes, coordinateDescent, cmaes, lockGates } from './optimize.js';
import { fitOneAtom, detectGate } from './construct.js';
import { renderWaveWindow, setGainLin, setSwitch, activeCount } from './genome-build.js';
import { leastSquaresGains } from './linfit.js';

function nowMs() { return Date.now(); }

// Render wave `slot` at unit output gain with its CURRENT shape/envelope/phase — the
// LS basis vector. (We can't reuse model.bases: those carry each wave's current
// gain, so an LS solve on them would return a multiplier, not the gain.)
function renderUnitBasis(genome, slot, plan) {
  const g = genome.clone();
  setSwitch(g, slot, 'gain_out_on', true);
  // 0 dB = unit linear; keep the wave's phase (sign lives there after setGainLin).
  g.setWaveStored(slot, 'gain_out', unitGainStored(g, slot));
  for (let w = 0; w < WAVE_SLOTS; w++) if (w !== slot) setSwitch(g, w, 'active', false);
  setSwitch(g, slot, 'active', true);
  return renderWaveWindow(g, slot, plan);
}
// stored value that maps gain_out to 0 dB.
function unitGainStored(g, slot) {
  // gain_out is linear -80..+6 dB; 0 dB stored = (0 - (-80))/(6 - (-80)) = 80/86.
  return 80 / 86;
}

// Global least-squares gain re-solve over all active waves — exact and near-free
// (additivity). Renders each wave once at unit gain, solves the optimal gains,
// writes them back. Returns the new SSE. Any wave whose optimal gain is negligible
// is switched off (frees a slot for reallocation).
export function resolveGainsLS(model, { killBelowLin = 1e-4 } = {}) {
  const g = model.genome;
  const slots = model.slots.filter((s) => g.getWave(s, 'active') >= 0.5);
  if (!slots.length) return model.sse();
  const bases = slots.map((s) => renderUnitBasis(g, s, model.plan));
  const { gains } = leastSquaresGains(bases, model.target);
  for (let i = 0; i < slots.length; i++) {
    if (Math.abs(gains[i]) < killBelowLin) setSwitch(g, slots[i], 'active', false);
    else setGainLin(g, slots[i], gains[i]);
    model.updateWave(slots[i]);
  }
  return model.sse();
}

// Rank active waves by marginal usefulness: how much SSE would INCREASE if this
// wave were removed (its basis subtracted). Cheap — no re-solve, just a dot update.
function marginalContributions(model) {
  const slots = model.slots.filter((s) => model.genome.getWave(s, 'active') >= 0.5);
  const recon = model.recon, target = model.target, winLen = model.winLen;
  const out = [];
  for (const s of slots) {
    const b = model.bases.get(s);
    if (!b) { out.push({ slot: s, gain: 0 }); continue; }
    // Δsse = ||(recon - b) - target||² - ||recon - target||²
    //      = Σ [ (r-b-t)² - (r-t)² ] = Σ [ b² - 2 b (r - t) ]
    let d = 0;
    for (let n = 0; n < winLen; n++) { const rt = recon[n] - target[n]; d += b[n] * b[n] - 2 * b[n] * rt; }
    out.push({ slot: s, gain: d }); // gain = SSE increase if removed (higher = more useful)
  }
  out.sort((a, b) => a.gain - b.gain); // least useful first
  return out;
}

// Reallocation / "wave stealing" (BRIEF-2 §4b.7). Kill the least-useful active wave,
// re-spend its slot on the largest unexplained residual structure, LS re-solve, and
// keep the change only if it lowers the true model SSE. Returns { improved, sse }.
export function reallocateOne(model, region, gate, atomOpts, { seed = 1 } = {}) {
  const g = model.genome;
  const ranked = marginalContributions(model);
  if (ranked.length < 2) return { improved: false, sse: model.sse() };
  const victim = ranked[0].slot;
  const base = victim * GENES_PER_WAVE;
  const snapshot = g.data.slice(base, base + GENES_PER_WAVE);
  const sseBefore = model.sse();

  // remove the victim from the reconstruction, then fit a fresh atom to the residual
  setSwitch(g, victim, 'active', false);
  model.updateWave(victim);
  const residual = new Float64Array(model.winLen);
  for (let n = 0; n < model.winLen; n++) residual[n] = model.target[n] - model.recon[n];

  const fit = fitOneAtom(g, victim, residual, model.plan, region, gate, atomOpts);
  if (!fit) { g.data.set(snapshot, base); model.updateWave(victim); return { improved: false, sse: model.sse() }; }
  model.updateWave(victim);
  resolveGainsLS(model);
  const sseAfter = model.sse();
  if (sseAfter < sseBefore - 1e-9) return { improved: true, sse: sseAfter };
  // revert
  g.data.set(snapshot, base);
  model.updateWave(victim);
  resolveGainsLS(model);
  return { improved: false, sse: model.sse() };
}

// The anytime scheduler. Fills the budget with the portfolio above.
//   deadline    — Date.now() ms budget end (required to bound the run; null = a
//                 large default so a bare call still terminates by convergence)
//   epsilon     — relative per-epoch improvement below which an epoch is "stagnant"
//   patience    — consecutive stagnant epochs → declare convergence, exit early
//   reallocBatch— reallocation attempts per epoch
//   cdRounds    — coordinate-descent rounds per epoch slice
//   onImprove(sse, snapshot) — streaming best-so-far (crash-survivable)
//   onLog(msg)  — plain progress
// Returns { genome, sse, trueSSE, gap, epochs, converged, stageLog, marginPerHour }.
export function runSchedule(genome0, plan, {
  deadline = null, epsilon = 1e-4, patience = 6, reallocBatch = 6,
  cdRounds = 3, cmaesIters = 100, cmaesMaxGenes = 60, seed = 1,
  cdSliceMs = 150000, cmaesSliceMs = 90000,
  onImprove = null, onLog = null, target = null,
} = {}) {
  const log = onLog || (() => {});
  const t0 = nowMs();
  const hardEnd = deadline || (t0 + 6 * 3600 * 1000); // safety bound if no budget given
  const model = new AdditiveModel(genome0, plan);
  const tgt = target || model.target;

  const gate = detectGate(tgt, plan);
  const region = gate && gate.onsetWin != null
    ? { on: gate.onsetWin, off: gate.offsetWin + 1 }
    : { on: 0, off: plan.winLen };
  const atomOpts = { shapeSearch: true, ampEnv: true, pitchEnv: true };

  let best = model.snapshot();
  let bestSSE = model.sse();
  const stageLog = [];
  const stream = (sse) => { if (sse < bestSSE - 1e-12) { bestSSE = sse; best = model.snapshot(); if (onImprove) onImprove(sse, best); } };
  const record = (stage, before) => { const sse = model.sse(); stageLog.push({ stage, wallMs: nowMs() - t0, sseBefore: before, sseAfter: sse, active: activeCount(model.genome) }); stream(sse); return sse; };

  // 0. cheap wins first: gate-lock + global LS.
  let s = model.sse();
  lockGates(model); record('gate-lock', s);
  s = model.sse(); resolveGainsLS(model); record('ls-resolve', s);
  log(`  scheduler start: SSE ${model.sse().toExponential(4)} (${activeCount(model.genome)} waves)`);

  let epoch = 0, stagnant = 0;
  while (nowMs() < hardEnd && stagnant < patience) {
    const epochBefore = model.sse();
    const remaining = hardEnd - nowMs();
    // Bound each coordinate-descent slice so epochs cycle every few minutes — that
    // lets reallocation (high value, structural) and CMA-ES fire early and often
    // rather than after one giant front-loaded descent (BRIEF-2 §4a portfolio).
    const cdDeadline = Math.min(hardEnd, nowMs() + Math.max(2000, Math.min(cdSliceMs, remaining * 0.5)));

    // A. coordinate descent on the additive-safe genes.
    let before = model.sse();
    coordinateDescent(model, collectRefinableGenes(model.genome), { rounds: cdRounds, deadline: cdDeadline, onImprove: stream });
    record('cd', before);

    // B. reallocation batch (structural).
    before = model.sse();
    let realloc = 0;
    for (let i = 0; i < reallocBatch && nowMs() < hardEnd; i++) {
      const r = reallocateOne(model, region, gate, atomOpts, { seed: seed + epoch * 100 + i });
      if (r.improved) realloc++;
    }
    record('realloc', before);

    // C. re-solve gains + relock gates after structural moves.
    before = model.sse();
    resolveGainsLS(model); lockGates(model);
    record('ls+gate', before);

    // D. CMA-ES joint polish on the worst waves (every other epoch).
    if (nowMs() < hardEnd && (epoch % 2 === 0)) {
      before = model.sse();
      const genes = collectRefinableGenes(model.genome).slice(0, cmaesMaxGenes);
      const cmDeadline = Math.min(hardEnd, nowMs() + Math.max(2000, Math.min(cmaesSliceMs, (hardEnd - nowMs()) * 0.4)));
      cmaes(model, genes, { iters: cmaesIters, sigma0: 0.03, seed: seed + epoch, deadline: cmDeadline, onImprove: stream });
      record('cmaes', before);
    }

    const epochAfter = model.sse();
    const improve = (epochBefore - epochAfter) / Math.max(epochBefore, 1e-30);
    stagnant = improve < epsilon ? stagnant + 1 : 0;
    epoch++;
    log(`  epoch ${epoch}: SSE ${epochAfter.toExponential(4)} (Δ ${(improve * 100).toFixed(3)}%, realloc+${realloc}, ${activeCount(model.genome)} waves, ${stagnant}/${patience} stagnant)`);
  }

  const converged = stagnant >= patience;
  // commit the best snapshot into the model and reconcile against the true engine.
  const finalModel = new AdditiveModel(best, plan);
  const rec = finalModel.reconcile();
  const marginPerHour = computeMarginPerHour(stageLog);
  return { genome: best, sse: rec.trueSSE, modelSSE: bestSSE, gap: rec.gap, epochs: epoch, converged, stageLog, marginPerHour };
}

// Marginal gain per hour: over the stage log, the SSE drop per wall-hour in the
// last third of the run — the number the owner uses to decide what a future budget
// is worth (BRIEF-2 §5.5).
function computeMarginPerHour(stageLog) {
  if (stageLog.length < 2) return null;
  const last = stageLog[stageLog.length - 1];
  const twoThirds = stageLog[Math.floor(stageLog.length * 2 / 3)];
  const dMs = last.wallMs - twoThirds.wallMs;
  const dSSE = twoThirds.sseAfter - last.sseAfter;
  if (dMs <= 0) return null;
  return { dSSE, hours: dMs / 3600000, ssePerHour: dSSE / (dMs / 3600000) };
}
