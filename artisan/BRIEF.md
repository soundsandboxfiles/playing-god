# ARTISAN — build brief v1

*Third member of the Playing God set. Written 2026-09-03. Owner: Jon Whitten (pronouns they/them — use them everywhere, including code comments and reports).*

**The lineage.** Playing God is the blind watchmaker: no target, fitness is measured listening time, the system exists to find what nobody could specify. MIMIC inverted the philosophy but kept the blindness: a known target, computed fitness, but search by evolution using the engine's own variation operators. ARTISAN completes the set — sighted where Playing God's watchmaker is blind. A known target, and **any method whatsoever**. Measure the target, take it apart, do calculus at it, train something, whatever. The only rule for the process is that it deliver something as close to perfect as possible.

**The job in one sentence.** Given a target WAV, produce a Playing God genome whose raw render matches the target sample-by-sample as closely as possible over a scored window — ideally exactly.

---

## 1. Read these first

1. `../playing-god-spec.md` — you need §3 (genome), §4 (synthesis) intimately. You do NOT inherit its invariants (see §4 below).
2. `../mimic/README.md`, `../mimic/docs/FITNESS.md`, `../mimic/docs/GENOME-STRING.md`, and `../output/MIMIC-REPORT.md` — the fitness spec, the codec, and everything empirically known about this landscape.
3. `../src/genome.js` and `../src/synthesis.js` — ground truth for layout and semantics. Where this brief and the code disagree, the code wins; where the spec and the code disagree, flag it, don't guess.

## 2. The task, precisely

