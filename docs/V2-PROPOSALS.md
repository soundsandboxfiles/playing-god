# Playing God — v2 proposals

**Status: proposals, not decisions.** Nothing here is v1 work; v1's constants,
gates and results stand. Origin: Jon, 2026-08-31, the morning after the
overnight v1 build, mid-way through the first Gate 1a audition (creature 016
had just held them for its full render). The vault entity
`Cowork/CONTEXT/projects/playing-god.md` records the why-history; this file
carries the proposals in full.

The organising idea, Jon's, stated once here and assumed below: **pitch and
rhythm are the same physical quantity — a period — at different timescales**,
and multiplying a period by a simple fraction (3/2, 4/3, 2/1; top-heavy or
regular) is often a *shorter perceptual jump* than nudging it by a small
amount, whether the period is heard as a tone, a pulse, or an LFO. Octave
equivalence and four-against-three are one phenomenon two octaves of timescale
apart. The genome already spans the boundary (pitch range reaches down to
0.01 Hz), so one operator family can serve harmony and polyrhythm at once.
This is a claim about the geometry of sound-space — which moves are short —
never about what will score.

---

## P1 — Ratio-jump mutation for pitch and timing genes

**What.** Extend the continuous-gene mutation kernel (§6.2) to a mixture:

- with probability `p_ratio_jump`: the gene takes a **structured jump** —
  pitch genes move by `±1200·log2(r)` cents; log-encoded timing genes
  (`pre_wait`, `duration`, `mid_wait`) move by `±log(r)` in stored space —
  with `r` drawn from the §5 initialisation ratio set with `P ∝ 1/r`
  (both jump directions, so regular and top-heavy fractions both arise);
- otherwise: the self-adaptive ES Gaussian exactly as v1.

**Scope (owner extension, 2026-08-31): every pitch-domain and time-domain
gene.** Not just `pitch_master` and the wave timing trio — also
`fundamental_cents`, pitch-envelope node levels (already in cents), envelope
node times (proportions; a ratio jump is a subdivision move), `tempo_bpm`.
The Gaussian path is retained everywhere ("plus or minus some" — nothing's
perfect); amplitude/gain genes are out of scope (they are not periods).

**The representation is a gift, not an obstacle.** Jon flagged "pitch is
stored in cents, so fraction math is hard" as a problem to solve. It is the
opposite: cents ARE log-frequency, so multiplying frequency by a simple
fraction is *adding a constant* — ×3/2 is +702.0 cents, ×2 is +1200, ×4/3 is
+498. The timing genes are log-encoded too (§3.1), so the same holds there.
No representation work is needed anywhere; a ratio jump is one addition in
stored space.

**Why the incumbent kernel does not get to claim neutrality.** The v1
Gaussian in cents is *already* multiplicative in frequency — it asserts that
log-frequency locality is the right geometry. There is no opinion-free
mutation kernel, only geometries that match or ignore the physics of sound.
The honest opposition is not additive-vs-multiplicative; it is **unstructured
small factors vs structured jumps onto simple ratios**, and both earn their
place: jumps land a wave *near* a ratio relation in one step; the Gaussian
supplies the imperfection — detune, beating, drift — which is where much of
what sounds alive actually lives. Neither replaces the other; hence a
mixture, not a swap.

**Default bias AND evolvable.** `p_ratio_jump` should exist as a
self-adaptive meta-gene in the pattern of `sigma_wave` / `p_mutate_wave`
(per-wave, with a global scale), so the search can turn the bias up where
ratio moves pay and down where they don't. This is the complete answer to
the §2.2 worry: a bias the system can evolve away is a prior on moves, not
an instrument with an opinion about outcomes.

**Invariant check (§2.1, as scoped 2026-08-30: operators, mechanisms and
regions — never points).** The mixture biases which moves are sampled;
it truncates nothing. Every gene value remains reachable by the retained
Gaussian path. Ranges untouched, no snapping, no quantisation of the space,
no genome rejected. Passes.

## P2 — Cross-wave inheritance: copy-at-ratio of functional blocks

**What.** A variation operator that copies a **functional block** from one
active wave to another wave *within the same genome*, with the copied
period/pitch offset by a simple ratio (including 1/1 for unison):

- **pitch block** = `pitch_master` + the entire pitch envelope (switch, node
  count, all node genes). Copy-at-ratio yields an octave double, a fifth, a
  harmonic stack in one step.
