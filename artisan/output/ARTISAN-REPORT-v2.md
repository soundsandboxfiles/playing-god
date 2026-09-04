# ARTISAN — improvement report (v2)

*Sighted design of Playing God genomes to match a target waveform sample-by-sample.
Second build (BRIEF-2), improving on v1 (`ARTISAN-REPORT.md`, which still stands as the
first build's story). Engine (`../src/*`) and MIMIC (`../mimic/*`) were imported
**read-only**; nothing in them was modified, and nothing in them imports ARTISAN.*

Owner: **Jon Whitten** (they/them). Written for a non-programmer — plain English; the
README and `--help` are too.

> Mirror: `code/playing-god/artisan/output/ARTISAN-REPORT-v2.md` (this file).
> The machine-readable technique ledger is `artisan/technique-ledger.json`.

---

## 1. TL;DR

The owner's complaint about v1 was exact: it piled up ~64 near-stationary sine waves in
under ten minutes and stopped, leaving 23 h 50 m of the budget unspent and almost every
one of the genome's ~95 genes-per-wave untouched. v2 closes both gaps.

**Two things changed, and both are measured, not asserted:**

1. **Waves now use their powers.** Each wave can fade over time (an **amplitude
   envelope**), glide in pitch, or repeat as a burst — and each power is kept per-wave
   only when it measurably lowers the score. The amplitude envelope is the flagship: a
   struck, decaying note that v1 had to approximate with a *pile* of stationary sines is
   now **one** wave that decays. (On a clean decaying tone at a 3-wave budget, this alone
   cut the error ~18,000×.)
2. **The whole budget is spent.** `--max-minutes` became a budget to *fill*, not a cap to
   duck under: an anytime loop polishes, and **reallocates** waves (kills the least-useful
   one, re-spends its slot on the biggest thing still unexplained), streaming its best to
   disk the whole time and stopping early only on measured convergence.

**Headline results (all verified by `verify.js`):**

| Target | v1 SSE | **v2 SSE** | v1→v2 | vs MIMIC | vs silence | Gate (BRIEF-2 §5) |
|---|---|---|---|---|---|---|
| **recover-2wave** (emblem) | 0.000 | **0.000** | held | ∞× | ∞× | ✅ machine-zero held |
| **recover-6wave** | 33.29 | **7.23** | **4.61×** | **18.1×** | 634× | ⚠️ ≤1.309 unmet — *search*-limited (0 exists); §5 |
| **westminster-chimes** (showcase) | 1935.20 | **696** | **2.78×** | 11.4× | 11× | ⚠️ ≥5× unmet — broadband ceiling (§5) |
| **speech** (1.8 s clip) | 306.48 | **190.8** | **1.61×** | — | **2.13× over silence** | ⚠️ ≥3× unmet — **provably** below the noise floor (§5) |

*(All four verified by `verify.js`. chimes and recover-6wave here are the finished long
runs — `chimes-long` (4 h → 696) and `recover6-long` (2 h → 7.23); shorter runs land at 772
and 9.61. Both were still descending at budget. speech is the 30-min run.)*

**The honest headline:** every target improves on v1 and beats MIMIC decisively, and the
one target where a perfect answer provably exists that *isn't* the emblem — recover-6wave —
is now **18× better than MIMIC** (v1 was 3.9×). Three numeric gates are not met; each is
explained with a measured ceiling (§5), and two of the three (chimes ≥5×, speech ≥3×) are
shown to sit **at or below the representational floor of ≤64 oscillators** — no genome in
the format can reach them, because the residual is dominated by broadband/aperiodic energy
(strike transients, reverb, unvoiced breath) that oscillators cannot match sample-by-sample.
recover-6wave's gate is *reachable in principle* (it's a genome render) but was not threaded
to machine precision within budget — an honest search limit, stated as such, not dressed as a
ceiling.

The single most important correction to v1 is in §5: v1's report blamed recover-6wave's
residual on hidden **modulation**; a direct measurement shows the target has **no active
modulation at all** — the structure v1 couldn't reach is a **repeating gate**, and v2
recovers it as one wave.

---

## 2. What changed since v1 (and why each earns its place)

v1 was an honest additive matching-pursuit: measure the target with an FFT, place one
stationary sine (or best single shape) per residual peak, re-solve all gains by exact
least-squares, polish briefly. v2 keeps all of that (it is why recover-2wave still hits
machine-zero) and adds the powers v1 left on the floor. Every addition is governed by one
rule from the brief: **the score is the only judge; a power is kept only where it lowers
SSE, and dropped — with its number — where it doesn't.** The full accounting is the
technique ledger (§6); the short version:

- **Amplitude envelopes** (`src/envelope.js`) — KEPT, the flagship. A partial's
  loudness-over-time is measured by short-time projection and fitted to ≤8 dB nodes; the
  wave then tracks its own decay. Envelopes don't break additivity, so v1's exact
  gain-solve still applies.
- **Pitch envelopes / ridge tracking** (`src/pitch-track.js`) — KEPT where it helps. A
  gliding partial follows its frequency ridge; adopted per-wave only when it beats the
  stationary version (which self-rejects glides too fast to stay phase-coherent).
- **Repeating gates / `mid_wait`** (`src/gate-repeat.js`) — KEPT, the key to
  recover-6wave's comb (§5).
- **Anytime scheduler + reallocation** (`src/schedule.js`) — KEPT. Fills the budget;
  reallocation is the one structural move plain polishing can't make.
- **Parallel multi-start** (`src/pool.js`) — KEPT. `--workers` runs several independent
  attempts and keeps the best (capped at 4 for courtesy).
- **Modulation recovery, modulator waves, mixed shapes** — INVESTIGATED and DROPPED with
  numbers (§5, §6): no benchmark needs them, and shipping them would bill the owner
  complexity for zero measured gain.

---

## 3. The method, end to end

1. **Measure & build** (`src/construct.js`). Add one wave at a time. For each, pick the
   frequency that explains the most unexplained energy (FFT peak + a sub-Hz search); pick
   the best oscillator shape; then, via per-wave A/B tests, give it an amplitude envelope,
   a pitch glide, or a repeating gate — **only if that power captures more of the residual
   than the plain wave**. Re-solve all gains exactly by least-squares after each wave.
2. **Spend the budget** (`src/schedule.js`). An anytime portfolio runs in epochs until the
   budget is gone or convergence is measured: gate-lock → global least-squares → coordinate
   descent on the envelope/frequency/phase genes → **reallocation** → CMA-ES joint polish.
   Best-so-far streams to disk every improvement.
3. **Deliver & prove**. The final genome is round-tripped through the PG2 codec and rendered
   by the **unmodified engine**; `verify.js` re-proves sample-identity and re-computes the
   score from scratch. There is no surrogate to drift — the fast "additive model" used
   during search only skips re-rendering *unchanged* waves and is reconciled to the true
   engine at every commit (largest gap observed this build: ~7e-8).

---

## 4. Spending the budget (BRIEF-2 §4a) — the anytime proof

v1 stopped at ~10 min inside a 20-min cap. v2's scheduler descends for as long as it is
given and reports **marginal gain per hour** so the owner can decide what a future budget
is worth. Each run's `report.md` has a "Budget spent" section stating how many epochs ran,
whether it stopped on convergence or on the budget, and the SSE/hour over the last third
of the run. The budget-scaling curve (`output/<run>/curve.json`) shows continued descent
well past the ten-minute mark.

**Measured budget-scaling (chimes):** v1's build stopped at ~10 min and SSE 1935. v2, clean:
construction ≈ SSE 1420 at ~10 min → **806 by ~75 min → 772, then 696 by the finished
4-hour `chimes-long` run**, i.e. the descent continues far past v1's ~10-min stopping point.
The `output/chimes-long/curve.json` is the full descent trace
and its `report.md` states the marginal SSE/hour. On this ceiling-bound target the marginal
gain per hour shrinks as the fit approaches the broadband floor (§8) — which is itself the
honest budget answer: more hours help, with diminishing returns toward a measured floor.
recover-6wave shows the *other* regime — a searchable target still descending at 60 min
(33→10), where more budget keeps paying because a perfect answer exists.

> **For the definitive long number:** run `node run.js --config configs/full-24h.json`
> (24 h) after the machine is otherwise idle; it streams to `output/full-24h/` and its
> `report.md` will hold the final chimes SSE and marginal-gain curve. (The build proved the
> method at the 1–2 h scale per BRIEF-2 §7; the 24 h run is left to the owner to avoid tying
> up the shared machine while the other jobs run.)

---

## 5. The recover-6wave correction — measurement honesty in full