- **Input:** any WAV (16/24-bit PCM, mono or stereo). Decode with mimic's `wavio` conventions: stereo averaged to mono, linear-resampled to the engine rate (22050 Hz). Import mimic's lib rather than rewriting it.
- Let **x** = target length in samples after decode. Let **y** = a user-set offset (default 0; seconds/ms in the UI, samples internally). The **scored window** is render samples `[y, y + x)`.
- **Objective:** minimise `SSE = Σ (render[y+i] − target[i])²` over the window, on raw float samples at 22050 Hz. Target value: **0**. Chase 0 even where it is provably unattainable — the chase is the phrasing that gets the owner the closest result. Report `similarity = 1/SSE` with mimic's `PERFECT_SIMILARITY` guard, for continuity with mimic's numbers.
- **Off-canvas rule (owner's words, near enough):** the program is TOTALLY AGNOSTIC about the render outside the scored window. Not silence, not anything — off the canvas, pay it no mind. Render length is yours to choose wisely, subject to length ≥ y + x. Note: the engine maps envelope node times proportionally over the *whole* render, so the shortest render containing the window maximises envelope resolution inside it — but the choice is yours. Expose `--render-length` as an owner override.
- **Raw render, never normalised.** Score and deliver via the raw `render()` path (mimic's `render-raw.js` precedent). The engine's `renderNormalized` applies loudness normalisation and a leading-silence trim; either would corrupt the metric. This is now explicit policy, not just precedent.
- **Length-dependence, stated honestly:** gates (`pre_wait`/`duration`/`mid_wait`) are absolute; envelopes stretch with render length. The delivered WAV is *this genome at this length*. The same genome at another length (e.g. under Playing God's render servo) is a relative, not a twin. Record the render length prominently and say this in the report and README — the owner plans to drop genomes into Playing God and should meet no surprises.

## 3. The only hard constraints

1. **The deliverable is a genome.** The final output must be expressible as a valid `PG2:` genome string — every gene a float32 in valid stored range — and the delivered WAV must be exactly the unmodified engine's raw render of that genome, encoded with the engine's own 16-bit encoder. Formalisation agreed with the owner: *any* genome expressible in the format is legitimate, because the discovery project's own axiom ("priors bias sampling; they never truncate the space") gives every valid genome probability > 0 of arising there. No "plausible creature" requirement — do not invent one.
2. **Engine read-only, one-way dependency.** Artisan imports `../src/*` and `../mimic/lib/*` read-only. It never modifies them. Nothing in Playing God or MIMIC ever imports Artisan.
3. **Local and offline.** Runs entirely on the owner's machine with no network connection at runtime, costing nothing but local compute. Hard cap 24 hours wall clock per run; default configs should finish far sooner.
4. **≤ 64 active waves.** Expose `--max-waves` (default 64 = the slot count). No minimum.

That is the complete list.

## 4. Invariants explicitly disowned (owner's instruction, 2026-09-03)

The discovery project's invariants exist to protect open-ended search from designer opinion. Artisan is designer opinion, weaponised. None of the following bind here:

- **§2.1 vastness / priors-never-truncate** — narrow, canonicalise, bias, and exploit at will. Internal canonicalisation of redundant gene combinations (which §3.1 forbids in the main project) is fine here.
- **§2.5 no gene may touch the fitness function** — meaningless here; the fitness is external and fixed.
- **Listens as scarce resource, dwell measurement, measurement-integrity machinery** — no listens are spent; evaluation is computed.
- **The engine's variation operators, recombination rules, §6 pipeline, MAP-Elites, the roulette ban** — optional tools, not requirements. You may set genes directly and never mutate anything.

Read this program as an engineer making the very best tool by whatever means; the genome format is the only cage. The one inherited discipline that stands in full: **measurement honesty**. Real numbers, real ceilings, incidents reported plainly (MIMIC's report is the model).

## 5. Method freedom, and the arbiter rule

- **Any method.** Closed-form analysis, STFT peak-tracking, matching pursuit, GA, CMA-ES, neural nets, gradient descent, hybrids, things without names yet.
- **Surrogate licence.** You may reimplement the synthesis loop in any language/framework (NumPy, PyTorch, hand-rolled SIMD, anything) for speed or differentiability. The true engine is the **sole arbiter**: the final genome must be round-tripped through the PG2 codec (forcing float32 quantisation) and rendered by the unmodified engine for the delivered WAV and the reported score. If a surrogate exists, measure and report surrogate-vs-engine parity; an optimiser that polishes in float64 and loses its shine at float32 has not finished.
- **Stack requirements:** (a) the verifier (§7) runs in plain node with zero dependencies, always; (b) any other stack ships with a one-command setup script the owner runs once with internet, after which everything runs offline; (c) prefer the fewest moving parts consistent with quality — every dependency is something the owner has to keep alive; (d) if anything stochastic remains, log seeds.
- The owner is functionally code-illiterate: `--help` and the README must read in plain English, and nothing may require them to evaluate code.

## 6. What is already known about this landscape

From MIMIC's report (read it in full): time-domain SSE has a **silence attractor** — a misaligned loud render scores worse than silence, so beating silence requires genuine positive correlation, which for sustained tones means a frequency/phase needle (~1/T Hz) that blind mutation almost never threads. MIMIC reached 35× below the silence floor on an envelope-rich 6-wave target and stalled at ~2% below floor on a pure 2-wave oscillator.

Artisan's whole reason for existing: **the needle is measurable.** An FFT of the target hands you frequency and phase; blind search's hardest case is sighted design's easiest.

A non-binding sketch, free to discard: greedy constructive matching pursuit — fit the single best wave-atom to the residual (STFT for pitch/phase/onset, envelope fit into ≤8 nodes, `mid_wait` for repetition, PM/self-modulation for dense or noisy spectra), subtract, repeat up to the wave budget, then joint local refinement (coordinate descent / CMA-ES / surrogate gradients). Constructive methods also yield the assembly artifact (§8) for free.

**Ceilings to name in the report, not hide:** everything above ~11 kHz is unrepresentable at 22050 Hz; stereo is collapsed; delivery is 16-bit; 64 enveloped oscillators against arbitrary real audio means SSE = 0 is reachable essentially only when the target is itself a genome render. For real audio, report the floor reached and your best analysis of what bounds it.

## 7. Deliverables per run (`output/<run>/`)

- **`genome.pg2.txt`** — the genome string. This is the crown jewel: it is what the owner pastes into Playing God or anywhere else. Make it easy to find and copy.
- **`final.wav`** — the true-engine raw render, with render length and sample rate recorded beside it.
- **`target-scored.wav`** — the target exactly as scored (post decode/mono/resample), for honest A/B listening.
- **`verify.js`** — plain node, zero deps: decode the PG2 string → render via the true engine at the recorded length → confirm sample-identity with `final.wav` → recompute SSE against `target-scored.wav` → print a plain-English verdict. **A run is not done until verify.js passes.** This is the proof the constraint held and the tripwire for surrogate drift.
- **`report.md`** — SSE, similarity, the target's silence floor, method actually used, wall-clock time, ceilings hit.
- **Progress trace, streamed.** MIMIC's one incident was losing 8.75 hours of work by writing the deliverable only at the end. Never repeat it: stream best-so-far genome + WAV + curve as the run proceeds, and honour a `--max-minutes` cap.
- **The mixer** (§8).
- If the method is constructive: **progressive assembly WAVs** — the render with wave 1, waves 1–2, 1–3, … The owner wants to hear the sound assemble.

## 8. The mixer — the owner's listening artifact

A self-contained HTML app per run. Core, mandatory:

- Loops the final render.
- One row per active wave: an on/off toggle, and a small graphic of that wave's loudness envelope across the whole render, with the scored window shaded so the canvas/off-canvas boundary is visible.
- Toggling re-renders **honestly**, in-browser via the real engine in a worker (mimic's `app-worker.js` / `browser-pool.js` are precedent). Muting a wave is NOT stem subtraction — a muted modulator changes its carrier's sound. A pure-stem fast path is allowed only where provably additive (no modulation edges into or out of the toggled set).

Niceties welcome once the core is honest: target-vs-render waveform overlay, live SSE for the current toggle subset, a play-target button. Design it to be pleasant — this is for listening, not debugging.

## 9. Forward compatibility (genome v2+)

Never hard-code 64, 96, 23, or 6167. Read slot count and gene layout from `../src/genome.js` and the PG2 codec. The codec's tag already rejects unknown versions loudly — keep that behaviour. A future `PG3` with more slots should require only codec/constants updates in Artisan, no structural rework. `--max-waves` defaults to whatever the loaded schema's slot count is.

## 10. Acceptance gates — do not call the build done without them

1. **Verifier discipline:** every delivered run passes `verify.js`.
2. **Recoverability, the headline gate:** on MIMIC's known-genome targets (`recover-2wave`, `recover-6wave` — reuse `../mimic/lib/targets.js`), where SSE = 0 provably exists, beat MIMIC's recorded bests by **≥100×**; aim for machine-zero. `recover-2wave` is the emblem: MIMIC stalled at the silence floor there (~1524 vs floor ~1562) because the needle can't be threaded blind. A sighted method must crush it. Pull MIMIC's exact recorded numbers from its own outputs (`race-full.json`, run dirs) — do not trust this brief's recollection of them.
3. **Real-audio showcase:** `../mimic/targets/westminster-chimes.wav`. Beat MIMIC's best recorded chimes SSE decisively, deliver the full artifact set including the mixer, and report the residual floor honestly.
4. **Tests:** a suite covering WAV decode round-trip, window arithmetic (y offset, render length ≥ y+x), fitness parity with mimic's implementation on shared cases, PG2 round-trip including float32 quantisation, verify.js against a known genome, and surrogate parity if a surrogate exists.

## 11. Pace, autonomy, and surviving a dead session

- **This is an overnight autonomous build — and it may run longer.** Take the time the work needs; days are fine. No check-ins, no clarifying questions: when a design choice surfaces, state the options in your output, pick one with a one-line reason, and proceed (the owner's untether conventions — the skill lives in the snapshot at `skills-rewrite-2026-07-06/skills/untether/SKILL.md`; its Step 3 behaviour rules and Step 4 handoff format apply here).
- Don't confuse the two clocks: the **24-hour cap is per run of the finished tool** on the owner's machine. The build session has no cap.
- **Assume the session can die at any moment** (token exhaustion, crash). The house system for surviving that is the **Continuation System** — read `felix-pitch-project/continuation-system/DESIGN.md` (in the snapshot) and copy its `TEMPLATE.md` to `artisan/CONTINUATION.md` as your first act. Follow it as written: ledger rows are ✅ only when the named output file exists AND its stated check passes; update the NOW line *before* starting long work; append every judgement call to DECISIONS the moment it's made; keep a CONTEXT DISTILLATE of what a fresh instance couldn't rediscover from disk; all real work products go to disk immediately, never held in conversation. The owner's recovery action is one sentence — "Consult artisan/CONTINUATION.md and proceed" — so the file must make that sentence sufficient.
  - Additionally: commit early and often, locally, with messages that narrate the build, and order the work so every stopping point leaves something runnable — the MIMIC crash lesson applied to the build itself, not just to runs.
- Close with the handoff report per the untether format (TL;DR; what changed; what is verified; what is NOT verified; judgement calls worth flagging; files to read in priority order) — that is `output/ARTISAN-REPORT.md` from §12.

## 12. Operational

- Lives at `code/playing-god/artisan/`, sibling of `mimic/` — same repo, same GitHub remote. If building in the sound-sandbox container: commit locally, never push; pushes happen host-side after sync-back, per house workflow.
- Report to `output/ARTISAN-REPORT.md` plus the host outbox mirror, per house habit. Record incidents the way MIMIC's report did: plainly.
- CLI mirrors mimic's shape: `node run.js --config <file>` plus overrides — `--target`, `--offset` (y), `--max-waves`, `--render-length`, `--max-minutes`, `--workers`, `--run`. Ship a `quick-demo` config that finishes in minutes.
