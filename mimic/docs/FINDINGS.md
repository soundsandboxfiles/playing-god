# MIMIC — empirical findings on the search landscape

What we actually observe when the GA runs, as opposed to the design intent
(FITNESS.md) and the decisions (DECISIONS.md). Add to this as runs complete.

---

## Gene-convergence dynamics (first established: speech run, 2026-09-04)

**Source.** `output/speechsignalprocessing-island-p600g9999999-s903` — island
GA, pop 600, seed 903, 3,614 generations in 24 h, 146 genomes saved every 25
gens (final SSE 172.79, 57.6 % below the 407.25 silence floor; clock-limited,
still improving at the cap). Artefacts live in that run folder:
`final-report.html`, `gene-convergence.html` (+ `-data.json`). Reproduce with
`node mimic/tools/gene-convergence.mjs <run-dir>`.

**Method.** For every *continuous* gene that is expressed in the final creature
(its wave switched on, final on-stretch ≥ 4 saves) and actually moved, take its
trajectory across saves, shift so the final value = 0 and scale so the start =
+1 (Jon's normalization; the sign flip is automatic). Then re-base each gene to
**its own activation generation** and average across genes — the **event-study /
peri-event-time alignment** (see `CONTEXT/personal/independent-derivations.md`,
2026-09-04). Founding and late-onset genes then share an origin.

**Findings.**

1. **Content genes converge by punctuated fixation, not smooth annealing.** On
   the calendar axis they sit flat, then jump *together* on the crown-trade
   generations — whole-genome champion swaps between rival lineages. This is
   lineage takeover / **fixation by takeover**, the GA analogue of *punctuated
   equilibrium*. Crown trades cluster in the first ~800 generations and thin out
   after (35 detected).

2. **Aligned to each gene's own birth, the population shows genuine annealing —
   with a lag.** Across all 1,576 qualifying genes the median holds near its
   birth value for ~250 generations, then relaxes: halfway at ~600 gens after
   onset, effectively settled by ~1,000 (τ ≈ 900 gens). The mean rides just
   above a matched exponential. The lag is the mechanism showing through — a
   gene doesn't move until its lineage starts winning, then converges fast.

3. **A "founding waves only" cut is badly unrepresentative.** The gen-0 champion
   had just 4 active waves, so filtering to genes active at *both* ends profiles
   ~1/15 of the final 62-wave creature and makes convergence look front-loaded
   (those genes rode the initial error collapse). Always include late-onset
   genes and birth-align. (Jon caught this; it changed the conclusion.)

4. **Convergence speed is role-dependent.** Modulation depths snap to their final
   value almost instantly at birth; envelope shapes, pitch nodes and envelope
   times relax over ~800 gens. Coarse routing decisions fix fast; shaping details
   anneal slowly.

5. **The textbook annealing curve lives in the META-genes, not the content
   genes.** `sigma_global` rose ~6× to gen 1,000 then annealed ~20-fold into the
   endgame; `mutation_fraction` annealed to ~0.007 (see the metagenes chart).
   Content genes fix faster than that. Cross-ref **P12** (V2-PROPOSALS): the cont
   meta-genes gate their own mutation, the self-referential loop Jon diagnosed.

**Caveats (read before trusting a curve).** Saves are the single global champion,
so whole-genome swaps appear as synchronized steps (a feature — the plot
re-derives the crown trades). 1-in-25 sampling rounds the staircase's corners.
The endpoint "0" is imposed (the run was clock-limited, not converged). Small-
displacement genes yanked during a late crown trade normalize to large out-of-
frame excursions — faithful to the recipe, not rendering noise.

## To extend

- **Re-run on the two 24 h chimes runs at completion** — `chimes-24h-random`
  (random start) and `chimes-24h-artisan` (ARTISAN-seeded start). Logged as
  **M4** in `docs/V2-PROPOSALS.md`. The A/B is the interesting part: a seeded
  start should show a *shorter τ and fewer early crown trades* (less lineage
  churn) than a random start. One command each:
  `node mimic/tools/gene-convergence.mjs output/chimes-24h-random`.
- **Score structure & difficulty at completion** —
  `node tools/structural-decomp.mjs <run-dir> --curve`. Reports the
  loudness-free structural residual (1 − corr²) and the **correlation ceiling**
  for the champion. Rank targets by the ceiling, not by their %-of-floor curves —
  those overlay across very different difficulties (see the cross-target overlay
  finding above).
- **M3 (per-island stats)** would let convergence be split by island and turn
  the crown-trade inference into direct measurement.

---

## Cross-target normalised-curve overlay: chimes vs speech (2026-09-05)

**The observation (Jon).** Plotted as *error ÷ own silence floor* (the dashboard's
"% of the score a silent creature gets"), the `chimes-24h-random` descent and the
first ~887 gens of the speech run lie almost on top of each other — despite chimes
being ~5× longer (9.5 s / 209,475 samples, floor 7,976) than speech (1.85 s /
~40,700 samples, floor 407; ~20× the absolute floor, ~3.8× energy per sample).

**How close.** Over shared gens 0–887, the two %-of-floor curves track at Pearson
**r = 0.988, mean abs gap 2.6 pts** — tightest through ~gen 300, then chimes drifts
**~4–5 pts above** speech (lagging) by gen 887.

**Why (three layers, in order of how much they matter).**

1. **The axis is scale-free by construction.** SSE is *extensive* (grows with
   sample count); the silence floor Σt² is extensive in the same way, so SSE/floor
   is *intensive* — a per-sample normalised error. Algebraically it is **1 − R²**
   (coefficient of determination about a zero baseline; audio is ~zero-mean). R² is
   dimensionless and scale-invariant, so length and loudness **cancel**. The two
   *different* extensive scalings here (duration AND amplitude) both vanish. Bonus:
   normalised SSE is **self-averaging** — the longer target gives a *lower-variance*
   fitness signal per generation, not a harder problem. Length helps the signal.

2. **The search clock is identical.** Both runs: pop 600, 4 islands, migInterval 10,
   elitism 2, mutationScale 1.0, crossoverRate 0.5, seeds 903/904. The GA lives in
   fixed-dimensional genome space (64 wave slots), so evaluations and selection
   pressure per generation are target-independent. Progress-per-*generation* is a
   property of the search, not the target. (Target length only moves wall-clock:
   pace 172 s vs 190 s/gen, both climbing as herds get heavier.)

3. **The residual is ~entirely structural, NOT loudness.** Gain-optimal
   decomposition of each champion (best single global gain k* removed):

   | genome            | %floor (raw) | struct 1−corr² | loudness gap | k*   | corr  |
   |-------------------|-------------:|---------------:|-------------:|-----:|------:|
   | SPEECH gen0       |       100.0% |         100.0% |        0.0% |0.599 | 0.018 |
   | SPEECH champion   |        42.4% |          42.4% |        0.0% |1.014 | 0.759 |
   | CHIMES-rnd gen0   |       100.0% |    (silent)    |        —    |0.000 |  —    |
   | CHIMES-rnd g875   |        64.2% |          64.1% |        0.0% |1.032 | 0.599 |
   | CHIMES-art g550   |        21.6% |          21.6% |        0.0% |1.017 | 0.885 |

   The **loudness gap is ~0 everywhere** and k*→1 within a few generations: the GA
   fixes global gain essentially for free, because matching gain on an *uncorrelated*
   render buys ~0 SSE (min_k Σ(kr−t)² → Σt² when corr≈0). So the %-of-floor axis you
   watch **is 1 − corr²** — the squared waveform correlation climbing — and the whole
   descent is phase-sensitive *structural* alignment from gen 0. (This corrects the
   earlier live-session guess that the shared early drop was "loudness discovery" —
   it isn't; the peak-amplitude ramp is real but contributes ~nothing to SSE until
   correlation exists.)

**What the overlay HIDES — the actual difficulty difference.** Read the correlation
ceiling, not the early overlap. At matched effort chimes climbs to a *lower*
correlation (0.599 at g875, still rising) than speech (0.759 at its champion): a
static 64-wave bank aligns better with a ~stationary 1.85 s speech snippet than with
a 9.5 s sequence of *sequential* bell strikes (a melody — time-varying content a
constant wave bank can only partly track). The curves overlay through the shared
early climb and **peel apart from ~gen 500** exactly where the remaining error stops
being generic and becomes target-specific structure. Chimes will plateau at a worse
%-of-floor; that gap is the cleanest available estimate of how much harder a
time-varying target is for a static bank — squarely the thing BRIEF-3 (tracks &
voices) and IMPRESSIONIST are meant to attack.

**Takeaway (Jon's framing, endorsed).** Not "the metric is wrong" — SSE/floor is
doing its job (cross-target comparability). The caution is methodological: **overlaid
normalised curves ≠ equal difficulty.** A scale-free goodness-of-fit ratio is, by
construction, blind to absolute difficulty; two targets can share an early
%-of-floor trajectory and have very different reachability ceilings. Judge difficulty
by the plateau / correlation ceiling, never by the early overlap.

*Note on the `sse-normalized` diagnostic:* it is SSE ÷ target energy = **the same
%-of-floor axis**, so it does NOT isolate structure. The loudness-free view is the
gain-optimal residual **1 − corr²** used above (per champion: render at 22050 over
window = target length; residFrac = SSE/Σt², struct = 1 − (Σrt)²/(Σrr·Σtt),
k* = Σrt/Σrr, corr = Σrt/√(Σrr·Σtt)). Loudness is a non-factor, so 1 − corr² ≈ the
raw axis at every champion.

*Packaged as a tool (2026-09-05):* `tools/structural-decomp.mjs`. Run
`node tools/structural-decomp.mjs <run-dir> [--target-name chimes|speech | --target <wav>] [--curve] [--json]`.
It prints this decomposition for the champion (and per saved generation with
`--curve`, so you can watch `corr` climb and see where it plateaus), auto-resolves
the target from `configs/<run>.json` when present, and **self-checks** its rendered
SSE against the run's recorded score (drift shown; ⚠ if >1%). Read-only; writes
only `<run-dir>/structural-decomp.json`, and only with `--json`.
