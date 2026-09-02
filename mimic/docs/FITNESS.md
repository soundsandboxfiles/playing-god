# MIMIC fitness — the owner's spec

This is the single most load-bearing decision in the project, so it gets its own
document. **The fitness is the spec, not a placeholder.**

## The definition (verbatim intent)

> Similarity = `1 / (sum of squared sample-by-sample differences)` over the
> scored window, computed on **raw float samples at the engine rate**. No
> normalisation, no alignment tolerance, no spectral substitution.

The owner knows, and wants, that this:

- **punishes identical-but-quieter** — a genome that reproduces the target's
  shape at half the amplitude scores far worse than a perfect match, because the
  per-sample differences are real and squared.
- **punishes identical-but-offset** — a genome that reproduces the target
  shifted by even a few samples scores badly, because SSE compares sample `i` to
  sample `i`, with no cross-correlation search for the best lag.

Owner: *"I want a blunt tool — if I just wanted fidelity then mp3 coding already
exists."*

## How it is implemented (`lib/fitness.js`)

- We **minimise SSE** internally (all three algorithms minimise a loss).
- We **report similarity = 1 / SSE**, guarding `SSE = 0` (a recovered genome)
  with a `PERFECT_SIMILARITY` sentinel (`Number.MAX_VALUE`).
- SSE is summed over exactly the scored window and nothing else.
- It runs on the **raw** synthesis output — see below.

## Two decisions that protect the spec

### 1. Raw render, not the engine's normalised render

`../src/render.js` exports `renderNormalized`, which applies §4.7 loudness
normalisation **and** the F4/P4 leading-silence trim. Both would sabotage the
owner's fitness:

- loudness normalisation rescales amplitude — erasing the *identical-but-quieter*
  penalty the owner explicitly asked for;
- the leading-silence trim shifts the waveform in time — hiding the
  *identical-but-offset* penalty.

So MIMIC scores the **raw** `render()` output from `../src/synthesis.js`
(`lib/render-raw.js`). This is a read-only use of the engine; we do not modify
it. Using the normalised path would have been a silent "improvement" to the
fitness — exactly what the brief forbids.

### 2. Full-length render, not the "stop at window end" shortcut

The brief permits stopping the render at the scored window's end to save the
free tail. **We deliberately do not.** The engine maps envelope time as
`t = n/(N-1)` over the *whole* render length `N`. Rendering a shorter buffer
would move every envelope and change the phenotype *inside* the scored window —
so the scored genome would differ from the auditioned genome. We therefore
render the full configured total length for both scoring and audition, and
window the SSE afterwards. The tail compute is the price of scoring exactly what
the owner hears.

(When the window covers the whole render — e.g. the main chimes run, total 9.5 s,
scored 0–9.5 s — there is no tail and no cost anyway.)

## Windowing

Config gives `total_length_s` and `window_start_s`. The target supplies its own
length. The scored region is:

```
[window_start_s, window_start_s + target_length_s)
```

Outside it the output is unconstrained (free tails either side). If the window
would run past `total_length_s`, MIMIC **extends** the render to cover it rather
than dropping target samples, and records the adjustment
(`extendedToFitWindow`).

## The target pre-processing (fixed, unbiased)

The target WAV is loaded (`lib/wavio.js`): stereo is mixed to mono by
**averaging** (so a stereo target is not twice as loud as the same mono
material — the SSE is amplitude-sensitive), and it is resampled to the engine
rate by linear interpolation. Linear resampling introduces a small
high-frequency roll-off, but it is part of the *fixed* target and therefore
identical for every genome scored against it — it cannot bias the race.

## Optional alternative metrics (off by default)

Per the brief's allowance, `lib/fitness.js` also implements diagnostic metrics,
selectable only with `--metric <name>` and never the default:

| name             | what it does                                          | why it is not default |
|------------------|-------------------------------------------------------|-----------------------|
| `sse` (default)  | the owner's blunt SSE                                 | — |
| `sse-normalized` | SSE ÷ target energy                                   | removes the loudness penalty the owner *wants* |
| `spectral`       | magnitude-spectrum SSE (naive DFT)                    | phase-insensitive — the "spectral substitution" the spec forbids |

These are for the owner's curiosity and for **diagnosing phase deception** (the
time-domain SSE landscape is riddled with it; see the report). They change what
the search optimises only when explicitly requested.

## Fitness temptations encountered — and resisted

Recorded per house habit (the brief asks for every temptation to "improve" the
fitness). See `docs/DECISIONS.md` for the running list; the headline ones:

1. *Normalise amplitude before SSE* — tempting because random genomes are wildly
   mis-scaled and normalising would make early search smoother. **Resisted:** it
   is the exact penalty the owner asked for.
2. *Cross-correlate to find the best lag before SSE* — tempting because phase
   deception (below) makes the landscape brutal. **Resisted:** "no alignment
   tolerance" is in the spec.
3. *Score in the spectral domain* — tempting because a bell's partials matter
   more than its phase. **Resisted:** "no spectral substitution"; offered only as
   an off-by-default diagnostic flag.
4. *Truncate the render at the window end* for speed — **resisted** because the
   engine couples envelope time to render length (decision 2 above); it would
   change the scored phenotype.
