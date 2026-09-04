# ARTISAN run — recover-2wave

*Sighted design of a Playing God genome to match this target sample-by-sample.*

## Result

- **Scored SSE:** 0.000000  (lower is better; 0 = a perfect, sample-identical match)
- **Similarity (1/SSE):** PERFECT (SSE = 0)
- **Silence floor for this target:** 1561.658 — a silent render scores this. This render is **Infinity× better than silence**.
- **MIMIC's best on this target:** 1524.400 — ARTISAN is **Infinity× better**.
- **Active waves used:** 1 of 32 allowed.

## What was rendered

- **Render length:** 2 s at 22050 Hz (44100 samples).
- **Scored window:** samples [0, 44100) — i.e. 0.000 s to 2.000 s.
- The delivered **final.wav** is the *unmodified engine's* raw render of the genome, 16-bit encoded. **genome.pg2.txt** is the genome as a shareable text string — paste it into Playing God.
- ⚠️ **Length matters.** This genome is tuned for *this* render length. The same genome at another length (e.g. under Playing God's render servo) is a relative, not a twin — its envelopes stretch with the render (BRIEF §2).

## Method

Sighted constructive matching pursuit + closed-form amplitude fitting, then engine-space refinement. In plain terms: ARTISAN *measures* the target with an FFT (frequency, phase, amplitude, and a low-frequency search), places one wave at a time to explain the loudest thing left — choosing the best oscillator shape for each — and after every wave re-solves all the volumes at once for the mathematically best fit. It then polishes frequencies, phases and gate timings directly against the real engine. No blind evolution; the needle MIMIC could not thread is simply measured.

- **Wall-clock time:** 3.6 s.
- **Random seed:** 1 (reproducible).

## Honesty — ceilings hit

- Everything above ~11 kHz is unrepresentable at 22050 Hz; stereo targets are collapsed to mono; delivery is 16-bit. These are fixed properties of the format, not search failures.
- This is a **recoverability** target: it was itself rendered from a genome, so SSE = 0 provably exists. ARTISAN chases it directly.

## Verify it yourself

```
node verify.js
```
Run from inside this folder. It re-renders the genome through the true engine, confirms the delivered WAV is byte-identical, and recomputes the SSE — printing a plain-English PASS/FAIL.

## Surrogate parity

None. ARTISAN optimises directly on the unmodified engine (the sole arbiter), so there is no separate surrogate and surrogate-vs-engine drift is identically zero. The additive fast-scorer used during search is reconciled against the true engine at every commit point; verify.js re-proves sample-identity independently.
