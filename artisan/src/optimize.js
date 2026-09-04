// optimize.js — refinement on the TRUE engine (via the fast additive model).
//
// The constructive pass (construct.js) gives a strong start; this polishes it
// toward machine-zero. Three tools, applied in order of bang-per-render:
//   1. lockGates      — snap each wave's on/off boundaries to the exact integer
//                       sample (the dominant error on gated targets like 2wave).
//   2. coordinateDescent — adaptive per-gene local search over the additive-safe
//                       continuous genes (frequency, phase, gain, envelope nodes,
//                       gate). Elitist: never accepts a worse SSE.
//   3. cmaes          — a compact hand-rolled CMA-ES for joint polish where
//                       coordinate moves stall (correlated gene interactions).
//
// All searches run in STORED gene space ([0,1] float32), so what the optimiser
// sees is exactly what the delivered genome stores — there is no float64→float32
// "shine" to lose (BRIEF §5). Randomness is seeded and logged.

import { WAVE_SCHEMA, WAVE_INDEX, WAVE_SLOTS, reflect01, ENV_MAX_NODES, renderRaw } from './engine.js';
import { setGateSamples } from './genome-build.js';
import { AdditiveModel } from './additive-model.js';

// Collect refinable {slot, name} for every active wave — only genes that actually
// move the additive phenotype. Shape WEIGHTS are excluded: a single-shape wave is
// normalised by its enabled-weight sum, so its weight is inert. Gate genes are
// included only when the wave is genuinely gated (otherwise they just say "sound
// throughout" and should stay put). Envelope nodes included when the env is on.
export function collectRefinableGenes(genome) {
  const genes = [];
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (genome.getWave(w, 'active') < 0.5) continue;
    genes.push({ slot: w, name: 'pitch_master' });
    genes.push({ slot: w, name: 'phase' });
    genes.push({ slot: w, name: 'gain_out' });
    const gated = genome.getWave(w, 'mid_wait_on') >= 0.5 || genome.getWave(w, 'duty') < 0.999;
    if (gated) { genes.push({ slot: w, name: 'period' }); genes.push({ slot: w, name: 'duty' }); genes.push({ slot: w, name: 'pre_prop' }); }
    if (genome.getWave(w, 'amp_env_on') >= 0.5) {
      const nn = Math.max(2, Math.min(ENV_MAX_NODES, genome.getWave(w, 'amp_env_n_nodes')));
      for (let k = 0; k < nn; k++) {
        genes.push({ slot: w, name: `amp_node${k}_level` });
        genes.push({ slot: w, name: `amp_node${k}_time` });
        // curve/tension are low-impact shape tweaks between nodes; refining them
        // costs a full render each for little SSE, so the budget is better spent on
        // levels/times and more waves. (They stay at their fitted defaults.)
      }
    }
    if (genome.getWave(w, 'pitch_env_on') >= 0.5) {
      const nn = Math.max(2, Math.min(ENV_MAX_NODES, genome.getWave(w, 'pitch_env_n_nodes')));
      for (let k = 0; k < nn; k++) {
        genes.push({ slot: w, name: `pitch_node${k}_level` });
        genes.push({ slot: w, name: `pitch_node${k}_time` });
      }
    }
  }
  return genes;
}

// Derive a wave's current (preSamp, durSamp) from its timing genes.
function currentGate(genome, slot, sampleRate) {
  const period = genome.getWave(slot, 'period');
  const duty = genome.getWave(slot, 'duty');
  const preProp = genome.getWave(slot, 'pre_prop');
  const durS = duty * period, preS = preProp * period;
  return {
    preSamp: Math.max(0, Math.round(preS * sampleRate)),
    durSamp: Math.max(1, Math.round(durS * sampleRate)),
    midOn: genome.getWave(slot, 'mid_wait_on') >= 0.5,
  };
}