- **timing block** = `pre_wait`, `duration`, `mid_wait`, `mid_wait_on`.
  Copy-at-ratio yields 3:4 against an existing pulse — polyrhythm in one step.

**Jon's own misgiving, and their resolution, recorded.** Inheriting
`pitch_master` alone is inheriting "the base pitch, at the whims of a
free-wheeling pitch envelope" — two waves with the same base can sound
unrelated, so bare-gene copying risks wrecking structure while claiming to
create relatedness. The fix is Jon's: **what is inheritable is the whole
pitch-and-envelope set**, never the bare value. Precedents already in the
design: duplication (§6.3) copies whole waves for exactly this
one-step-reachability reason; crossover is wave-intact (§6.8); and the
×0.05 soft-arrival rule exists if a copy needs to arrive quietly.

**Relation to duplication.** Duplication copies a whole wave into another
slot. P2 is finer-grained: the target keeps its own shape, gains, envelope
of amplitude, modulation — it *adopts a relation* rather than becoming a
clone. Between them the one-step-reachable set now includes: chorus
(duplication), harmonic stacking and rhythmic rhyme (P2). This is the
"regularity and rhyming" property the vault records as the argument Jon is
actually drawn to, obtained by operator rather than by construction.

## P3 — Period / duty-cycle reparameterisation of wave timing

**What.** Jon's proposal, refined: replace per-wave `duration` + `mid_wait`
with a **master period** and a **duty proportion** that splits it into sound
and gap; `pre_wait` becomes a proportion of the period, free to exceed 1.
Refinement over the stated version: the master value should be the **period**
(`duration + mid_wait`), because ratio relations *between periods* are what
polyrhythm is, and P1/P2 jumps should therefore act on the period.

**Why the basis matters.** Under this parameterisation, mutating the period
scales the whole pattern — same character, different tempo — while mutating
the duty proportion changes character on a fixed grid. The mutation axes
align with perceptually coherent moves. The overnight Gate 2a analysis
(OVERNIGHT-REPORT §8) found the timing class is precisely where small
mutations desynchronise everything downstream; that was a finding about the
measurement instrument, but it is also evidence that v1's timing axes do not
point along perceptually coherent directions. This fixes the axes rather
than the metric.

**Cost — the big ticket.** A bijective reparameterisation changes no
reachability (invariant-clean) but is genome-schema surgery: priors, the
crossover repair pass, duplication, compatibility distance, logging schema
and stored-genome compatibility all touch it. v2 proper, not a patch.

---

## Interactions, calibration, gates

- **Any kernel change re-runs Gates 2a and 2b.** Locality is a property of
  the kernel as much as of the space; the v1 numbers do not transfer. 2b
  (with the real descriptors) remains the decision instrument. Expect ratio
  jumps to read as *large* moves under frame-aligned MFCC (they are meant
  to be — a fifth up is audible); what matters is where offspring land in
  descriptor space, i.e. 2b, not 2a's frame metric.
- **The ratio set and its 1/r top-heaviness are designed priors**, same
  provisional status as the §5.1 choices. Reuse the §5 initialisation set
  for consistency; changing it is a listening-session decision, not a code
  decision.
- **Recalibrate `P_SWITCH_FLIP_BASE` and the J tables** under any new
  kernel (see OVERNIGHT-REPORT §8's finding that no class reaches J=0.25
  and flips run ~3× the stated target).
- **Watch item, not a prevention:** cheap ratio jumps enable neutral drift
  around the ratio lattice (octave up, octave down). The logs can measure
  it; nothing should prevent it a priori.

## What this deliberately does not do

No consonance scoring, no snapping to grids, no quantisation of any range,
no validity checks, no gene made unreachable. The Gaussian path is retained
everywhere. The system still has no opinion about what will be engaging —
these proposals only change which neighbourhoods are cheap to visit, and
even that bias is evolvable per P1.

---

## P4 — Trim leading silence (a deliberately non-purist compromise)

**The problem (Jon, 2026-08-31, during the first audition).** A creature that
opens with silence collects dwell for free: its opening is indistinguishable
from "loading new sound", so the listener's instinct is to wait. That is a
valid evolutionary response — and there is real appeal in the soloist who
stands ready and pauses before playing — but left alone, every lineage will
feel the pressure toward a ~1.5 s opening silence, and the herd gets boring
to listen to. The purist position (let silence-openers take over, then let a
starts-immediately disruptor strain win on the relief of not waiting) was
considered by Jon and explicitly declined: "no, I want to be blunter, at
least at this early stage."

