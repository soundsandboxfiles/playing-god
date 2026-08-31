# Playing God — v2 build report

**Build session:** headless sandbox, plain node (no browser, no audio device).
**Status:** COMPLETE. All work-order items (F1–F9, P1–P4, the recalibration, and
every v2 gate) implemented, committed one unit at a time, and verified. GATE P3-mig
sample-exact; the decision gate (2b) passes at every swept value. P5 analysed only.
What awaits a human is in §10 (F3 audition, app smoke-test, cold evaluation).

This report is written for a reader who does not read code and navigates by
comments (the codebase is heavily commented with *why*, citing spec and
V2-PROPOSALS sections). It is the build session's own account and is **not** the
cold evaluation (§15.1). It is built on the v1 system (passed its gates, ran its
first real 213-listen session), not from scratch.

Companion documents:
- `docs/SPEC-DELTA-V2.md` — every spec section v2 amends, quoted, with the v2
  wording beside it (for the owner to fold into the spec).
- `docs/V2-PROPOSALS.md` — the approved work order (P1–P4, F1–F9, P5).

---

## 0. The governing rule, and how v2 held to it

> Priors bias sampling; they never truncate the space.

Every v2 change is a bias on which moves are *cheap*, never a constraint on what
can *exist*. The single deliberate exception is the F4/P4 leading-silence trim:
owner-mandated, scope-limited to the opening, and its code comment says it is a
non-purist compromise. No other exception was added, and **no metric anywhere
judges whether a sound is good**. Section 6 lists every point where narrowing the
space was tempting and what was done instead.

## 1. How to re-run everything

Under plain `node` from the project root, no dependencies, no build step:

```
node gates/make-seed-picks.js       # write seed-picks.json from the v1 ground truth (F2)
node gates/gate-p3mig.js            # GATE P3-mig: timing reparam equivalence (P3)
node gates/gate2a-locality.js       # Gate 2a genotypic locality + switch-flip recalibration
node gates/gate2b-behavioural.js    # Gate 2b single run (decision gate)
node gates/gate2b-sweep.js          # Gate 2b p_ratio_jump sweep {0,0.05,0.15,0.3} (sets default)
node gates/prior-sanity.js          # §5.2 prior sanity (1000 genomes, final v2 priors)
node gates/f3-pactive-batches.js    # F3 audition batches at p_active 0.03/0.06/0.10
node gates/gate3-plumbing.js        # Gate 3 machinery (SYNTHETIC dwell), picks-seeded
node gates/drift-control.js         # 3× 2500-listen SYNTHETIC null model, picks-seeded
```

Gate artefacts (evidence) are in `output/gate-artefacts/`.

## 2. Gate results (measured vs threshold)

| Gate | Threshold | Measured | Verdict |
|---|---|---|---|
| **P3-mig** timing reparam | sample- or near-exact; report max deviation | **max deviation 0, corr 1.0** (207 genomes, 4 s + 30 s, 44.1 kHz) | **PASS (sample-exact)** |
| **2a** genotypic locality | p90 < 0.20·U at ε=0.01 | p90/U = **0.705** (timing class only; all others pass) | **FAIL — informational for v2** (see §3) |
| **2b** behavioural locality (decision) | p_same ≥ 0.35 AND p_near ≥ 0.70 (mutation-only) | **PASS at ALL swept p_ratio_jump** (0.548–0.567 / 0.776–0.785) | **PASS; default p_ratio_jump = 0.3** |
| **3-plumbing** machinery | cells fill/evict/protect/servo/logs | all 8 checks pass — 124 cells (48%; harm-axis degeneracy, §5), depth-8, 1676 evictions, 2500/2500 reconstructed, **servo moved 13× (no runaway)** | **PASS (SYNTHETIC)** |
| **§5.2** prior sanity | plumbing check, no verdict | see §4 | (no verdict by design) |

**The decision gate PASSED decisively.** Gate 2b is the only gate that can
invalidate the v2 archive (BUILD-ORDER), and it passes at every swept ratio-jump
value with margin — behavioural locality barely moves as the ratio-jump bias rises
(p_same 0.567→0.548, p_near 0.785→0.776 across 0→0.3), so the P1/P2/P3 kernel keeps
offspring landing in or near the parent's cell. The deep-grid archive's load-bearing
assumption holds under the v2 kernel and schema.

## 3. Gate 2a (informational for v2) & the switch-flip recalibration