// Snap one wave's gate boundaries to the SSE-minimising integer samples via a
// coarse-to-fine 1-D hill climb on preSamp then durSamp. Only meaningful for
// play-once (midOn=false) gated waves; skips waves that sound throughout.
export function lockGate(model, slot, { radius = 400 } = {}) {
  const plan = model.plan;
  const rate = plan.sampleRate;
  const g = model.genome;
  if (g.getWave(slot, 'mid_wait_on') >= 0.5) return; // repeating gate: leave to CD
  // Only meaningful for waves that are actually gated shorter than the window.
  // A wave that sounds throughout (duty≈1) has no boundary to snap — skip it.
  if (g.getWave(slot, 'duty') >= 0.999) return;
  let { preSamp, durSamp } = currentGate(g, slot, rate);
  if (durSamp >= plan.winLen && preSamp === 0) return;
  const setGate = (pre, dur) => {
    setGateSamples(g, slot, { preSamp: pre, durSamp: dur, midSamp: 1, midOn: false, sampleRate: rate });
    return model.updateWave(slot);
  };
  let best = model.sse();
  for (let step = radius; step >= 1; step = Math.floor(step / 2)) {
    let improved = true;
    while (improved) {
      improved = false;
      // preSamp
      for (const d of [step, -step]) {
        const p = preSamp + d; if (p < 0) continue;
        const s = setGate(p, durSamp);
        if (s < best - 1e-12) { best = s; preSamp = p; improved = true; } else setGate(preSamp, durSamp);
      }
      // durSamp
      for (const d of [step, -step]) {
        const q = durSamp + d; if (q < 1) continue;
        const s = setGate(preSamp, q);
        if (s < best - 1e-12) { best = s; durSamp = q; improved = true; } else setGate(preSamp, durSamp);
      }
      if (step === 1 && !improved) break;
    }
  }
  setGate(preSamp, durSamp);
  return best;
}

// Snap a REPEATING (mid_wait) wave's burst timing to the SSE-minimising integer
// samples. A comb's spacing is set by the period (durSamp+midSamp) and its position
// by preSamp; coordinate descent in stored log-space nudges these but rarely lands
// the exact integer sample a comb needs, so a dedicated integer hill-climb on
// (durSamp, midSamp, preSamp) is the analog of lockGate for bursts. This is the
// single move that most reduces recover-6wave's residual (its 426 Hz gated comb).
export function lockRepeatingGate(model, slot, { radius = 200 } = {}) {
  const g = model.genome;
  if (g.getWave(slot, 'mid_wait_on') < 0.5) return; // only repeating gates
  const rate = model.plan.sampleRate;
  let { preSamp } = currentGate(g, slot, rate);
  const period = g.getWave(slot, 'period'), duty = g.getWave(slot, 'duty');
  let durSamp = Math.max(1, Math.round(duty * period * rate));
  let midSamp = Math.max(1, Math.round((1 - duty) * period * rate));
  const set = (pre, dur, mid) => { setGateSamples(g, slot, { preSamp: pre, durSamp: dur, midSamp: mid, midOn: true, sampleRate: rate }); return model.updateWave(slot); };
  let best = model.sse();
  for (let step = radius; step >= 1; step = Math.floor(step / 2)) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dp, dd, dm] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step], [0, 0, -step]]) {
        const p = preSamp + dp, d = durSamp + dd, m = midSamp + dm;
        if (p < 0 || d < 1 || m < 1) continue;
        const s = set(p, d, m);
        if (s < best - 1e-12) { best = s; preSamp = p; durSamp = d; midSamp = m; improved = true; }
        else set(preSamp, durSamp, midSamp);
      }
      if (step === 1 && !improved) break;
    }
  }
  set(preSamp, durSamp, midSamp);
  return best;
}

export function lockGates(model, opts = {}) {
  for (const slot of model.slots.slice()) {
    lockGate(model, slot, opts);
    lockRepeatingGate(model, slot, opts);
  }
  return model.sse();
}

// Adaptive coordinate descent in stored space. Each gene keeps its own step,
// halving on failure, growing on success. Elitist. Streams on improvement.
//   opts.rounds    — max full sweeps
//   opts.step0     — initial stored-space step
//   opts.minStep   — stop a gene when its step drops below this
//   opts.deadline  — Date.now() ms budget (optional)
//   opts.onImprove(sse) — streaming callback
export function coordinateDescent(model, genes, {
  rounds = 40, step0 = 0.02, minStep = 1e-7, deadline = null, onImprove = null,
} = {}) {
  const g = model.genome;
  const steps = new Map(genes.map((_, i) => [i, step0]));
  let best = model.sse();
  const idxOf = (name) => WAVE_INDEX[name];

  for (let round = 0; round < rounds; round++) {
    let anyImprove = false;
    for (let gi = 0; gi < genes.length; gi++) {
      if (deadline && Date.now() > deadline) return best;
      const { slot, name } = genes[gi];
      let step = steps.get(gi);
      if (step < minStep) continue;
      const base = slot * WAVE_SCHEMA.length + idxOf(name);
      const cur = g.data[base];
      let improvedGene = false;
      for (const dir of [1, -1]) {
        const trial = reflect01(cur + dir * step);
        g.data[base] = trial;
        const s = model.updateWave(slot);
        if (s < best - 1e-12) {
          best = s; improvedGene = true; anyImprove = true;
          if (onImprove) onImprove(best);
          steps.set(gi, Math.min(0.25, step * 1.3));
          break;
        } else {
          g.data[base] = cur; model.updateWave(slot);
        }
      }
      if (!improvedGene) steps.set(gi, step * 0.5);
    }
    if (!anyImprove) {
      // all genes at/near their min step → converged
      let alive = false;
      for (const s of steps.values()) if (s >= minStep) alive = true;
      if (!alive) break;
    }
  }
  return best;
}

