# IMPRESSIONIST-MIMIC — placeholder. Gated on the validated perceptual metric.

*Folder reserved 2026-09-04 at the owner's request (Jon Whitten, they/them); re-sequenced the same day. Fifth program in the Playing God set and the last corner of its 2×2: MIMIC = blind search × sample-exact metric; ARTISAN = sighted design × sample-exact; IMPRESSIONIST = sighted design × perceptual; **IMPRESSIONIST-MIMIC = blind evolution (GA or equivalent) × perceptual fitness.***

## Build order (owner's decision, 2026-09-04)

This program now comes **before** IMPRESSIONIST, not after. The owner's reasoning: MIMIC's GA machinery is well worked and reviewed, and a fitness function is a plug-in (`fitness.js` is the single seam; `--seed-genome` exists) — so building this first means only ONE new thing is under test (the perceptual metric), not two (the metric AND whatever construction methodology impressionist invents). The revised sequence:

1. **The perceptual-similarity metric as a standalone, importable module** with an ears-validation protocol (deliberately-degraded variants ranked against the owner's listening before the metric is trusted). This is the actual new thing. Its two consumers are impressionist-mimic and impressionist — build it to be imported by both, owned by neither. Where it lives (its own folder, or developed inside this program's build) is for its brief to settle.
2. **IMPRESSIONIST-MIMIC** — mostly a fitness swap into MIMIC's proven harness. A small brief.
3. **IMPRESSIONIST** — inherits a metric that has been both validated by ears and hardened by evolution.

## The gate

**Do not brief or build until the perceptual metric module exists and has passed its ears-validation protocol.** That is the only gate now — impressionist itself is no longer upstream. A session landing here before then should stop and say so. Handing blind evolution an unvalidated metric would let it optimise the metric's blind spots at scale.

## The role: first consumer AND adversarial auditor

Blind evolution is a relentless Goodhart machine — it will find whatever the metric cannot hear and pile fitness into exactly those blind spots. That is the design, not the danger: this program is the metric's red team. A genome that **scores well and sounds wrong** can only be the metric's fault (the GA has no methodology to blame — it just optimises what it is given); such finds are metric bugs discovered cheaply, to be fixed before impressionist inherits anything. Honest caveat for the brief: a merely *mediocre* result is NOT diagnostic — blind search over ~6,000 genes is intrinsically hard even on a smooth landscape. Only scores-well-sounds-wrong indicts the metric.

## Why this program is expected to work where MIMIC struggled

MIMIC's central pathology — the silence attractor, where a misaligned loud render scores worse than silence and blind search stalls — was **metric-induced**: an artifact of time-domain SSE's phase-exactness, not of evolution. A perceptual metric is largely phase-insensitive, so the deceptive landscape that defeated MIMIC should be far smoother here. This program is the direct test of that claim.

## A bridge product available on day one

MIMIC's `--seed-genome` accepts ARTISAN's output. Seeding with the SSE-optimal genome and letting perceptual evolution polish its *sound* starts the search deterministically close — exactly the regime where blind search is strongest — and is a strong early deliverable in its own right. The 2026-09-04 artisan-seeded 24 h MIMIC run (under SSE) is a dry run of this pipeline's shape; read its outcome.

## When the time comes, read

1. The metric module — its code, its validation results, its known blind spots.
2. `../impressionist/NOTES-FOR-BRIEF.md` — lineage context, the Goodhart double-layer, why ARTISAN's technique-ledger verdicts are metric-relative.
3. `../mimic/README.md`, `../mimic/docs/FITNESS.md`, and MIMIC's report — the harness this program inherits and the silence-attractor story it exists to escape.
4. The house process stack, unchanged: Continuation System, untether conventions, technique-ledger discipline, anytime budget-filling, verify.js honesty (verify re-proves render identity; the score it recomputes becomes the perceptual metric).
5. `../tools/structural-decomp.mjs` — the SSE-space cross-check (structure-vs-loudness + correlation ceiling) for any genome you evolve; a diagnostic foil to the perceptual objective, not the objective itself. See `../mimic/docs/FINDINGS.md`.
