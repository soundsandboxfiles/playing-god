# Gate 1a — human audition verdict

**Date:** 2026-08-31. **Auditor:** Jon (the project owner — this gate needs
ears by construction; BUILD-ORDER). **Harness:** gate1a-batch/index.html served
over localhost, audio-only mode (the default). Batch: 100 creatures, 30 s
renders, fixed RNG seed 0x1A0000 (bit-identical regeneration possible).

## Verdict: PASS — owner call, made early

- **Auditioned: 38 / 100. Held: 13. Skipped early: 25.**
- **Criterion amendment, owner's, made mid-audition:** the specified threshold
  was "holds past 10 seconds"; Jon amended it to **5 seconds** ("at absolute
  random 10 seemed like too steep an ask") and is happy with that as a starting
  point. Recorded plainly: 13 of 38 held past 5 s under the amended criterion;
  the original 10 s criterion was not measured to completion. The absolute
  count (13) already exceeds the 10 required by the original condition, at
  38% of the batch auditioned.
- **Call:** "This is interesting enough to move on." The audition was ended
  early by the owner on that judgment.

## Named standouts (owner's words)

| creature | note |
|---|---|
| 016 | "a beast — listened to that whole thing" (full 30 s) |
| 034 | "magnificent" |
| 040 | "a lot of promise" |
| 045, 046, 049 | "good" |
| 074 | "really like" (added after the call, audition continuing informally) |

These six are the intended seed parents for the archive once the
seed-from-picks change lands (docs/V2-PROPOSALS.md, fix queue F2). Genomes
recoverable exactly: re-run the gate1a batch generation with seed 0x1A0000
and serialize indices 16, 34, 40, 45, 46, 49, 74.

## Observation arising (owner, during audition)

Creatures that open with silence collect free dwell: an opening silence is
indistinguishable from "loading new sound", so the instinct is to wait.
Logged as proposal P4 / fix F4 in docs/V2-PROPOSALS.md — a deliberately
non-purist trim of leading silence.
