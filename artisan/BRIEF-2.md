# ARTISAN — improvement brief v2

*Successor to `BRIEF.md` (v1, 2026-09-03). Written 2026-09-04. Owner: Jon Whitten (pronouns they/them — use them everywhere, including code comments and reports).*

**The complaint, in the owner's words (near enough):** Artisan was built to answer "with 24 hours of local compute, what's the closest to an arbitrary sound you can get with a single genome?" What it actually does is pile up the best ~64 near-stationary waves in under ten minutes and stop. A fine start, and the recover-2wave result is real — but the genome has enormous power that v1 leaves on the floor, and so does the clock: 23 hours 50 minutes of the budget go unspent. At the very least it should match the loudness envelope. Your job is to close both gaps.

**The job in one sentence.** Make absolutely certain that no power the genome has *which could improve the match* is ignored or left on the table, and that the whole budget is there to fund the powers that pay — so a 24-hour run on real audio lands dramatically closer to the target than v1's ten-minute pile of sines. Feature use is never the goal; the score is. A capability examined, measured and rejected with numbers is a job done; a capability bolted on because this brief lists it is a failure of the same class as leaving one unexamined.

---

## 1. Read these first

1. `BRIEF.md` — v1's brief. **Its §2 (task), §3 (hard constraints), §4 (disowned invariants), §5 (method freedom, arbiter rule), §7 (deliverables), §8 (mixer) and §9 (forward compatibility) all still bind, unchanged.** This document adds to it; where the two conflict, this one wins.
2. `output/ARTISAN-REPORT.md` — v1's build report. §5 (the recover-6wave ceiling and the modulation-recovery sketch) and §10 (flagged-not-built: worker pool, modulation recovery) are the beginning of your worklist.
3. `../src/genome.js` — read the whole wave schema. This is the inventory of what v1 ignored.
4. `src/construct.js`, `src/optimize.js`, `src/additive-model.js` — v1's method, so you know exactly what exists.
5. `CONTINUATION.md` — v1's build ledger and judgement calls.
6. `output/chimes/`, `output/speech/`, `output/recover-6wave/` — the runs whose numbers you must beat. Pull exact figures from `meta.json`/`report.md` in each; do not trust this brief's recollection of them.

## 2. The diagnosis — measured, not vibes

The owner's disappointment is backed by what's on disk:

- **The genome offers ~95 genes per wave. v1 sets about six of them** (one shape, frequency, phase, gain, gate timing). Unused, per `../src/genome.js`: the 34-gene **amplitude envelope** (8 nodes × level/time/curve/tension, −80..+24 dB), the 35-gene **pitch envelope** (±9600 cents — a wave can glide almost ten octaves), **PM** (any slot as source, depth to 32), **AM**, **pure modulator waves** (`gain_out_on` off, `gain_mod_on` on — a free LFO/FM operator that costs no audible slot), **mixed shapes** (the four shape weights are continuous and summable, not a 1-of-4 choice), and `mid_wait` repetition beyond the simple gate v1 detects.
- **v1 stops long before the clock does.** The chimes curve (`output/chimes/curve.json`) shows construction done at ~41 s, then coordinate descent grinding 1966 → 1935 (−1.6 %) over eight minutes, then `cd-done` and exit — inside a 20-minute cap, on a 24-hour license. There is no anytime loop; `refineRounds` runs out and the program leaves.
- **The shipped chimes config has v1's own best features switched off** (`configs/chimes.json`: `shapeSearch: false`, `cmaes: false`). The delivered showcase didn't even use the v1 toolkit fully.
- **Speech is the tell.** `output/speech` (a 1.8 s speech clip, 2.85-minute cap): SSE 306 against a silence floor of 407 — only 1.33× better than silence, with all 64 waves spent. Speech is enveloped, pitch-gliding harmonics; a stationary-sine bank is close to the worst honest representation of it.

Why the envelope gap costs so much, concretely: chimes are struck decays. A stationary sine matched to a decaying partial must pick one amplitude for the whole note — too loud in the tail, too quiet at the strike, paying SSE at both ends, when `amp_env_on` plus a handful of nodes would track the decay almost exactly. The same argument, doubled, for speech syllables. This is the cheapest large win in the entire project.

So: the space has NOT been exhaustively searched. v1 searched a thin additive slice of it, briefly.

## 3. What does not change

