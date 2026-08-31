# Welcome, Josh — start here

Procedural sound generator where creatures are **evolved, not designed**;
fitness is measured listening time and nothing else. Vanilla JS, zero
dependencies, no build step. You need node ≥ 18 and python3 (or any static
server) — nothing else.

## Run it (60 seconds)

```
git clone <this repo>
cd playing-god
python3 -m http.server 8766
# open http://localhost:8766/app/index.html
```

Press any key — a creature plays. `Space` next · `M` mutate · `B` back up the
lineage · `K` favourite · `F` annotate · `P` pause · `E` export logs · `V`
visuals. The port matters on a given machine (browser storage is per-origin —
8766 is canonical), but any port works on a fresh machine.

## Read in this order

1. `README.md` — the project's own front door.
2. `playing-god-spec.md` — the complete design. **Every value is a decision,
   not a suggestion**; §2's invariants govern everything.
3. `docs/BUILD-ORDER.md` — stages and gates, and why gates are stop signs.
4. `docs/DESIGN-HISTORY.md` — **the why-ledger**: the reasoning behind every
   constant, decisions taken against instinct (both directions) with reasons,
   and the full build history. Feed this to your Claude and ask it "why is
   such-and-such the way it is". `docs/VASTNESS-IS-THE-POINT.md` is the
   governing value it keeps citing.
5. `docs/V2-PROPOSALS.md` — the running design ledger: every post-v1 change,
   the owner's rulings, and the open queue (v2.3 at the bottom).
6. `output/V2.2-REPORT.md` (then V2.1, then OVERNIGHT-REPORT) — what was
   built, what the gates measured, what failed and why that was the system
   working.
7. `docs/SPEC-DELTA-V2.md` — spec amendments not yet folded into the spec.

Some docs reference `Cowork/CONTEXT/...` paths — that's Jon's private notes
vault, not in this repo. The project-relevant content of those notes IS here,
as `docs/DESIGN-HISTORY.md` and `docs/VASTNESS-IS-THE-POINT.md`.

## Verify the machine (all headless, plain node, from the repo root)

```
node gates/gate1b-mech.js         # lineage stack, bit-exact
node gates/gate2b-geomsweep.js    # THE decision gate across grid geometries (~13 min)
node gates/gate3-plumbing.js      # archive machinery, both modes (SYNTHETIC)
node gates/race.js                # deep@8x8 vs adaptive@16x16 (~15 min)
node gates/predictor-check.js     # predictor pipeline soundness
node gates/smoke-modes.js         # both archive modes end-to-end
```

Gate evidence lives in `output/gate-artefacts/` (JSON, committed). The WAV
audition batches are deliberately not committed — regenerable bit-exact from
recorded seeds (`gates/render-batch.js`, `gates/f3-pactive-batches.js`,
`gates/w1-exploration.js`).

## The one rule (before you change anything)

> Priors bias sampling; they never truncate the space.

No range-narrowing, no validity checks that reject genomes, no metric
anywhere that judges whether a sound is *good*. If a change would make the
output better by making less possible, it's wrong by construction — the
temptation is documented in every report because everyone who touches this
project feels it. Comments in `src/` explain *why* and cite spec sections;
Jon navigates by comments, so keep that discipline.

## Current state (2026-08-31)

v2.2: deep-grid archive at 8×8 (chosen by Gate 2b sweep) with
adaptive-sampling @16×16 behind a UI setting; both shadow predictors live
with public rolling accuracy; herd seeds from Jon's ten favourite creatures
(`output/gate-artefacts/seed-picks.json`, full genomes in
`output/favourites/favourites.json`). Open queue: `docs/V2-PROPOSALS.md`
bottom (descriptor head → genome-only autonomy, worker rendering,
visualiser v2).
