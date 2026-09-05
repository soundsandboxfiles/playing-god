# The target library — design rationale

*Written 2026-09-05 (Cowork session, TODO item 2). This is the "why" document; `manifest.json`
is the canonical "what". A lot downstream leans on this library — ARTISAN's generality gates
(BRIEF-3 §6.2), the perceptual metric's ears-validation (TODO items 1/5), and every future
IMPRESSIONIST benchmark — so the selection logic is written down, with its sources, rather
than left implicit.*

## 1. The central idea from the literature: critical, not representative

The canonical test-material collections were not assembled to *represent* ordinary audio.
They were assembled to *break things in known ways*. The EBU's SQAM disc (Tech 3253) states
its selection goal as material that "reveal[s] to the listener impairments that have been
observed in testing" — castanets for pre-echo, glockenspiel and harpsichord for sparse
attacks over tonal decay, solo speech in several languages because speech exposes what
music masks. MUSHRA (ITU-R BS.1534) codifies the same idea for listening tests: material
"shall be critical", i.e. chosen so systems under test actually differ on it — with two
riders we adopt wholesale: excerpts of **~10 s, preferably not exceeding 12 s** (auditory
comparison memory is short), and **loudness-aligned presentation**.

So every clip here earns its place by naming the *failure mode it stresses* — of this
engine, and of the metrics that will judge it. That is the `engineStress` and
`metricDiagnosticity` field on each manifest entry. A clip that stresses nothing is dead
weight; sixty clips would dilute Jon's audition time (the scarcest resource in this
project — the ear is the final judge) without adding coverage.

One MUSHRA rule we deliberately *invert*: BS.1534 excludes "synthetic signals deliberately
designed to break a specific system" — right for codec juries, wrong for an optimization
benchmark. Our synthetic protocol-tones clip exists partly as the opposite: an **anchor
the engine provably CAN represent** (steady sine dyads are native engine phenotypes), so
that total failure elsewhere is interpretable. This mirrors MUSHRA's own anchor logic
(known reference points calibrate the scale), and mirrors what MIMIC's `lib/targets.js`
already does in-domain with its recoverability targets.

## 2. In-domain vs out-of-domain: this library is the out-of-domain arm

The sound-matching literature (synthesizer parameter inference) distinguishes targets that
are outputs of the synth (*in-domain*) from real recordings (*out-of-domain*), and a 2025
survey of iterative sound-matching notes out-of-domain matching is still "an unexplored
area, yet a necessary one" — and that loss-function performance is "highly dependent on
the synthesizer", with human listening the only trustworthy arbiter. Both findings are
load-bearing here: (a) MIMIC's recoverability targets already cover in-domain; this
library is the out-of-domain complement, and the two should never be merged or confused;
(b) no metric verdict transfers from another synth's experiments — which is exactly why
HOLD.md's ears-validation gate exists, and why this library doubles as its material.

## 3. Axes of coverage

Three literatures supply the axes, and the manifest tags every clip on all of them:

- **Timbre space** (Grey 1977; McAdams et al. 1995; Caclin et al. 2005): the recurring
  perceptual dimensions are attack time, spectral centroid/brightness, and spectral
  flux/temporal evolution. The library spans sharp↔soft attack, dark↔bright, static↔evolving.
- **Signal statistics** (Serra & Smith's SMS deterministic/stochastic split — already the
  project's frame): harmonicity from pure tones (DTMF) through inharmonic bells (chimes),
  mixed regimes (speech, train), to pure noise textures (stream, whisper, applause).
  The engine has no noise oscillator, so the tonal→noise axis is precisely its
  easy→impossible axis; the metric branch exists for the far end of it.
- **Scene structure** (Bregman's auditory scene analysis): monophonic sources, polyphony
  under a slot cap (piano, orchestra), and multi-source scenes (train = whistle + chuff
  + rail; birdsong over ambience).

Plus two axes this project specifically needs, which general test collections don't mark:

- **Pulse.** Jon's reset-vs-accumulate question (session note 02 — DTW's slope-constraint
  choice) hypothesises: accumulate for pulsed/melodic material, reset for pulseless. The
  library therefore contains a deliberate matched pair — `drumloop-120` (unmistakable
  4-bar pulse, exactly 8.000 s) against `stream`/`birdsong-thrush` (nothing to align) —
  so the eventual metric can be tested on material at both poles, not argued about in
  the abstract. `dtwProbe` on each entry records which pole (or both) it probes.
- **SSE↔ear disagreement.** IMPRESSIONIST's showcase targets should be "ones where SSE
  and the ear disagree most" (NOTES-FOR-BRIEF q4). ARTISAN v2 measured the per-target
  broadband floor as SSE's blind spot. Whisper, applause, stream, and the train's chuff
  live in that gap; piano-goldberg and dtmf-modem sit at the agreement end as controls.
  A metric-validation set needs both ends, or a metric that simply hates noise would
  look validated.

## 4. Tiering, length, and level

- **Tier A (core four)** — chimes, speech-male-en (the canonical two, kept bit-identical:
  converting them would silently invalidate every existing SSE number), birdsong-thrush,
  applause. Four corners: inharmonic-tonal-sparse / voiced+unvoiced speech / fast-FM
  biological / broadband-transient texture. New tier-A cuts are ≤4 s because generation
  pace scales with target length (measured on the chimes runs: 9.5 s target ⇒ ~5× slower
  generations than the 1.8 s speech clip; 48 h caps arriving at ~gen 1,200 instead of
  3,614). Long expensive runs should not pay for seconds that add no coverage.
- **Tier B (full bench)** — everything else, ≤10 s per MUSHRA. These serve ARTISAN
  construction benchmarks (cheap per-target) and Jon's listening sessions.
- **Level**: new clips are peak-normalized to −1.0 dBFS *after* resampling (resampling can
  move the true peak), landing beside the canonical two (measured: chimes −0.42, speech
  0.0 dBFS peak). SSE is amplitude-sensitive, so level is part of the target definition,
  and the manifest records it. Loudness-matched (rather than peak-matched) variants are a
  *metric-branch* question — flagged for item 5, not built here.
- **House format**: 22050 Hz mono 16-bit PCM WAV. Conversion happens offline with ffmpeg's
  polyphase resampler specifically so `wavio.js`'s linear-interpolation fallback (fine for
  a loader, poor as a mastering tool) never touches library material.

