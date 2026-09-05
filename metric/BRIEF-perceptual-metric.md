# The perceptual-similarity metric — design brief

*Written 2026-09-05 (Cowork chat session, Opus, no compute) from session note
`_session-notes/02-perceptual-metric-notes.md`, its verbatim owner notes, and a literature
pass. This is item 1 of `code/playing-god/TODO.md` — the standalone, ears-validated
perceptual fitness function that IMPRESSIONIST-MIMIC and IMPRESSIONIST both consume and
nothing else does. It is the hard gate in front of that whole branch (`impressionist-mimic/HOLD.md`).*

*Status: DESIGN, not code. It follows the house pattern — a brief now, a sandboxed Claude Code
build later. But read §0 first: the single most important decision in this brief is that the
build's first task is not "implement the metric" but "run a bake-off," because the metric is too
load-bearing to anoint from an armchair.*

---

## 0. The frame — read before anything else

**The commission (owner's words, near enough):** the fitness that makes IMPRESSIONIST "aim for
something that sounds as similar as possible to the human ear," in place of MIMIC/ARTISAN's
sample-exact SSE.

**Why this is the keystone.** Everything else in the set defers to a metric. Playing God's own
axiom is that *the ear is the final judge* — its fitness is literal human listening. This module
is a **proxy for that ground truth**, and its first consumer (IMPRESSIONIST-MIMIC) is a blind GA
whose entire job is to find and exploit whatever the proxy gets wrong. So the metric is
simultaneously the most important and the most attacked artefact in the project. Getting it
"right first time" does not mean picking the cleverest formula in this document. It means
building the apparatus that lets Jon's ears *choose and then police* the formula.

**Therefore the deliverable of the build is two things, in order:**

1. A **metric-validation harness** (§4) — the battery of degraded variants, anchor tests,
   human-ranking calibration, and the adversarial GA probe. This is built *first*, before any
   metric is trusted, because it is how every candidate is judged.
2. A **bake-off** (§5) of 3–4 candidate metric configurations behind one interface, scored on
   that harness and on Jon's ears, with the winner (or the winning portfolio) promoted to the
   module's default. §2 gives the lead hypothesis the bake-off should try to beat; it is a
   hypothesis, not a verdict.

**What this brief is NOT:** it is not a licence to build IMPRESSIONIST-MIMIC. The gate in
`HOLD.md` stands — nothing downstream is built until the metric has passed §4 with Jon's ears
signing off. This brief builds *only* the metric module and its harness.

---

## 1. Read these first

- `_session-notes/02-perceptual-metric-notes.md` — the owner's four intuitions verbatim and the
  open reset-vs-accumulate question. This brief is that note, resolved.
- `impressionist-mimic/HOLD.md` — the gate, the "first consumer AND adversarial auditor" role,
  and the doubled-Goodhart warning. The reason §4 is not optional.
- `impressionist/NOTES-FOR-BRIEF.md` — "The metric is the hard part (and the trap)", the
  metric-relative technique ledger, and the measured broadband floor that is this metric's
  whole opportunity.
- `artisan/BRIEF-3.md` and — if it exists by build time — `artisan/output/ARTISAN-REPORT-v3.md`.
  ARTISAN v3 ("tracks and voices") builds a track/STFT front end and envelope fitting that are the
  concrete extraction machinery the deterministic term (§2.1) should reuse rather than reinvent,
  and it generates fresh SSE-vs-ear divergence evidence. See the precondition note at the end of
  this section.
- `mimic/docs/FITNESS.md` — the SSE baseline this metric is defined *against*, and its two
  protected decisions (raw render, full-length render). Read especially "Fitness temptations
  encountered — and resisted": three of those resisted temptations (normalise, cross-correlate,
  score spectrally) are things *this* metric is allowed — even required — to do. The metric is
  where MIMIC's forbidden moves become the point.
- `artisan/output/ARTISAN-REPORT-v2.md` §8 — the measured floors (speech ~147–164, chimes
  ~350–430) and *why* they exist: broadband/aperiodic residual an oscillator bank cannot match
  sample-by-sample. That residual is exactly what a perceptual metric must make cheap.
- `../playing-god-spec.md` §3–4 — the engine. Load-bearing facts for the metric: 22050 Hz mono,
  <11 kHz representable; oscillator shapes are sine/triangle/saw/square only (**no noise
  oscillator**); broadband energy exists only via modulation and self-modulation/feedback
  (§4.3: self-modulation "produces saw-like and noise-like spectra depending on depth");
  modulation is **phase** modulation not FM (§4.1).

