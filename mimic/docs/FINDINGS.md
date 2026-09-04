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
- **M3 (per-island stats)** would let convergence be split by island and turn
  the crown-trade inference into direct measurement.
