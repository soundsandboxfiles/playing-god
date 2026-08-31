# SPEC-DELTA-V2 — every specification section v2 amends

**Purpose.** v2 changes are implemented against `playing-god-spec.md` (v1, still
binding except where amended) and `docs/V2-PROPOSALS.md` (the approved work order).
This file quotes each spec passage v2 changes and gives the v2 wording beside it,
so the owner can fold the deltas into the spec later. **This file does not edit the
spec itself** (per the work order). Section numbers refer to `playing-god-spec.md`.

Each entry: **what the spec says → what v2 does → why (proposal / fix id)**. Every
v2 change is a *bias on which moves are cheap*, never a *truncation of what can
exist* — the single deliberate exception is the F4/P4 leading-silence trim, marked
as such (§4 / §8 entry).

---

## §3.1 Per-wave genes — Timing (P3)

**Spec (§3.1, Timing — 5):**
> | `pre_wait` | log | 0 – 30 s |
> | `duration` | log | 0.5 ms – 120 s |
> | `mid_wait` | log | 0.5 ms – 30 s |
> | `mid_wait_on` | binary | off = play once, never repeat |
> | `phase` | linear, wrapping | 0 – 1 |

**v2:** the three quantitative timing genes are reparameterised **in place** to a
period / duty / pre-proportion basis (`mid_wait_on`, `phase` unchanged):

> | `period` | log | 0.001 – 150 s | (= duration + mid_wait) |
> | `duty` | linear | 0 – 1 | (= duration / period; fraction that is sound) |
> | `pre_prop` | log | 1e-6 – 1e5 | (= pre_wait / period; "free to exceed 1") |

Bijective with the v1 trio: `period = duration + mid_wait`, `duty = duration/period`,
`pre_prop = pre_wait/period`; synthesis reconstructs `duration = duty·period`,
`mid_wait = (1−duty)·period`, `pre_wait = pre_prop·period` at decode. Gene positions
are unchanged, so all later indices and the §14 delta store are unaffected.

**Why (P3).** Ratio relations *between periods* are what polyrhythm is, so the P1/P2
ratio moves act on the period; mutating the period then scales the whole pattern
(same character, different tempo) while mutating duty changes character on a fixed
grid — the mutation axes line up with perceptually coherent moves. `pre_prop`'s wide
log range keeps migration loss-free at both extremes and leaves no delay unreachable
(§2.1); its locality cost is the least consequential timing gene (F4/P4 neutralises
the leading pre_wait). **Invariant-clean:** a bijection changes no reachability.
**GATE P3-mig** (`gates/gate-p3mig.js`) proved it phenotype-exact: migrating 200
random v1 genomes + the 7 picks and rendering v1 vs v2 gave **max deviation 0,
correlation 1.0** at 44.1 kHz, 4 s and 30 s.

## §3.1 Per-wave meta (P1) & §3.2 Globals (P1)

**Spec (§3.1, Per-wave meta — 2):** `sigma_wave`, `p_mutate_wave`.
**v2:** adds **`p_ratio_jump_wave`** (cont, 0–1) — the per-wave probability that a
mutated pitch/time gene takes a structured ratio jump (§6.2 entry below).

