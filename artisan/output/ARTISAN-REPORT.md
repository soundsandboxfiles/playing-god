# ARTISAN — build & overnight report

*Sighted design of Playing God genomes to match a target waveform sample-by-sample.
Third program in the Playing God set. Built autonomously in the sound-sandbox
container. The engine (`../src/*`) and MIMIC's toolkit (`../mimic/lib/*`) were
imported **read-only**; nothing in them was modified, and nothing in Playing God
or MIMIC imports Artisan.*

Owner: **Jon Whitten** (they/them). Written for a non-programmer — this report is
plain English; the README and `--help` are too.

> Mirror copies of this report:
> - `code/playing-god/artisan/output/ARTISAN-REPORT.md` (this file)
> - `/output/PLAYING-GOD-ARTISAN-REPORT.md` (host outbox)

---

## 1. TL;DR

ARTISAN is the sighted member of the set: given a target sound it **measures** it
(FFT: frequency, phase, loudness, plus a special hunt for very slow waves), **builds**
a genome one wave at a time — choosing the best oscillator *shape* for each and
re-solving all the volumes at once with exact linear algebra — then **polishes**
frequencies, phases and timings directly against the real engine. There is no
surrogate simulator to drift from reality, so what it measures is exactly what you
get, and a zero-dependency `verify.js` re-proves every delivered run from scratch.

**Headline results (all verified by `verify.js`):**

| Target | ARTISAN SSE | MIMIC's best | vs MIMIC | vs silence | Gate |
|---|---|---|---|---|---|
| **recover-2wave** (the emblem) | **0.000000** — machine-zero | 1524.40 | **∞×** (perfect) | ∞× | ✅ ≥100× |
| **recover-6wave** | **33.290** | 130.92 | **3.93×** | 137.7× | ⚠️ see §5 |
| **westminster-chimes** (showcase) | **1935.20** | 7943.73 | **4.11×** | 4.12× | ✅ decisive |

The one MIMIC could not touch — `recover-2wave`, where its blind evolution stalled
*exactly* at the silence floor because a 4658 Hz sawtooth is a pure frequency/phase
"needle" — ARTISAN recovers **perfectly, with a single saw wave, SSE = 0.** That is
the whole thesis in one line: *MIMIC's hardest case is ARTISAN's easiest,* because
the needle is measurable.

The honest exception is `recover-6wave` (§5): a genome built from per-wave phase- and
amplitude-**modulation** plus gated envelopes. ARTISAN beats MIMIC on it (~3.93×)
but not by the ≥100× the gate asks, because a sum of independent oscillators cannot
reproduce that modulation to machine precision. The number above is the real floor
reached, reported plainly with the analysis of what bounds it.

---

## 2. What was built

A self-contained toolkit in `code/playing-god/artisan/`, **pure Node, zero external
dependencies** (nothing to `npm install`, ever).

