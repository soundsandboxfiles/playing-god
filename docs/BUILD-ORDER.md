# Build order and gates

Four stages, separated by acceptance gates. **A gate is a stop condition, not a
review point.** Three of them test assumptions the downstream design depends on.

Hand a build agent **one stage at a time**. Given the whole specification it
will build the whole system, which is exactly what the gates exist to prevent.

---

## Which gates can run without a human

| Gate | What it tests | Autonomous? |
|---|---|---|
| **1a** Generation-zero listenability | is any random Creature worth hearing | **No — needs ears, by construction** |
| **1b-mech** Lineage stack | `B` returns correctly to arbitrary depth | Yes |
| **1b-perc** Sibling resemblance | does `M` give siblings or strangers | No — but subsumed by 2a, which measures it objectively |
| **2a** Genotypic locality | MFCC distance vs mutation ε; `J_class` table | **Yes, fully** |
| **2b** Behavioural locality | `p_same`, `p_near`, `H_cell` | **Yes, fully** |
| **3-plumbing** Archive machinery | cells fill, eviction fires, servo moves, logs reconstruct | Yes — with a synthetic dwell source |
| **3-real** Archive progress | 40 cells, 15 at depth ≥3, mean fitness rising | No — needs 1,000 real listens |
| **4** Predictor | Spearman ρ ≥ 0.40 | No — needs 2,000 real listens |

### Why Gate 1a cannot be automated, and should not be

"Is anything in here worth hearing" requires a listener. Any proxy metric
standing in for it — spectral interest, novelty, complexity, anything — would
be a claim about what sounds are good, written into the machinery that decides
whether to proceed. That is precisely the failure mode the invariants forbid,
and it has already occurred three times during design.

The first invariant is the reason this gate needs a human. That makes it a
principled boundary rather than an inconvenience.

### Synthetic dwell is for plumbing only

Gate 3-plumbing may drive the archive with a synthetic dwell source (e.g.
uniform random seconds) to verify that cells fill, eviction fires, protection
holds, the servo moves and logs round-trip. It proves the machinery runs.

It proves **nothing** about the search, and no conclusion about behaviour,
convergence or quality may be drawn from a synthetic-dwell run. Label every
such run `SYNTHETIC` in the logs so no later reader mistakes it for evidence.

---

## Stage 1 — Generator

Build: genome structure (§3), priors (§5), synthesis including the modulation
matrix and cycle handling (§4), `SPACE` / `M` / `B` with the lineage stack,
dwell logging with attention gating (§8.3), the repeat cooldown (§8.5), the
legibility display (§12.1), and §14 logging for all of the above.

- **Gate 1b-mech** — automated. Lineage stack correctness at arbitrary depth.
- **Gate 1a** — human. 100 pre-rendered random genomes, auditioned. At least 10
  hold a listener past 10 seconds.

## Stage 2 — Locality calibration

Build: `gates/gate2a-locality.js`, `gates/gate2b-behavioural.js`, and the MFCC
implementation they share. Hand-roll MFCC rather than adding a dependency —
it is ~100 lines and keeps the container hermetic.

- **Gate 2a** — automated. Continuous-gene criterion: p90 < 0.20·U at ε = 0.01.
  Produces the `J_class` table, which sets the switch flip rates.
- **Gate 2b** — automated. `p_same ≥ 0.35` and `p_near ≥ 0.70`, mutation-only.

**Gate 2b is the decision point for everything downstream.** If it fails, the
archive design itself may change — coarser grid, different descriptors, or a
switch to adaptive-sampling MAP-Elites. Building the archive before 2b passes
risks throwing it away. Stop here and report.

## Stage 3 — Archive

Only after 2b passes. Build: descriptors (§7.1), deep cells with random-eviction
maintenance and newcomer protection (§7.2, §7.4), rank-based cell and in-cell
selection with lexicographic parsimony (§7.3), offspring yield (§7.6),
similarity-weighted multi-parent crossover (§6.4–6.8), duplication (§6.3),
provenance tracking (§8.2), the render-length servo (§9).

- **Gate 3-plumbing** — automated, synthetic dwell.
- **Gate 3-real** — human. 1,000 real listens.

## Stage 4 — Predictor

Only after 2,000 attended listens exist. **Gate 4** before any autonomous run.

---

## The overnight run

Everything up to and including Gate 2b is autonomous. A run left unattended
should:

1. Build Stage 1 and its logging. Run Gate 1b-mech.
2. Render 100 random genomes to files and stage them in a listening harness,
   ready to open. Do not attempt to judge them.
3. Build Stage 2. Run Gates 2a and 2b. Write artefacts to
   `output/gate-artefacts/`.
4. **Branch on Gate 2b.**
   - **Pass** → build Stage 3 and run Gate 3-plumbing with synthetic dwell.
   - **Fail** → stop. Do not build Stage 3. Report `p_same`, `p_near`, `H_cell`
     and which of the specification's §13.3 fixes the numbers point to.
5. Write `output/OVERNIGHT-REPORT.md`: what was built, gate results with
   measured numbers against thresholds, anything in the specification found
   ambiguous or contradictory, and what is waiting for a human.

Note that Stage 3 work is not wasted if **Gate 1a** later fails — the archive,
servo and logging are correct regardless of whether generation zero sounds
good, and a 1a failure is fixed in the priors (§5). It *is* wasted if Gate 2b
fails, which is why 2b is the branch point and 1a is not.

---

## Other human-in-the-loop dependencies

- **No audio device in the container.** Nothing can be heard there. Everything
  up to the SAMPLES tier is testable headlessly; AUDIO is not.
- **No browser in the container.** Hence `src/` must be Node-importable with no
  DOM. A prior sandbox run on another project crashed Chromium at page load;
  do not build gates that need a browser.
- **Archive axis ranges** need calibrating against observed distributions.
  Automatable inside the overnight run; report the observed ranges.
- **Pushing to a remote.** The sandbox snapshot excludes `.git/`, so the
  container cannot push. Commits and pushes happen host-side after
  `sync-back.sh`.
