# Playing God — the to-do list

*Built 2026-09-05 ~00:30 by an untethered Cowork session, from the actual files and their
datestamps (`THE-STORY-SO-FAR.html` ignored, per your instruction). One Claude session per
item, or one physical Jon-task where marked. Companion handoff report:
`REPORT-FROM-AUTONOMOUS-SESSION-2026-09-05.md` (beside this file) — it holds the evidence
trail for every claim here. Reordered 2026-09-05 on Jon's instruction: the core-app
listening item moved from first to last — the user-evolved aspect is the least interesting
to them at present.*

**The one standing constraint everything else bends around:** the two MIMIC chimes runs
launched Friday ~07:00 are not 24-hour runs. Their completion criterion was changed to 3,614
generations (commit `a55c8a6`), chimes generations run several times slower than speech's
did (9.5 s target vs 1.8 s, and the pace keeps falling as champions densify — 25 gens took
58 min at 21:08, 64 min by 23:10), so the 2,880-minute wall-clock cap fires first: **both
runs stop Sunday ~07:00, at very roughly gen 1,200–1,400 (random) and 600–800 (seeded)** —
nowhere near 3,614. Until then the Mac's compute is spoken for. Note BRIEF-3 §8's
compute-courtesy line says "Saturday ~07:00" — written before the cap change; it is a day
early. Treat it as Sunday.

---

## This weekend, before the runs finish

### 1. Perceptual-metric design brief (session note 02)

**✓ DONE 2026-09-05 (Cowork chat, Opus).** Brief at `metric/BRIEF-perceptual-metric.md`. Headline: the build's first task is a *validation harness + bake-off*, not a chosen metric; lead architecture mirrors the SMS split (tonal term = time/pitch-tolerant multi-scale spectral distance, noise term = McDermott–Simoncelli texture statistics); reset-vs-accumulate resolved (permissive DTW default + pulse/pitch auto-setter); reset warp flagged as the sharpest Goodhart hole. All five §10 decisions resolved with Jon 2026-09-05 (metric home = metric/; CDPAM in bake-off but validator-tier only; global-tuning IN; raw render, gain cheap-not-free; ρ bar set post-bake-off). Sequencing confirmed: build ARTISAN v3 (item 4) before the metric build (item 5); refresh the brief with v3's report first (brief §1.1).

**Opus. Chat session, no compute — run any time, including right now.**
Thread: the perceptual branch — the hard gate in front of BOTH impressionist programs, per
your build order in the vault. The seed note (`_session-notes/02-perceptual-metric-notes.md`)
is ready and rich: your four constraints, the canonical landmarks already mapped (SMS
sines-plus-noise, multi-scale STFT/DDSP loss, DTW and its slope-constraint — which is your
reset-vs-accumulate question in canonical dress), and the ears-validation protocol
requirement from HOLD.md. Deliverable: the metric module's brief — metric portfolio,
validation protocol, reset-vs-accumulate resolved or exposed as a parameter with a
detection rule. Not code.
Why first: it's the highest-leverage Claude work that needs zero compute and zero
sync-back, and it gates the branch you're most interested in.

### 2. Build the target library
**Sonnet session + your ears for the final picks. ~1 hour, light enough to run during the GA runs.**
Thread: every program at once. The project owns exactly two real targets — westminster
chimes and a 1.8 s speech clip — while BRIEF-3's generality gate demands "symphonies,
speech, modem beeps, birdsong, trains", and the metric's ears-validation needs varied
material to degrade and rank. Action: collect ~10–15 short rights-clean WAVs across the
space (speech male/female/other-language, melodic music, percussive music, birdsong,
machinery, modem/DTMF, broadband ambience, polyphony), convert to house format (22050 Hz
mono, ≤10 s), file once under a shared `targets/` home with a manifest, audition and veto
by ear. Sonnet because it's curation and plumbing, not judgement — the judgement is yours.

