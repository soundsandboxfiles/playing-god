# MIMIC — provisional choices and fitness temptations

A running log, per house habit. Two kinds of entry:

- **PROVISIONAL** — a choice I made with my best judgement that the owner may
  want to overrule.
- **TEMPTATION RESISTED** — a moment where "improving" the fitness was tempting,
  recorded and *not acted on* (the brief mandates this).

The report (`MIMIC-REPORT.md`) collects these for the owner.

## Fitness temptations resisted

1. **Normalise amplitude before SSE.** Random genomes are wildly mis-scaled;
   normalising would smooth early search. Resisted — it erases the
   identical-but-quieter penalty the owner explicitly wants.
2. **Cross-correlate for best lag before SSE.** Phase deception makes the
   landscape brutal; aligning first would help enormously. Resisted — "no
   alignment tolerance" is in the spec. (Offered as no metric at all — even the
   diagnostics do not align.)
3. **Score in the spectral domain.** A bell is defined by its partials far more
   than its phase; spectral matching would converge faster and sound closer.
   Resisted as the default — offered only as `--metric spectral`, off by default.
4. **Truncate the render at the scored window's end** for speed. Resisted — the
   engine couples envelope time to render length, so truncation changes the
   scored phenotype. Full-length render, windowed SSE.
5. **Use `renderNormalized`** (the engine's normal path) instead of raw
   `render()`. Resisted — it applies loudness normalisation + leading-silence
   trim, which would erase both the loudness and the offset penalties.

## Provisional choices

- **Engine rate = 22050 Hz** for MIMIC. The target is native 22050; the engine's
  descriptor rate is 22050; halving the audio rate halves render cost. Auditioned
  WAVs are written at 22050 too. (The engine can render 44100; MIMIC standardises
  on 22050.) PROVISIONAL — trivially changed via `--sample-rate`… (not yet a flag;
  hard-coded default, revisit if the owner wants 44100 fidelity).
- **Recoverability seeds.** 2-wave = priors seed 14 (clean, peak 0.50); 6-wave =
  priors seed 4 (peak 0.94); seed-pick favourite = `seed-picks.json` genome[0]
  ("16"). Chosen by scanning for audible, non-clipping targets so recoverability
  is a meaningful test (a silent target is trivially "recovered" by silence).
- **Linear resampling** of the target (not windowed-sinc). Transparent,
  dependency-free, deterministic, and identical for every genome — cannot bias
  the race.
- **Default total length** when unset = exactly the span needed to cover the
  window (`window_start + target_length`), so no target sample is ever dropped.
