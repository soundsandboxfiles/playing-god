# Playing God — overnight build report

**Build session:** headless sandbox, plain node (no browser, no audio device).
**Status:** running ledger — updated as each numbered item completes. Gate 2b is
the branch point; its result and what follows are at the end.

This report is written for a reader who does not read code and navigates by
comments (the codebase is heavily commented with *why*, citing spec sections).
It is the build session's own account and is **not** the cold evaluation
(§15.1) — that must be run separately from the logs and gate artefacts.

---

## 0. How to read this / how to re-run everything

Everything runs under plain `node` from the project root
(`/sandbox/code/playing-god/`), no dependencies, no build step:

```
node gates/gate1b-mech.js        # Gate 1b mechanical (lineage stack)
node gates/prior-sanity.js       # §5.2 prior sanity check (≈14 min)
node gates/render-batch.js       # stage 100 WAVs + listening harness for Gate 1a
node gates/gate2a-locality.js    # Gate 2a genotypic locality (≈10–15 min)
node gates/gate2b-behavioural.js # Gate 2b behavioural locality — THE decision point
node gates/gate3-plumbing.js     # Gate 3 machinery (SYNTHETIC dwell) — only if 2b passed
```

Gate artefacts (evidence) are in `output/gate-artefacts/`. The runtime logs the
app would produce are described in `docs/EXPORTING-LOGS.md`.

---

## 1. What was built, stage by stage

### Foundations (`src/`, all DOM-free so the gates import them directly)

- **`rng.js`** — one seedable PRNG (mulberry32) behind every random draw, so
  every gate is reproducible for a cold evaluator.
- **`genome.js`** — the 64-wave × 95-gene + global schema, stored as floats in
  [0,1] mapped to declared ranges on read, reflected at bounds (§3). Includes the
  kill-switch list (§3.3), complexity count, and the exact inverse map used by
  the priors.
- **`priors.js`** — initialisation (§5) and the nine undesigned §5.1 priors
  (documented in §4 of this report).
- **`synthesis.js`** — GENOME→SAMPLES (§4): per-sample PM (not FM, §4.1), routing
  with cycle handling via topological order + one-sample back-edge delay (§4.3),
  gate timing, amplitude/pitch envelopes, optional 60 Hz per-wave visual envelope.
- **`loudness.js`** — integrated-loudness normalisation to −20 LUFS (ITU-R
  BS.1770 / EBU R128, §4.7), K-weighting generated for the actual sample rate,
  gated integrated loudness, true-peak ceiling by static gain (never a limiter,
  §4.7), near-silence path, LRA diagnostic. Hand-rolled, no dependency.
- **`mfcc.js`** — hand-rolled MFCC with a from-scratch radix-2 FFT (§13.2).
- **`descriptors.js`** — the two archive axes (temporal development, harmonicity,
  §7.1), log-scaled 16-bin mapping, and the §5.2 sanity metrics.
- **`distance.js`** — compatibility distance D (§6.5).
- **`variation.js`** — self-adaptive ES mutation (§6.2), discrete switch/routing/
  node-count moves (§6.2b), duplication (§6.3), partner kernel (§6.6), multi-parent
  slot-preserving crossover with the repair pass (§6.8), and the full `breed` step.
- **`lineage.js`** — the SPACE/M/B stack. **`cooldown.js`** — the repeat cooldown
  (§8.5). **`fitness.js`** — contrib/provenance and relatedness-weighted lineage
  averaging (§8.2). **`servo.js`** — the render-length servo (§9). **`archive.js`**
  — Deep-Grid MAP-Elites (§7). **`loop.js`** — the per-listen engine tying it all
  together. **`logging.js`** — genome delta/resync store with exact reconstruction
  and the JSONL streams (§14). **`render.js`** — the single render+normalise
  pipeline everything downstream reads (§4.7). **`wav.js`** — WAV encoder for the
  Gate 1a batch.

### App (`app/index.html`) — delivery surface only

Thin browser shell: Web Audio playback (offline render → AudioBuffer, 8 ms stop
fade), **table-driven** keyboard (§1), one attention-suspension code path for
visibility/blur, annotation focus and the pause key (§8.7), the annotation field
firewalled from the search (§8.6), the legibility display (§12.1), a plain
fallback visualiser using the cached 60 Hz per-wave envelope — not an FFT of the
mix (§11.1), IndexedDB logging in the §14 schema, and the `E` JSONL export
(docs/EXPORTING-LOGS.md). Not on any gate path (all gates are headless).