## 5. Sourcing and rights

The bar: public domain / CC0 preferred; CC-BY 4.0 accepted with attribution recorded in
the manifest; **no NC, ND, or SA anywhere**, so nothing constrains what the repo can
become later. Sources used: LibriVox/archive.org (PD speech, several languages),
the Open Goldberg Variations (CC0 studio piano), US National Park Service sound
galleries (federal PD nature recordings), radio aporee field recordings on archive.org
(recordist-applied PD Mark — a "no known copyright" label rather than a formal waiver;
flagged honestly in the rights ledger), pre-1923 acoustic-era recordings (US PD under the
Music Modernization Act), and two Freesound CC0/CC-BY clips via their no-auth preview MP3s
(originals are login-gated; both entries carry self-record upgrade paths because a 128k
MP3's transient smearing contaminates exactly the axis the castanets clip exists to test).
SQAM's own audio was deliberately NOT used: its recordings are copyrighted commercial
excerpts; we borrow its taxonomy, not its files.

Three slots are better filled by Jon's own microphone than by anything on the open web —
`voice-sung` (sustained vibrato phrase; also the ultimate known-reference audition
material), plus upgrades to `whisper` and `castanets` (any dry click source: claves,
woodblock, handclaps). The library is never blocked on these: each has a fetched
alternate in place.

## 6. What was considered and rejected

- **xeno-canto** birdsong (mostly NC/SA), **BBC Sound Effects** (research-only licence),
  **Harvard/IEEE sentence corpora** (licence-restricted recordings), **SQAM audio**
  (copyright), **Amen break** for the pulsed slot (famously unlicensed lineage),
  **Martha Goldstein harpsichord** (CC-BY-SA), Freesound's best harpsichord phrase
  (CC-BY-NC): all licence-failed. A dedicated harpsichord slot died with that — piano
  covers the attack-over-decay axis; revisit only if a rights-clean harpsichord phrase
  surfaces.
- **A 60-clip FSD50K-style sweep**: coverage without auditability. Jon's ears are the
  validation instrument; 14–17 clips is what a single sitting can genuinely rank.
- **Loudness normalization (LUFS) instead of peak**: wrong layer — level semantics belong
  to the metric design (item 5), and changing the level convention now would decouple new
  targets from the canonical two.

## 7. Sources

EBU Tech 3253 (SQAM) and its Users' Handbook — tech.ebu.ch/publications/sqamcd;
ITU-R BS.1534-3 (MUSHRA) §on test material — itu.int; Serra & Smith 1990 (SMS);
McAulay & Quatieri 1986; Grey 1977 / McAdams et al. 1995 / Caclin et al. 2005 (timbre
space); Bregman 1990 (ASA); Engel et al. 2020 (DDSP, multi-scale spectral loss);
Vahidi et al. 2025 "Evaluating Sound Similarity Metrics for Differentiable, Iterative
Sound-Matching" (arXiv:2506.22628) — in/out-of-domain framing, metric-synth dependence;
Music Modernization Act (pre-1923 US recordings PD as of 2022-01-01). Per-clip source
pages and checksums live in `manifest.json`.

## 8. Addendum 2026-09-05: the micro tier, and audition-round revisions

Audition round 1 changed the library in ways worth recording. Three slots moved to the
owner's own microphone (whisper, the 120 BPM loop, and both sung phrases) after the fetched
versions failed by ear — the Freesound whisper turned out to be whispered *singing* (voiced,
so it missed the unvoiced pole), and the drum-loop preview wasn't a drum loop at all. Lesson
for future sourcing: preview MP3s can't be trusted sight-unseen for *content*, only for
licence; the owner's mic is both rights-cleaner and faster than a second sourcing round.

**Tier M (micro, ≤1.5 s)** was added at the owner's request: single events — a kick, a snare,
one chime strike, one staccato flute note. The design logic: every full-length target puts
the engine in the slot-starved regime (64 waves vs seconds of polyphony); a single event
inverts that — the whole budget serves one gesture, so micro targets measure the engine's
per-event ceiling with representation cost removed. micro-chime-strike is deliberately cut
from the canonical chimes so its result reads directly against ARTISAN's full-chimes work
(how much of that difficulty is the event itself vs the polyphony?). micro-snare is the
purest broadband transient (no tonal handle); micro-flute is its tonal counterpart with a
noise chiff. Render cost is near-zero, so these double as fast-iteration targets. They also
bracket target length from the other side: the library now runs 0.25 s (micro-snare) to
14.1 s (voice-sung-complex, the owner's deliberate length exception).

**Completion note (2026-09-05, end of day):** the library closed at 21 targets — 2 canonical,
19 accepted across three same-day audition rounds. Full trail and lessons in
`REPORT-TARGET-LIBRARY-2026-09-05.md`.