// ── a compact CMA-ES over a chosen set of stored genes ───────────────────────
// Minimises model SSE. Standard (μ/μ_w, λ) with rank-μ + rank-one covariance
// update; genes clamped to [0,1] by reflection. Seeded RNG (logged). This is the
// joint-polish stage for correlated gene interactions coordinate descent misses.
export function cmaes(model, geneList, {
  iters = 200, popSize = null, sigma0 = 0.05, seed = 1, deadline = null, onImprove = null,
} = {}) {
  const N = geneList.length;
  if (N === 0) return model.sse();
  const lambda = popSize || (4 + Math.floor(3 * Math.log(N)));
  const mu = Math.floor(lambda / 2);
  // recombination weights
  const w = new Float64Array(mu);
  let wsum = 0;
  for (let i = 0; i < mu; i++) { w[i] = Math.log(mu + 0.5) - Math.log(i + 1); wsum += w[i]; }
  for (let i = 0; i < mu; i++) w[i] /= wsum;
  let mueff = 0; { let s = 0; for (let i = 0; i < mu; i++) s += w[i] * w[i]; mueff = 1 / s; }
  const cc = (4 + mueff / N) / (N + 4 + 2 * mueff / N);
  const cs = (mueff + 2) / (N + mueff + 5);
  const c1 = 2 / ((N + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((N + 2) ** 2 + mueff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (N + 1)) - 1) + cs;
  const chiN = Math.sqrt(N) * (1 - 1 / (4 * N) + 1 / (21 * N * N));

  const rng = mulberry32(seed >>> 0);
  const randn = () => { // Box-Muller
    let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const g = model.genome;
  const bases = geneList.map((x) => x.slot * WAVE_SCHEMA.length + WAVE_INDEX[x.name]);
  const mean = new Float64Array(N);
  for (let i = 0; i < N; i++) mean[i] = g.data[bases[i]];

  const C = identity(N);
  const pc = new Float64Array(N), ps = new Float64Array(N);
  let sigma = sigma0;
  let best = model.sse();
  const bestGenes = Float64Array.from(mean);

  const evalAt = (vec) => {
    const touched = new Set();
    for (let i = 0; i < N; i++) { g.data[bases[i]] = reflect01(vec[i]); touched.add(geneList[i].slot); }
    for (const slot of touched) model.updateWave(slot);
    return model.sse();
  };

  for (let iter = 0; iter < iters; iter++) {
    if (deadline && Date.now() > deadline) break;
    // sqrt of C via eigen (Jacobi) — N is small (subset), do it every few iters
    const { B, D } = eigen(C);
    const pop = [];
    for (let k = 0; k < lambda; k++) {
      const z = new Float64Array(N); for (let i = 0; i < N; i++) z[i] = randn();
      const y = new Float64Array(N);
      for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += B[i][j] * (D[j] * z[j]); y[i] = s; }
      const x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = mean[i] + sigma * y[i];
      const f = evalAt(x);
      pop.push({ x, y, z, f });
    }
    pop.sort((a, b) => a.f - b.f);
    if (pop[0].f < best - 1e-12) {
      best = pop[0].f; for (let i = 0; i < N; i++) bestGenes[i] = reflect01(pop[0].x[i]);
      if (onImprove) onImprove(best);
    }
    // recombine mean
    const oldMean = Float64Array.from(mean);
    const yw = new Float64Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < mu; k++) s += w[k] * pop[k].y[i]; yw[i] = s; mean[i] = oldMean[i] + sigma * s; }
    // update evolution paths
    // C^{-1/2} yw  ≈ B D^{-1} B^T yw
    const invSqrtYw = matVec(mulBDinvBt(B, D), yw);
    for (let i = 0; i < N; i++) ps[i] = (1 - cs) * ps[i] + Math.sqrt(cs * (2 - cs) * mueff) * invSqrtYw[i];
    let psNorm = 0; for (let i = 0; i < N; i++) psNorm += ps[i] * ps[i]; psNorm = Math.sqrt(psNorm);
    const hsig = psNorm / Math.sqrt(1 - Math.pow(1 - cs, 2 * (iter + 1))) / chiN < (1.4 + 2 / (N + 1)) ? 1 : 0;
    for (let i = 0; i < N; i++) pc[i] = (1 - cc) * pc[i] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * yw[i];
    // covariance update
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let rankMu = 0;
        for (let k = 0; k < mu; k++) rankMu += w[k] * pop[k].y[i] * pop[k].y[j];
        const rankOne = pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * C[i][j];
        C[i][j] = (1 - c1 - cmu) * C[i][j] + c1 * rankOne + cmu * rankMu;
      }
    }
    // step size
    sigma *= Math.exp((cs / damps) * (psNorm / chiN - 1));
    if (!(sigma > 1e-12) || !Number.isFinite(sigma)) sigma = sigma0; // guard
  }
  // commit best
  const touched = new Set();
  for (let i = 0; i < N; i++) { g.data[bases[i]] = bestGenes[i]; touched.add(geneList[i].slot); }
  for (const slot of touched) model.updateWave(slot);
  return model.sse();
}

