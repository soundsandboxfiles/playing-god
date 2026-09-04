# ARTISAN run — SpeechSignalProcessing.wav

*Sighted design of a Playing God genome to match this target sample-by-sample.*

## Result

- **Scored SSE:** 306.484  (lower is better; 0 = a perfect, sample-identical match)
- **Similarity (1/SSE):** 0.003263
- **Silence floor for this target:** 407.248 — a silent render scores this. This render is **1.329× better than silence**.
- **Active waves used:** 64 of 64 allowed.

## What was rendered

- **Render length:** 1.8460770975056688 s at 22050 Hz (40706 samples).
- **Scored window:** samples [0, 40706) — i.e. 0.000 s to 1.846 s.
- The delivered **final.wav** is the *unmodified engine's* raw render of the genome, 16-bit encoded. **genome.pg2.txt** is the genome as a shareable text string — paste it into Playing God.
- ⚠️ **Length matters.** This genome is tuned for *this* render length. The same genome at another length (e.g. under Playing God's render servo) is a relative, not a twin — its envelopes stretch with the render (BRIEF §2).

## Method

Sighted constructive matching pursuit + closed-form amplitude fitting, then engine-space refinement. In plain terms: ARTISAN *measures* the target with an FFT (frequency, phase, amplitude, and a low-frequency search), places one wave at a time to explain the loudest thing left — choosing the best oscillator shape for each — and after every wave re-solves all the volumes at once for the mathematically best fit. It then polishes frequencies, phases and gate timings directly against the real engine. No blind evolution; the needle MIMIC could not thread is simply measured.

- **Wall-clock time:** 149.4 s.
- **Random seed:** 1 (reproducible).

## Honesty — ceilings hit

- Everything above ~11 kHz is unrepresentable at 22050 Hz; stereo targets are collapsed to mono; delivery is 16-bit. These are fixed properties of the format, not search failures.
- For arbitrary real audio, SSE = 0 is reachable essentially only when the target is itself a genome render. The number above is the real floor ARTISAN reached; the residual is whatever the 64-oscillator additive model cannot represent (dense noise, fast inharmonic detail).

## Verify it yourself

```
node verify.js
```
Run from inside this folder. It re-renders the genome through the true engine, confirms the delivered WAV is byte-identical, and recomputes the SSE — printing a plain-English PASS/FAIL.

## Surrogate parity

None. ARTISAN optimises directly on the unmodified engine (the sole arbiter), so there is no separate surrogate and surrogate-vs-engine drift is identically zero. The additive fast-scorer used during search is reconciled against the true engine at every commit point; verify.js re-proves sample-identity independently.