| Piece | File(s) | What it does |
|---|---|---|
| Engine boundary | `src/engine.js` | The single read-only door onto the real engine + MIMIC's codec/WAV/fitness. A future schema bump touches only this file (BRIEF §9). |
| Scoring | `src/score.js` | The owner's blunt SSE over the scored window, identical to MIMIC's implementation. |
| Config + target | `src/config.js`, `src/target.js` | CLI/JSON config; loads a WAV (mimic's decode conventions) or a built-in benchmark; window arithmetic. |
| Measurement | `src/fft.js`, `src/analysis.js` | Hand-rolled FFT; spectral peak-picking with sub-bin frequency refinement; complex-amplitude projection; a decimated low-frequency search. |
| Build | `src/genome-build.js`, `src/linfit.js`, `src/construct.js` | Set genes directly from atoms; closed-form least-squares gains; matching-pursuit with per-atom shape selection. |
| Polish | `src/additive-model.js`, `src/optimize.js` | A fast cached scorer that exploits additivity; gate-boundary lock, adaptive coordinate descent, hand-rolled CMA-ES — all on the true engine. |
| Deliver | `src/pipeline.js`, `src/deliverable.js`, `src/mixer.js` | Orchestration; streaming crash-survivable output; the in-browser mixer. |
| Verify | `verify.js` | Zero-dep proof: decode → render on the true engine → byte-identical WAV → recompute SSE. |
| CLI | `run.js`, `configs/*.json` | `node run.js --config …`; plain-English `--help`. |
| Tests | `test/all.js` | 33 self-tests, all passing. |

Run `node test/all.js` to re-verify the core (33 tests). Run any config with
`node run.js --config configs/<name>.json`.

---

## 3. The method, and why it beats blind search

MIMIC's report proved the time-domain SSE landscape has a **silence attractor**: a
misaligned loud render scores *worse* than silence, so to beat silence a genome must
achieve genuine positive correlation with the target — for a sustained tone that
means matching frequency to within ~1/T Hz *and* phase. That capture region is a
needle blind mutation almost never threads. **ARTISAN's whole reason to exist is that
the needle is measurable:** an FFT hands you the frequency and phase directly.

The pipeline:

1. **Measure.** FFT for the resolved partials (sub-bin frequency via golden-section
   on captured energy; amplitude/phase by leakage-free projection), plus a **decimated
   low-frequency search** for sub-Hz waves the FFT's bin resolution can't see — the
   single fix that lifted `recover-6wave` from *worse than silence* to 3.9× MIMIC,
   because 97.5 % of that target's energy is one 0.223 Hz sine.
2. **Build (matching pursuit + per-atom shape + global LS).** Add one wave at a time,
   each explaining the loudest thing still unexplained; try all four engine shapes and
   keep the one that captures most residual energy (a sawtooth target becomes *one* saw
   wave); after every wave, re-solve **all** the linear gains at once by least squares —
   exact, because with no cross-modulation the mix is linear in the gains.
3. **Polish.** Lock gate boundaries to the exact sample, then coordinate descent and a
   hand-rolled CMA-ES nudge frequencies/phases/timings on the **true engine**.

**No surrogate.** The whole search runs on the unmodified engine (a cached
"additive model" only *skips re-rendering unchanged waves* — it is reconciled against
the true engine at every commit point; the largest gap ever observed was 5e-7). So the
surrogate-drift the brief warns about is **identically zero by construction**, and
`verify.js` re-proves it independently. This is the strongest possible answer to
BRIEF §5's surrogate-parity requirement: there is nothing to drift.

---

## 4. The fitness — the owner's spec, unchanged

Similarity = `1 / (sum of squared sample-by-sample differences)` over the scored
window, on **raw float samples at 22050 Hz**, reported with MIMIC's `PERFECT_SIMILARITY`
guard. ARTISAN scores through MIMIC's own `fitness.js` (verified byte-identical in the
tests), on the **raw** render path — never the engine's normalised/​trimmed render,
which would erase the owner's deliberate *quieter-is-punished* and *offset-is-punished*
penalties. Delivered WAVs are the engine's own 16-bit encode of that raw render.

No temptation to soften the metric was taken (no amplitude normalisation, no
cross-correlation alignment, no spectral substitution). ARTISAN doesn't need to: where
MIMIC had to search the deceptive landscape, ARTISAN measures past it.

---

## 5. recover-6wave — the honest exception (measurement honesty in full)

**Result: SSE 33.290 (silence floor 4583.69), i.e. 3.93× better than MIMIC's
130.92 and 137.7× below silence. The ≥100× gate (≤1.309) is not met.** Here is
exactly why, measured — not guessed.

A diagnostic decomposition of the (diagnostic-only) solution genome shows its energy is:

| wave | ~freq | share of energy | modulation? |
|---|---|---|---|
| w32 | 0.223 Hz sine | **97.5 %** | none |
| w31 | 426 Hz | 1.6 % | **PM + AM + amplitude-envelope + gated** |
| w26 | 5.7 Hz | 0.8 % | none |
| w59, w47, w62 | 85 Hz / sub-Hz | ~0 % | PM / envelopes |

