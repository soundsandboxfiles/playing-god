# ARTISAN run — recover-2wave

*Sighted design of a Playing God genome to match this target sample-by-sample.*

## Result

- **Scored SSE:** 8.0555e-9  (lower is better; 0 = a perfect, sample-identical match)
- **Similarity (1/SSE):** 1.2414e+8
- **Silence floor for this target:** 1561.658 — a silent render scores this. This render is **1.9386e+11× better than silence**.
- **MIMIC's best on this target:** 1524.400 — ARTISAN is **1.8924e+11× better**.
- **Active waves used:** 1 of 24 allowed.

## What was rendered

- **Render length:** 2 s at 22050 Hz (44100 samples).
- **Scored window:** samples [0, 44100) — i.e. 0.000 s to 2.000 s.
- The delivered **final.wav** is the *unmodified engine's* raw render of the genome, 16-bit encoded. **genome.pg2.txt** is the genome as a shareable text string — paste it into Playing God.
- ⚠️ **Length matters.** This genome is tuned for *this* render length. The same genome at another length (e.g. under Playing God's render servo) is a relative, not a twin — its envelopes stretch with the render (BRIEF §2).

## Method

Sighted constructive matching pursuit + closed-form amplitude fitting, then engine-space refinement. In plain terms: ARTISAN *measures* the target with an FFT (frequency, phase, amplitude, and a low-frequency search), places one wave at a time to explain the loudest thing left — choosing the best oscillator shape for each — and after every wave re-solves all the volumes at once for the mathematically best fit. It then polishes frequencies, phases and gate timings directly against the real engine. No blind evolution; the needle MIMIC could not thread is simply measured.

- **Wall-clock time:** 5.8 s.
- **Random seed:** 1 (reproducible).

### Budget spent (anytime optimiser)

The optimiser ran 4 portfolio epochs and stopped on **measured convergence** — no strategy in the portfolio (coordinate descent, reallocation, CMA-ES) improved SSE beyond the epsilon threshold across the patience window. Marginal gain over the last third of the run: 0.00e+0 SSE per 0.01 h = 0.00e+0 SSE/hour. The engine-vs-fast-model gap at the end was 0.00e+0 (the additive fast scorer stayed faithful to the true engine).

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
