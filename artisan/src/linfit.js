// linfit.js — the closed-form heart of ARTISAN's amplitude fitting.
//
// KEY STRUCTURAL FACT (DECISIONS 2026-09-03): when no AM/PM couples the waves,
// the engine's mixed output is exactly a LINEAR combination of each wave's own
// contribution: render[n] = Σ_k a_k · basis_k[n], where basis_k is wave k rendered
// alone at unit linear gain and a_k is its linear output gain. So for a FIXED set
// of oscillator bases (shape, frequency, phase, envelope shape, gate), the gains
// that minimise the owner's SSE over the scored window are the ordinary
// least-squares solution — no search, no gradient, globally optimal. This is how
// ARTISAN threads amplitude "needles" that MIMIC's blind mutation could not.
//
// We solve the normal equations (BᵀB) a = Bᵀt with a small ridge for stability.
// K (number of waves) ≤ slot count, so a plain symmetric solve is ample.

// Solve (A + λI) x = b for a symmetric positive-(semi)definite A via Cholesky,
// falling back to a tiny extra ridge if not quite PD. A is K×K (row-major array of
// Float64Array rows), b length K. Returns Float64Array x.
export function solveSymmetric(A, b, ridge = 1e-9) {
  const K = b.length;
  // copy with ridge on the diagonal
  const M = [];
  let scale = 0;
  for (let i = 0; i < K; i++) scale = Math.max(scale, A[i][i]);
  const lam = ridge * (scale || 1);
  for (let i = 0; i < K; i++) {
    M.push(Float64Array.from(A[i]));
    M[i][i] += lam;
  }
  // Cholesky M = L Lᵀ
  const L = [];
  for (let i = 0; i < K; i++) L.push(new Float64Array(K));
  for (let i = 0; i < K; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = M[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) { // not PD — bump ridge and retry once
          if (ridge < 1e-3) return solveSymmetric(A, b, ridge * 100);
          sum = 1e-12;
        }
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  // forward solve L y = b
  const y = new Float64Array(K);
  for (let i = 0; i < K; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
    y[i] = sum / L[i][i];
  }
  // back solve Lᵀ x = y
  const x = new Float64Array(K);
  for (let i = K - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < K; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}

// Given K basis vectors (each a Float64Array/Float32Array over the scored window)
// and the target over the window, return the least-squares gains a[k] minimising
// Σ_n (Σ_k a_k basis_k[n] − target[n])². Also returns the resulting SSE.
//   bases  : array of K arrays, each length winLen
//   target : array length winLen
export function leastSquaresGains(bases, target, ridge = 1e-9) {
  const K = bases.length;
  const winLen = target.length;
  if (K === 0) {
    let sse = 0; for (let n = 0; n < winLen; n++) sse += target[n] * target[n];
    return { gains: new Float64Array(0), sse };
  }
  // Gram matrix BᵀB and Bᵀt
  const G = [];
  for (let i = 0; i < K; i++) G.push(new Float64Array(K));
  const bt = new Float64Array(K);
  for (let i = 0; i < K; i++) {
    const bi = bases[i];
    for (let j = i; j < K; j++) {
      const bj = bases[j];
      let dot = 0;
      for (let n = 0; n < winLen; n++) dot += bi[n] * bj[n];
      G[i][j] = dot; G[j][i] = dot;
    }
    let dt = 0;
    for (let n = 0; n < winLen; n++) dt += bi[n] * target[n];
    bt[i] = dt;
  }
  const gains = solveSymmetric(G, bt, ridge);
  // SSE = |t|² − 2 aᵀ(Bᵀt) + aᵀ(BᵀB)a
  let tt = 0; for (let n = 0; n < winLen; n++) tt += target[n] * target[n];
  let cross = 0; for (let i = 0; i < K; i++) cross += gains[i] * bt[i];
  let quad = 0;
  for (let i = 0; i < K; i++) { let s = 0; for (let j = 0; j < K; j++) s += G[i][j] * gains[j]; quad += gains[i] * s; }
  const sse = Math.max(0, tt - 2 * cross + quad);
  return { gains, sse };
}