---

## 2. Gate results (measured vs threshold)

| Gate | Threshold | Measured | Verdict |
|---|---|---|---|
| **1b-mech** lineage stack | exact B-return at depth, exact reconstruction | depth-40 exact; 400-step interleaved 0 mismatches; 251 genomes reconstructed bit-exact | **PASS** |
| **§5.2 prior sanity** | plumbing check, no verdict | see §3 below | (no verdict by design) |
| **1a** listenability | ≥10 of 100 hold past 10 s | **awaits a human** (100 WAVs + harness staged) | pending human |
| **2a** genotypic locality | p90 < 0.20·U at ε=0.01 | **p90/U = 0.624** — isolated to the `timing` class (0.707); all other classes pass | **FAIL** (see §8) |
| **2b** behavioural locality | p_same ≥ 0.35 AND p_near ≥ 0.70 | **p_same = 0.548, p_near = 0.752** (mutation-only) | **PASS** |
| **3-plumbing** machinery | cells fill/evict/protect/servo/logs | all 8 checks pass — 200 cells, depth-8, 1287 evictions, 2500 genomes reconstructed exact | **PASS** (SYNTHETIC) |

**Branch decision (BUILD-ORDER step 4): Gate 2b is the decision point, and it
PASSED. Per the instructions, I built EVERYTHING** — Stage 3 in full, Gate
3-plumbing with synthetic dwell, the §14 logging, the §8.6 annotation field, and
the export path. Gate 2a failed, but 2a is **not** the branch point (BUILD-ORDER:
"The only gate that can invalidate the architecture is Gate 2b"), and its failure
is analysed in §8 — it does not invalidate the deep-grid archive, which depends on
behavioural locality (2b), not fine-grained genotypic locality (2a).

Artefacts: `gate1b-mech.json`, `prior-sanity.json`, `gate1a-batch-manifest.json`,
`gate2a-locality.json`, `J_class_table.json`, `gate2b-behavioural.json`,
`axis-calibration.json`, `gate3-plumbing.json` — all in `output/gate-artefacts/`.

---

## 3. §5.2 prior sanity check — raw distributions (NO verdict, §5.2)

1,000 random genomes rendered at 60 s (the initial listen length L_init) at
22.05 kHz. Metrics on the raw pre-normalisation buffer; loudness figures from the
§4.7 pass. **This is a plumbing check reported as facts about the priors, not a
judgement about what will score (§5.2).**

- Rendered 1000/1000, **0 render errors, 0 non-finite** — synthesis is robust
  across the whole prior.
- Clipping (raw, pre-normalisation): **520/1000** — expected and harmless; §4.7
  normalisation rescales every render.
- Effectively silent (raw RMS < −60 dBFS): **127/1000**; near-silent by the §4.7
  loudness gate: **122/1000** (~12%).
- Active waves: min 1, median 2, mean 2.11, max 7.
- Complexity (not-kill switches ON): median 301 of 768.
- Peak: median 1.00, mean 1.74, p90 4.30, max 15.0.
- RMS: median 0.19, p90 1.01.
- Silence fraction (below −60 dBFS): median 0.73, mean 0.56 — most renders are
  silent most of the time (a direct consequence of the §5.1(6) independent-timing
  choice, see §4 and §5).
- Onsets: median 81, mean 173, p90 498.
- Spectral centroid: median ≈1.49 kHz, p90 ≈2.98 kHz, max ≈9.3 kHz.
- LUFS before normalisation: median −14.9, p90 −2.2, min −61.7, max +18.9.

Full artefact: `output/gate-artefacts/prior-sanity.json`.

---

## 4. The §5.1 priors I had to choose (undesigned — my choices are PROVISIONAL)

The spec (§5.1) names nine priors as genuinely absent and forbids silently
defaulting them. Each choice below biases only the initial draw; none removes any
region from reach (§2.1). All are reproduced here so the owner can overrule them;
each is marked in `src/priors.js` as `§5.1(n) CHOICE`.

