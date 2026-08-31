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
  > **Threshold amended by the owner, 2026-08-31 (F5, V2-PROPOSALS).** Mid-audition
  > Jon lowered the hold threshold from **10 s to 5 s** — "at absolute random 10
  > seemed like too steep an ask" — and PASSED the gate on that basis: 13 of 38
  > auditioned held past 5 s (the absolute count 13 also clears the original
  > 10-of-100 bar). See `output/gate-artefacts/gate1a-verdict.md`. The 5 s figure
  > is the standing pass condition for future 1a batches unless the owner revises
  > it again. Note this is a threshold on the *human's* attention, not a proxy
  > metric — the gate still needs ears and still judges nothing itself.

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
   ready to open. Do not attempt to judge them. (Pass threshold amended to 5 s,
   2026-08-31 — see the Gate 1a note above, F5.)
3. Build Stage 2. Run Gates 2a and 2b. Write artefacts to
   `output/gate-artefacts/`.
4. **Branch on Gate 2b.**
   - **Pass** → **build everything.** Stage 3 in full, Gate 3-plumbing with
     synthetic dwell, and the §14 logging, §8.6 annotation field and export
     path. Do not stop to wait for a human to run Gate 1a. See below.
   - **Fail** → stop. Do not build Stage 3. Report `p_same`, `p_near`, `H_cell`
     and which of the specification's §13.3 fixes the numbers point to.
5. Write `output/OVERNIGHT-REPORT.md`: what was built, gate results with
   measured numbers against thresholds, anything in the specification found
   ambiguous or contradictory, and what is waiting for a human.

### Why the run does not stop for Gate 1a

The owner's time is the scarce resource, not the agent's. Waiting overnight for
a human verdict before building the rest would cost a return trip to a coding
agent, and the risk it avoids is smaller than it looks.

**The only gate that can invalidate the architecture is Gate 2b, and it needs
no human.** If behavioural locality fails, the archive design itself may change
— coarser grid, different descriptors, or adaptive-sampling MAP-Elites — so
that work would genuinely be thrown away. The machine can determine this on its
own, overnight, before committing to the archive layer.

A **Gate 1a** failure is a different shape entirely. It says generation zero is
not worth listening to, and the fix is in the priors (§5, §5.1). The archive,
selection, fitness, servo, logging and annotation machinery are all still
correct — they do not care whether the sounds being fed through them are any
good. That work is *premature*, not wasted.

So: build through to completion once 2b passes. The genuinely at-risk work is
already gated by something fully automatable, and the residual downside is some
possibly-early code rather than a wrong architecture.

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