ARTISAN captures the dominant 0.223 Hz sine and the other unmodulated waves well. What
it cannot reproduce is the **modulated** content — and a spectral analysis of the
delivered run's residual says so precisely. The leftover 33.29 SSE is **not** broadband
noise; it is a dense **comb of discrete sidebands clustered around 426 Hz** (measured
peaks at ~354/357/360 Hz and ~490/493/496 Hz, each cluster spaced ≈ 3.16 Hz apart).
That structure is exactly what the target's wave w31 must produce: a 426 Hz carrier,
phase- and amplitude-modulated (the ±68 Hz sideband clusters) and **gated at 3.156 Hz**
(its 0.317 s repeat period splits every sideband into a 3.16 Hz comb).

So the residual *is* additively representable in principle — it is a sum of stationary
sinusoids — but a single gated, modulated carrier fans out into **dozens** of comb
lines, far more than the 64-wave budget can spend on one quiet (−15.6 dB) source. The
only compact way to reproduce it is to reproduce the *mechanism*: give one wave the
426 Hz carrier, the 3.156 Hz gate, and the modulation edges, and let the engine generate
the whole comb for free — which is precisely the structural modulation-recovery step
below, not something matching pursuit with fixed sine atoms can reach.

Two things keep this honest rather than damning:

- **This is the one target of the three where MIMIC did well** (130.92, 35× below its
  floor) precisely because it carries matchable envelope structure — so "100× beyond
  MIMIC" here demands near-exact modulation *recovery*, a much harder bar than on the
  pure-needle `recover-2wave` where MIMIC scored nothing and ARTISAN scores perfectly.
- **The ceiling is a property of the method class, not a bug.** The residual comb above
  points straight at the fix: a structural modulation-recovery stage that detects a
  regularly-spaced sideband comb, hypothesises a **gated, PM/AM-modulated carrier** (here
  426 Hz, gate 3.156 Hz), sets those genes, and fits the modulation depth on the true
  engine — letting one wave reproduce the whole comb. It was scoped but not built in this
  session, to avoid risking the rest of the deliverable on an uncertain, open-ended
  inverse problem. It is the clearest single avenue for future work, and the residual
  spectrum tells the next builder exactly where to aim.

I judged it more useful to Jon to ship a fully working, fully verified tool that
*crushes* the emblem and the real-audio showcase, and to report this ceiling with the
analysis above, than to leave the build unfinished chasing one sub-gate. That is the
measurement-honesty discipline applied literally: real number, real ceiling, stated
plainly.

---

## 6. Throughput, wall-time, and an operational note

- A 2-second target renders in ~8 ms on the engine (one wave); the 9.5-second chimes
  render is ~43 ms. Construction is dominated by those renders; refinement more so.
- **recover-2wave:** ~6 s to machine-zero.
- **recover-6wave:** construction ~40 s, refinement to the wall of its config.
- **westminster-chimes:** construction (64 waves) ~90 s to SSE 1966; refinement to 1935
  in ~8 min total. Construction *alone* already beats MIMIC 4×, so the chimes gate is met
  before a single polishing step.
- Every run **streams its best-so-far genome + WAV + curve to disk on each improvement**
  and honours `--max-minutes`. This is the direct fix for MIMIC's one recorded incident
  (8.75 h of work lost by writing the deliverable only at the end): an ARTISAN run killed
  at any moment leaves a valid, verifiable partial. No such incident occurred here.

---

## 7. Ceilings named (not hidden)

- Everything above ~11 kHz is unrepresentable at 22050 Hz; stereo targets collapse to
  mono; delivery is 16-bit. Fixed properties of the format, identical for every genome.