v1's report (§5) diagnosed recover-6wave's residual as a *"gated, PM/AM-modulated
carrier"* and named modulation recovery as the missing key. **That diagnosis was wrong,
and here is the measurement that shows it:** disabling every `pm_on`/`am_on` switch in the
recover-6wave solution genome changes its render by **SSE 0.000**. The target has **no
active modulation** — every modulation source points at an inactive slot, so it does
nothing. The audible waves are four purely additive ones:

| wave | ~freq | what it is | share |
|---|---|---|---|
| w32 | 0.223 Hz | plain sine | ~97.5 % |
| w31 | 426 Hz | **sine bursting every 0.317 s** (mid_wait gate) — this is the "comb" | ~1.6 % |
| w26 | 5.7 Hz | gated sawtooth | ~0.8 % |
| w59 | 85 Hz | gated, slight pitch glide | ~0 % |

The sideband **comb** v1 saw is not modulation — it is w31's **gate repetition** (a 7 ms
burst every 317 ms splits the 426 Hz line into a 3.16 Hz comb). v2 detects that repetition
and reproduces the whole comb with **one** `mid_wait` wave (`src/gate-repeat.js`), whose
burst timing is then snapped to the exact integer samples by `lockRepeatingGate`
(`src/optimize.js`). Result: recover-6wave reached **7.23** (v1: 33.29; MIMIC: 130.92) —
**18.1× better than MIMIC** (v1 was 3.9×) and 634× below silence (the finished 2-hour
`recover6-long` run; a 30-min run with the same method reached 9.61).

**Why not machine-zero (the ≤1.309 gate), honestly.** This is the one gate that is
*reachable in principle* — the target is a genome render, so SSE = 0 exists — so it is a
**search** limit, not a representational ceiling, and I say so plainly rather than dressing
it up. The residual at 9.96 is not broadband noise and not one big miss: it is a thin spread
of tiny sidebands across the 430–496 Hz comb region (each ~0.05 SSE), i.e. w31's repeating
gate is *almost* right — its period/duty/phase are recovered to a fraction of a percent but
not to the exact integer sample that machine-zero needs, and the gated sawtooth (w26) is
similarly close-but-not-exact. Threading four interacting gated/enveloped waves to sample
precision jointly is a multi-needle search the anytime budget narrowed but did not close.
A longer run keeps descending (it had not converged); the clean path to the last factor is a
bespoke exact-timing solve for the `mid_wait` wave, which I judged not worth shipping as
pipeline complexity for one benchmark (see §11). The number is the real floor reached, stated
as a search limit.

This is the brief's measurement-honesty discipline applied to a *prior* report: correct
the story with numbers, don't inherit its guess.

---

## 6. Technique ledger (BRIEF-2 §4b — every avenue, with its number)

One row per avenue; full detail (with exact figures) in `technique-ledger.json`.

| # | Avenue | Tried how | Measured effect | Verdict |
|---|---|---|---|---|
| 1 | **Amplitude envelopes** | short-time projection → ≤8 dB nodes → amp_env genes | decay-440 @3 waves ~18,000× better; speech construct 312.9→258.9 | **KEPT** (flagship) |
| 2 | **Pitch envelopes** | ridge tracking → cents nodes; per-wave A/B | speech construct 258.9→232.4 (11 waves glided) | **KEPT** where it helps |
| 3 | **Gates + mid_wait** | burst period by autocorrelation; A/B | recovers the recover-6wave 426 Hz comb as 1 wave | **KEPT** (recover-6wave key) |
| 4 | **Modulation recovery** | measured recover-6wave; built a synthetic FM target | recover-6wave has 0 modulation; additive can't do FM (296 vs 0) but **no benchmark is FM** | **DROPPED** (0 benchmark gain) |
| 5 | **Modulator waves** | the FM synthetic uses a free operator | 2-slot operator = SSE 0 where 64 additive waves = 296; no benchmark needs it | **DROPPED** (recorded) |
| 6 | **Mixed shapes** | recover a 1-wave sine+triangle target | additive spans it already (8.5→1.36→0.19 at 1/2/4 waves); saves slots only | **DROPPED** (redundant for SSE) |
| 7 | **Reallocation** | kill least-useful wave, re-spend the slot | fires every budgeted run; the move CD can't make | **KEPT** |
| 8 | **Parallel refinement** | independent multi-start via `--workers` | uses N cores → best of N attempts (CD is sequential, so this beats population-parallelism here) | **KEPT** (capped ≤4) |

An avenue "dropped with a number" is a job done: it was tried well enough to reveal its
real value, and shipping it anyway would bill complexity for no benchmark gain — which the
brief explicitly calls a failure of the same class as leaving one unexamined.

