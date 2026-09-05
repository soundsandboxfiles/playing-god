# Target library — completion report (TODO item 2)

*2026-09-05. One day, one Cowork session, three audition rounds. Companion documents:
`LIBRARY-DESIGN.md` (the literature rationale), `manifest.json` (canonical metadata),
`MANIFEST.md` (generated view), `AUDITION.html` (the listening page, now in its final state).*

## What exists now

21 targets in `code/playing-god/targets/`, all in house format (22050 Hz mono 16-bit WAV,
peak −1 dBFS) except the two canonical clips (bit-identical copies — SSE continuity), all
verified through MIMIC's own `wavio.js` loader, every one auditioned and accepted by the
owner. Three tiers: **A** (core four for expensive runs: chimes, speech-male-en,
birdsong-thrush, applause), **B** (full bench for ARTISAN generality gates and the metric's
ears-validation), **M** (single-event micro targets, owner-commissioned: what accuracy can
the engine reach when all 64 slots serve one gesture?). Target lengths bracket 0.25 s
(micro-snare) to 14.1 s (voice-sung-complex, the owner's deliberate length exception).

| id | tier | dur (s) | source kind | licence |
|---|---|---|---|---|
| chimes | A | 9.50 | existing | assumed cleared by owner |
| speech-male-en | A | 1.85 | existing | assumed cleared by owner |
| birdsong-thrush | A | 4.00 | download | Public domain |
| applause | A | 4.00 | download | PD Mark 1.0 |
| speech-female-en | B | 6.00 | download | Public domain |
| speech-ja | B | 6.00 | download | CC0 1.0 |
| whisper | B | 5.50 | self-record | owner's own recording |
| voice-sung-simple | B | 9.00 | self-record | owner's own recording |
| voice-sung-complex | B | 14.10 | self-record | owner's own recording |
| piano-goldberg | B | 7.00 | download | CC0 1.0 |
| castanets | B | 4.00 | download | CC-BY 4.0 |
| orchestra | B | 8.00 | download | PD Mark 1.0 |
| drumloop-120 | B | 4.00 | self-record | owner's own recording |
| train-steam | B | 5.00 | download | PD Mark 1.0 |
| stream | B | 5.00 | download | Public domain |
| dtmf-modem | B | 6.00 | synthesized | none needed |
| edison-1917 | B-optional | 8.00 | download | US PD |
| micro-kick | M | 0.30 | download | CC0 |
| micro-snare | M | 0.25 | derived | owner's own recording |
| micro-chime-strike | M | 3.50 | download | CC0 |
| micro-flute-staccato | M | 0.81 | download | CC0 |

## The build story, compressed

Designed literature-first at the owner's instruction ("a lot is going to be built on this").
Selection follows SQAM/MUSHRA critical-material logic — every clip names the engine failure
mode and metric blind spot it stresses (see per-clip `engineStress` / `metricDiagnosticity`).
Two project-specific axes were added: a pulsed/pulseless matched pair (drumloop-120 vs
stream/birdsong) giving the DTW reset-vs-accumulate question real test material, and explicit
SSE↔ear agree/disagree tagging so metric validation has both poles. Sourcing was
licence-strict (PD/CC0 preferred, CC-BY with recorded attribution, no NC/ND/SA); rejected on
rights: SQAM audio, xeno-canto, BBC SFX, the Amen break, all rights-clean harpsichord phrases.

The sandboxes have no network, so downloads ran through a curl-only Mac script with
archive.org md5 verification; conversion/analysis/builds ran in the local VM (ffmpeg + node,
zero npm deps). Excerpt windows were chosen by measurement (onset density, spectral flatness,
stationarity scoring in `tools/make-targets.mjs analyze`), then corrected by ear.

## What the owner's ears changed (the audit trail argument for audition-by-ear)

- **Two preview downloads failed on content**: the "whisper" was whispered *singing* (voiced);
  the "industrial drum loop" wasn't a drum loop. Lesson recorded: previews can be trusted for
  licence, never for content. Both slots now carry the owner's own recordings.
- **Both derived micro cuts failed**: the loop window held three kicks; the chimes cut
  straddled two strikes (the onset detector's deadband missed double-kicks, and bell ring
  masked later onsets). Owner's steer, adopted: one-shot samples are the right source for
  single events. Both re-sourced CC0 (karolist kick #371192; sgossner VSCO2:CE tubular bell
  C4 #374273 — trade recorded: loses the canonical-chimes link, gains true isolation).
- **Window corrections by ear**: orchestra +3 s; train-steam earlier and −2 s (shouting/hiss
  tail); bell tail truncated at 3.5 s deliberately ("the full tail would no longer be short").
- **Four owner recordings entered the library**: whisper (numbers 1–10, true unvoiced),
  drumloop-120 (own DAW stem, exactly 2 bars), voice-sung-simple (9.0 s), voice-sung-complex
  (14.1 s length exception, "curious what happens at that length").
- **Chimes clicking investigated and closed**: the canonical file is clean by two independent
  offline detectors; per the Sound Sandbox Step 6.5 rule ("offline clean ⇒ realtime layer"),
  the clicks are playback-side, not in the data.

## Housekeeping done at close

`.gitignore`: the repo's global `*.wav` rule would have silently kept the whole library off
GitHub — negated for `targets/*.wav` and for the four non-refetchable owner recordings in
`_raw/` (downloads stay ignored; `fetch-raw.sh` is their backup). Session notes 01 and 02
moved to `_session-notes/_launched/`. Retired raws (the two failed previews) moved to the
vault's `_to_delete/`. The stale whisper fetch line removed from the script.

## For future sessions

- New programs point at `targets/`; `mimic/targets/` stays untouched for old configs.
- `manifest.json` is canonical; `MANIFEST.md` and `AUDITION.html` are regenerated, never
  hand-edited. The metric-validation harness must iterate whatever the manifest holds
  (owner instruction, already folded into the metric brief §7) — no hardcoded counts.
- To add a clip: manifest entry → fetch line (or file in `_raw/`) → `analyze`/`build` →
  owner audition → status `accepted`. To re-cut: edit `windows.json`, rebuild that id.
- Statuses are load-bearing: nothing below `accepted` should appear in a benchmark suite.
