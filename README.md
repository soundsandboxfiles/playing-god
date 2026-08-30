# Playing God

Procedural sound generator in which sounds are **evolved rather than designed**.
Fitness is measured listening time and nothing else.

Working title under consideration: *Primordial Jam*. Directory and repo names
follow the vault slug `playing-god` until that is decided.

## Read these first, in this order

1. **`SPEC.md`** (also `SPEC.pdf`) — the complete design specification. Every
   value in it is a decision, not a suggestion.
2. **`docs/BUILD-ORDER.md`** — the stage sequence and its acceptance gates.
3. The vault entity `Cowork/CONTEXT/projects/playing-god.md` in the parent
   Claude folder — holds the reasoning behind the constants, the decisions
   taken against Jon's stated instinct and why, and the standing caution.

`SPEC.md` says *what*. The vault entity says *why*. A change that contradicts
either needs both updated.

## The one rule that governs everything

From `Cowork/CONTEXT/beliefs/vastness-is-the-point.md`:

> Priors bias sampling; they never truncate the space.

The system exists to find something nobody could have specified in advance.
Any change that improves the output by narrowing what can be produced is
rejected on principle, not on merit. This has been violated three times during
design and caught three times on review — see the standing caution in the vault
entity for the pattern.

## Build to the gates, never to completion

Four stages separated by acceptance gates. Three gates test assumptions the
downstream design depends on. **Do not build past a failed gate.** If
behavioural locality fails, everything built on top of the archive is wasted.

See `docs/BUILD-ORDER.md`.

## Layout

```
SPEC.md / SPEC.pdf     the specification
docs/                  build order, stage instructions, handover prompt
src/                   ES modules — genome, synthesis, variation, archive,
                       fitness, servo, descriptors, logging.
                       MUST be importable under plain Node with no DOM.
app/                   index.html — thin shell wiring src/ to Web Audio,
                       canvas and the keyboard. Delivery surface only.
gates/                 gate scripts, run under Node, no browser
output/gate-artefacts/ gate results — committed, they are evidence
output/logs/           runtime JSONL — gitignored, regenerated
```

## Why src/ and app/ are separate

The build sandbox has Node but **no browser**. Every automated gate has to run
headless. Keeping synthesis, variation, archive and descriptors as plain ES
modules with no DOM dependency means Gates 2a and 2b run under `node` with no
browser at all, and the HTML page stays a thin shell over tested code.

This is the practical form of the specification's representation discipline:
everything up to the SAMPLES tier is testable headlessly. Only AUDIO needs
a machine that can make a noise.

## Storage

IndexedDB, not localStorage. A full genome is ~24 KB and a real run would
exceed the localStorage quota within a few hundred listens. Logging schema is
specification §14; an implementation that cannot reconstruct a genome from its
log alone has failed that section.

## Backup

Local git repo. Remote to be added — see `docs/BUILD-ORDER.md`.
The sandbox snapshot excludes `.git/`, so pushes happen host-side after
`sync-back.sh`, never from inside the container.
