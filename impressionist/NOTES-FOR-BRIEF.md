# IMPRESSIONIST — pre-brief notes

*Fourth program in the Playing God set. Captured 2026-09-04 by the Cowork session that wrote ARTISAN's BRIEF-2 and BRIEF-3, at the owner's request, so the future brief-writing session starts with everything this one learned. This is NOT the brief — the owner (Jon Whitten, they/them) will commission that in a separate chat after ARTISAN v3 is built. Nothing here is binding; all of it is context.*

## The commission, in one line (owner's words, near enough)

Impressionist is Artisan but instead of aiming for SSE it aims for something that will **sound as similar as possible to the human ear** as the target.

## Where it sits in the lineage

A 2×2 the set now almost fills: MIMIC = blind search × sample-exact metric; ARTISAN = sighted design × sample-exact metric; IMPRESSIONIST = sighted design × perceptual metric. (Blind × perceptual is the unbuilt corner — see "MIMIC connection" below.) Playing God itself sits outside the grid: its fitness is actual human listening, which makes it the ground truth impressionist's metric is a proxy for.

## Why the SSE work says this project should exist (measured, not vibes)

ARTISAN v2 measured, per target, a **broadband/aperiodic floor**: chimes SSE cannot go below ~350–430 and speech below ~147–164, because the residual is strike transients, room reverb, and unvoiced breath — noise-like energy that no oscillator bank can match *sample-by-sample* (`ARTISAN-REPORT-v2.md` §8, `src/residual.js`). That floor is exactly SSE's blindspot, not the ear's: a listener doesn't need the exact noise waveform, only noise with the right spectral/temporal envelope. This is the classic sines-plus-noise insight (Serra & Smith's SMS: a deterministic part matched precisely, a stochastic part matched *statistically*). Impressionist's whole opportunity is the gap between "sample-exact" and "sounds the same" — the part of every real sound that SSE proves unreachable is precisely the part a perceptual metric makes cheap.

## What changes when the metric goes perceptual

- **Phase mostly stops mattering.** The ear is largely insensitive to steady-state phase (transients partially excepted). ARTISAN's hardest problems — the frequency/phase needle, phase-corrected slot re-entry (BRIEF-3 §4), machine-zero phase threading — mostly evaporate. Enormous search relief.
- **The silence attractor dies.** MIMIC's central pathology (a misaligned loud render scores worse than silence, so blind search stalls at the silence floor) is an artifact of time-domain SSE. Spectral/perceptual losses don't punish misalignment that way. The deceptive landscape MIMIC fought was *metric-induced*.
- **MIMIC connection:** because of the two points above, blind evolution under a perceptual fitness may work dramatically better than MIMIC did — worth a comparison arm (sighted vs evolved under the same perceptual loss), and it's the missing corner of the 2×2.
- **ARTISAN's technique ledger does NOT carry over as verdicts.** The ledger's DROPPED rows (modulation recovery, modulator waves, mixed shapes — `technique-ledger.json` rows 4–6) were dropped because *no SSE benchmark needed them*. Under a perceptual metric that reverses at least in part: FM/self-modulation is the compact way to make noise-like and dense textures (the engine has no noise oscillator — only sine/tri/saw/square — so modulation is the *only* route to broadband energy), which is exactly what the perceptual metric newly rewards. Rule for the brief: ledger verdicts are metric-relative; every dropped avenue must be re-tried under the new metric before its verdict is inherited.

## The metric is the hard part (and the trap)