- Every hard constraint in v1 §3: the deliverable is a valid `PG2:` genome, the true engine is the sole arbiter, engine and MIMIC imported read-only, local and offline, ≤64 active waves (`--max-waves`), 24-hour hard cap per run of the tool.
- The metric: raw-render SSE over the scored window, unchanged and unsoftened. (The owner's "match the loudness envelope" is not a request for a new perceptual metric — envelope mismatch is exactly what SSE is already punishing. Fix the representation, not the ruler.)
- Zero-dependency `verify.js` discipline; measurement honesty; streaming best-so-far to disk; plain-English README and `--help` for a code-illiterate owner; forward compatibility per v1 §9.
- **No regressions:** recover-2wave stays machine-zero, the test suite grows but never shrinks, `quick-demo` still finishes in minutes.

## 4. The mandate — two obligations

### 4a. Spend the budget (anytime discipline)

`--max-minutes` becomes a budget to fill, not a cap to duck under. The improvement loop runs until the budget is gone: rounds of residual re-analysis → structural proposals (new/changed waves, envelopes, modulation) → joint refinement → occasional basin hops / restarts on the worst-explained regions, forever streaming best-so-far. Early exit is permitted ONLY on measured convergence — e.g. no improvement above a stated epsilon across every strategy in the portfolio for a stated long interval — and the run report must show that evidence. "My refinement schedule finished" is not convergence.

A budget scheduler is yours to design: cheap wins first (construction, envelope fitting), expensive search (CMA-ES on wave subsets, modulation recovery, reallocation) funded by whatever remains. Log what each stage bought — the owner should be able to read the curve and see where the hours went.

### 4b. Leave no genome power on the table (ranked, with sketches — sketches non-binding, ranking advisory)

The obligation is exhaustive *investigation*, not exhaustive *use* — the distinction is the owner's, stated when commissioning this brief, and it governs everything below. SSE on the benchmarks is the only judge any technique answers to. Each avenue must be tried honestly — implemented well enough to reveal its real value, not strawmanned in a form built to fail — kept where it measurably lowers SSE on at least one benchmark, dropped where it doesn't, and the verdict recorded with its number either way in the technique ledger (§6). "Tried, cost two hours, bought nothing, dropped" is a fully respectable row; a feature wired in to demonstrate coverage games the brief instead of serving it, and bills the owner for complexity they must keep alive. When budget forces triage, let the residual set the order: spend investigation where the unexplained energy says the payoff is.

1. **Amplitude envelopes — the flagship.** Near-closed-form: short-time complex projection of the residual (or target) onto a wave's frequency gives that partial's amplitude track over time; fit ≤8 nodes to the track (greedy node placement or small DP), write `amp_env_*`, then re-solve gains and polish. Expect this alone to transform chimes and speech.
2. **Pitch envelopes.** Track partials through the STFT (ridge tracking); encode drift/glides as `pitch_env_*` in cents. Speech formant sweeps and inharmonic bell partials stop costing dozens of stationary waves.
3. **Gates + `mid_wait` repetition, properly.** Repeated strikes should share one wave with a period, not burn a slot per strike.
4. **Modulation recovery.** v1's report §5 hands you the method and the test case: detect a regularly-spaced sideband comb in the residual, hypothesise a gated PM/AM carrier, set the genes, fit depths on the true engine. recover-6wave is the designed proof; dense/noisy textures (consonants, bell shimmer) are the real-audio payoff.
5. **Modulator waves.** Slots with `gain_out_on` off are free operators — an FM pair can generate a whole comb for two slots where additive needs twenty.
6. **Mixed shapes.** The atom dictionary is every weighted combination of the four shapes, not four atoms.
7. **Reallocation ("wave stealing").** Greedy matching pursuit is provably suboptimal: periodically kill the wave contributing least, re-spend the slot on the largest unexplained structure, re-polish. With 24 hours, do this a lot.
8. **Parallel refinement.** MIMIC's worker pool (`../mimic/lib/workers.js`, `eval-worker.js`) is the precedent v1 flagged and skipped; CMA-ES populations parallelise trivially. `--workers` already exists in the CLI shape.

The additive fast-scorer needs rethinking as modulation enters: additivity breaks across modulation edges. Partition waves into modulation-connected components; components stay independently cacheable. The true engine remains the arbiter at every commit point, exactly as v1 did it.

## 5. Acceptance gates — do not call the build done without them

Pull all baseline numbers from the v1 run dirs, not from here.

1. **Regression:** every v1 gate still passes. recover-2wave machine-zero; all tests green; `verify.js` passes on every delivered run.
2. **recover-6wave:** the v1 ≥100× gate (vs MIMIC's best) is now IN scope — modulation recovery is the key v1 identified but didn't cut. Aim for machine-zero; it's a genome render, so zero exists.
3. **Chimes:** beat v1's SSE (≈1935) by **≥5×** within a ≤2-hour budget, and show a 24-hour-config run (or an honestly extrapolated long run, see gate 5) doing better still.
4. **Speech:** beat v1's SSE (≈306) by **≥3×**; report the ×-over-silence figure prominently (v1: 1.33×).
5. **Budget-filling proof:** at least one long run (several hours minimum; a full 24 h if operationally sensible — see §7) whose curve shows continued descent well past the ten-minute mark, plus a stated measurement of marginal gain per hour so the owner can decide what future budgets are worth.
6. **The escape hatch, used honestly:** if a numeric gate above proves unreachable, the v1 §5 discipline applies — a measured, spectral, quantified analysis of the ceiling (what bounds it, where the residual energy sits, why no genome in the format can hold it), not a shrug. An unmet gate with a proven ceiling is an acceptable outcome; an unmet gate without one is not.

## 6. Deliverables

- Everything in v1 §7 per run, unchanged (genome, final.wav, target-scored.wav, verify.js, report.md, streamed progress, assembly WAVs where constructive).
- **The mixer, upgraded honestly:** per-wave envelope graphics now show the real fitted envelopes; modulator waves appear as what they are (marked, with their modulation edges indicated); toggling stays honest under modulation (the pure-stem fast path only where provably additive, per v1 §8).
- **Configs:** `quick-demo` (minutes, unchanged spirit), `standard-1h`, `overnight-8h`, `full-24h` — and fix the shipped `chimes.json` so nothing arrives with the good features off.
- **`output/ARTISAN-REPORT-v2.md`:** the story of the improvement, with a v1-vs-v2 table on all four benchmark targets, the budget-scaling curve, the honest ceilings, and the **technique ledger** — one row per §4b avenue: how it was tried, its measured effect on which benchmark, kept or dropped, and why. An avenue missing from the ledger is an avenue unexamined, and the build is not done. Same report culture as v1 and MIMIC. Untether handoff format (TL;DR; what changed; what is verified; what is NOT verified; judgement calls; files to read in priority order).
- README and `--help` updated, plain English throughout.

## 7. Pace, autonomy, and surviving a dead session

- **This session has permission to run as long as it needs** (owner's words). Days are fine. No check-ins, no clarifying questions: when a design choice surfaces, state the options in your output, pick one with a one-line reason, proceed. The owner's untether conventions apply (`skills-rewrite-2026-07-06/skills/untether/SKILL.md` — Step 3 behaviour rules, Step 4 handoff format).
- **Token-outage-proof logging, the house method (v1 §11, unchanged):** read `felix-pitch-project/continuation-system/DESIGN.md`, copy its `TEMPLATE.md` to `artisan/CONTINUATION-v2.md` as your first act (leave v1's `CONTINUATION.md` intact as history). Ledger rows ✅ only when the named file exists AND its check passes; update the NOW line before long work; append every judgement call to DECISIONS the moment it's made; keep the CONTEXT DISTILLATE current; all work products to disk immediately, never held in conversation. Recovery must be one sentence: "Consult artisan/CONTINUATION-v2.md and proceed."
- Commit early and often with messages that narrate the build; order the work so every stopping point leaves something runnable. Long validation runs must themselves be crash-survivable (they already stream; keep it that way).
- **Compute courtesy:** two 24-hour MIMIC runs were launched on this machine on the morning of 2026-09-04 and may still be running (check for `node run.js` processes under `../mimic/`). While they live, cap your own `--workers` to leave them roughly half the machine, and prefer scheduling your longest validation run for after they finish. Never kill them.
- **Two clocks, still:** the 24-hour cap is per run of the finished tool; the build session has no cap. But don't let one 24-hour validation run block the build — develop and prove the method at the 1–2 hour scale, then launch the long run and finish the report around it, updating the report with the final number when it lands (or leaving the owner a one-line instruction for where the number will appear).

## 8. Operational

- Work lives in `code/playing-god/artisan/`, same repo, same rules as v1 §12: engine and MIMIC untouched, commit locally throughout. Push only if the remote is already configured and pushing is frictionless; otherwise leave pushing to the owner and say so in the report.
- Report to `output/ARTISAN-REPORT-v2.md`; mirror per house habit if an outbox exists in your environment.
- CLI keeps its v1 shape; new capabilities get flags with plain-English `--help` text, and every stochastic component logs its seed.