---

### 1.1 Precondition — refresh this brief after ARTISAN v3

This brief is written from ARTISAN **v2**'s evidence. The sequencing decision of 2026-09-05 is
that ARTISAN v3 is built *before* the metric (it hardens the shared analysis front end and
sharpens the SSE-vs-ear picture — see the reply that accompanied this brief, and TODO item 5's
"gated behind 4"). So before the metric build starts, spend ten minutes folding v3's report into
§2 and §5: any new tonal/noise decomposition behaviour, any new place SSE and the ear diverge,
and the concrete front-end functions the deterministic term can import. This is a refresh, not a
rewrite — the architecture below is expected to stand.

## 2. The lead hypothesis — an architecture, not a verdict

The literature and ARTISAN's own measurements point the same way, so the bake-off should start
with a strong prior. The prior is: **mirror the sound's own structure in the metric.**

### 2.1 The one idea

ARTISAN v2 *measured* that every real target splits into two parts with different natures:

- a **deterministic / tonal** part — partials, formant trajectories, the bell's pitches, the
  melody — where *sequence and pitch relationships carry the meaning*; and
- a **stochastic / broadband** part — strike transients, breath, reverb tail, room noise —
  where *only the statistics carry the meaning*, and the exact waveform is not perceptible
  structure at all (it is literally unreachable by 64 oscillators sample-by-sample, which is the
  floor).

This is Serra & Smith's **Spectral Modeling Synthesis** (sines + a stochastic residual), and it
is not a synthesis trick borrowed for the metric — it is the correct shape *for the metric*,
because the ear judges the two parts by different criteria. So the metric should have two terms:

- **Deterministic term:** a *sequence-preserving, time- and pitch-tolerant* spectral distance on
  the tonal content. This is where Jon's timing-flexibility and cents-tolerance live.
- **Stochastic term:** a *statistical* distance on the broadband content — match the noise's
  spectral and temporal envelope statistics, **not** its samples. This is Jon's intuition #1,
  and its canonical form is **McDermott & Simoncelli's sound-texture statistics** (time-averaged
  moments of subband envelopes, cross-band correlations, and modulation-band power) — the model
  that demonstrably captures how humans perceive texture.

The split is general, which answers Jon's standing worry that a method will "rob generality": a
pure tone has an empty stochastic term, pure noise has an empty deterministic term, and
everything between splits smoothly by how much energy actually sits on each axis. It imposes no
segmentation and no musical assumption; it measures on whichever axis the sound has content.
Crucially, **the bake-off tests this split against a no-split baseline** (§5, config A), so if the
split adds Goodhart surface without perceptual gain, the data says so rather than the brief
insisting.

### 2.2 The front end — perceptual axes, handling three of Jon's four points for free

Compute both terms on a **perceptual time-frequency representation**, not raw linear STFT:

- **Frequency axis:** a perceptual scale — **ERB / gammatone** (closest to the cochlea) or **mel
  / Bark** (cheaper). Bin widths near the critical band make Jon's "a couple of cents is
  imperceptible" fall out automatically: a few cents stay inside a bin, a semitone crosses bins.
  Do **not** implement cents-tolerance as an explicit pitch-offset term (that would wrongly
  forgive systematic detuning too); let the scale's coarseness carry it.
- **Amplitude axis:** log / loudness-compressed magnitudes, ideally loudness-weighted (an
  equal-loudness contour, ISO 226, or a Moore–Glasberg-style weighting). This makes errors in
  quiet or masked bands cost less than errors in prominent bands — a first approximation of
  masking without a full auditory model.
- **Phase:** discarded. Compare **magnitudes only**. This makes Jon's point #2 true *by
  construction*: a phase-inverted (or any phase-shifted) copy has identical magnitudes and scores
  perfect. Jon's own caveat — "unless it results in weird phase cancellation" — is handled by
  keeping at least one **short-window** term in the multi-scale set, so within-window
  cancellation still shows up as a magnitude change. (Transients are the one place steady-state
  phase-insensitivity partially breaks; the short windows are also what catch transient timing.)

### 2.3 Time tolerance — cheap first, alignment second (and warily)

Jon's point #3 (timing has flex) has two magnitudes and they want different tools:

- **Small drift (a handful of samples, sub-3%): use multi-scale windows, no alignment.** A
  **multi-scale spectral distance** (STFT magnitude distance summed over several window sizes —
  the DDSP loss, Engel et al. 2020) is inherently tolerant of small time shifts inside its larger
  windows, and needs no alignment search. This is the cheap, ungameable first line and should be
  the deterministic term's backbone.
- **Larger drift (a section genuinely longer/shorter): use bounded alignment — Dynamic Time
  Warping** (this is Jon's independent derivation; already logged in the vault ledger 2026-09-04).
  DTW penalises the *amount* of warp, not the raw offset, so a 3%-long section costs almost
  nothing. Use **soft-DTW** (Cuturi & Blondel 2017) if a differentiable/smooth version is wanted;
  compute it over spectral *frames*, not raw samples, for speed.

**The warning Jon has not flagged, and the build must respect: alignment is a Goodhart hole.**
An unbounded warp lets the optimiser *align away* real errors — the GA discovers it can score
well by producing something the aligner happily stretches onto the target. So any alignment must
be **bounded** (a Sakoe–Chiba band — a hard limit on how far the warp may stray from the
diagonal), and the bound itself must be a validated parameter, not a free one. The safest build
order is: ship the metric with multi-scale windows only, prove it on the harness, and add DTW
*only if* §4 shows small-drift tolerance is insufficient — and re-run the adversarial probe the
moment alignment is switched on.

### 2.4 What the engine's shape means for the metric

The engine has **no noise oscillator**; its only route to broadband energy is modulation and
self-modulation (§4.3). This is not the metric's problem to solve, but it has one consequence the
metric must get right: the stochastic term must **reward a statistical noise match** (right
spectral/temporal envelope) rather than demand a specific waveform, because a statistical match
via FM/self-modulation is the *only* thing the engine can offer for breath and reverb. If the
stochastic term is too literal, IMPRESSIONIST inherits a metric that punishes the engine for a
limit it cannot escape — and the ARTISAN ledger's dropped modulation rows (metric-relative, per
NOTES-FOR-BRIEF) never get their fair re-test.

---

## 3. The reset-vs-accumulate question — resolved