**The fix.** Start playback at the first audible sound — trim leading
sub-audible material from the rendered buffer before the dwell clock starts
(or an equivalent: play from 0 but start dwell at first audibility; the trim
is simpler and preferred). **The code comment must say this is a non-purist
compromise, owner-mandated, revisitable** — it is the one place the system
deliberately reaches into what is heard for a fitness-hygiene reason.

**Scope limits, so the compromise stays small:** only the *opening* is
trimmed — mid-piece silence is untouched (the pause before the phrase stays
fully expressible and scoreable). Consequences to note in implementation:
leading `pre_wait` becomes phenotypically near-neutral (neutral drift along
it is fine); §4.7 loudness and the descriptors should read the trimmed
buffer so all instruments see what the listener hears; the servo's dwell
semantics are unchanged.

---

## Fix queue (v1.x — logged 2026-08-31, to implement in the next sandbox pass)

| # | Fix | Notes |
|---|---|---|
| F1 | Harness manifest path bug | `gate1a-batch/index.html` fetches `./gate1a-batch-manifest.json` but the artefact is written one directory up. Workaround in place on host (manifest copied into the batch dir, 2026-08-31). Proper fix: write the manifest into the batch dir too (or fetch `../`), and note that `fetch()` requires the harness be served over localhost, not file:// — document the one-line `python3 -m http.server` invocation in the harness header. |
| F2 | Seed-from-picks | Archive seeding (§5) amended: seed parents = owner's Gate 1a picks (creatures 16, 34, 40, 45, 46, 49, 74 of the seed-0x1A0000 batch), each plus σ=0.2 mutants to fill 32. Keeps the coherence rationale of the seeded batch; pending-queue heard-before-insert rule (§7.5) unchanged. |
| F3 | p_active comparison batches | Render three fresh 100-creature batches at init p_active 0.03 / 0.06 / 0.10; owner auditions ~20 of each with the harness; ears set the constant. Re-run §5.2 sanity per batch. Motivated by owner instinct 2026-08-31: 1–3 wave creatures get samey. Caveat carried: some sameyness may live in envelope/timing priors, not wave count — the comparison shows which. |
| F4 | Leading-silence trim | Implement P4 in the render/playback path with the mandated non-purist comment. |
| F6 | Pin the app's serving port | Browser storage is per-origin, so localhost:8766 and :8765 are different databases. The first real session's data (213 listens, 2026-08-31) lives on **:8766** — that is now the canonical port; document it in the app header. The app must also tolerate a pre-existing v1 database (version or migrate it, never clobber). |
| F5 | Gate 1a criterion note | Owner amended the 1a threshold from 10 s to 5 s mid-audition (see output/gate-artefacts/gate1a-verdict.md). Update BUILD-ORDER's stated pass condition or annotate it, so the next reader isn't confused by the mismatch. |

---

## Methodological note — the drift control (Jon, 2026-08-31, logged not yet actioned)

Jon's long-held rule, raised while starting the first real session: how do you
know developments are due to selection pressure rather than the other forces
at play (operator bias, drift, the priors), unless you compare against the
same herd run under a random fitness function? The answer the design already
half-contains: **SYNTHETIC-dwell mode is exactly that null model.** A run
driven by random dwell is evolution with selection removed; where its archives
drift is the signature of operator bias + priors alone. So the control is: run
N synthetic-dwell runs from the same seed herd, and any claimed discovery in a
real run should differ from that drift distribution. Jon's stated rule
("no meaningful difference from the start herd under random fitness") is
stronger than needed — operators will move even an unselected herd somewhere;
the point is to *measure* where, and correct for it, rather than require
stasis. Cheap to run (no listener needed), labelled SYNTHETIC by the existing
logging rule. Candidate addition to the evaluation protocol (§15) rather than
to the engine.

