// predictor.js — P6, the SHADOW PREDICTOR (spec §10; V2-PROPOSALS "P6"). Two tiny,
// hand-rolled models trained incrementally between listens. DOM-free and node-testable.
//
// THE RULE THIS MODULE LIVES UNDER (unchanged, plus predictor law):
//   • Shadow predictions influence NOTHING — not selection, eviction, or rendering.
//     They are shown beside each listen and scored; that is all (§10, P6).
//   • Every PREDICTED (autonomously assigned) record is EXCLUDED from the accuracy
//     metrics (it must not grade its own homework) AND from the training data (no
//     training on its own outputs). This module only ever `observe()`s REAL,
//     attended, human dwells — the caller must never feed it a PREDICTED record.
//   • The predictor operates on GENOME features and therefore performs no audio
//     renders (§10.2). The "creature" model is genome-only; its Spearman ρ is the
//     ONLY number the on-screen autonomy WISDOM keys on (ρ ≥ 0.40 guidance).
//
// TWO MODELS, split by the owner's own catch (P6):
//   • CREATURE model — genome-derived features ONLY (no session context). This is the
//     thing autonomy actually needs: judging a creature without knowing when/where it
//     was heard. Its ρ gates the WISDOM text.
//   • SESSION model — creature features + hour-of-day + session position + the last K
//     human dwells + listener id. Better at next-dwell prediction, worse at its real
//     job; the GAP between the two accuracies measures how much of dwell is context
//     rather than creature (a finding in its own right, P6).
//
// HONESTY ABOUT SCALE (P6): at a few hundred listens the creature model's ρ will be
// poor. That is the point of showing it — calibrated trust, built in public, on the
// spec's own health metric. The model is deliberately TINY (an ensemble of small
// MLPs) because it is retrained between listens in a browser, and because a big model
// on a few hundred points would overfit and lie.

export const PRED_K = 5;        // last-K human dwells fed to the session model (recorded)
export const ENSEMBLE = 6;      // ensemble size — mean for prediction, std for LCB (§10.2)
export const HIDDEN = 10;       // hidden units per tiny MLP
export const DWELL_FLOOR = 0.35; // §8.3 MIN_DWELL_S — the smallest real dwell
const LR = 0.03;                // SGD step (online, between listens)
const STEPS_PER_OBS = 4;        // a few SGD steps per new real observation

// ── deterministic RNG (self-contained so the module needs no imports) ─────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ── genome-derived creature features (the SAME vector from a live genome or a stored
// listen record, so the model warm-starts from IndexedDB history and predicts live) ──
// Fields used all exist in the §14.1 listen schema (active_wave_count, complexity,
// modulation_edge_count, has_feedback_cycle, expressed_parameter_count) — every one a
// function of the GENOME, never of the audio or the dwell. Five features: tiny on
// purpose (§ honesty about scale).
export function creatureFeaturesFromScalars(s) {
  return [
    clamp01((s.active_wave_count || 0) / 10),
    clamp01((s.complexity || 0) / 400),
    clamp01((s.modulation_edge_count || 0) / 12),
    s.has_feedback_cycle ? 1 : 0,
    clamp01((s.expressed_parameter_count || 0) / 600),
  ];
}

// Session-only extras appended to the creature vector for the session model.
// context: { hour (0-23), session_pos (listen index), last_dwells:[...], listener_idx (0..) }
export function sessionExtras(ctx) {
  const hour = ((ctx && ctx.hour) || 0);
  const ang = (hour / 24) * 2 * Math.PI;
  const pos = clamp01(((ctx && ctx.session_pos) || 0) / 600);
  const last = (ctx && ctx.last_dwells) || [];
  const kv = [];
  for (let i = 0; i < PRED_K; i++) {
    const d = last[last.length - 1 - i];
    kv.push(d != null ? clamp01(d / 30) : 0.0); // normalise by a 30 s scale; missing → 0
  }
  const listener = (ctx && ctx.listener_idx) || 0;
  return [Math.sin(ang) * 0.5 + 0.5, Math.cos(ang) * 0.5 + 0.5, pos, ...kv, listener > 0 ? 1 : 0];
}

// ── a tiny 1-hidden-layer MLP (tanh), predicts a STANDARDISED target ──────────
class TinyMLP {
  constructor(nIn, seed) {
    const r = mulberry32(seed);
    this.nIn = nIn; this.nH = HIDDEN;
    this.W1 = Array.from({ length: this.nH }, () => Array.from({ length: nIn }, () => (r() - 0.5) * 0.8));
    this.b1 = Array.from({ length: this.nH }, () => 0);
    this.W2 = Array.from({ length: this.nH }, () => (r() - 0.5) * 0.8);
    this.b2 = 0;
    this._r = r;
  }
  forward(x) {
    const h = new Array(this.nH), a = new Array(this.nH);
    for (let j = 0; j < this.nH; j++) {
      let z = this.b1[j];
      const w = this.W1[j];
      for (let i = 0; i < this.nIn; i++) z += w[i] * x[i];
      a[j] = z; h[j] = Math.tanh(z);
    }
    let y = this.b2;
    for (let j = 0; j < this.nH; j++) y += this.W2[j] * h[j];
    return { y, h, a };
  }
  // One SGD step on standardised target t (MSE).
  trainStep(x, t, lr) {
    const { y, h } = this.forward(x);
    const dy = (y - t); // dL/dy
    // output layer
    for (let j = 0; j < this.nH; j++) this.W2[j] -= lr * dy * h[j];
    this.b2 -= lr * dy;
    // hidden layer
    for (let j = 0; j < this.nH; j++) {
      const dh = dy * this.W2[j] * (1 - h[j] * h[j]);
      const w = this.W1[j];
      for (let i = 0; i < this.nIn; i++) w[i] -= lr * dh * x[i];
      this.b1[j] -= lr * dh;
    }
  }
}