// ── small linear-algebra helpers for CMA-ES (N is the gene-subset size) ──────
function identity(N) { const M = []; for (let i = 0; i < N; i++) { M.push(new Float64Array(N)); M[i][i] = 1; } return M; }
function matVec(M, v) { const N = v.length; const o = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += M[i][j] * v[j]; o[i] = s; } return o; }
// B diag(1/D) B^T  (i.e. C^{-1/2})
function mulBDinvBt(B, D) {
  const N = D.length; const M = [];
  for (let i = 0; i < N; i++) { M.push(new Float64Array(N)); for (let j = 0; j < N; j++) { let s = 0; for (let k = 0; k < N; k++) s += B[i][k] * (1 / D[k]) * B[j][k]; M[i][j] = s; } }
  return M;
}
// Jacobi eigen-decomposition of symmetric C → { B (columns=eigvecs), D (sqrt of eigvals) }.
function eigen(C) {
  const N = C.length;
  const a = C.map((r) => Float64Array.from(r));
  const V = identity(N);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
      if (Math.abs(a[p][q]) < 1e-20) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < N; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < N; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < N; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const D = new Float64Array(N);
  for (let i = 0; i < N; i++) D[i] = Math.sqrt(Math.max(1e-20, a[i][i]));
  return { B: V, D };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Orchestrated refinement: lock gates → coordinate descent → CMA-ES polish → a
// final coordinate-descent cleanup. Returns { genome, sse, trace } and reconciles
// with the true engine.
//   onCheckpoint(stage, sse, genomeSnapshot) — called at each stage boundary and,
//     throttled, on improvement during long searches (crash-survivable streaming).
//   onLog(msg) — plain progress lines.
export function refine(genome, plan, {
  rounds = 40, cmaesIters = 200, useCmaes = true, seed = 1, deadline = null,
  onCheckpoint = null, onLog = null, cmaesMaxGenes = 48, streamEveryMs = 8000,
} = {}) {
  const model = new AdditiveModel(genome, plan);
  const trace = [];
  let lastStream = 0;
  const checkpoint = (stage, sse, force = false) => {
    trace.push({ stage, sse, t: nowMs() });
    const now = nowMs();
    if (onCheckpoint && (force || now - lastStream > streamEveryMs)) { lastStream = now; onCheckpoint(stage, sse, model.snapshot()); }
  };
  const log = onLog || (() => {});

  checkpoint('start', model.sse(), true);
  lockGates(model);
  checkpoint('gates', model.sse(), true);
  log(`  after gate-lock: SSE ${model.sse().toExponential(4)}`);

  let genes = collectRefinableGenes(model.genome);
  coordinateDescent(model, genes, { rounds, deadline, onImprove: (s) => checkpoint('cd', s) });
  checkpoint('cd-done', model.sse(), true);
  log(`  after coordinate descent: SSE ${model.sse().toExponential(4)}`);

  if (useCmaes && (!deadline || nowMs() < deadline)) {
    genes = collectRefinableGenes(model.genome);
    const subset = genes.slice(0, cmaesMaxGenes);
    cmaes(model, subset, { iters: cmaesIters, sigma0: 0.03, seed, deadline, onImprove: (s) => checkpoint('cmaes', s) });
    checkpoint('cmaes-done', model.sse(), true);
    log(`  after CMA-ES: SSE ${model.sse().toExponential(4)}`);
    coordinateDescent(model, collectRefinableGenes(model.genome), { rounds: 12, deadline, onImprove: (s) => checkpoint('cd2', s) });
    checkpoint('final', model.sse(), true);
    log(`  after final polish: SSE ${model.sse().toExponential(4)}`);
  }

  const rec = model.reconcile();
  return { genome: model.snapshot(), sse: rec.trueSSE, modelSSE: rec.modelSSE, gap: rec.gap, trace };
}

function nowMs() { return Date.now(); }