**Spec (§3.2):** 8 non-visual globals + 14 visualiser = 22 (the build already carried
22 vs the Appendix's 21 — recorded in OVERNIGHT §6).
**v2:** adds **`p_ratio_jump_scale`** (cont, 0–4) — the global scale on the per-wave
ratio-jump probability, and the reference rate for the two global pitch/time genes.

**Genome size.** v1 (as built) 6102 → **v2 6167** (`64×96 + 23`). Both new genes are
*appended*, so every pre-existing index is unchanged. **Why (P1):** the ratio-jump
bias must be evolvable so the search can turn it up where ratio moves pay and down
where they don't — a bias the system can evolve away is a prior on moves, not an
instrument with an opinion (§2.2). ES constants τ′, τ recomputed for n=6167 (change
past the 4th decimal; behaviour unchanged).

## §4.2 / §4.7 Render path — leading-silence trim (F4 / P4) — THE ONE DELIBERATE EXCEPTION

**Spec (§8.3, Render completion; §4.7):** the render is played whole; loudness and
descriptors read the rendered buffer.

**v2:** before loudness and descriptors read the buffer, the **leading run of
sub-audible samples is trimmed** (the exact zeros produced while every wave's
pre_wait gate is shut). Only the *opening* is trimmed; mid-piece silence is
untouched. Loudness, descriptors, the visualiser and the audition batches all read
the trimmed buffer; the app censors dwell / fires `completed` at the trimmed length.

**Why (P4), stated plainly as the exception it is.** A creature that opens with
silence collects dwell for free (its opening is indistinguishable from "loading the
next sound"), so unchecked every lineage drifts toward a ~1.5 s opening silence and
the herd gets boring. This is the **single place the system deliberately reaches
into what is heard for a fitness-hygiene reason** — owner-mandated, scope-limited to
the opening, revisitable, and marked as a non-purist compromise in the code
(`src/render.js`). No other trimming, scoring or filtering is added anywhere.
Threshold: first sample ≥ −60 dB of the render's peak (provisional). Leading
pre_wait becomes phenotypically near-neutral; neutral drift along it is expected.

## §5 Seeded initial batch (F2)

**Spec (§5, Seeded initial batch):**
> The archive is seeded from **32** genomes: one drawn at random as above, and 31
> mutations of it at σ = 0.2.

**v2:** the 32-genome batch is **seven owner Gate 1a picks** (creatures 16, 34, 40,
45, 46, 49, 74 of the seed-0x1A0000 batch) plus σ=0.2 mutants cycling through them to
fill 32. The picks were captured as raw v1 genomes and migrated to v2
(phenotype-preserving); `seed-picks.json` is the committed artefact.

**Why (F2).** Start the search from material a human has already judged worth hearing
rather than a random draw — a stronger start, not a narrower one (nothing made
unreachable; §2.1). Keeps §5's coherence rationale.

**Also fixed (F2, §5 / §7.5 ordering):** the pending seed queue is now **fully
drained** before breeding begins ("played in sequence", §5). v1 drained it only
while zero cells were occupied, so after the first seed inserted it began breeding
and the other 31 seeds never played — which would have made seeding from 7 picks
meaningless. The heard-before-insert rule (§7.5) is untouched.

## §5.1(6),(8) Timing prior (P3)

**Spec (§5.1(6)):** `pre_wait` / `duration` / `mid_wait` drawn independently.
**v2:** still drawn independently in v1 terms, then written as period/duty/pre_prop
(the P3 migration applied at draw time). Generation-zero timing distribution and RNG
order are **identical to v1** — P3 changes mutation geometry, not the init. Keeps the
§5.2 sanity numbers comparable. Provisional.

## §6.2 Continuous genes — ratio-jump mixture (P1)

**Spec (§6.2):** every continuous gene mutates by the self-adaptive ES Gaussian.
**v2:** for pitch- and time-domain genes the kernel is a **mixture**: with
probability `p_ratio_jump` a **structured ratio jump** onto a simple fraction of the
§5 ratio set (P ∝ 1/r, both directions); otherwise the ES Gaussian, **retained
everywhere**. Scope (owner extension): `pitch_master`, pitch-envelope node levels,
`fundamental_cents` (± 1200·log2(r) cents); `period`, `pre_prop`, `tempo_bpm` (× r in
log space); `duty`, amp/pitch envelope node times (subdivision, × r on the
proportion). Amplitude/gain genes are out of scope (not periods). `p_ratio_jump` =
`p_ratio_jump_wave × p_ratio_jump_scale`, both evolvable.

**Why (P1).** The v1 Gaussian in cents is *already* multiplicative in frequency, so
the honest opposition is unstructured small factors vs structured jumps onto simple
ratios — both earn a place. Jumps land near a ratio relation in one step; the
Gaussian supplies detune/beating/drift. Invariant-clean: every value stays reachable
via the retained Gaussian; nothing snapped or quantised (§2.1). `n_ratio_jumps`
logged (§14).

## §6.2b / §13.2 Switch-flip base — recalibration

**Spec (§6.2b, Appendix):** `P_SWITCH_FLIP_BASE = 0.004`, targeting ~1.0 flip per
reproduction (§13.2).
**Finding (OVERNIGHT §8, confirmed v2):** no switch class reaches J = 0.25 under this
prior, so `p_class = 0.004·min(1, 0.25/J)` leaves every class at the base and the
768 switches give ~3 flips per reproduction, not ~1.0.
**v2:** `P_SWITCH_FLIP_BASE` set from the v2 Gate 2a J table to
`1 / (64 · Σ_classes min(1, 0.25/J))`.
**old = 0.004 → new = 0.00134** (= 1/(64·11.66); gives 1.000 expected flips).
`p_switch_flip_scale` (gene, init 1.0) still absorbs drift during a run.

## §6.3 Duplication — sibling operator P2 (copy-at-ratio)

**Spec (§6.3):** duplication copies a whole wave into another slot.
**v2 adds P2:** a finer-grained operator that copies a **functional block** (pitch
block = pitch_master + pitch envelope; or timing block = period/duty/pre_prop/
mid_wait_on) from one active wave to another active wave, with the block's
pitch/period offset by a simple ratio (§5 set, including 1/1 for unison). The target
keeps its own shape, gains, amplitude envelope and modulation — it *adopts a
relation* rather than becoming a clone. Rate `P_COPY_RATIO_BLOCK = 0.08` (provisional,
mirrors `p_duplicate`). Requires ≥2 active waves (operator precondition, not a
truncation). Logged in §14 (`copy_ratio_*`).

**Why (P2).** Between duplication and P2 the one-step-reachable set now includes
chorus, harmonic stacking and rhythmic rhyme — regularity by operator, not by
construction. Invariant-clean (§2.1).

## §9.2 Render-length servo — consecutive-fire guard (F8)

**Spec (§9.2, Guards):** "Do not run the servo until the window is full … apply a
change only if |L_new − L|/L > 0.05."
**v2 adds:** after an *applied* change, no further change is applied until the
trailing window has **substantially refreshed** — `SERVO_REFRESH_GUARD = 50` new
records (half the window X=100). Direction/L′ are still computed and logged every
listen (§14.3, new `suppressed_by_refresh_guard`, `records_since_change`).

**Why (F8).** The v1 servo re-evaluated every listen against a window that slid by
one record, so one threshold crossing re-fired every listen and compounded
geometrically (first real session: 3 consecutive shrinks 60→34→21→15, then 8
consecutive extends 15→300 against an unchanged window). Requiring the window to
refresh before re-applying makes the servo re-decide on data that reflects the change.
Cites §9.2's existing window-composition gate. Provisional guard value.

## §8.3 Dwell / UI timer at render end (F7)

**Spec (§8.3, Render completion):** "Time spent after the render ends does not
accrue." (Logged dwell already caps at L correctly — confirmed first session.)
**v2:** the **visible** dwell timer now freezes at the render's end with a "render
ended (censored at L)" marker, and the 90 s idle rule no longer fires on a listen
that has already completed. Annotation attention gating verified unchanged: focusing
the note field suspends audio + the dwell clock via the single §8.7 path, so typing
accrues no dwell. Display-only fix; the recorded dwell was already correct.

## §14.1 Logging additions

New per-listen fields: `leading_trim_s`, `played_length_s` (F4/P4);
`render_wall_ms` now a real number, not null (F9); `n_ratio_jumps` (P1);
`copy_ratio_fired/kind/r/up/source/target` (P2). New servo-event fields
`suppressed_by_refresh_guard`, `records_since_change` (F8). Genome records tagged
`schema_version: 'v2'` in the app (F6). All still reconstructable from the log; the
delta store is unaffected by the schema change (appended genes, in-place timing).

## §6 / F6 — IndexedDB & serving port

**v2 (F6):** canonical serving port documented as **localhost:8766** (storage is
per-origin; the first real session's 213 listens live there). The app versions the
IndexedDB up (1→2) with a **purely additive** upgrade — never deletes or recreates a
store — so the owner's v1 data is preserved; a `meta` store records the schema
version. A pre-existing v1 database is tolerated, never clobbered.

---

# v2.1 refinement pass (2026-08-31 evening) — deltas on top of v2

The v2.1 micro-run refines the working v2 system against the owner's evening
rulings (V2-PROPOSALS "Owner rulings, 2026-08-31 evening"; F10/W1/F11). Every change
below is still a *bias on which moves are cheap* or a *presentation-layer* handling
of a measurement fact — never a truncation of what can exist. The single deliberate
exception remains the F4/P4 leading-silence trim, now refined (below).

> **Gate status after v2.1 (IMPORTANT).** The harm-axis fix and F10 are both
> correct/mandated in themselves, but **together they drop Gate 2b (behavioural
> locality) below threshold** — p_same 0.192 (needs ≥0.35), p_near 0.479 (needs
> ≥0.70), vs v2's 0.567/0.779. A bisect (`gate2b-bisect.json`) attributes it: F10
> dominates the p_same collapse (denser starts compress the dev axis), the instrument
> fix dominates the H_cell rise and independently sinks p_near (a now-legible harm
> axis is a real second dimension offspring move along — part of v2's "pass" was the
> degenerate axis collapsing offspring into one bin, V2-REPORT §5). Per the work
> order this run did **not** loosen the gate; the archive-geometry response (coarser
> grid / coarser harm binning / adaptive sampling, §13.3, or an owner change to the
> F10 range) is a **pending owner decision** — see `output/V2.1-REPORT.md` §4. So the
> two deltas below are shipped in code, but **the 16×16 deep archive does not
> re-validate under them as-is.**

## §7.1 Harmonicity axis — estimator legibility fix (V2-REPORT §5)

**Spec (§7.1, Axis 2):** harmonicity via spectral flatness (Wiener entropy),
tonal→0, noisy→1. **Instrument (§2.2): carries no opinion about the sound.**

**v2 defect (V2-REPORT §5):** the estimator added a *fixed absolute* floor
(eps = 1e-10) to every bin's power before the geometric mean. On a near-pure tone
almost every bin is genuinely ~0 power, so the geometric mean collapsed onto eps
itself and the flatness read ~1e-9 — the estimator's numerical floor, not a
harmonicity value. ~6% of random genomes piled onto that floor, the distribution
went bimodal, and the calibrated log axis stretched into estimator noise (most
mid-range sounds compressed into the top harm bins; archive coverage fell to 48%).

**v2.1 fix (instrument legibility only — no range narrowed, no genome rejected):**
- **Relative per-frame noise floor** `HARM_FLOOR_REL = 1e-3`: each bin's power is
  floored at `1e-3 × (mean raw bin power of the frame)` before both means. A pure
  tone then reads a *stable* flatness of ≈ `HARM_FLOOR_REL` (scale-invariant —
  independent of the render's amplitude), comfortably above estimator noise; a
  genuinely noisy frame (bins already comparable) is essentially unchanged.
- **Silent frames excluded** from the average: a silent frame carries no harmonic
  information. The v2 eps made a silent frame read flatness 1 (noisy), wrongly
  piling silence-dominated genomes (median silence ~0.73) at the noisy end; a naive
  "silent→0" would just move the pile to the tonal end. Excluding them removes both.
- **Belt-and-braces** `HARM_AXIS_MIN_FLOOR = 1e-4` raises the calibrated `harm.min`
  (raise-only, so it cannot narrow a well-spread axis), so a residual near-pure
  reading still clamps cleanly into the tonal edge bin rather than anchoring the log
  scale on noise.

**Measured** (1000 F10 genomes @4 s): harm p2 **2.4e-10 → 1.13e-3**, p50 8.0e-3,
p98 6.3e-2; the estimator-floor pile is gone. Nothing about what can exist or what
is heard changed (§2.2). Recorded for the cold evaluator as the resolution of the
§5 finding.

## §5 / §5.1 Generation-zero wave count — explicit range draw (F10)

**Spec (§5, Appendix `P_ACTIVE_AT_INIT`):** each wave slot is activated
independently at init with probability `p_active`.

**v2.1 (F10, owner ruling):** the default generation-zero activation is now an
explicit **count** draw: `n_active` uniform in **1..10**, then that many distinct
slots chosen uniformly. **Init-draw bias only (§2.1):** every wave-count and every
slot combination stays reachable, the per-wave kill-switch stays evolvable, and the
`MIN_ACTIVE = 1` floor is untouched (`n_active ≥ 1`). `P_ACTIVE_AT_INIT` and the
per-slot path are retained only for the F3 comparison batches (which pass an explicit
`pActive`); `opts.nActive` forces an exact count (W1). **Why (F10):** the owner's F3
audition found 1–3-wave creatures samey and wanted denser starts on the table — a bet
on where to *start*, not a change to what may exist. **Measured:** active-count
uniform 1..10 over 2000 draws; near-silent @4 s fell ~12% → 5.8%.

## §4.2 / §4.7 Leading-silence trim — 0.25 s threshold (owner refinement)

**v2 (above):** trim any leading run of sub-audible samples before the first audible
sound. **v2.1 (owner ruling):** trim the opening **only when the leading inaudible
span exceeds 0.25 s** (`TRIM_MIN_LEAD_S`); playback then starts at the first audible
moment. Openings quieter than 0.25 s of silence are left alone — "the breath before
an entrance survives". Still the single deliberate presentation-layer exception,
still no genome change; the mandated non-purist comment in `src/render.js` quotes the
refinement. Verified: ≤0.24 s openings pass untouched, ≥0.25 s trim at first audible.

## §8.3 / §8.7 / P5 Near-silent auto-advance (owner ruling)

**Spec (§8.3):** no looping, no auto-advance; dwell is the sole fitness signal
(§8.1). **V2-REPORT §9 (P5):** the owner asked to stop wasting interface time on
near-silent creatures; deleting-at-creation was ruled out as a §2.1 truncation, and
Option A (presentation-layer auto-advance) recommended.

**v2.1 (P5 ruled, app delivery surface only):** on the `near_silent` **measurement**
flag the app plays the creature (so it is heard and measured), shows a clear
"near-silent · auto-advancing" label, and **auto-advances after 0.4 s** (in the
owner's 0.25–0.5 s range), recording the **true short dwell** via the normal commit
path — no fabricated skip, no suppressed dwell. `Space` stays frictionless (a
keystroke pre-empts the timer); pause/annotate/tab-hide clears it via the single §8.7
suspension path and it re-arms on resume. **Nothing is deleted and selection is
untouched** — this acts only on presentation timing (§2.2, the near-silent flag is a
measurement fact, not a taste judgement). Confined to `app/index.html`; `src/` is
unchanged and DOM-free.

## §14 / §8.6 Favourites store (F11)

**v2.1 (F11, owner wishlist):** a new IndexedDB store `favourites`. Pressing **`K`**
writes the current creature — the full genome (exactly reconstructible), `genome_id`,
`added_at`, and a `listen_context` block — to it. Like `notes`, favourites are stated
preference and are **firewalled from the search (§8.6):** nothing reads them into
fitness, descriptors, the Predictor or selection. The IndexedDB is versioned **2→3**
purely additively (no store deleted or recreated; §6/F6 rule preserved). `E` exports
`favourites.jsonl` (the store is in `STORES`). At startup the store is **seeded from
`output/favourites/favourites.json` without clobbering** existing entries (idempotent,
dedupe by id). Merge path documented in `docs/EXPORTING-LOGS.md`.

## Appendix — constants changed

```
GENES_PER_WAVE        95 → 96      (P1: + p_ratio_jump_wave)
GLOBAL_GENES          22 → 23      (P1: + p_ratio_jump_scale)
GENOME_SIZE           6102 → 6167
timing genes          pre_wait/duration/mid_wait → period/duty/pre_prop (P3)
  period   log 0.001..150 s   duty linear 0..1   pre_prop log 1e-6..1e5
P_SWITCH_FLIP_BASE    0.004 -> 0.00134   (target ~1.0 flip, §13.2; measured Gate 2a)
P_RATIO_JUMP_INIT     0.3   (Gate 2b sweep default: largest passing with margin) (P1)
P_RATIO_JUMP_SCALE_INIT 1.0                                                        (P1)
P_COPY_RATIO_BLOCK    0.08 (provisional)                                          (P2)
SERVO_REFRESH_GUARD   50   (= X/2; new, F8)
LEADING_SILENCE_TRIM  first sample ≥ −60 dB of peak (new, F4/P4; non-purist)
TAU_GLOBAL/TAU_LOCAL  recomputed for n=6167 (0.0090 / 0.0798)
P_ACTIVE_AT_INIT      0.03 (retained for F3 batches; NOT the default init after F10)
```

### v2.1 constants

```
HARM_FLOOR_REL        1e-3   (relative per-frame spectral-flatness noise floor; V2-REPORT §5)
HARM_AXIS_MIN_FLOOR   1e-4   (belt-and-braces min for the calibrated harm axis; §5)
N_ACTIVE_MIN/MAX      1 / 10 (F10 generation-zero wave-count range; init-draw bias only)
TRIM_MIN_LEAD_S       0.25   (leading-silence trim now fires only past this; owner refinement)
AUTO_ADVANCE_S        0.4    (P5 near-silent auto-advance window; owner range 0.25–0.5 s)
DB_VERSION            2 → 3  (F11 favourites store; purely additive)
```

*Gate-measured values (P_SWITCH_FLIP_BASE, the Gate 2b p_ratio_jump default) are
filled from the artefacts in the V2 report — see `output/V2-REPORT.md`.*

---

# v2.2 archive-geometry resolution + shadow predictors (2026-08-31 late) — deltas on top of v2.1

The v2.2 run resolves the v2.1 Gate 2b failure (the 16×16 deep archive fell below the
behavioural-locality threshold under the fixed harm instrument + F10 priors) by making
the archive geometry a PARAMETER and letting the gate choose, and it ships BOTH archive
architectures raced against each other, plus BOTH shadow predictors. Every change is
still a *bias on which moves are cheap*, a *presentation/measurement instrument*, or an
*archive-geometry choice sanctioned by §13.3* — never a truncation of what can exist.
The 2b thresholds were NOT loosened (p_same ≥ 0.35, p_near ≥ 0.70, mutation-only).

## §7.1 Archive geometry is a parameter; the shipping deep geometry is G = 8×8

**Spec (§7.1):** "16 × 16 = 256 cells … Axes are global constants (§2.5)."

**v2.2:** the grid is a build parameter `{nx, ny}` (default 16×16 — every prior caller
unchanged). §13.3's first sanctioned response to a 2b failure is a **coarser grid**;
this run swept Gate 2b (thresholds fixed) across {16×16, 16×8, 12×12, 12×8, 10×10, 8×8}
with ONE render pass re-binned per geometry (geometry moves only where bin edges fall,
never a descriptor value — invariant-clean, §2.1). **Result: only 8×8 passes both
thresholds with margin** (p_same 0.379 ≥ 0.35, p_near 0.807 ≥ 0.70); 10×10 is the
nearest miss (p_same 0.343). So the **shipped default deep geometry is G = 8×8** — which
is exactly §13.3's named coarser-grid fallback (64 cells, 512 listens to fill vs 2,048).
Full table in `output/V2.2-REPORT.md` §2 and `gate2b-geomsweep.json`.

**Why (work order §2).** A coarser grid lets a parent's neighbourhood absorb the larger
offspring descriptor spread that the legible harm axis (v2.1) and denser F10 starts
produced. It adds no quality metric and narrows nothing — a pure resolution change.

## §7.2 / §13.3 Adaptive-sampling MAP-Elites shipped alongside the deep grid

**Spec (§13.3):** if behavioural locality is genuinely absent, "switch to
adaptive-sampling MAP-Elites (Justesen et al., 2019) — single elite per cell; a
challenger must beat the elite after being sampled the same number of times, and the
elite is re-sampled whenever it survives … depends on no locality assumption at all."

**v2.2:** implemented as `src/adaptive.js` (`AdaptiveArchive`) and selectable in the
Engine via `archiveMode: 'deep' | 'adaptive'`. Single elite per cell; a bred child that
lands in an occupied cell opens a **contest**; the scheduler owes the challenger
re-listens until it has the elite's sample count, then compares denoised means; the
survivor is **re-sampled**. §8.5 cooldown is **respected when scheduling re-listens** (a
genome in the repeat window is deferred, not re-heard early). Adaptive does NOT require
2b (run informationally at 16×16: p_same 0.234, p_near 0.564 — the deep grid would fail
there, adaptive does not care and fills the grid regardless; race column confirms).

**Why (V2-PROPOSALS fulcrum check).** "Never re-listen" was a derived engineering choice,
not an invariant (the invariant is §2.3b — listens are scarce). The deep grid buys cheap
implicit averaging with a locality dependency; adaptive buys locality-independence with a
re-listen tax. **The race (work order §4) measures both; it declares NO winner** — the
archive-mode choice and the boredom-confound weighting are the owner's.

## §10.2 Autonomy gate DEMOTED from RULE to WISDOM — OWNER AMENDMENT

**Spec (§10.2):** "Minimum data before first use: 2,000 attended listens"; autonomous
operation is *disabled* below ρ < 0.20 and gated throughout on the health metric — a
hard LOCK.

**v2.2 (owner override, 2026-08-31 late — recorded here as an amendment to §10.2):** the
autonomy gate is **demoted from RULE to WISDOM**. Both predictors ship this session, both
are accessible from the UI, and **either can be set running at any moment**. In place of a
lock there is plain on-screen text stating that **worthwhile results are not expected
below creature-model ρ ≥ 0.40**, showing the **current ρ** and the **attended-listen
count**. The gate becomes information, not a barrier.

**What REMAIN hard rules (unchanged, enforced):**
- every predictor-assigned record is labelled **PREDICTED** (`predicted: true` in the
  §14.1 log, with `predicted_by`);
- PREDICTED records are excluded **both** from the accuracy metrics (the predictor does
  not grade its own homework) **and** from the predictor's training data (no training on
  its own outputs);
- the shadow predictions **influence nothing** — not selection, eviction, or rendering —
  in shadow mode; autonomy is a distinct, owner-invoked mode whose PREDICTED assignations
  are quarantined by the labelling rule above.
- **Session-model autonomy freezes** its recent-dwell context to the last K human dwells
  while running alone (its guesses degrade without fresh human context — the UI says so).

## §10 P6 — the two shadow predictors (creature + session)

**Spec (§10.2):** one ensemble of 5 MLPs (3×256) on the full 6,101-gene genome.

**v2.2 (P6, sized to the delivery reality):** two **tiny hand-rolled** ensembles
(`src/predictor.js`) trained **incrementally between listens** from IndexedDB history
(all real sessions; never on PREDICTED or SYNTHETIC records). Tiny on purpose — a big
model on a few hundred points would overfit and lie (§ honesty about scale, P6).
- **CREATURE model** — five genome-derived scalars only (active-wave count, complexity,
  modulation-edge count, feedback flag, expressed-parameter count — all in the §14.1
  schema, so live prediction and history-training share one feature definition). Never
  renders (§10.2). **Its ρ is the number the wisdom text keys on.**
- **SESSION model** — creature features + hour-of-day (sin/cos) + session position +
  **last K = 5** human dwells + listener id.
- **UI (P6):** before each listen both models' predictions; after it, the actual dwell
  beside them; a **rolling Spearman ρ over the last N** (N user-settable, default 40) for
  both models **and a rolling-median naive baseline**; the **session−creature gap** as its
  own readout. LCB fitness `mean − k·std` (§10.2), k = 1.0 when creature ρ ≥ 0.40 else 2.0.
- **Interleaved autonomy** (owner idea): a toggle, **OFF by default**, f(ρ) conservative
  and documented — 0 below ρ = 0.20, ramping linearly to a cap of 3 assignations per human
  listen at ρ ≥ 0.40.

**Autonomy render note (provisional choice, documented).** §10.2 says the predictor
performs no renders and uses predicted descriptors (head B) for placement. v2.2 autonomy
instead **renders each autonomous candidate** (cheap — ms) so it lands in its REAL
descriptor cell, and predicts only the **dwell** (the scarce human signal, §2.3b). This
avoids injecting a poorly-trained descriptor head into the archive while still realising
the "no human listen" speedup. Revisitable; flagged in the report.

## Appendix — v2.2 constants

```
ARCHIVE_GEOMETRY        parameter {nx,ny}; deep DEFAULT G = 8×8 (Gate 2b geometry sweep — only pass w/ margin)
ARCHIVE_MODE            'deep' (default) | 'adaptive' (16×16); visible app setting
ADAPTIVE (Justesen 2019) single elite/cell; contest to elite's sample count; survivor re-sampled; cooldown-respected
PRED_K                  5      (last-K human dwells fed to the session model)
PRED_ENSEMBLE           6      (tiny-MLP ensemble size; mean → prediction, std → LCB)
PRED_HIDDEN             10     (hidden units per MLP)
PRED_RHO_WINDOW         40     (default rolling-ρ window N; user-settable in the UI)
LCB_K                   1.0 (ρ≥0.40) / 2.0 (else)   (§10.2 acquisition)
INTERLEAVE_F(ρ)         0 below ρ=0.20 → linear → cap 3 at ρ≥0.40   (OFF by default)
AUTONOMY_GATE           WISDOM, not lock (owner amendment to §10.2); PREDICTED labelling/exclusion remain hard rules
```

