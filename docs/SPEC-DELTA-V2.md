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
P_ACTIVE_AT_INIT      0.03 (F3 audition may revise)
```

*Gate-measured values (P_SWITCH_FLIP_BASE, the Gate 2b p_ratio_jump default) are
filled from the artefacts in the V2 report — see `output/V2-REPORT.md`.*