// ── the predictor: an ensemble + running target standardisation ───────────────
export class DwellPredictor {
  // kind: 'creature' | 'session'. nIn is set on first observe/predict from the vector.
  constructor(kind) {
    this.kind = kind;
    this.members = null; // built lazily once nIn is known
    this.nIn = null;
    // running log-dwell mean/var (Welford) for target standardisation.
    this._n = 0; this._mean = 0; this._M2 = 1e-6;
    this.n_observations = 0; // REAL attended observations trained on (never PREDICTED)
  }
  _ensure(nIn) {
    if (this.members) return;
    this.nIn = nIn;
    this.members = Array.from({ length: ENSEMBLE }, (_, m) => new TinyMLP(nIn, 0x9e37 + m * 101 + (this.kind === 'session' ? 7 : 0)));
  }
  get sd() { return Math.sqrt(this._M2 / Math.max(1, this._n)); }
  _updateTargetStats(logd) {
    this._n++; const d = logd - this._mean; this._mean += d / this._n; this._M2 += d * (logd - this._mean);
  }
  // Observe a REAL, attended dwell (never a PREDICTED record — caller enforces).
  observe(vec, dwell) {
    this._ensure(vec.length);
    const logd = Math.log(Math.max(DWELL_FLOOR, dwell));
    this._updateTargetStats(logd);
    const sd = this.sd || 1;
    const t = (logd - this._mean) / sd;
    for (const mem of this.members) for (let s = 0; s < STEPS_PER_OBS; s++) {
      // per-member bootstrap: occasionally skip, so members diverge → honest std.
      if (mem._r() < 0.25) continue;
      mem.trainStep(vec, t, LR);
    }
    this.n_observations++;
  }
  // Predict dwell for a feature vector. Returns seconds + the LCB acquisition value
  // (§10.2: mean − k·std, in log space) + raw ensemble spread.
  predict(vec, L, k = 1.0) {
    this._ensure(vec.length);
    const sd = this.sd || 1;
    const ys = this.members.map((m) => m.forward(vec).y * sd + this._mean); // log-dwell per member
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let v = 0; for (const y of ys) v += (y - mean) * (y - mean); const std = Math.sqrt(v / ys.length);
    const ceil = L || 300;
    const dwell = Math.min(ceil, Math.max(DWELL_FLOOR, Math.exp(mean)));
    const lcb = Math.min(ceil, Math.max(DWELL_FLOOR, Math.exp(mean - k * std)));
    return { dwell, lcb, mean_log: mean, std_log: std, ready: this.n_observations >= 8 };
  }
  // Serialise / restore (so the app can persist the model across a session if wanted).
  toJSON() { return { kind: this.kind, nIn: this.nIn, n: this._n, mean: this._mean, M2: this._M2, n_obs: this.n_observations, members: this.members && this.members.map((m) => ({ W1: m.W1, b1: m.b1, W2: m.W2, b2: m.b2 })) }; }
}

// ── metrics: rolling Spearman ρ + MAE, and the rolling-median naive baseline ───
export function spearman(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(n);
    let i = 0;
    while (i < n) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
    return r;
  };
  const ra = rank(a), rb = rank(b);
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}

function median(arr) {
  if (arr.length === 0) return DWELL_FLOOR;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Tracks the last N (prediction, actual) pairs for a model AND the naive baseline,
// and reports rolling Spearman ρ + MAE for each. The baseline predicts the rolling
// median of PRIOR actual dwells (a varying, honest "no-skill" reference).
export class RollingScore {
  constructor(n = 40) { this.n = n; this.pairs = []; this.actuals = []; this.baselinePairs = []; }
  setWindow(n) { this.n = Math.max(5, n | 0); this._trim(); }
  _trim() { while (this.pairs.length > this.n) this.pairs.shift(); while (this.baselinePairs.length > this.n) this.baselinePairs.shift(); }
  // Call BEFORE observing the actual: record the model's prediction and the naive
  // baseline's prediction (rolling median of prior actuals), then the actual.
  record(pred, actual) {
    const basePred = median(this.actuals.slice(-this.n));
    this.pairs.push([pred, actual]);
    this.baselinePairs.push([basePred, actual]);
    this.actuals.push(actual);
    if (this.actuals.length > 2000) this.actuals.shift();
    this._trim();
  }
  _stats(pairs) {
    if (pairs.length < 3) return { rho: null, mae: null, n: pairs.length };
    const p = pairs.map((x) => x[0]), a = pairs.map((x) => x[1]);
    const mae = p.reduce((s, v, i) => s + Math.abs(v - a[i]), 0) / p.length;
    return { rho: spearman(p, a), mae, n: pairs.length };
  }
  model() { return this._stats(this.pairs); }
  baseline() { return this._stats(this.baselinePairs); }
}
