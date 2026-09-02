# MIMIC

Autonomous evolution of Playing God genomes toward a **target waveform**. The
deliberate inverse of the discovery project: the target is known, fitness has an
opinion by design, and no human listens are spent — evaluation is computed.

> **This is a sub-project of Playing God.** It imports the engine modules under
> `../src/*` **read-only** (synthesis, genome, priors, variation, rng, wav). It
> never modifies `../src/` or `../app/`. Anything MIMIC needs differently gets
> its own module inside `mimic/`.

## The fitness (owner's spec, not a placeholder)

Similarity = `1 / (sum of squared sample-by-sample differences)` over the scored
window, on **raw float samples at the engine rate** (22050 Hz). No
normalisation, no alignment tolerance, no spectral substitution. It punishes
quieter-but-identical and offset-but-identical — the owner wants exactly that
bluntness. Internally we minimise SSE (guarding SSE = 0); we report 1/SSE.

Alternative metrics exist only as **optional, off-by-default flags** (see
`--metric`), documented in `docs/FITNESS.md`.

## Quick start (for a non-programmer)

```
# Evolve toward the Big Ben chimes with sensible defaults:
node run.js --config configs/chimes.json

# Point it at any WAV:
node run.js --target /path/to/your.wav --generations 200 --population 300

# See every option in plain English:
node run.js --help
```

Each run writes `output/<run>/` containing per-generation fittest WAVs, a
fitness curve, the final fittest as WAV + genome string, and a **listening
harness** (`serve.js`) that plays the generations in order so you can *hear* the
convergence.

## Layout

- `lib/` — the engine-facing library (WAV I/O, fitness, algorithms, worker pool)
- `run.js` — the CLI runner
- `bench/` — the algorithm race harness and benchmark targets
- `app.html` — in-browser evolution (built blind; smoke-tested by the owner)
- `docs/` — fitness spec, genome-string format, decisions
- `targets/` — target WAVs (the owner's `westminster-chimes.wav` lives here)