**Refinement (owner question, 2026-08-31 afternoon): why not engineer the
whole process to be neutral — uniform over every parameter under random
fitness?** The attribution benefit would be real (a known analytic null:
any structure = selection). And much of the system already has it: symmetric
Gaussian steps with reflection have a uniform per-gene stationary
distribution; balanced ± ratio jumps (P1) preserve this; crossover pushes
toward independent genes with preserved marginals (Geiringer 1944) — the
owner's property is literally recombination's fixed point. The two
deliberate violators: **duplication** (no inverse operator, so it
manufactures wave-correlation under random fitness — the price of one-step
choruses) and **the archive itself** (equal weight per occupied cell is
diversity pressure with no fitness signal; under random fitness MAP-Elites
spreads rather than drifts — by design). Deeper limit: uniformity is
chart-relative — uniform in genotype coordinates is violently non-uniform in
sound (§5.2: median render 73% silence), so the archive chooses uniform-ish
over *descriptor* space, i.e. over the audible, instead. Position: keep the
kernel neutral where free (it is, v2 included), keep the two purchased
violations, and MEASURE the residual drift with synthetic runs rather than
flattening the operator set — flattening would cost most of the machine.

---

## Findings from the first real session's logs (2026-08-31, 213 listens — analysed same day)

Session export filed at `output/logs/session-2026-08-31-first/`. Three of
Jon's in-app notes plus the log analysis yield:

| # | Item | Evidence |
|---|---|---|
| F7 | Dwell/attention semantics at render end and during annotation | Logged dwell correctly caps at L (all 11 `completed` listens show dwell == L exactly), but the visible timer keeps counting after the render ends (owner note, listen 180); verify §8.3 attention gating truly suspends during annotation typing (`time_composing_ms` reached ~24 min over the session) and after render end; make the UI timer stop or mark at render end. |
| F8 | **Servo consecutive-fire runaway — measurement integrity, high priority** | The servo re-evaluates every listen against an unchanged window: 3 consecutive shrinks 60→34→21→15 at listens 101–103 (p_completed=0 each), then 8 consecutive extends 15→300 at listens 204–211 (same window_n=100, same p_completed=0.11 every time). One threshold crossing → geometric runaway to floor/ceiling. Fix: after an applied change, the servo must not move again until the window has substantially refreshed (guard choice to be recorded in SPEC-DELTA-V2, citing §9.2). This runaway also produced the 300 s renders behind the owner's "massively slow" note. |
| F9 | `render_wall_ms` logged as null | The 5–10 s load stalls at L=300 cannot be confirmed from the log; record it. |

## P5 — Near-silent creatures at the interface (owner instinct vs invariant — UNRESOLVED, analyse before acting)

Owner note, listen 179: "everything labeled near silent is actually inaudible
to me. My instinct is to just delete those when they're created and move on."
Deleting at creation is a §2.1-forbidden truncation — a validity check
rejecting genomes, the exact move the invariants exist to prevent — so this
one does NOT get the P4 treatment without a decision made with eyes open.
The real cost is interface time: ~12% of random genomes are near-silent
(§5.2 data), i.e. one dead listen in eight during early sessions. The
non-truncating alternatives to lay out for the owner: presentation-layer
handling of `near_silent`-flagged renders (they are physically inaudible at
playback gain, which is measurement fact, not taste); letting them score
zero on merit as §4.7 intends and accepting the time cost; or a fast-skip
affordance. Selection pressure will also thin them naturally. Owner decides.

## Session observation worth carrying into tonight's p_active decision

Population mean active wave count evolved from ~2 (init) to 7.29 by listen
100 and 8.75 by listen 200 — selection is already pushing hard toward more
waves, independently confirming the owner's sameyness instinct. Archive:
47 cells at listen 100 → 75 at listen 200, QD score 207 → 405, D_med rising.
Evolution is working and diversifying; the wave-count question may be more
about generation-zero listenability than about where evolution ends up.

---

## F3 verdict and owner rulings (2026-08-31 evening audition)