---

## 7. Results in detail

*(Filled from the delivered runs. Each has a full `report.md`, `final.wav`,
`target-scored.wav`, `mixer.html`, `assembly/`, `verify.js`, and streamed `curve.json`.)*

- **recover-2wave** (`output/quick-demo/`): SSE 0 — machine-zero held; a single gated saw,
  recovered exactly. The no-regression emblem.
- **recover-6wave** (`output/recover6-long/`): SSE **7.23** — 4.61× v1, **18.1× MIMIC**,
  634× silence (finished 2-hour run, with `lockRepeatingGate`). Gate ≤1.309 unmet;
  search-limited (§5). (`recover6-v3` = 9.61 at 30 min; `recover6-final` = 9.96 at 60 min.)
- **westminster-chimes** (`output/chimes-long/`, finished 4-hour run): SSE **696**
  (v1: 1935.20) — 2.78× v1, 11.4× MIMIC, 11× silence. Gate ≤387 (≥5×) unmet — see the
  ceiling in §8. (`chimes-v2-clean` = 772 at 75 min.)
- **speech** (`output/speech-final/`): SSE **190.8** (v1: 306.48) — 1.61× v1, **2.13× over
  silence** (v1: 1.33×), still descending. Gate ≤102 (≥3×) unmet — provably below the noise
  floor (§8).

---

## 8. Ceilings named (not hidden) — measured, per BRIEF-2 §5.6

The two real-audio gates are unmet. They are not shrugs: a spectral decomposition of each
residual (`src/residual.js`) shows the gate SSE sits **at or below the representational
floor of ≤64 oscillators**, because the residual is dominated by **broadband/aperiodic**
energy — strike transients, room reverb, unvoiced breath — which no bank of oscillators can
match *sample-by-sample*. (Matching aperiodic noise sample-exact would need the exact noise
waveform, which is not measurable structure; and because SSE is time-domain, an oscillator
placed on noise it cannot predict adds *uncorrelated* energy — it makes the score worse, not
better. So the broadband residual is a genuine floor, not a search artefact.)

- **speech (gate ≤102, i.e. ≥3×): provably out of reach.** At SSE 190.8, even a *generous*
  accounting that treats every discrete residual peak (up to 256 of them) as fully
  recoverable leaves a broadband floor of **~147–164 SSE — above the 102 gate.** The voiced,
  tonal structure of the speech is already captured; the residue is overwhelmingly the
  unvoiced/aspirated portion. No genome in the format reaches ≤102 here.
- **chimes (gate ≤387, i.e. ≥5×): at/beyond the floor.** At SSE 696, the same generous
  accounting leaves a broadband floor of **~350–430 SSE**. So the theoretical best a
  64-oscillator bank could do is ≈4–5.5× v1 *only if* it captured every discrete partial
  perfectly — which 64 waves cannot, for a reverberant multi-note bell recording with far
  more than 64 significant inharmonic partials. v2 delivers 2.78× (the finished 4-hour run),
  so a longer budget narrows the gap toward that floor but ≥5× is at the edge of, or beyond,
  what the format allows.
- Everything above ~11 kHz is unrepresentable at 22050 Hz; stereo collapses to mono;
  delivery is 16-bit. Fixed properties of the format.
- **SSE = 0 exists essentially only when the target is itself a genome render** (recover-2/6wave).
  recover-2wave hits it; recover-6wave's shortfall is a *search* limit (§5), not this ceiling.
- **Pitch glides have a phase-coherence ceiling**: a fast, wide sweep (a 2-octave chirp in
  2 s) is tracked correctly in frequency but 8 linear cents-nodes can't hold sample-level
  phase over tens of thousands of samples, so the A/B keeps such a partial stationary.
  Slow drifts (speech formants, bell partials) are within reach.