Jon's open question: target has sections a,b,c,d of 1 s each; the render nails each but section a
runs 1.03 s. Should b,c,d be 1.00 s (drift persists — everything after a is late) or 0.99 s (the
render "makes up for lost time" and re-lands on the target's absolute grid)? Jon's own read:
*first option (don't make up) for material without a consistent pulse; second (make up) for most
music* — and then, "but I want this to work for arbitrary sounds. What to do?"

**The literature's answer, and this brief's resolution:** this is precisely DTW's **step/slope
constraint and boundary condition**, and the field's answer to "which setting?" is *do not fix it
— expose it*, then set it by the material. Concretely:

- **"Don't make up for lost time" = a locally-free (subsequence / low-slope-penalty) warp.** Each
  section re-aligns independently; an early stretch does not force later compression. Correct for
  non-metric material (birdsong, speech, machinery, ambience) — the majority of "arbitrary
  sound."
- **"Make up for lost time" = a globally-constrained warp** (a narrow Sakoe–Chiba band, or a
  single global tempo term). Cumulative drift is penalised, so the render is pushed to stay on the
  target's absolute time-grid. Correct for material with a stable pulse.

**Resolution for the build:**

1. **Default to the "reset" (locally-free, bounded) warp.** The generality gate demands arbitrary
   sound; most non-music is non-metric; and a global constraint imposed on non-metric material is
   the more damaging error (it invents a rigidity the sound does not have). This also honours
   Jon's "don't bake in a method" instinct — the permissive default assumes nothing.
2. **Expose the constraint as one parameter** (call it warp tightness / slope penalty), and
   **provide an auto-setter** that tightens it when the material has a stable pulse or pitch
   centre. Concrete detection rule for the auto-setter:
   - **Pulse:** autocorrelation of the onset-strength (spectral-flux) envelope. A sharp, high
     peak at a consistent lag ⇒ stable tempo ⇒ tighten toward "accumulate." Flat/broad ⇒ leave
     permissive.
   - **Pitch:** stability of a tracked f0 / harmonic salience over time. A steady pitch centre ⇒
     the pitch analogue of accumulate is safe.
   The auto-setter is a *setter*, not a hardcoded mode — it can be overridden, and it degrades to
   the permissive default when detection is ambiguous.
3. **The pitch analogue is real but lower-stakes, and asymmetric to time.** Jon extended the same
   structure to tuning (if a is 10 cents sharp, should b,c,d be 0 or 10 cents sharp?). Note the
   asymmetry: a *constant* global tuning offset is close to imperceptible (few listeners hold
   absolute pitch to 10 cents), so a small global pitch offset can be nearly free — but *relative*
   pitch (the melody, the interval structure) must be preserved. The ERB/mel binning of §2.2
   already gives the per-section cents-tolerance; a small optional global-offset search adds the
   transposition tolerance. **Decided IN (owner 2026-09-05: tokens are cheap, do the extra
   work):** implement the small global-offset search, validate it like everything else, and never
   let it forgive relative-pitch error.

**Flag for §4:** whichever way the constraint is set, it is the sharpest Goodhart risk in the
metric (§2.3). The validation battery must include a "can the warp be gamed?" probe — a variant
that is *wrong* but *warp-alignable* to the target must still score badly.

---

## 4. The metric-validation harness — built first, the actual gate

This is the deliverable that matters most and it is built before any metric is trusted. It has
five parts. A candidate metric that fails any of the first two is rejected outright; parts 3–5
rank the survivors and are where Jon's ears are the arbiter.

### 4.1 Anchor tests (pass/fail sanity — automatable)

- **Identity:** target vs itself ⇒ perfect (distance 0). Non-negotiable.
- **Phase inversion:** target × −1 (and a few random phase-shifts) ⇒ perfect. This is Jon's
  point #2 as an executable test. A metric that fails this is disqualified.
- **Silence** and **white noise** vs each target ⇒ finite, reported reference distances. These
  replace SSE's "× over silence" convention — the new baselines everything is quoted against
  (§6).
- **The SSE-optimal ARTISAN genome for the same target** ⇒ the natural **v0 baseline to beat**.
  The perceptual metric should rank a good ARTISAN render as decent-but-improvable; if it ranks
  it as terrible or as perfect, the metric is miscalibrated.

### 4.2 Degraded-variant battery with expected orderings (Jon's intuitions, made executable)

For each target, synthesise a family of controlled degradations and assert the metric's ordering
matches the ear. Each maps to a named intuition, so this battery is literally "does the metric
encode what Jon asked for":

| Degradation | Expected cost | Guards |
|---|---|---|
| Phase scramble (magnitudes intact) | ~free | point #2 |
| Sub-perceptual time-stretch (≤2–3%) | ~free | point #3 (timing) |
| Sub-perceptual detune (≤~10 cents) | ~free | point #3b (tuning) |
| Noise residual replaced with spectrally-matched different noise | cheap | point #1 (statistical, not SSE) |
| Gross time-stretch (e.g. 20%) | costly, and **monotone** with amount | point #3 not over-firing |
| Semitone+ transposition | costly | binning not too coarse |
| A partial/formant band dropped | costly | tonal content matters |
| A spurious loud tone added | costly | no free garbage |
| Click / wrong transient injected | costly | transient sensitivity |
| Overall level wrong by X dB | costly, scaling with X | loudness modelled |

**Monotonicity** is its own test and its own literature: Turian & Henry (2020), *"I'm Sorry for
Your Loss: Spectrally-Based Audio Distances Are Bad at Pitch,"* showed spectral distances can be
**non-monotone and deceptive** across a pitch sweep — exactly the failure that would send a GA in
the wrong direction. So for the sweepable degradations (time-stretch, detune, level), assert the
metric increases monotonically with the degradation amount. A non-monotone metric is a
landscape with false minima and must be fixed or rejected.

### 4.3 Human-ranking calibration (Jon's ears, formalised)

Present Jon with sets of degraded/candidate renders to rank by ear. Then measure agreement
between the metric's ordering and Jon's, using the standard machinery for validating an objective
quality model — this is the **ITU-T P.1401** framework in miniature: **Spearman rank correlation
and Kendall's τ** for ordering, **RMSE after a monotonic mapping** for calibration, and an
**outlier ratio**. Naming it is not ceremony: it gives a target number ("the metric must reach ρ
≥ [threshold] against Jon's rankings before it is trusted") and a standard way to compare bake-off
candidates. Jon's rankings are the ground truth; the correlation is the metric's grade.

**Fits the owner's build method.** Jon's standard workflow is an autonomous sandboxed Claude Code
run, often overnight, with no mid-run interaction. So the harness must **batch** everything that
needs Jon's ears into a single self-contained package the autonomous run produces at the *end* — a
mixer-style A/B listening artifact plus a ranking form whose results drop straight back into the
ρ/τ computation — never a live mid-run prompt. The build runs to completion autonomously; the
metric is then **finalised only after** one batched listening session, which is the gate. Design
the ranking task to be completable in one sitting (~10–20 short clips per target).

### 4.4 The adversarial probe — the whole reason IMPRESSIONIST-MIMIC is built first

Run a short blind GA (MIMIC's harness, fitness swapped to the candidate metric) against each
candidate and **listen to the winner**. Per `HOLD.md`: a genome that **scores well and sounds
wrong** can only be the metric's fault, and is a metric bug found cheaply. This is not a
downstream activity — it is part of *validating the metric*, and it is why the build order puts
the blind program before IMPRESSIONIST. Honest caveat (from HOLD.md): a merely *mediocre* GA
result is not diagnostic — blind search over ~6,000 genes is hard even on a smooth landscape.
Only **scores-well-sounds-wrong** indicts the metric. Every such find becomes a new row in §4.2's
battery so the fix is regression-tested forever.

### 4.5 Heavy validators as independent second opinions (not inner-loop, not ground truth)

At end-of-run only, cross-check with standardised metrics: **PEAQ** (ITU-R BS.1387), **PEMO-Q**
(Huber & Kollmeier 2006, an auditory-model metric), **ViSQOL/ViSQOLAudio**, and the learned
**CDPAM** (Manocha et al. 2021). Two rules: (1) they are **corroboration, not the objective** —
each was tuned for its own domain (codec artefacts, speech) and may not generalise to
oscillator-bank renders, birdsong, or modem tones; where they disagree with Jon, **Jon wins**.
(2) Keep them **out of the inner loop** — too slow for millions of evaluations, and (for CDPAM)
a learned black box whose blind spots are non-physical and *especially* Goodhart-exploitable by a
GA (see §5 on why a learned metric is a risky inner-loop fitness). Note also **Fréchet Audio
Distance** is a *distributional* metric for generative-model evaluation, not a paired-reference
distance — wrong tool for per-genome target-matching; mentioned only to forestall reaching for it.

---

## 5. The bake-off — how the default is actually chosen

Implement these behind one interface (§6) and run all through §4. Let the harness + Jon's ears
pick the winner or the winning weighted portfolio.

- **Config A — baseline:** plain multi-scale STFT magnitude loss (the DDSP loss), linear scale.
  The honest floor: if the fancier configs can't beat this on §4, ship this. Known weaknesses to
  watch (Schwär & Müller 2023, *Multi-Scale Spectral Loss Revisited*): domination by
  low-energy/near-silent regions and sensitivity to the linear-vs-log magnitude weighting — the
  build should guard these (energy flooring / thresholding) rather than inherit them.
- **Config B — perceptual front end:** A + ERB/mel scale + loudness weighting (§2.2). Tests how
  much of the win is just "measure on the ear's axes."
- **Config C — the split (lead hypothesis):** B + the deterministic/stochastic decomposition,
  with McDermott–Simoncelli texture statistics on the residual (§2.1), computed in sliding
  texture windows so evolving textures keep coarse sequence.
- **Config D — bounded alignment:** C + bounded DTW/soft-DTW on the deterministic term (§2.3),
  *only if* A–C leave a timing gap the battery detects. Switched on last, re-probed adversarially
  (§4.4) the moment it is.
- **Config E — learned (DECIDED IN, owner 2026-09-05):** wrap CDPAM as the deterministic term.
  Measured in the bake-off; but even if it wins on human-correlation it is **quarantined to the
  offline validator tier** (§4.5), never the GA inner loop — a GA eats a learned black box's blind
  spots. Expect it to win on
  raw human-correlation for speech and lose on generality, speed, zero-dep discipline, and
  Goodhart-robustness. Worth measuring so the trade-off is on the record, not assumed. If it
  wins, quarantine it to the validator tier (§4.5), not the inner loop.

The winning config's parameters (scale, window sizes, term weights, split ratio, warp tightness)
are tuned on the validation set and frozen; the frozen numbers and their §4 scores go in the
module's report.

---

## 6. Engineering constraints and the module interface

- **Standalone, importable, owned by neither consumer.** Proposed home: `code/playing-god/metric/`
  (this brief's folder). IMPRESSIONIST-MIMIC and IMPRESSIONIST import it read-only. *Owner to
  confirm the home before the build starts.*
- **Signature:** a pure function of two rendered buffers, e.g.
  `distance(candidateSamples, targetSamples, opts) -> number` plus a richer diagnostics object
  (per-term breakdown, chosen warp setting, which battery rows would flag). **Convention: a
  distance, lower = better, 0 = perfect.** Provide a documented "similarity" view for continuity
  with MIMIC's `1/x` culture, but the native quantity is a distance. Direction must be stated
  once, loudly, because a sign error here silently inverts the whole search.
- **Fixed target, precomputed once.** The target is fixed for a run; precompute all target-side
  features (spectra, texture stats, onset/pitch analysis for the auto-setter) once and reuse.
  Mirror `FITNESS.md`'s logic: any fixed target-side transform is identical for every genome and
  cannot bias the race — but it must be *fixed*, documented, and applied to the target only.
- **Speed / tiering.** The inner-loop primary fitness must survive the GA's evaluation rate
  (millions). Keep it to cheap spectral + statistics + (optional bounded) alignment. Heavy
  validators (§4.5) run offline at end-of-run only. If a config can't hit the speed budget, it
  loses the bake-off on that ground regardless of accuracy — record it.
- **Raw vs normalised render.** SSE deliberately scored the *raw* render to keep its
  identical-but-quieter penalty (`FITNESS.md`). That rationale does **not** transfer: loudness is
  perceptual, so the metric should model level *itself* (via the loudness-weighted term, §2.2)
  rather than lean on the engine's normalisation. **Decided (owner 2026-09-05): score the raw
  render** and let the metric's own loudness term decide how much a level difference costs — and
  treat "is a constant overall gain free, cheap, or costly?" as an explicit validated question,
  resolved as: a constant overall gain is a weak perceptual cue, so *cheap but not free*. Do not silently adopt the
  engine's normalisation; that would be MIMIC's forbidden silent-improvement in reverse.
- **Scored window / off-canvas.** Inherit ARTISAN's owner-positionable scored window and
  total-off-canvas agnosticism (NOTES-FOR-BRIEF). One new wrinkle: windowed spectral metrics have
  **edge effects** at the window boundary. Resolve with a short guard/taper region and document
  it; do not let the boundary become a scored artefact.
- **`verify.js` discipline.** Per house culture, the score `verify.js` recomputes *is* the metric,
  so the metric must be deterministic and re-derivable. Zero external deps is the standing
  discipline — which **Config E (learned) breaks** (it needs a model + a heavy runtime). That
  alone is a strike against a learned inner-loop fitness and a reason to quarantine it if adopted.
- **Baselines to report** (replacing SSE's silence-relative convention): distance of silence,
  distance of white noise, and distance of the ARTISAN SSE-optimal genome, per target. These are
  the numbers a run's result is quoted against.

---

## 7. Generality — what must NOT be baked in

The metric must work across the BRIEF-3 generality space: speech (multiple speakers/languages),
melodic music, percussive music, symphony/polyphony, birdsong, machinery, modem/DTMF, broadband
ambience, trains. Rules:

- No music-specific assumption on the default path. The pulse/pitch auto-setter (§3) is a setter
  with a permissive fallback, never a mode the sound is forced into.
- The deterministic/stochastic split (§2.1) is a graceful-degradation representation, not a
  segmentation — verify on pure-tone and pure-noise targets that each term vanishes cleanly.
- **This needs material, and the library will have grown.** The validation battery and the
  generality claim both depend on TODO item 2 (the target library). By build time there will be
  more than the project's original two targets (chimes + speech) on file, so the harness must
  iterate over **whatever targets the library holds at build time** — discovered from a manifest,
  never a hardcoded set or a fixed count. Item 2 is a soft precondition for §4; flag it if the
  library isn't ready when the build starts.
- **Reuse, don't reinvent, the analysis front end.** If ARTISAN v3 exists at build time, borrow
  its track/STFT front end and envelope fitting for the deterministic term's extraction stage
  (§2.1) — the *analysis*, not the SSE *scoring*.

---

## 8. Deliverables

1. The **validation harness** (§4) — battery generator, anchor tests, ranking-calibration tool
   that records Jon's rankings and computes ρ/τ/RMSE/outliers, and the adversarial-probe runner.
   Built first.
2. The **metric module** (§6) — the bake-off winner promoted to default, alternatives kept behind
   `--metric`/opts for diagnosis (mirroring `mimic/lib/fitness.js`'s off-by-default alternates).
3. A **report** — the bake-off table (each config's §4 scores, speed, ρ against Jon), the frozen
   winning parameters, the reset-vs-accumulate default + auto-setter behaviour, every
   scores-well-sounds-wrong find and its regression test, the reported baselines (§6), and the
   metric's **known blind spots stated plainly** (HOLD.md asks IMPRESSIONIST to inherit "its
   known blind spots" — this report is that inheritance).
4. A plain-English `README` / `--help` (code-illiterate-owner culture) and the mixer-style A/B
   listening artifact carried over from ARTISAN, so Jon can *hear* what the metric ranks.

---

## 9. Process (house stack, unchanged)

Continuation System for token-outage-proofing (one CONTINUATION file per build); untether
conventions (no check-ins — state options, pick one, proceed); commit-early-never-push in the
sandbox (push from the Mac); precondition check that the expected prior code is present; ablation
discipline (every term earns its place by measured contribution on §4 — the bake-off *is* the
ablation); measurement honesty (real ρ numbers, real ceilings, incidents reported plainly);
compute courtesy around other running jobs.

---

## 10. Decisions — resolved 2026-09-05

All five open decisions were settled with the owner on 2026-09-05 (three delegated to Claude's
judgement); recorded here so the build inherits them, not a fresh debate.

1. **Metric home:** confirmed — `code/playing-god/metric/`. Imported read-only by
   IMPRESSIONIST-MIMIC and IMPRESSIONIST.
2. **Human-correlation threshold:** set after seeing the bake-off's spread, not in advance (owner:
   "as you like"). Report every config's ρ/τ against Jon's rankings, then freeze the pass bar from
   that distribution.
3. **Learned metric (Config E):** IN the bake-off as a measured comparison — quarantined to the
   offline validator tier (§4.5) even if it wins, never the GA inner loop.
4. **Global-tuning tolerance:** IN (owner: tokens are cheap, do the extra work). Small
   global-offset search (§3.3); never forgives relative-pitch error.
5. **Raw vs normalised + constant-gain cost:** raw render; the metric's own loudness term sets
   level cost; a constant overall gain is *cheap but not free* (§6).

---

## References (offline-readable identifiers)

- Serra & Smith (1990), *Spectral Modeling Synthesis* — sines + stochastic residual (SMS).
- McDermott & Simoncelli (2011), *Sound Texture Perception via Statistics of the Auditory
  Periphery: Evidence from Sound Synthesis*, Neuron 71 — the texture-statistics model for the
  stochastic term.
- Engel et al. (2020), *DDSP: Differentiable Digital Signal Processing*, ICLR — multi-scale
  spectral loss; the nearest published cousin of this whole project.
- Schwär & Müller (2023), *Multi-Scale Spectral Loss Revisited*, IEEE SPL — documented failure
  modes of the MSS loss (low-energy domination, lin/log weighting) to guard against.
- Turian & Henry (2020), *I'm Sorry for Your Loss: Spectrally-Based Audio Distances Are Bad at
  Pitch*, arXiv:2012.04572 — evidence that spectral distances can be non-monotone/deceptive;
  motivates §4.2 monotonicity and the perceptual frequency scale.
- Sakoe & Chiba (1978), Dynamic Time Warping + the band constraint — the reset/accumulate knob
  (Jon's independent derivation, ledger 2026-09-04).
- Cuturi & Blondel (2017), *Soft-DTW*, ICML, arXiv:1703.01541 — differentiable DTW for the
  optional alignment term.
- Huber & Kollmeier (2006), *PEMO-Q* — auditory-model quality metric (validator tier).
- ITU-R BS.1387 (*PEAQ*); ViSQOL/ViSQOLAudio — standardised validators.
- Manocha et al. (2020, *DPAM*; 2021, *CDPAM*, arXiv:2102.05109) — learned JND-based perceptual
  audio metrics (Config E / validator tier).
- ITU-T P.1401 — statistical evaluation of objective quality models (ρ, RMSE, outlier ratio):
  the frame for §4.3.
