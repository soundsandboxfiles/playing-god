# Session note: build out the perceptual-similarity metric

*Filed 2026-09-04 from Jon's offline notes (22:32). Run this as its own fresh session.*
*Recommended model to run it with: **Opus** — this is literature-informed design of a fitness
function with genuine conceptual depth (the "make up for lost time" question is subtle); it
wants judgement, not just execution.*

## What this is

This is the seed for the **perceptual-similarity metric module** — the standalone, ears-validated
fitness function that IMPRESSIONIST and IMPRESSIONIST-MIMIC both consume (and nothing else does).
Per the build-order decision of 2026-09-04, this metric is the FIRST new thing to build in that
branch of the set; IMPRESSIONIST-MIMIC is its first consumer and adversarial auditor. Before
building, read `impressionist-mimic/HOLD.md` and `impressionist/NOTES-FOR-BRIEF.md` (esp. "The
metric is the hard part" and the Goodhart double-layer), and MIMIC's `docs/FITNESS.md` for the SSE
baseline the perceptual metric is defined against.

A note on shape: Jon likes the house pattern of writing a **brief** first, then having a sandboxed
Claude Code execute it. This session should probably produce the metric's design/brief (literature
survey + the decisions below resolved) rather than diving straight to code — but that's for the
session and Jon to settle at the top.

## Jon's note, verbatim

> Let's build out this metric! So, I'm hoping there's a rich literature you can draw on here in
> terms of how to measure perceptual similarity but here are some of my thoughts (NOT meant to be
> exhaustive or canon, just notes for consideration. Feel free to push back or entirely omit if
> it's better phrased by a paper)
> 1) noise needs to be statistically similar, not SSE similar (this is something Claude said, just
> wanted to restate)
> 2) a phase inversion of the target waveform should score 100%. Phase can broadly be ignored,
> unless it results in some weird phase cancellation stuff.
> 3) timing has some flexibility. Things like a section of audio being slightly shorter or longer
> than in the target are not the death knell they would be in SSE. If it's a handful of samples
> it's literally imperceptible.
> 3) ditto tuning. A couple of cents here or there is imperceptible.
>
> (Then there's the question of whether to 'make up for lost time' or not. Let's say the target
> audio has four sections, a,b,c and d, all of which last one second. Let's say each section is
> perfectly rendered, except that section a now lasts 1.03 seconds instead. Is it more 'accurate'
> for sections b,c and d to be 1 second or 0.99 seconds each? Ditto pitch actually, if section a
> is 10 cents sharp should b,c and d be 0 or 10 cents sharp? In both cases I think the first option
> works better for material without a consistent pulse or melodic logic (most things besides
> rhythmic/melodic music) and the latter is best for most music. But I want this to work for
> arbitrary sounds. What to do? Does the literature have the answer?)

## Canonical landmarks for the session to start from (Claude, 2026-09-04)

Each of Jon's four points maps onto established machinery — name these to Jon and use them as the
literature entry points:

1. **"Noise statistically, not SSE"** → Serra & Smith's *Spectral Modeling Synthesis* (sines +
   a stochastic residual matched by its spectral envelope, not sample-for-sample). Already logged.
2. **"Phase inversion should score 100%; ignore phase"** → **magnitude-spectrogram distance**: the
   whole family of multi-scale STFT / mel-spectrogram losses (the DDSP loss, Engel et al. 2020) is
   phase-invariant by construction — it compares magnitudes, so an inverted (or any phase-shifted)
   copy scores identical. Jon's own caveat about "weird phase cancellation stuff" is the known
   exception the literature handles by keeping windows short enough that within-window cancellation
   still shows up in the magnitudes.
3. **"Timing has flexibility / make up for lost time or not"** → this is **Dynamic Time Warping**,
   and Jon has independently re-derived not just DTW but its central design knob. DTW aligns two
   signals by warping the time axis, penalising the *amount* of warp, not the raw sample offset —
   so a section 3% long costs almost nothing. And Jon's a/b/c/d "make up for lost time?" question
   is exactly DTW's **step/slope-constraint and boundary choice**: an *unconstrained* warp lets
   b,c,d snap back (each independently best-aligned — the "reset", right for non-metric material);
   a *global-slope-constrained* warp (e.g. Sakoe–Chiba band, or a single global tempo/pitch offset
   term) makes an early drift persist (the "accumulate", right for music with a pulse). The
   literature's answer to "arbitrary sounds" is not to pick one — it's to expose the constraint as
   a parameter, or to detect whether the material has a stable pulse/pitch centre and set it
   accordingly. Same structure transfers to the pitch/tuning axis (a global-offset term vs
   per-section). **Log this as an independent derivation** (see below).
4. **"A couple of cents is imperceptible"** → perceptual pitch/frequency tolerance; handled either
   by the DTW-analogue on the frequency axis or by mel/ERB-scale spectral binning, which is
   coarse enough that a few cents fall inside a bin.

Heavier standardised metrics (PEAQ, ViSQOL) are probably too slow for millions of GA evaluations
but make good end-of-run validators. And the non-negotiable from NOTES-FOR-BRIEF: whatever metric
is chosen must pass an **ears-validation protocol** (rank deliberately-degraded variants against
Jon's listening) before it is trusted, because its first consumer is a Goodhart machine.

## Open decision the session must resolve (Jon's, unanswered)

Reset vs accumulate for time AND pitch, for *arbitrary* sound. The steer above (expose it as a
constraint, or detect pulse/pitch-stability and switch) is the starting hypothesis, not a verdict —
test it against the literature and Jon's ears.