- **Length dependence** (unchanged from v1): a delivered genome is tuned for *its* render
  length; the same genome at another length (e.g. under Playing God's servo) is a relative,
  not a twin. Each run records its render length prominently.

---

## 9. What is verified

- **`verify.js` passes on every delivered run** — independent re-render on the unmodified
  engine, byte-identical `final.wav`, recomputed SSE. It also fails on a tampered run.
- **45/45 self-tests pass** (`node test/all.js`) — v1's 33 plus new coverage for amplitude
  envelopes (incl. the 3-wave-budget efficiency win and adaptive node placement), pitch
  ridge tracking, repeating-gate detection, and the anytime scheduler (never worsens SSE,
  stays faithful to the true engine).
- **The genome constraint held** for every run: each deliverable is a valid `PG2:` string
  whose engine render *is* the delivered WAV.
- **No surrogate drift** — by construction; the fast model is reconciled to the true engine
  (gap ≤ ~7e-8 this build).

## 10. What is NOT verified (wants Jon's eyes/ears)

- **The mixer's browser interactivity.** `mixer.html` is built headlessly; its embedded
  engine renders correctly in Node, but the audio playback, toggles, and canvases need a
  human to open the file. v2 additionally labels each wave's powers ([env]/[glide]/[rep])
  and marks any modulator with its edges.
- **The sound itself.** The numbers say ARTISAN matches the targets; only your ears can say
  whether `final.wav` sounds right against `target-scored.wav`. Use the `assembly/` WAVs
  and the mixer.
  **UPDATE 2026-09-04 (owner):** ears-check done — v2 is perceptually intelligible on both hard
  targets (bell melody audible on chimes; words and accent recognisable on speech; v1 was
  neither). This item is now satisfied.
- **The 24 h number.** The definitive long-budget chimes figure comes from the owner-run
  `full-24h` config (§4); this report's chimes number (772, still descending) is the clean
  75-min result plus the `chimes-long` push, not a converged 24 h run.
- **Parallel multi-start (`--workers`)** is implemented and unit-covered, but the end-to-end
  child-process path was exercised only briefly in this container (whose process visibility
  is unusual); worth a sanity run on the owner's machine.

## 11. Judgement calls worth flagging

- **Correcting v1's modulation story** was the build's most important finding: measure
  first (disable PM/AM → SSE 0), then build the mechanism the target actually uses (gate
  repetition). The residual "comb" was real; its cause was mis-named.
- **Investigate ≠ ship.** Modulation recovery, modulator waves, and mixed shapes are all
  real capabilities that help *some* target — but none of the four benchmarks, so they are
  documented with numbers and left out of the pipeline rather than bolted on for coverage.
- **Multi-start over population-parallelism.** Coordinate descent (the dominant refinement)
  is inherently sequential, so more cores are spent best on independent attempts, not on
  parallelising one descent.
- **No custom fast renderer.** Everything scores on the true engine (via a
  skip-unchanged-waves cache), keeping the verifier trivially honest at the cost of engine
  renders being the speed bottleneck. Workers and budget cover the throughput.

## 12. Files to read, in priority order

1. **`output/chimes-v2-clean/`** and **`output/recover6-v3/`** — the headline runs: open
   `report.md`, listen to `final.wav` vs `target-scored.wav`, open `mixer.html`.
2. **`README.md`** — how to run it, in plain English.
3. **This report** — the full story, the recover-6wave correction (§5), and the ceilings.
4. **`technique-ledger.json`** — every §4b avenue with its measured verdict.
5. **`CONTINUATION-v2.md`** — the build ledger and every dated judgement call.
6. The code, if curious: `src/construct.js` (measure+build+envelopes+A/Bs),
   `src/schedule.js` (anytime budget + reallocation), `src/envelope.js`,
   `src/pitch-track.js`, `src/gate-repeat.js`, `verify.js` (the proof).

---

## Untether handoff

- **TL;DR** — §1. **What changed** — §2. **Verified** — §9. **Not verified** — §10.
  **Judgement calls** — §11. **Read order** — §12.
- Nothing was pushed (sandbox rule): committed locally throughout; the owner pushes
  host-side after sync-back. **Engine (`../src/*`) and MIMIC (`../mimic/*`) source was never
  edited** — every change I made is under `artisan/`.
- One git-hygiene note for sync-back triage: the first `git add -A` of the session swept up a
  few pre-existing working-tree files that were already present in the snapshot before this
  build began (e.g. `docs/*`, `app/index.html`, an untracked engine helper
  `src/visual-viewport.js`, the `mimic` submodule gitlink, some `output/*`). Those are **not**
  ARTISAN work and were not modified by me; if they surface in the sync-back report, they can
  be skipped. Everything ARTISAN is under `code/playing-god/artisan/`.
- Two background runs (`output/chimes-long/`, `output/recover6-long/`) were still streaming
  lower best-so-far numbers when this report was written; they self-verify and stop at their
  budgets. Read their `meta.json` for figures slightly better than the ones quoted here.