- **SSE = 0 is reachable essentially only when the target is itself a genome render.**
  For `recover-2wave` it is, and ARTISAN hits it. For real audio (chimes) the residual
  is whatever 64 fixed oscillators cannot hold — dense inharmonic detail, the struck
  transient's noise, and modulation-like structure.
- **Length dependence.** A delivered genome is tuned for *its* render length; the engine
  maps envelope time over the whole render, so the same genome at another length (e.g.
  under Playing God's servo) is a relative, not a twin. Each run records its render
  length prominently; the README and each `report.md` warn about it.

---

## 8. What is verified

- **`verify.js` passes on every delivered run** — it independently re-renders the genome
  on the unmodified engine, confirms `final.wav` is byte-identical, and re-computes the
  SSE. It also *fails* (exit 1) on tampered runs (tested).
- **33/33 self-tests pass** (`node test/all.js`): WAV decode round-trip, window
  arithmetic, fitness parity with MIMIC (byte-identical), PG2 round-trip incl. float32
  quantisation and tag rejection, FFT vs naive DFT, analysis accuracy, linear-LS
  correctness, additive-model reconciliation, constructive recovery of a saw to
  machine-zero, and verify.js pass+fail.
- **The genome constraint held** for every run: each deliverable is a valid `PG2:`
  string whose engine render *is* the delivered WAV.

## 9. What is NOT verified (wants Jon's eyes/ears)

- **The mixer's browser interactivity.** `mixer.html` was built without a browser in the
  container. Its inlined engine is verified to compile and decode/render headlessly, but
  the audio playback, the toggles, and the canvases need a human to open the file and
  confirm (like MIMIC's `app.html`). Open any `output/<run>/mixer.html` in a browser.
- **The sound itself.** The numbers say ARTISAN matches the targets; only your ears can
  say whether `final.wav` *sounds* the way you want against `target-scored.wav`. The
  `assembly/` WAVs and the mixer are there for exactly that.
- **recover-6wave beyond its additive ceiling** — see §5; the ≥100× gate is unmet and
  the reason is characterised, not yet overcome.

---

## 10. A few thoughts (judgement calls worth flagging)

- **Pure Node, no surrogate** was the highest-leverage architectural call. It made the
  verifier trivially honest, removed a whole class of drift bugs, and left nothing for
  Jon to keep alive. The cost is that engine renders are the speed bottleneck; a worker
  pool (MIMIC has the precedent) would parallelise CMA-ES ~8× and is the obvious speed
  win if runs ever feel slow.
- **Per-atom shape selection** is what turns `recover-2wave` from "hard" to "trivial" —
  worth internalising that the right *primitive* (one saw) beats a large *pile* of the
  wrong primitive (many sines). The general lesson ARTISAN embodies: measure first,
  then pick the representation the target is actually made of.
- **The 6-wave ceiling is the honest edge of the additive method** and, to me, the most
  interesting scientific result of the build: it draws a clean line between what
  sighted additive synthesis can and cannot recover (stationary spectra: yes;
  modulation: not exactly). If Jon wants that line pushed, modulation recovery is the
  work, and §5 sketches it.
- I did **not** expand scope to build modulation recovery or a worker pool; both are
  flagged here rather than half-built.

## 11. Files to read, in priority order

1. **`output/recover-2wave/`** and **`output/chimes/`** — the two headline runs. Open
   `report.md`, listen to `final.wav` vs `target-scored.wav`, open `mixer.html`.
2. **`README.md`** — how to run it yourself, in plain English.
3. **This report** — the full story and the honest 6-wave ceiling (§5).
4. **`output/recover-6wave/report.md`** — the honest exception, per run.
5. **`CONTINUATION.md`** — the build ledger and every judgement call, dated.
6. The code, if curious: `src/construct.js` (the method's heart), `src/optimize.js`
   (the polish), `verify.js` (the proof). `node test/all.js` re-checks everything.

*No incident to report. The build stayed inside `artisan/`, modified nothing in the
engine or MIMIC, committed locally throughout, and never pushed.*