1. **`fundamental_cents`.** Declared range = the full pitch range 0–25,100 cents
   (nothing unreachable). **Init draw:** a fundamental frequency log-uniform in
   **[50, 400] Hz**, converted to cents. *Why:* it seats the harmonic series (65%
   of pitch draws) in a musical bass/low-mid register where generation-zero
   material is likeliest to be worth hearing, while mutation can still reach the
   whole range.
2. **Envelope node priors** (the spec's "largest single gap"). Amplitude node
   **level**: Gaussian mean **0 dB**, sd **12 dB**; **curve**: Gaussian mean 0, sd
   0.4 (mostly near-linear); **tension**: Gaussian mean 0.5, sd 0.2. Pitch node
   **level**: Gaussian mean **0 cents**, sd **200** (mostly small pitch motion).
   Node **times**: uniform (they are sum-normalised anyway). All folded into their
   declared ranges, so −80 dB and ±9600 cents remain reachable. *Why:* the default
   (uniform-in-stored) puts the average amplitude node near −28 dB — mostly
   near-silent — which fights the sine-wave-speech argument that complexity lives
   in envelopes (§12).
3. **Shape weights and switches.** Number of enabled shapes drawn **1 (.60), 2
   (.30), 3 (.08), 4 (.02)**; enabled weight uniform [0.3,1]. *Why:* enabling all
   four at p=0.5 averages toward the sine-ish (a narrow palette, §5.1(3)); few
   shapes give distinct timbres. Every combination still reachable by switch flips.
4. **`gain_out` mapping.** Active waves sorted **ascending by pitch (lowest
   loudest)**; amplitude_k = **1/k** (k from 1); dB_k = 20·log10(1/k) mapped into
   [−80,+6]. Inactive waves get a neutral Gaussian draw (mean −12 dB). *Why:*
   loudest-lowest mimics the 1/f rolloff of most acoustic sources; the sort
   direction is a real spectral decision the spec left open — I picked
   lowest-loudest and flag it as provisional.
5. **`tempo_bpm`.** Log-uniform 30–300 (the spec's suggested natural choice).
6. **Joint `duration`/`mid_wait`/`pre_wait`.** **Chosen: independence**, per the
   spec's stated option. *Why:* coupling them (e.g. "don't emit a 5 ms click once
   every 30 s") would be a designer assumption about what ought to be audible — a
   narrowing. The accepted consequence — a substantial fraction of waves inaudible
   in practice — is visible in the §3 silence-fraction distribution (median 0.73).
7. **`phase`.** Uniform [0,1].
8. **Unspecified global inits.** `sigma_global`=0.05, `sigma_wave`=0.05,
   `p_switch_flip_scale`=factor 1.0, `mutation_fraction`=**1.0** (neutral material
   should mutate freely, §2.6; effective per-gene rate is still only
   mutation_fraction×p_mutate_wave≈0.3), `p_duplicate`=0.08, `n_partners`=1.4,
   `partner_influence`=0.15, `p_mutate_wave`=0.3. Also *unlisted* inits I had to
   set: `amp_env_on` p0.6, `pitch_env_on` p0.25, `mid_wait_on` p0.5, `am_depth`
   init log-uniform 0.1–2.0 (mirrors pm_depth), `gain_mod` init log-uniform 0.1–4.
9. **Visualiser genes** (14). Drawn uniform in proposed ranges; visual only, no
   gate reads them. Ranges are a proposal (§11.1), reactable.

---

## 5. Where I was tempted to narrow the space — and what I did instead

Per the governing rule, every such temptation is recorded, not acted on.

- **Silence fraction is high** (median 0.73 of the render below −60 dBFS; ~12% of
  genomes near-silent). The obvious "fix" is to couple the timing priors so waves
  are audible more often. I did **not** — that is the §5.1(6) narrowing, and a
  drone of near-silence is a legitimate point in the space that should score on
  its merits (§4.7 near-silence, §2.1). Left independent; reported the fact.
- **52% of raw renders clip.** Tempting to add a pre-normalisation gain prior or a
  validity check rejecting hot genomes. I did **not** — clipping is a property of
  the raw sum and is removed by §4.7 loudness normalisation with no effect on what
  can be produced. No genome is rejected anywhere in the build.
- **Aliasing** at high `pitch_master` (the pitch range reaches 20 kHz; at 22.05
  kHz descriptor rate that aliases). Tempting to band-limit or clamp pitch. I did
  **not** — the declared range defines the space (§2.1); band-limiting would make
  a region unreachable. Aliasing is part of what those genomes produce.
- **Gate 2a failed on the timing class.** The obvious ways to make it pass are to
  narrow the timing ranges, quantise tempo, or filter out rhythmic genomes — every
  one of which deletes the load-bearing rhythm feature (§3.1) and narrows the space.
  The subtler temptation was to quietly swap the locality distance for a
  time-warp-invariant one so the number passes. I did neither; I reported the
  failure and its cause (§8). Any change to the locality distance is flagged as an
  owner decision, not taken here.
- **No metric anywhere judges whether a sound is good.** The descriptors and the
  loudness normaliser are instruments (§2.2); the sanity check and every gate
  report facts or structural pass/fail, never a verdict on sound quality.

---

## 6. Specification ambiguities / contradictions found (quoted with section)

- **Genome parameter count is off by one.** §2.1 and the Appendix state
  **6,101** parameters / **21** globals, but the §3.2 enumeration names 8
  non-visual globals + 14 visualiser genes = **22**, and 64×95+22 = **6,102**.
  The "22 → 21" master_gain bookkeeping (vault) collided with `n_partners` being
  "silently lost and restored". **I implemented all enumerated genes (6,102),**
  because dropping an enumerated gene to hit 6,101 would remove specified function
  (a visualiser gene "must do something perceptible", §11.1). Flagged, not
  silently reconciled. The ES constants τ'/τ change only past the 4th decimal.
- **"Expected active waves ~2.9" (§5)** is arithmetically inconsistent with
  `P_ACTIVE_AT_INIT = 0.03`: 64×0.03 = 1.92, and with the floor ≈ 2.05. Measured
  mean 2.11 (§3). The 2.9 figure would need p≈0.045. Minor; implemented 0.03 as
  written.
- **Spec version.** The in-repo `playing-god-spec.md` header reads "DESIGN BRIEF
  **v3**"; the vault entity calls it **v9** (36 pp). Recorded as-is in every gate
  artefact rather than reconciled.
- **`d_global` "over the 21 global genes" (§6.5)** — with 22 globals implemented,
  `distance()` averages over all 22. One extra visualiser value out of 22 changes
  `d_global` negligibly.
- **Envelope time-base is unspecified.** §3.1 says node times are "normalised by
  the sum across active nodes" but never states the envelope's total span. I
  interpreted the envelope as spanning the **full render [0,1]**, with the gate
  (pre_wait/duration/mid_wait) chopping it separately. Recorded as an
  interpretation; alternatives (envelope over the gated duration) are defensible.
- **Complexity definition** (§7.4/§14.1 "not-kill switch count") does not say
  whether to count switches on *inactive* waves. I count all ON switches across
  all 64 waves (literal reading). It only breaks ±5% fitness ties, so the choice
  is low-stakes; flagged.

---

## 7. What is waiting for a human, and how to run it

- **Gate 1a (listenability) — needs ears, by construction (§2.3, BUILD-ORDER).**
  100 WAVs and a listening harness are staged at
  `output/gate-artefacts/gate1a-batch/index.html`. Open it on the host. Audio-only
  is the default; press `V` to toggle a visual preview (kept off so it does not
  change what is judged). Keys `1`/`0` tally how many held you past 10 s. **Pass:
  at least 10 of 100.** The build does not and must not judge this.
- **Known minor items in the (untested) app**, none gate-critical: the plain
  fallback visualiser (§11.1) uses pitch→hue / gain→size / cached-envelope→
  brightness but does **not** yet wire the 14 visualiser genes (`hue_base` …
  `background_drift`) into the visual — those are carried in the genome and await
  the §11 proposal, which the spec explicitly leaves to be proposed and reacted
  to. B-replays are handled (dwell averaged, no duplicate cell insert), but a
  replay does not retroactively update the resident's already-stored fitness
  snapshot (deep cells denoise across residents, not by re-evaluation, so this is
  consistent with §7.2).
- **Smoke-test the app on the host.** `app/index.html` cannot be run in the
  sandbox (no browser, no audio device — README). Every `src/` module it uses is
  unit-/integration-tested headlessly and the app's own module script parses
  clean, but the DOM/Web-Audio wiring itself has never executed. Open it in a
  browser on the host and confirm: a Creature plays on the first keypress, SPACE /
  M / B / P / F / E behave, the legibility strip draws, and `E` downloads the six
  JSONL files. It renders at 22.05 kHz in v1 (a noted simplification; §12 permits
  44.1 kHz audio with descriptor downsampling as a later refinement).
- **Gate 2a is failing** and is a genuine result the owner should look at (§8).
  It does not block anything built tonight, but if the owner wants it addressed,
  the decision (a time-warp-tolerant locality distance vs accepting the frame
  metric) is theirs — I deliberately did not take it.
- **Gate 3-real, Gate 4** — need 1,000 and 2,000 real listens; out of scope for
  an overnight headless run. Stage 4 (the Predictor) is **not built** — it is
  gated on 2,000 attended listens (BUILD-ORDER) that do not exist yet.
- **A cold evaluation (§15).** Run a fresh session on the logs + gate artefacts
  using the prompt in `docs/EXPORTING-LOGS.md`. Do not use this build session
  (§15.1: a builder reads its own logs for confirmation).

---

## 8. Gate 2a FAILED — the full analysis (this is a real finding, not a bug I hid)

**Result:** continuous-gene criterion `p90 perceptual distance < 0.20·U at
ε=0.01` — measured **p90/U = 0.624**. Fail. Locality curve (median / p90 as a
fraction of U):

| ε | median/U | p90/U |
|---|---|---|
| 0.001 | 0.025 | 0.206 |
| 0.01 | 0.075 | **0.624** |
| 0.1 | 0.268 | 1.011 |
| 0.5 | 0.626 | 1.710 |

**The failure is isolated to ONE gene class.** Per-class p90/U at ε=0.01:

| class | p90/U | |
|---|---|---|
| **timing** (pre_wait, duration, mid_wait, phase) | **0.707** | FAIL |
| pitch | 0.075 | pass |
| pitch_env | 0.026 | pass |
| amp_env_level | 0.011 | pass |
| gain | 0.008 | pass |
| amp_env_shape / shape / mod_depth / meta / global | ≤0.004 | pass |

**What is going on, established by a controlled diagnostic (not a guess):**

1. It is **not** the near-silence normalisation branch. Only 0.6% of ε=0.01
   mutants flip near-silent status, and those flips have *small* distance
   (0.030·U). The same-silence mutants alone give p90/U = 0.577. Ruled out.
2. It is **not** pitch (the widest range, which I first suspected) — pitch passes
   at 0.075.
3. It **is** the interaction of the timing genes with the **frame-aligned** MFCC
   perceptual distance (§13.2: "mean Euclidean distance between MFCC frame
   sequences"). A small change to `duration`/`mid_wait` on a *repeating* wave
   (`mid_wait_on`) shifts every pulse over the 4-s render, so frame *n* in the
   parent holds a pulse where frame *n* in the mutant holds silence. Frame-aligned
   distance reads that de-synchronisation as a large move even though the sound is
   perceptually near-identical (same rhythm, slightly different rate). The timing
   trio is load-bearing precisely because it makes rhythm and polyrhythm (§3.1),
   so this class is exactly where a frame-aligned metric is weakest.

**What I did NOT do (governing rule).** I did not narrow the timing ranges,
add a tempo/quantisation constraint, gate out rhythmic genomes, or swap in a
time-warp-invariant distance to make the number pass. Removing rhythmic reach
would delete a load-bearing feature (§3.1) and narrow the space (§2.1); changing
the distance metric to pass a gate would be tuning an instrument to a desired
answer (§2.2). Both are the project's forbidden move. **I report the number as
measured.**

**Why this does not block the build.** Gate 2a is not the architecture gate;
Gate 2b is (BUILD-ORDER). 2b uses the archive's *actual* descriptors — the
development axis is built from **8-segment mean** MFCC vectors, which average over
frames and are therefore robust to exactly the pulse-alignment effect that sinks
2a — and 2b **passed**. So the deep-grid archive's load-bearing assumption
(offspring land in/near the parent's cell) holds even though the fine-grained
frame distance does not.

**Where it does matter, flagged for later (not fixed now):**
- The genotypic-neighbour → phenotypic-neighbour assumption behind
  **relatedness-weighted lineage averaging** (§8.2) and the **Predictor** (§10)
  is weaker for timing-dominated genomes. This is a Stage-4 concern; the Predictor
  is not built tonight (needs 2,000 real listens).
- If the owner wants Gate 2a to pass on its own terms, the honest levers are a
  **§13.3-style decision the owner should make**, e.g. a time-warp-tolerant
  perceptual distance (DTW-aligned MFCC) for the *locality instrument only* — which
  changes measurement, not the space. That is a design call, deliberately left to
  the owner rather than taken here.

**J_class table caveat, and a mild calibration mismatch.** In the first 2a run
the switch-flip J was measured by flipping on a uniformly random wave — usually
one of the ~61 inactive slots — so every class read J≈0. Corrected to flip on
active waves and re-ran: `active` is now the largest (**J=0.169**) and `gain_out_on`
next (0.167), with the §13.2 predicted ordering (active largest) holding. But
**no class reaches J=0.25**, so `p_class = 0.004·min(1, 0.25/J)` leaves every
class at the base **0.004**. Consequence: 768 switches × 0.004 ≈ **3 flips per
reproduction**, whereas §13.2 targets "approximately 1.0". The base rate was
evidently set expecting some class to be throttled down; none is, because in this
prior a genome has only ~2–3 active waves so even flipping `active` moves the
sound only ~1/6 of the way to unrelated. This over-flips relative to the stated
target — a constant the log evidence suggests is mis-set (`P_SWITCH_FLIP_BASE`
would need ≈0.0013 to hit ~1.0), flagged for the owner, not changed here. The
self-adaptive `p_switch_flip_scale` gene can also absorb it during a real run.

---

## 9. Stage 3 was built in full (Gate 2b PASS branch)

Built and wired into `src/loop.js` (the per-listen engine) and `app/index.html`:

- **Deep-Grid MAP-Elites** (`archive.js`, §7): 16×16 cells, depth 8, uniformly
  random fitness-blind eviction (§7.4), newcomer protection blind to fitness
  (§7.2), rank-based cell selection `score = 0.7·r_fitness + 0.3·r_yield`, `P ∝
  score^2` (§7.3a), in-cell rank selection with lexicographic parsimony (§7.3c),
  offspring yield with shrinkage (§7.6), D_med refreshed every 100 listens (§6.6).
- **Similarity-weighted multi-parent crossover** with the never-zero partner
  kernel (§6.6), slot-preserving inheritance + repair pass (§6.8), duplication
  (§6.3), provenance `src`/`contrib` (§8.2) — all in `variation.js`.
- **Render-length servo** (`servo.js`, §9): shrink computed, extend triggered.
- **Relatedness-weighted lineage fitness** (`fitness.js`, §8.2).
- **§14 logging** in `logging.js` + `loop.js`: the full per-listen record
  (§14.1), archive snapshots every 100 listens (§14.2), servo events with the
  sorted dwell window (§14.3), anomalies (§14.6), genome delta/resync store with
  exact reconstruction. The app mirrors these into IndexedDB with the same schema.
- **§8.6 annotation field** and **§8.7 single attention-suspension path** in the
  app, with the firewall (notes never touch the search) enforced structurally
  (separate store, no join path).
- **Export path** (`E`) producing timestamped JSONL per store
  (docs/EXPORTING-LOGS.md).

## 10. Gate 3-plumbing (SYNTHETIC dwell — machinery only, NOT evidence about the search)

2,500 listens driven by a uniform random dwell source. Every check passed:

- cells occupied **200/256** (78% coverage); depth histogram peaks at depth 8
  (109 cells full); **eviction fired 1,287×**; **newcomer protection held** on
  every full-cell insert, never blocking all candidates; **servo moved 83×**;
  **2,500 / 2,500 genomes reconstructed bit-exact from the log**; 25 snapshots
  written; **0 render errors, 0 anomalies**.

Per BUILD-ORDER, **no conclusion about behaviour, convergence or quality may be
drawn from this** — the dwell was random, not measured. Every record is tagged
`SYNTHETIC`.