Engagement by batch (Jon, ~20 auditioned each): p_active 0.03 → 4/21;
0.06 → 6/21 (incl. f3-pactive-006 #001, "might be the best thing I've heard",
4 waves; #019 "most pad-sounding thing we've made", 5 waves); 0.10 → 8/23.
Engaged creatures' wave counts: 003 batch {5,3,1,3}; 006 {4,4,4,3,7,5};
010 {6,5,7,6,8,6,6,6} — engagement rises with waves, but a 1-wave creature
engaged too, and Jon noted some 6-wave creatures "sounded like 1 or 2"
(expected: gain_out_on p=0.75 plus pure modulators mean active ≠ audible).

**F10 (owner ruling): generation-zero wave count becomes a RANGE, 1–10.**
Replace the per-slot p_active draw at init with an explicit count
distribution: draw n_active in 1..10 (uniform unless the owner says
otherwise), then activate that many slots. Init-draw bias only; kill-switch
evolvability and the floor unchanged; nothing unreachable (§2.1).

**W1 (owner wishlist): a high-wave exploration batch** — render creatures at
forced n_active up to the 64 max (e.g. 8/16/32/64) purely for the owner to
hear what dense territory sounds like. A rendering exercise, not a prior
change.

**F11 (owner wishlist): favourites library** — created at
`output/favourites/favourites.json` + vault entity
`jons-favourite-creatures`. Wishlist: an in-app "add to favourites" key
writing an entry (genome, timestamp) live during sessions.

---

## Owner rulings, 2026-08-31 evening (P5 and the trim refined) — for the v2.1 micro-run

**P5 RULED: auto-advance adopted.** On the `near_silent` measurement flag the
app plays the creature, shows a clear "near-silent" label, and auto-advances
after **0.25–0.5 s** (owner's range; pick a value in it and record), logging
the true short dwell. Nothing deleted, no fitness faked, selection untouched.
Option D (selection bias) remains vetoed.

**F4/P4 trim refined (owner):** trim the opening only when the leading
inaudible span exceeds **0.25 s**; playback then starts at the first audible
moment. Openings quieter than 0.25 s of silence are left alone (the breath
before an entrance survives). No genome change — presentation only. The
mandated non-purist comment stays and should quote this refinement.

---

## The fulcrum check and the two-lane resolution (owner + Cowork, 2026-08-31 late)

Owner asked whether the Gate 2b response was balancing a planet on an
unexamined pebble — specifically whether "never listen twice" is an invariant.
Resolution: it is NOT an invariant; the invariant is §2.3b (listens are the
scarce resource). "Never re-listen" is a derived engineering choice, and
§13.3's adaptive-sampling row is the design with that choice relaxed. The
owner's boredom observation is recorded as the strongest argument FOR the
deep grid (kin-averaging = repeated measurement WITHOUT repetition; adaptive
sampling's re-listens carry the familiarity confound). Decision by
measurement, not argument: the v2.2 run implements BOTH — deep grid at the
finest 2b-passing geometry, and adaptive-sampling MAP-Elites at 16×16 — and
races them under synthetic noisy dwell for listens-to-fill, listens-to-
stabilise, niches preserved, and re-listen tax. Owner chooses on the numbers;
the boredom weighting stays a human judgement. The app ships with archive
mode + geometry as a setting so the choice is a flip, not a rebuild.

## P6 — Shadow predictor with public accuracy (owner proposal, 2026-08-31)

Spec §10 gates the Predictor's USE on 2,000 attended listens and Spearman
ρ ≥ 0.40. Nothing gates WATCHING it fail in public. P6 ships it in shadow
mode from day one: it predicts every dwell before the listen, the actual
dwell lands next to it, and its rolling accuracy (over the last N listens,
N user-settable) is on the main UI. Influence on the search: none, until the
spec's own gate unlocks it.

**Two models, split by the owner's own catch.** The owner spotted that a
predictor leaning on "the last 10 dwell values" is good at next-dwell
prediction and bad at its actual job (evaluating creatures without session
context, which is what autonomy needs). So: a CREATURE model (genome-derived
features only, never renders — §10.2's second-head trick applies) whose
accuracy is the ONLY number that gates autonomy; and a SESSION model
(creature features + time of day, session length, last K dwells, listener id)
for the UI's live prediction and as a diagnostic. The gap between their
accuracies measures how much of dwell is context rather than creature — a
finding in its own right. Both displayed beside a naive baseline (rolling
median) so "accuracy" means skill, not flattery.

**Autonomy controls.** A number field + button ("do N assignations by
yourself") wired to the spec's Gate 4 conditions — visible always, unlocked
only at ≥2,000 attended listens AND creature-model ρ ≥ 0.40; until then it
shows progress toward unlock. Every predictor-assigned record is labelled
PREDICTED (the SYNTHETIC rule's sibling): excluded from the accuracy metric
(it does not grade its own homework — owner's phrasing: "it'll always be
right!") and excluded from the predictor's own training data (no training on
its own outputs). LCB fitness per §10.2 when live.

**Interleaved autonomy (owner idea, logged for the vault too):** instead of
10,000-block autonomous runs, between each human listen the predictor does
f(current ρ) silent assignations — autonomy that scales continuously with
demonstrated accuracy and stays permanently on the re-grounding leash. A
candidate replacement for §10.2's checkpoint blocks. Implement behind the
same Gate 4 lock, off by default, f conservative and documented.

**Honesty about data scale:** at a few hundred listens the creature model's
ρ will be poor. That is the point of showing it — calibrated trust, built in
public, on the spec's own health metric.

**Owner override (2026-08-31, late): the §10.2 autonomy gate is demoted from
RULE to WISDOM.** Both predictors ship this session, both accessible from the
UI, and either can be set running at any moment. The on-screen text near the
autonomy controls must state plainly that worthwhile results are not expected
below creature-model ρ ≥ 0.40, showing current ρ and attended-listen count —
the gate becomes information, not a lock. What REMAIN hard rules: PREDICTED
labelling on every autonomous record, exclusion of PREDICTED records from the
accuracy metric and from predictor training data, and the shadow predictions
influencing nothing. Session-model autonomy note: its recent-dwell context
freezes to the last K human dwells while running alone (its guesses degrade
without fresh human context — the UI should say so). Recorded in SPEC-DELTA
as an owner amendment to §10.2.

---

## v2.3 queue (logged 2026-08-31, post-smoke-test)

| # | Item | Notes |
|---|---|---|
| B1 | **onended race** (FIXED on host, uncommitted): stale playback-finished callback froze the next listen's timer at L. One-line guard in app/index.html; measurement was never affected (commit computes from clocks). Fold into next commit. | done, commit pending |
| S1 | **Seed herd = all favourites** (owner instruction): seed-picks.json regenerated from favourites.json — 10 seed parents (7 gate1a + f3-006 #001/#019 + w1-n64-07), verified via genomesFromSeedPicks. Data-only change; commit pending. | done, commit pending |
| P7 | **Descriptor head → genome-only autonomy.** Owner hit the render cost ("run 10 takes a while"). Path: train a genome→descriptor predictor on the unlimited free labels every real render produces; display its objective filing accuracy (fraction placed in correct / adjacent cell); switch autonomous placement to genome-only once proven — same public-accuracy pattern as the dwell predictor. Until then rendering stays (honest filing). | next sandbox run |
| P8 | **Background autonomy rendering**: move autonomous renders into a worker so the UI never blocks; progress readout. Immediate relief independent of P7. | next sandbox run |
| P9 | **Visualiser v2 (owner, 2026-08-31): broaden its phase space** — far more visual variety than pitch-hue/gain-size — while keeping dynamic responsiveness, and strengthen family similarity AND out-of-family difference through **genome similarity, explicitly NOT genealogy** (§6.7's genotypic-not-genealogical principle, visually). The clean mechanism: make appearance a deterministic function of the genome — wire the 14 dormant §11 visualiser genes plus derived genome features into the visual, so near genomes look near and distant genomes look distant automatically, with no lineage data consulted anywhere. Spec §11.1 explicitly invites this proposal. | next full version |

---

## Wishlist additions (owner, 2026-09-01)

| # | Item | Notes |
|---|---|---|
| P10 | **Speculative pre-render** — dense creatures load slowly; the fix is breeding+rendering candidate N+1 in a background worker while creature N plays, from the archive state at that moment. Honest cost, stated: the selection producing N+1 is one listen stale. MAP-Elites permits this. | with P8 |
| P11 | **Genome ↔ text string** — any genome serialisable to a version-tagged string (e.g. `PG2:` + base64 of the gene array); a copy key on the playing creature and a paste box that displays/plays any string. Version tag mandatory (schema will change; the P3 migration is precedent). Enables sharing creatures person-to-person. | next sandbox run |
| W2 | **Phone app with swipe gestures — FLAGGED, needs an owner ruling made knowingly.** Owner proposal: swipe-no = huge fitness penalty; swipe-yes = record dwell and advance. The yes-swipe is just advance. **The no-swipe penalty is the first proposal ever to put STATED PREFERENCE into F(g)** — §8.1 says dwell seconds and nothing else, and the §8.6 annotation firewall exists precisely because stated preference is rejected by the mission statement. Possible readings: (a) on a phone the swipe IS the native dwell-ending gesture, so a no-swipe is just a skip and should carry no extra penalty; (b) the owner deliberately amends §8.1 for the phone context (their right — record it as an owner amendment if so). Do not implement the penalty without that explicit ruling. | v3, ruling pending |

| F12 | Pointer activity (pan/drag/wheel on the visuals — PR #1) should refresh `lastInputMs` so attentive mouse-only listening isn't flagged idle at 90 s. One line, next pass. | next sandbox run |