- Candidates, all locally computable offline: multi-scale STFT / mel-spectrogram distance (the DDSP loss — Engel et al. 2020, the nearest canonical cousin of this whole project: a differentiable additive+noise synth fitted under spectral loss), MFCC distance, loudness-model-weighted spectral loss, and heavier standardised metrics (PEAQ, ViSQOL) probably too slow for millions of evaluations but useful as end-of-run validators.
- **Goodhart warning, doubled.** ARTISAN's BRIEF-2 already encodes the ablation discipline (every technique earns its place by measured contribution; investigation exhaustive, use contribution-tested) — carry that forward verbatim. But impressionist adds a second layer: the *objective itself* is now a proxy. An optimizer will find whatever the metric can't hear (metric-invisible artifacts, spectral garbage that scores well). The brief should mandate a **metric-validation protocol**: before trusting any metric, generate deliberately-degraded variants (phase-scrambled, noise-substituted, artifact-injected) and check the metric's ranking against the owner's ears; and end every run with an honest A/B listening artifact, because the owner's listening is the ground truth the metric approximates. (Pleasing symmetry: that returns the project to Playing God's own axiom — the ear is the final judge.)
- SSE conventions don't transfer: "× over silence" and the silence floor are SSE constructs; impressionist needs its own baseline conventions (e.g. metric distance of silence, of white noise, of the SSE-optimal ARTISAN genome for the same target — that last one is the natural v0 baseline to beat, and ARTISAN itself is the natural *seed generator*).

## What to inherit from ARTISAN wholesale

- **Hard constraints that presumably still bind** (owner to confirm in the real brief): deliverable is a valid `PG2:` genome; the unmodified engine is the sole arbiter and renderer; engine + MIMIC imported read-only; local/offline; ≤64 active waves; 24 h cap per run; raw render path (normalisation would now be a *metric* question — flag it, don't assume).
- **Machinery:** the STFT/track front end and envelope/gate/glide fitting (v2/v3 `src/`), the anytime budget-filling scheduler with reallocation and measured-convergence-only early exit, streaming best-so-far to disk, `verify.js` zero-dep discipline (re-verify render identity; the *score* it recomputes becomes the perceptual metric), the mixer listening artifact, per-run report culture (MIMIC → ARTISAN's measurement honesty: real numbers, real ceilings, incidents reported plainly).
- **Process:** Continuation System for token-outage-proofing (`felix-pitch-project/continuation-system/DESIGN.md` + TEMPLATE, one CONTINUATION file per build); untether conventions (no check-ins; state options, pick one, proceed); commit-early-never-push in the sandbox; precondition check that the expected prior code is present before building on it; plain-English README/`--help`/reports for a code-illiterate owner; compute courtesy around other running jobs (host processes are invisible from the sandbox container — use date-based rules).
- **Semantics to respect:** scored window + owner-positionable offset; total off-canvas agnosticism; render-length dependence of envelopes (a genome is tuned for *its* length); forward compatibility read from `../src/genome.js` (never hard-code 64/95/etc.).

## Known open questions for the real brief (owner decides)

1. Which perceptual metric (or portfolio), and how the metric-validation protocol works.
2. Whether the scored-window/off-canvas rule keeps its exact SSE form under a windowed spectral metric (edge effects).
3. Whether raw-vs-normalised render stays policy (loudness is perceptual — the metric may want to care about level differently than SSE did).
4. Benchmarks: the four SSE targets carry over for continuity, but the showcase targets should be ones where SSE and the ear disagree most (breathy speech, reverberant/noisy material — the very things ARTISAN's floors proved out of reach).
5. ~~Whether a blind-evolution arm (perceptual MIMIC) is in scope or its own program.~~ DECIDED 2026-09-04, twice: its own program, IMPRESSIONIST-MIMIC (`../impressionist-mimic/HOLD.md`) — and re-sequenced the same day to come BEFORE impressionist. Owner's reasoning: MIMIC's GA harness is proven and a fitness function is a plug-in, so building the blind program first tests only one new thing (the metric), and evolution doubles as the metric's adversarial auditor (scores-well-sounds-wrong finds are metric bugs, found cheaply). Consequence for THIS brief: impressionist does not develop the perceptual metric — it INHERITS the standalone, ears-validated, evolution-hardened metric module (consumers: impressionist-mimic and impressionist, no others) and its brief focuses on construction methodology under that metric.

## Pointers on disk

`code/playing-god/artisan/`: `BRIEF.md`, `BRIEF-2.md`, `BRIEF-3.md`, `output/ARTISAN-REPORT.md`, `output/ARTISAN-REPORT-v2.md`, `technique-ledger.json`, `CONTINUATION*.md`. MIMIC's report and `docs/FITNESS.md` for the SSE spec and the silence-attractor story. `../playing-god-spec.md` §3–4 for genome/synthesis.