> **STATUS 2026-09-05 — designed, tooled, awaiting one Mac command.** Ran as a
> literature-first session (Jon's call: "a lot is going to be built on this"). Everything
> lives in `targets/`: LIBRARY-DESIGN.md (selection rationale from SQAM/MUSHRA critical-
> material logic, timbre-space axes, the in/out-of-domain distinction, a deliberate
> pulsed-vs-pulseless pair for the DTW reset-vs-accumulate question), manifest.json
> (16 clips: canonical 2 + 13 sourced rights-clean with checksums + 1 synthesized;
> tier A core-four for expensive runs, tier B full bench), and tools/ (fetch, synth,
> analyze/build/verify — verified end-to-end; dtmf-modem already built). **COMPLETE 2026-09-05,
> three audition rounds same day.** Final state: 21 targets (2 canonical + 19 accepted),
> spanning tier A (core four), tier B (full bench) and a new tier M of single-event micro
> targets (owner-commissioned; 0.25-3.5 s), plus the owner's own voice on four clips and
> a deliberate 14.1 s length-exception probe. Every target verifies through MIMIC's wavio.
> .gitignore amended: targets/*.wav negated past the global *.wav rule (else the library
> would silently not commit), owner's non-refetchable self-recordings in _raw/ negated too.
> Only remaining act: the Mac-side git commit (item 8's ritual now includes targets/). Three optional self-record upgrade slots
> (voice-sung, whisper, castanets) documented in MANIFEST.md — library not blocked on them.

## Sunday morning, when the runs stop (~07:00)

### 3. Harvest the chimes A/B
**Opus — reading the runs is a judgement task; the tool run itself is one command each.**
Thread: MIMIC. State at Friday 23:30: random at gen 657, best SSE 5,484 (below the 7,976
silence floor); seeded at gen 333, best SSE 1,753. Two things to hold onto when reading
results: (a) the seed is ARTISAN **v1**'s chimes genome (gen-0 SSE 1935.2 — v2's 696
didn't exist when you launched at 06:50; it synced back at 18:51), so this is
"v1-seed vs random", not "best-seed vs random"; (b) the generation-matched design broke —
the cap fires first, so the honest comparison is time-matched at 48 h with unequal
generation counts (denser genomes render slower — itself a finding, and the reason M2's
performance profile just got more valuable). Action: run
`node mimic/tools/gene-convergence.mjs` on each finished run (M4), read the A/B against
FINDINGS.md's prediction (seeded ⇒ shorter τ, fewer early crown trades), listen to both
best renders, write findings into `mimic/docs/FINDINGS.md` and the vault, and decide the
follow-up: accept the 48 h verdict, or relaunch — the obvious next run seeds with v2's
696-SSE genome, which doubles as the dry run of impressionist-mimic's
seed-then-perceptually-polish bridge.

### 4. ARTISAN v3 — "tracks and voices" (BRIEF-3)
**Sandboxed Claude Code, untethered, Opus — the phase-solve physics and the ablation
judgement calls are exactly where a lesser model gets expensive. Long run.**
Thread: ARTISAN. Fully unblocked except for compute: BRIEF-3 finished 22:21 Friday
(including the mixer normalisation fix and the reopened shape-blend avenue), v2 is synced
back and committed, the §1 precondition (v2 src files + 45/45 tests) will pass. Launch
`launch-sandbox.sh` Sunday after the GA runs end — not Saturday, despite the brief's stale
date line — hand it BRIEF-3, then do the sync-back triage and push from the Mac when it's
done. Gates to watch: chimes ≤500 in ≤2 h, speech ≤160, the two new synthetic benchmarks,
and the phase-control experiment before any slot reuse ships.

## Gated behind 1 (and 4)

### 5. Build the metric module, then ears-validate it
**Sonnet build off item 1's brief; then a Jon listening session to rank the deliberately
degraded variants. The hard gate in HOLD.md stands: nothing downstream until your ears
sign off.** Needs item 2's library for validation material. Build and validation are two
separate sittings — the build is sandbox work, the validation is you.

### 6. IMPRESSIONIST-MIMIC — brief, then build
**Opus for the (small) brief, Sonnet for the build — it's mostly a fitness swap into the
proven GA harness.** Gated on item 5. Bundle the parked MIMIC work into the same code
pass rather than spending separate sessions: P12 (meta-genes gating their own mutation —
owner-diagnosed, confirmed in code), M2 (the per-generation cost profile item 3 just made
urgent), M3 (per-island stats, which upgrades crown-trade inference to measurement).

### 7. IMPRESSIONIST — the brief
**Opus, separate chat — your stated plan.** Only after v3 exists (item 4) and the metric
is validated (item 5). `impressionist/NOTES-FOR-BRIEF.md` is current and unusually
complete; the brief session should start there and at the ledger's metric-relative
DROPPED rows (modulation is the engine's only route to broadband energy).

## Quickies and backlog

### 8. Two minutes at the Mac
**Jon, physical.** (a) Delete
`Cowork/CONTEXT/projects/_REVIEW-playing-god-intelligibility-wording.md` — this session
checked the backfilled wording against it line by line; the calibration survived intact,
so the file's only remaining job is to be deleted. (b) `git add` this TODO and the
session report in `code/playing-god/`, commit, push — deliberately left uncommitted
because Cowork-side commits litter `.git/` on the no-delete mount.

### 9. Core-app cold evaluation (§15)
**Opus, fresh session, on the logs + gate artefacts.** Queued since v2.2 shipped; the
build's own report is not the cold evaluation, by design. Not urgent, but do it before
any core-app v3 is contemplated — and it pairs naturally with whatever listening data
item 11 eventually produces.

### 10. Someday / noticing
- Ping Josh: PR #1 merged, `ONBOARDING-JOSH.md` is ready, and the mixer artifacts are
  genuinely shareable now. (No Claude needed.)
- The name. The vault still records "Primordial Jam — preferred, not decided."
- A v2-696-seeded SSE MIMIC run only if item 3 leaves the question interesting —
  otherwise it's subsumed by item 6's bridge product.

## Deliberately last, by your call (2026-09-05)

### 11. Play the v2.2 app — the archive-mode decision and a real listening session
**Jon, no Claude needed (or Haiku alongside to walk the checklist). ~1 hour, whenever the
user-evolved thread interests you again.**
Thread: Playing God itself. Parked, not lost: v2.2 shipped 2 Sep with a working app, and
its report's "what awaits a human" (§9) — the archive-mode choice it calls *the one real
decision* (deep@8×8 default vs adaptive@16×16 at a ~65% re-listen tax; one-click,
reversible) and the 15-minute smoke-test, plus the F3 audition carried over from the v2
report's §10 — has waited since. The only exported listening session in the project is
still v1's 213-listen session of 31 Aug. Nothing downstream blocks on this; it costs
nothing to leave parked, and it's here so it can't silently vanish.

---

## Thread-status flags (the "am I losing the plot" check)

- **Parked by choice (2026-09-05):** the core-app v2.2 decision + smoke-test + audition —
  bottom of the list on your instruction; nothing else depends on it.
- **Waiting on Jon (trivial):** the _REVIEW file deletion; the Mac-side commit/push.
- **Blocked on compute until Sunday ~07:00:** ARTISAN v3.
- **Gated by design:** impressionist-mimic (on the validated metric), impressionist (on
  v3 + the metric). Correctly parked — no action lost.
- **In flight, self-tending:** the two chimes runs (streaming saves; clean stop at the cap).
- **Not blocked on anything:** metric brief (1), target library (2) — these are the
  free moves.
- **Nothing is blocked on sync-back** — Friday's 18:51 sync-back landed, the repo is
  clean, and GitHub is current at `b2b2d8a`.