Gate 2a re-run under the v2 kernel and the trimmed render path. **It is
informational for v2 and does not block** (work order §6): the v1 report's §8
established that the frame-aligned MFCC metric punishes timing moves, and the timing
class is exactly where a reparameterisation like P3 lands as a "large" frame move
even when perceptually small. The archive uses the 8-segment mean MFCC (robust to
that), which is Gate 2b — the real decision instrument.

- U (unrelated median perceptual distance): 293.14. **Continuous criterion FAILS:**
  p90/U at ε=0.01 = **0.705** (threshold 0.20).
- Locality curve p90/U: ε=0.001 → 0.290; ε=0.01 → **0.705**; ε=0.1 → 1.246; ε=0.5 → 1.854
- **Failure isolated to ONE class — timing (p90/U = 0.819)**; every other class passes:
  shape 0.001, gain 0.008, amp_env_level 0.013, amp_env_shape 0.005, pitch **0.079**,
  pitch_env 0.031, mod_depth ~0, meta ~0, global ~0. Same shape as v1 (OVERNIGHT §8):
  the frame-aligned MFCC reads any timing shift (now a period/duty/pre_prop move,
  plus the F4 trim moving the frame origin) as a large move even when perceptually
  small. V2-PROPOSALS predicted exactly this ("ratio jumps read as *large* under
  frame-aligned MFCC … what matters is 2b, not 2a's frame metric"). The archive's
  8-segment mean MFCC averages over frames and is robust to it — that is Gate 2b.
- J table (median J/U): **gain_out_on largest at 0.381** (throttled, factor 0.657);
  **active 0.196** (not throttled, factor 1.0); all other classes ≤ 0.010. Note this
  differs from §13.2's expectation that `active` would be largest and throttle to
  ~0.001 — under this prior `active` moves the sound only ~1/5 of the way to
  unrelated (only ~2–3 waves active), and it is `gain_out_on` that crosses J=0.25.

**Switch-flip recalibration (work order §5, OVERNIGHT §8).** Measured under the v2
kernel: `Σ_classes min(1, 0.25/J) = 11.66` (only `gain_out_on` throttled). At the v1
base 0.004 that gives `64 · 0.004 · 11.66 ≈ 2.98` flips per reproduction — the ~3×
overshoot OVERNIGHT §8 found. **`P_SWITCH_FLIP_BASE` set old 0.004 → new 0.00134** =
`1 / (64 · 11.66)`, giving **exactly 1.000 expected flips** per reproduction at
`p_switch_flip_scale = 1` (§13.2 target). Recorded here and in SPEC-DELTA-V2. The
self-adaptive `p_switch_flip_scale` gene still absorbs drift during a run.

*(2a was NOT tuned to pass; the number is reported as measured. No timing range was
narrowed, no metric swapped — see §6.)*

## 4. §5.2 prior sanity check (final v2 priors) — raw distributions, NO verdict

1,000 random genomes at 60 s / 22.05 kHz under the final v2 priors. Plumbing check,
reported as facts about the priors, not a claim about what will score (§5.2).

- Rendered **1000/1000, 0 render errors, 0 non-finite** — synthesis robust across
  the whole v2 prior (including the reparameterised timing and the two new genes).
- Clipping (raw, pre-normalisation): **520/1000** (removed by §4.7 normalisation).
- Effectively silent (raw RMS < −60 dBFS): **127/1000**; near-silent by the §4.7
  gate: **122/1000 (~12%)**.
- Active waves: min 1, median 2, mean **2.11**, max 7. Complexity median 301.
- Peak: median 1.00, p90 4.30, max 15.0. RMS: median 0.19, p90 1.01.
- Silence fraction: median **0.73**, mean 0.56 (the §5.1(6) independent-timing
  choice; unchanged from v1 by construction).
- Onsets: median 81, p90 498. Spectral centroid: median ≈1.49 kHz, p90 ≈2.98 kHz.
- LUFS before normalisation: median −14.9, p90 −2.2, min −61.7, max +18.9.

**These are essentially identical to the v1 §5.2 numbers** (OVERNIGHT §3), which is
the expected and desired result: P3 expresses the timing prior in v1 terms then
converts (same distribution, same RNG order), and P1/P2 change *mutation*, not the
initial draw. The v2 changes did not disturb generation zero. No verdict (§5.2).
Full artefact: `output/gate-artefacts/prior-sanity.json`.

## 5. Gate 2b — the decision gate, and the p_ratio_jump sweep

Run on the final v2 kernel and schema, at `p_ratio_jump` init ∈ {0, 0.05, 0.15, 0.3},
mutation-only. Default set to the largest value passing **p_same ≥ 0.35 AND
p_near ≥ 0.70 with margin**.

| p_ratio_jump | p_same (≥0.35) | p_near (≥0.70) | H_cell | with-crossover (same/near) | pass? |
|---|---|---|---|---|---|
| 0.00 | 0.567 | 0.785 | 0.399 | 0.500 / 0.702 | **PASS** |
| 0.05 | 0.561 | 0.778 | 0.333 | 0.503 / 0.710 | **PASS** |
| 0.15 | 0.555 | 0.778 | 0.458 | 0.489 / 0.697 | **PASS** |
| 0.30 | 0.548 | 0.776 | 0.357 | 0.472 / 0.688 | **PASS** |

**Shipped default: p_ratio_jump = 0.3** (`P_RATIO_JUMP_INIT` in `src/priors.js`) —
the largest swept value, and it passes mutation-only with margin (p_same 0.548 ≥
0.35, p_near 0.776 ≥ 0.70). All four values pass; the ratio-jump bias costs only ~2
points of p_same and ~1 of p_near across the whole range, so behavioural locality is
not the binding constraint on it. The default is set to 0.3 to let the structured
ratio moves fire often at init while remaining evolvable per wave (`p_ratio_jump_wave`)
and globally (`p_ratio_jump_scale`) — the search can still turn it down where ratio
moves don't pay. (Only `0` passing was the flag-loudly case; it did not occur.)
with-crossover is expected less local (§13.3) and is informational: its p_near dips
to 0.688 at 0.3, just under 0.70, but the decision is mutation-only, which passes.
H_cell ≈ 0.33–0.46 of U throughout — cells are moderately heterogeneous, as under v1.
`seed-picks.json` regenerated so the picks-seeded herd carries p_ratio_jump_wave=0.3.

**Single-run confirmation at the shipped default.** `gate2b-behavioural.js` re-run at
the default (p_ratio_jump=0.3, its own axis calibration) independently confirms:
**p_same = 0.567, p_near = 0.779, H_cell = 0.333** (mutation-only) — PASS. It also
writes the shipped `axis-calibration.json` (dev [0.014, 308], harm [1.7e-11, 1.0]).

**A real finding to flag — the harmonicity (Axis 2) calibration is degenerate at the
low end.** The `calibrateAxis` p2–p98 procedure sets the harm axis min to **1.7e-11**,
which is the *numerical floor of the spectral-flatness estimator for a pure tone*
(harmonicityRaw adds a 1e-10 epsilon per bin, so a near-sine reads ~1e-9 flatness),
not a meaningful harmonicity value. ~7% of random genomes are near-pure tones sitting
on this floor, and a large fraction are fully noisy (flatness ≈ 1.0), so the harm
distribution is bimodal and the log axis stretches into estimator noise — most
mid-range sounds compress into the top harm bins. Consequences, stated honestly:
(i) the 16×16 archive effectively provides most of its diversity resolution along
Axis 1 (temporal development, which is well-spread: dev [0.014, 308]); (ii) Gate 2b's
high p_same is therefore carried substantially by dev-locality — still a valid pass
(offspring do land near parents), but the harm axis contributes less than nominal.
This is **not tuned away** (that would be adjusting an instrument, §2.2). Two neutral,
non-truncating options for the owner: floor the harm axis min above the estimator
noise (~1e-4, as v1's calibration happened to sit) in the app's live recalibration
(BUILD-ORDER already mandates live recalibration at L=60 s), or raise the flatness
epsilon so pure tones read a stable small value rather than the floor. Neither
changes what can be produced; both only improve the archive's harm-axis legibility.
Recorded for the cold evaluator (§15) — it is a candidate mis-set constant on the
evidence of the logs, exactly the kind §15.2 invites, and no kind-of-sound claim.

## 6. Where narrowing the space was tempting — and what was done instead

- **Gate 2a fails on timing (p90/U 0.705 > 0.20).** The ways to "pass" — narrow the
  timing ranges, quantise the period, filter rhythmic genomes, or swap the locality
  metric for a time-warp-invariant one — each deletes load-bearing rhythm (§3.1) or
  tunes an instrument to a desired answer (§2.2). Did none; reported as measured. 2a
  is informational for v2; 2b (robust 8-segment metric) is the decision.
- **P3 pre_prop wide range (1e-6..1e5).** Tempting to cap it for locality. Capping
  would make long-delay-short-period combinations unreachable (§2.1) and break
  loss-free migration. Left wide; noted the locality cost (least consequential gene).
- **P2 requires ≥2 active waves.** An operator precondition, not a truncation — the
  muted-target region stays reachable via unmute + P1. Verified reasoning, not capped.
- **P5 near-silent creatures (owner wants to delete at creation).** A §2.1-forbidden
  truncation. Not implemented; analysed in §9 for the owner to decide.
- **The ratio set is a designed prior, kept verbatim from §5** — not edited (a
  listening-session decision, not a code one, per P1).
- **No metric anywhere judges sound quality.** The descriptors, loudness normaliser,
  locality gates and sanity check are instruments (§2.2); every report is a fact or a
  structural pass/fail. The one place v2 touches what is heard (F4/P4 trim) is flagged
  as the deliberate exception.

## 7. Provisional values I chose, and why

| Value | Choice | Why / status |
|---|---|---|
| `P_RATIO_JUMP_INIT` | **0.3** (Gate 2b sweep default) | Largest swept value passing 2b with margin |
| `P_SWITCH_FLIP_BASE` | 0.004 → **0.00134** | From the v2 Gate 2a J table; ~1.0 flip/reproduction (§13.2) |
| `P_RATIO_JUMP_SCALE_INIT` | 1.0 | Neutral global scale; evolvable |
| `P_COPY_RATIO_BLOCK` (P2 rate) | 0.08 | Mirrors `p_duplicate`; could become a gene later |
| `SERVO_REFRESH_GUARD` (F8) | 50 (= X/2) | "Substantially refreshed" = half the window new; cites §9.2 |
| Leading-trim threshold (F4) | −60 dB below peak | Matches the near-silence convention; targets pre_wait zeros |
| `pre_prop` range (P3) | log 1e-6..1e5 | Covers migration at both extremes; keeps all delays reachable |
| P2 block-copy: 50/50 pitch vs timing | equal | No reason to prefer either a priori |
| P1 global-gene ratio rate | `P_RATIO_JUMP_INIT × scale` | Globals (fundamental, tempo) have no per-wave carrier |
| Timing prior expressed in v1 terms | keep v1 distribution | P3 changes mutation, not the init; comparability |

## 8. Ambiguities / questions carried (with section numbers) — decided and continued

- **§5 "played in sequence" vs §7.3a-edge "with exactly one occupied cell breed".**
  v1 drained the seed queue only while zero cells were occupied → one seed played.
  Read §5 as authoritative for the seeded batch: v2 drains the whole queue first
  (F2). Assumed this is the intent; flagged for the owner.
- **P1 scope and `duty`.** P1 predates P3's `duty` gene. `duty` is a time-domain
  proportion like the node times P1 lists, so I included it in ratio-jump scope
  (subdivision move). Assumed consistent with P1's intent; recorded.
- **P1 global genes' ratio-jump rate.** No per-wave carrier for `fundamental_cents`
  / `tempo_bpm`; used `P_RATIO_JUMP_INIT × scale`. Assumed acceptable (2 genes).
- **P2 rate not specified.** Used a constant 0.08 (not a gene). Assumed a fixed
  operator rate is fine (P2 doesn't require evolvability, unlike P1).
- **Trim in the locality gates.** Chose to trim in 2a/2b (consistency with what the
  app produces — 2b MUST, since the app assigns cells on trimmed audio). Recorded.

## 9. P5 — near-silent creatures at the interface (ANALYSE ONLY; no behaviour changed)

**The owner's instinct (listen 179):** "everything labeled near silent is actually
inaudible to me. My instinct is to just delete those when they're created and move
on." **Nothing in this run changes any behaviour for near-silent creatures** — this
is analysis for the owner to decide against, as the work order requires.

**Why deleting at creation is out of bounds.** Deleting a genome at creation because
it is near-silent is a *validity check that rejects genomes* — a §2.1-forbidden
truncation, the exact move the invariants exist to prevent. It would make an entire
region (genomes whose raw integrated loudness is below −60 LUFS) *unreachable*, not
merely unlikely. And near-silence is a legitimate point in the space (§4.7): it
should score badly on its own merits, not be defined out of existence. So this one
does **not** get the F4/P4 treatment — that exception was owner-mandated,
scope-limited and about *presentation timing*, whereas deletion is about *what may
exist*.

**The real cost is interface time, and it is measurable.** ~12% of random genomes are
near-silent (§5.2 data, both v1 and v2). At generation zero that is roughly one dead
listen in eight — a genuine drain on the scarce resource (§2.3b). Two mitigating
facts: (a) the `near_silent` flag is a *measurement fact* (the render is physically
inaudible at playback gain), not a taste judgement, so acting on the flag at the
presentation layer is not a smuggled prediction; (b) selection pressure thins
near-silent creatures naturally over a run, since a silent listen skips fast and its
lineage is rarely selected — the 12% is a generation-zero rate, not a steady-state
one.

**Non-truncating alternatives, with costs (owner decides):**

| Option | What it does | Keeps §2.1? | Cost / risk |
|---|---|---|---|
| **A. Presentation-layer auto-advance** | When `near_silent` is set, the app plays it (so it is heard/measured) but shows a clear "near-silent" banner and, after a short fixed window (say 2 s), auto-advances *without* recording a dwell that pretends the listener chose to skip. | Yes — the genome still exists, is generated, selected, stored; only its *presentation* is handled. | Must NOT fabricate or suppress fitness in a way that biases the signal. Simplest honest form: still record the real (short) dwell, just spare the owner the wait. Low risk. |
| **B. Score zero on merit + accept the cost** | Change nothing. Near-silent creatures play, the owner skips them in ~0.5 s, they score low and wash out (§4.7 as intended). | Yes — the purist baseline. | The ~1-in-8 dead listens at generation zero. This is the current behaviour. |
| **C. Fast-skip affordance** | A dedicated key (or a shorter cooldown) that lets the owner dismiss a flagged near-silent creature in one keystroke, recording an honest short dwell. Owner-driven, not automatic. | Yes — nothing is rejected; the listener just skips faster. | Adds one key binding (table-driven, §1). Puts the decision in the owner's hands each time. Low risk. |
| **D. Down-weight near-silent in *selection* (not fitness)** | Bias parent-selection away from near-silent lineages (selection is a prior, not an instrument — §7.6 already biases selection). | Yes — selection steers effort, it does not reject or alter measurement. | This is a *claim that near-silence will not score* smuggled into selection — borderline. Recommend NOT doing this without the owner explicitly accepting the bias; it is the failure-mode shape (§2.3). |

**Recommendation (for the owner, not enacted):** combine **A** (auto-advance after a
short window on the `near_silent` flag) with **C** (a fast-skip key), because both act
only on presentation/interaction and both keep the fitness signal honest and the
space intact. Avoid **D** unless the owner explicitly wants a selection bias against
near-silence, since that is the invariant's known failure mode wearing an
efficiency costume. **B** (do nothing) remains the purist default and is what ships
today. The decision is the owner's; this run changed nothing.

## 9b. Gate 3-plumbing (SYNTHETIC) & the drift-control null model

**Gate 3-plumbing, v2, picks-seeded, under the shipped v2 axis-calibration**
(`gate3-plumbing.json`, all records SYNTHETIC). 2,500 listens under uniform-random
dwell. All 8 machinery checks pass: **124/256 cells occupied (48%)**, depth histogram
peaks at depth 8 (91 cells full), **1,676 evictions**, newcomer protection held on
every full-cell insert, **2,500/2,500 genomes reconstructed bit-exact**, 25 snapshots,
**0 render errors, 0 anomalies**. The servo **moved 13× over 2,500 listens** (reaching
L=300 under the synthetic distribution's ~17% completion rate) — the F8 guard turned
what was a per-listen geometric runaway in v1 into a handful of spaced moves. Coverage
is lower than the v1-calibration run (86%) precisely because the v2 harm axis is
degenerate (§5) — most sounds compress into few harm bins — which is the coverage cost
of that finding made concrete; the gate still clears its ≥40-cell threshold with
margin. Per BUILD-ORDER **no conclusion about the search may be drawn** — dwell is
random.

**Drift control — the SYNTHETIC null model** (`drift-control.json`, all SYNTHETIC).
Jon's long-held rule (V2-PROPOSALS methodological note): to know a development is
*selection* and not operator bias + drift + priors, compare against the same herd
run under a random fitness function. This is that baseline: **3 runs of 2,500 listens
each from the picks-seeded herd**, distinct recorded seeds (0xd8171/2/3), archive
snapshots every 250 listens kept as the reference distribution.

Final-snapshot readouts (SYNTHETIC — a reference distribution, **not** a claim about
what scores):

(Run under the shipped v2 axis-calibration, so the null model matches what the app
starts from.)

| run | cells | QD | D_med | active waves | n_partners | partner_infl | p_ratio_jump_wave | p_ratio_jump_scale |
|---|---|---|---|---|---|---|---|---|
| 0xd8171 | 121 | 325 | ~0.56 | 2.65 | 2.95 | ~0.21 | 0.354 | 1.56 |
| 0xd8172 | 156 | 435 | ~0.58 | 5.45 | 3.67 | ~0.21 | 0.386 | 1.73 |
| 0xd8173 | 136 | 372 | ~0.59 | 5.78 | 3.22 | ~0.23 | 0.435 | 1.33 |

**What this baseline says, and it matters for reading a real run.** Under *random*
fitness, from the same picks-seeded start (~2.2 active waves, n_partners 2.1,
p_ratio_jump_wave 0.35, scale 1.4 at listen ~250), the herd still drifts: active-wave
count climbs to ~2.6–5.8, n_partners to ~3.0–3.7, and **the ratio-jump meta-genes
drift** (per-wave 0.35→~0.35–0.44, scale to ~1.3–1.7). This is operator bias + priors
alone — duplication and multi-parent crossover push toward more waves and more
partners even with no selection. (The lower, noisier cell counts vs the v1-calibration
run reflect the degenerate harm axis, §5, not a change in the drift itself.) So a real
run that shows "active-wave count rose" or "n_partners rose" cannot claim that as a
*selection* effect without exceeding this drift band (directly relevant to the owner's
sameyness / wave-count instinct, F3 — some of the observed wave-count rise is operator
drift,
not necessarily what listeners reward). This is a candidate addition to the
evaluation protocol (§15), not the engine, and changes no behaviour. All records
labelled SYNTHETIC.

## 10. What awaits a human, and how to run it

- **F3 p_active audition** — three batches at `output/gate-artefacts/f3-pactive-*/`
  (git-ignored; they reach the host via sync-back). Per-batch sanity (100 genomes):
  **p_active 0.03 → mean 2.12 active waves, 15 near-silent; 0.06 → 4.15 waves, 3
  near-silent; 0.10 → 6.24 waves, 0 near-silent.** Serve each over localhost (F1),
  audition ~20 audio-only, pick the p_active. Read against the drift null model (§9b):
  the owner's "1–3 waves get samey" instinct is real, and near-silence falls off
  sharply with p_active — but the null model shows wave count *also* rises under no
  selection, so the audition is about generation-zero listenability, which only ears
  can judge (BUILD-ORDER). The summary shows whether residual sameyness tracks wave
  count or lives in the envelope/timing priors (F3 caveat).
- **Gate 1a re-audition (optional)** at the 5 s threshold (F5) if the owner wants a
  fresh generation-zero read under v2 priors.
- **Smoke-test the app on the host** (`app/index.html`, served on :8766) — the DOM/
  Web-Audio wiring has never executed in the container (no browser). Confirm: a
  Creature plays; SPACE/M/B/P/F/E behave; the legibility strip draws the v2 gate
  pattern; the dwell timer freezes at render end (F7); `E` exports; and the v1
  IndexedDB is preserved (F6).
- **Gate 3-real, Gate 4** — need 1,000 and 2,000 real listens; out of scope headless.
- **A cold evaluation (§15)** on the logs + gate artefacts, in a fresh session.

## 11. What was built (v2 changes, by commit)

F1 harness pathing + localhost doc · F5 BUILD-ORDER threshold note · F6 port 8766 +
non-clobbering IndexedDB upgrade · F4/P4 leading-silence trim · F9 render_wall_ms ·
F8 servo consecutive-fire guard · F7 UI timer freeze at render end · F2 seed-from-
picks (+ full-queue drain fix) · P3 period/duty reparam + migration + GATE P3-mig ·
P1 ratio-jump mutation (evolvable, extended scope) · P2 copy-at-ratio blocks ·
switch-flip recalibration · Gate 2a/2b re-run under the v2 kernel · §5.2 sanity · F3
batches · Gate 3-plumbing + drift-control null model. Each is one commit with a
why-citing message; `src/` stays DOM-free; the app is the delivery surface only.
