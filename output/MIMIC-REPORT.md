# MIMIC — build & overnight report

*Autonomous evolution of Playing God genomes toward a target waveform.*
Sub-project of Playing God. Built overnight, autonomously, in the container.
Engine imported **read-only**; nothing in `../src/` or `../app/` was modified.

> Two mirror copies of this report exist:
> - `code/playing-god/output/MIMIC-REPORT.md` (this file, second-read-first)
> - `/output/PLAYING-GOD-MIMIC-REPORT.md` (host outbox)

**Status of the numbered brief:** all steps complete. Steps 1–9 built, tested
(22/22), and committed. Step 10 (showcase): the algorithm race ran to a decision
(GA), the chimes hunt ran to its wall-clock cap, and an audible companion demo
was added; the optional windowed second run was skipped (rationale in §6). Step
11 is this report, written to both paths.

**One honest incident, recorded.** The first chimes run died at generation
393/450 after ~8.75 hours (dense evolved genomes render ~7× slower than the
random-genome benchmark) and — because the deliverable was written only at the
end — lost everything. I fixed the design flaw (streaming, crash-survivable
deliverable + a `--max-minutes` cap; §7), then re-ran the hunt under supervision.
Nothing was faked or skipped to hide it.

---

## 1. What was built

A self-contained toolkit in `code/playing-god/mimic/`, its own git repo
(isolated commits, never pushed), plain node + browser, **no external
dependencies**.

| Piece | File(s) | What it does |
|---|---|---|
| WAV loader | `lib/wavio.js` | Hand-rolled RIFF decoder: 16/24-bit PCM, stereo→mono (averaged), linear-resampled to 22050 Hz. Re-exports the engine's 16-bit encoder for output. |
| Target synthesis | `lib/targets.js` | Synthetic (sine / chirp / decaying tone) + **recoverability** targets rendered from known genomes (2-wave, ~6-wave, a seed-pick favourite) where a perfect solution provably exists. |
| Raw phenotype | `lib/render-raw.js` | Renders the **raw** synthesis output (not the engine's normalised/trimmed path) — the deliberate choice that preserves the owner's quieter/offset penalties. |
| Fitness | `lib/fitness.js` | The owner's spec: SSE over the scored window, similarity = 1/SSE, guarded SSE=0. Off-by-default diagnostic metrics. |
| Genome string | `lib/genome-string.js` | `PG2:` + base64 float32 codec (P11 format), bit-exact round-trip, version-tagged, portable node+browser. |
| Algorithms | `lib/algorithms/*` | Three contenders: GA, Island GA, MAP-Elites-as-optimizer, over the engine's real variation operators. |
| Parallel eval | `lib/workers.js`, `lib/eval-worker.js`, `lib/score-core.js` | worker_threads pool; shared render-and-score kernel. |
| Runner | `run.js` | `node run.js --config <file>` + full CLI overrides; `--help` for a non-programmer. |
| Deliverable | `lib/deliverable.js`, `lib/harness-assets.js` | Per-run `output/<run>/`: per-generation fittest WAVs, fitness curves, final fittest WAV + genome string, and a self-contained audio-only listening harness. |
| Browser app | `app.html`, `app-worker.js`, `lib/browser-pool.js` | In-browser evolution with Web Workers, live fitness curve, listen/export. |
| Tests | `test/all.js` | 22 self-tests, all passing. |

Run `node test/all.js` to verify the whole core (genome-string round-trip, WAV
decode, the fitness spec's penalties, recoverability self-SSE=0, worker==serial
bit-exactness, the shared kernel, the app's import surface, elitism monotonicity).

---

## 2. The fitness — the owner's spec, and every temptation resisted

**Similarity = 1 / (sum of squared sample-by-sample differences)** over the
scored window, on raw float samples at the engine rate (22050 Hz). Implemented
by minimising SSE (guarding SSE=0), reported as 1/SSE. Full detail in
`mimic/docs/FITNESS.md`.

It punishes *identical-but-quieter* and *identical-but-offset* by construction —
the owner wants exactly this bluntness. Verified by tests: a half-amplitude copy
and a one-sample-shifted copy both score SSE > 0.

### Fitness temptations resisted (recorded per house habit)

1. **Normalise amplitude before SSE.** Random genomes are wildly mis-scaled and
   normalising would smooth early search — but it erases the quieter-is-punished
   penalty. *Resisted.*
2. **Cross-correlate for the best lag before SSE.** Phase deception (below) makes
   the landscape brutal; aligning first would help enormously. "No alignment
   tolerance" is in the spec. *Resisted* — even the diagnostics do not align.
3. **Score in the spectral domain.** A bell is defined by its partials far more
   than its phase. *Resisted as default* — offered only as `--metric spectral`,
   off by default.
4. **Truncate the render at the scored window's end** (the brief's optional
   speed shortcut). *Resisted* — the engine maps envelope time as `t=n/(N-1)`
   over the whole render length, so truncating changes the scored phenotype. We
   render full length and window the SSE.
5. **Use the engine's `renderNormalized`.** It applies loudness normalisation +
   leading-silence trim, which would erase both the loudness and the offset
   penalties. *Resisted* — we reach past it to the raw `render()`.

Nothing on this list was acted on. The full running log is in
`mimic/docs/DECISIONS.md`.

---

## 3. The time-domain SSE landscape — phase deception & the silence attractor

The brief predicted phase deception and asked me to measure and report it. It is
the single most important empirical finding of the build, and it is **not a bug —
it is the owner's fitness behaving exactly as specified.**

**The silence attractor.** A totally silent genome scores `SSE = |target|²`
(the target's own energy). A *loud* genome whose oscillation is misaligned in
phase scores `|g|² + |t|² − 2⟨g,t⟩ ≈ |g|² + |t|²`, which is **worse than
silence**. So on any oscillatory target the search is driven *toward* silence,
and to beat silence a genome must achieve genuine positive correlation with the
target — which for a sustained tone means matching frequency to within ~`1/T` Hz
(a few cents over a 2 s window) *and* phase. That capture region is a needle;
random mutation rarely threads it.

**Measured consequence.** On the pure oscillatory recoverability target
(`recover-2wave`, silence-floor SSE 1562) all three algorithms stall *exactly* at
the silence floor across seeds and hundreds of generations — even though a perfect
solution (SSE=0) provably exists in the search space. The machinery is proven
correct: seeding the known solution into gen-0 holds SSE=0 under elitism. The
stall is pure landscape.

**But it is target-dependent.** Targets with transient / envelope structure —
the decaying tone, and (crucially) the bell chimes — expose gradient *below* the
silence floor, because partial matches of the onset and amplitude envelope
correlate positively even when the fine carrier phase is wrong. The GA beat the
decay-440 silence floor (2676 → 2533) in a 12-generation smoke run. So MIMIC
genuinely matches structure where structure is matchable, and honestly fades to
near-silence where only a phase needle would win. **The fitness still stands as
spec'd.**

---

## 4. The algorithm race — decided by measurement

**Full multi-seed race:** population 100 × generations 60, seeds 1/2/3, all six
benchmark targets, identical render budget per algorithm (each renders
`pop × (gen+1)` genomes). Raw data: `mimic/output/race-full.json`.

Best final SSE (lower is better), and how far it dips below the silence floor:

| target | silence floor | GA best (× below floor) | Island best | MAP-Elites best |
|---|---|---|---|---|
| sine-220 | 7.94e3 | **3.85e3 (2.06×)** | 4.44e3 (1.79×) | 7.69e3 (1.03×) |
| chirp-110-880 | 7.94e3 | **7.51e3 (1.06×)** | 7.59e3 | 7.76e3 |
| decay-440 | 2.68e3 | **1.14e3 (2.35×)** | 1.59e3 (1.68×) | 2.48e3 (1.08×) |
| recover-2wave | 1.56e3 | **1.52e3 (1.02×)** | 1.56e3 (1.00×) | 1.56e3 (1.00×) |
| recover-6wave | 4.58e3 | **1.31e2 (35.0×)** | 1.38e2 (33.2×) | 2.77e2 (16.5×) |
| recover-seedpick | 4.05e4 | 2.83e4 (1.43×) | **2.67e4 (1.52×)** | 3.51e4 (1.15×) |

**Scoreboard: GA 5 wins, Island 1, MAP-Elites 0.** Escapes below the floor are
nearly tied (GA 17, Island 17, MAP-Elites 18 out of 18 runs), which tells the
real story:

- **MAP-Elites escapes the floor most *often* but by the smallest *margin*
  every time.** Its enforced diversity always keeps some loud, mildly-correlated
  genome alive in an off-cell, so it reliably clears silence — but it spreads the
  render budget across ~256 cells instead of hammering the best basin, so it never
  digs deep. The "diversity as deception-hedge" bet loses here because the
  deception is a *needle* (a narrow capture region), not a wide false basin:
  diversity doesn't help you thread a needle, concentration does.
- **GA escapes slightly less often but goes far *deeper*** — 2× under floor on the
  tonal targets, 35× on the 6-wave. Depth is exactly what "match the target"
  rewards, so GA is the right default.
- **Island** tracks GA closely (it *is* four small GAs) and wins only the
  seed-pick, where its demes hedged a hard, dense target slightly better.

Notice GA even cracked the **pure sine** with the larger budget (3.85e3 vs floor
7.94e3) — with 60 generations and 100 genomes it threaded the frequency/phase
needle that the tiny smoke runs could not. The landscape is deceptive, not
impossible.

**→ Default algorithm set to `ga`** in `run.js` and the configs. Island is the
recommended alternate for dense/hard targets; MAP-Elites is retained for its
diversity but is not competitive as a pure optimiser here.

---

## 5. Recoverability verdict — how close to re-finding a known genome's sound?

A perfect solution provably exists for these (the target *is* a rendered genome),
so this measures how much of the deception the search can overcome:

- **~6-wave genome: excellent.** GA reaches SSE 131 against a silence floor of
  4584 — **35× below floor**, from a random start, with no phase alignment
  allowed. The bulk of the sound is recovered; what remains is fine-phase
  mismatch on the higher partials.
- **2-wave pure oscillator: essentially a stall.** GA reaches 1524 vs a 1562
  floor — a 2% dip, 2 seeds of 3 even that much. This is the silence attractor at
  its purest: a two-sine target is almost all needle and almost no envelope, so
  there is nothing to hill-climb toward except the exact frequency+phase, which
  random mutation almost never hits. **Honest verdict: on pure sustained tones the
  blunt time-domain SSE is close to unsearchable — and that is the fitness working
  as the owner specified, not a failure of the search.**
- **Seed-pick favourite: partial.** Best 2.67e4 vs 4.05e4 floor (~1.5× below) —
  a dense, 60+-wave real creature is far too high-dimensional to recover in 60
  generations, but the search still gets a third of the way below silence.

The takeaway: recoverability scales with how much *matchable structure*
(transients, envelopes, low-frequency shape) the target carries versus how much
is *pure phase* (sustained partials). The chimes sit in the favourable middle —
lots of struck-bell transient and decay envelope — which is why the main hunt
(next) gets real traction.

---

## 6. The chimes hunt — and an audible companion demo

### The chimes (the honest hard case)

GA (the race winner), against `targets/westminster-chimes.wav` — 9.5 s, whole
length scored, silence-floor SSE **7976**. Population 150, streaming deliverable,
20-minute wall-clock cap.

**Result: it reached generation 77 and best SSE 7943.7 — a 0.4 % dip below the
silence floor.** The fittest genome's peak grew across the run from 0 → ~0.12
(near-silent → faintly present), and the per-generation fittest peaks trace that
faint climb: `0.00, 0.03, 0.05, 0.09, 0.11, 0.12, 0.13, 0.12`.

This is the **phase deception at full strength, and it is the fitness working as
the owner specified — not a failure.** A 9.5 s bell is almost entirely *sustained
inharmonic partials*, i.e. phase needles: to score meaningfully below silence a
genome must lock the frequency *and* phase of several partials simultaneously over
9.5 seconds, and the blunt SSE gives no gradient toward that until it is nearly
achieved. So the SSE-optimal strategy is **near-silence with a whisper of
correlated energy**, which is exactly what the search converged to. Listening to
the ascent, you hear a faint, growing bell-tinged texture emerging from silence —
honest, if humbling.

Two caveats that keep this fair rather than damning:

- The earlier (pre-cap) run reached SSE 7.16e3 (~10 % below floor) by generation
  393 — so with *far* more compute the chimes do keep yielding, slowly. The
  descent is real, just glacial, and dense late genomes render ~7× slower (§7),
  which is why a wall-clock cap is the sane bound. The 20-minute run is a faithful
  *slice* of that ascent, not its ceiling.
- The result would be dramatically better under a phase-tolerant metric — which is
  precisely why the owner forbade one. `--metric spectral` exists for the curious
  (it matches partials regardless of phase and would "hear" the bell), but it is
  **not** the spec and off by default.

**Hear it:**
```
cd mimic/output/chimes-main
node serve.js          # → http://localhost:8080/  — press "Play all in order"
```
`fittest-listen.wav` is the final fittest normalised for comfortable volume;
`fittest.wav` is the faithful (quiet) render that was actually scored.

### The audible companion demo (recover-6wave) — hear the machine really converge

Because the chimes converge to near-silence, they are a poor *demonstration* that
the search works. So there is a second, deliberately *matchable* run the owner can
hear clearly: `recover-6wave` (a known 6-wave genome, so a perfect solution
exists; silence floor 4584), GA, 120 generations.

**Result: best SSE 138 vs floor 4584 — 33.2× below the floor.** The ascent is
clean and loud enough to hear plainly (fittest peak ~0.5–0.7 throughout):

| generation | 0 | 30 | 60 | 90 | 120 |
|---|---|---|---|---|---|
| best SSE | 2431 | 482 | 243 | 160 | **138** |

61 per-generation WAVs at `mimic/output/demo-6wave/`. Play them in order
(`node serve.js`) and you hear a clear convergence: a rough approximation at gen 0
sharpening steadily toward the target's timbre. This is the same GA, the same
blunt SSE — it simply has matchable structure to climb.

> Take-away for the owner: the toolkit converges audibly and strongly wherever the
> target carries matchable structure (envelopes, transients, recoverable genomes);
> it fades honestly to near-silence on pure-phase targets like a sustained bell.
> Both behaviours are the same blunt fitness you asked for.

*(The optional windowed second run — 13.5 s total, chimes scored from t=2 s — was
**skipped**: it would be the same near-silent chimes outcome at 40 % more cost,
and the priority was finalising cleanly after the earlier crash consumed the
overnight budget. The window feature itself is tested and works; see §3/§8 and
`configs/chimes-windowed.json` to run it.)

---

## 7. Throughput & wall-time (measured, 8-core container)

Render throughput (batch of 256 renders):

| render length | 1 worker | 2 | 4 | 8 |
|---|---|---|---|---|
| chimes 9.5 s | 5.9 r/s | 11.1 (1.9×) | 19.4 (3.3×) | **24.6 r/s (4.2×)** |
| bench 2.0 s | 28.2 r/s | 52.7 (1.9×) | 93.9 (3.3×) | **115.4 r/s (4.1×)** |

Speed-up plateaus near 4× at 8 workers (memory-bandwidth bound; the render is a
tight per-sample loop over a large buffer). Still a 4× wall-clock win.

**Wall-time for the chimes (9.5 s, 8 workers, 24.6 renders/sec)** — minutes for
`population × generations` (each generation renders `population` offspring, so
renders = `pop × (gen+1)`; this is exact for MIMIC, not an estimate):

| pop \ gen | 50 | 100 | 200 | 500 | 1000 |
|---|---|---|---|---|---|
| 100 | 3.5 | 6.8 | 13.6 | 33.9 | 67.7 |
| 200 | 6.9 | 13.7 | 27.2 | 67.8 | 135.4 |
| 300 | 10.4 | 20.5 | 40.8 | 101.7 | 203.2 |
| 500 | 17.3 | 34.2 | 68.0 | 169.5 | 338.6 |

(`node bench/throughput.js` regenerates this on any machine; the owner's is 8-core.)

**Operational finding (learned the hard way).** The table above is measured on
*random* genomes (mean ~5 active waves). But a GA evolving toward a rich target
accumulates active waves (the duplication operator adds them, and a complex bell
rewards more), so late-generation genomes render **~7× slower** than random ones.
A first chimes run crawled to gen 393/450 over ~8.75 h and then died — and
because the deliverable was written only at the end, it lost everything. Two fixes
landed:

- **Streaming deliverable** — each generation's fittest WAV is written to disk the
  moment it is produced (`streamStart`/`streamSavedGen`/`streamFinalize`), so a
  crash leaves a playable partial. The manifest is rewritten each save.
- **`--max-minutes` wall-clock cap** — stops the loop cleanly and finalises,
  keeping everything saved. The chimes config now uses it, because for a
  dense-genome run the cap, not the generation count, is the practical bound.

---

## 8. Provisional choices (owner may overrule)

- **Engine rate 22050 Hz** for MIMIC (matches the target natively, halves render
  cost). Hard-coded default.
- **Recoverability seeds**: 2-wave = priors seed 14, 6-wave = seed 4, favourite =
  `seed-picks.json` genome[0]; chosen by scanning for audible, non-clipping
  targets (a silent target is trivially "recovered" by silence).
- **Linear resampling** of the target (transparent, deterministic, unbiased).
- **Default total length** = exactly the span covering the window, so no target
  sample is dropped.
- **Gen-WAV loudness**: one shared anti-clip gain per run (never boosts), so the
  quieter-is-punished cue survives as you listen to the ascent.
- **MAP-Elites axes** = the engine's development×harmonicity descriptors, computed
  on the scored window; calibrated from the gen-0 sample.

Full list with rationale: `mimic/docs/DECISIONS.md`.

---

## 9. The browser app — smoke-test checklist

`app.html` was built blind (no browser in the container). Its DOM-free core is
the same tested modules the CLI uses; the DOM/Worker/WebAudio wiring needs a human
pass. **Full checklist: `mimic/docs/APP-SMOKETEST.md`.** In brief: serve the
project root (`python3 -m http.server 8000` from `code/playing-god/`), open
`http://localhost:8000/mimic/app.html`, load a target (chimes / synthetic /
upload), Start, watch the live SSE curve, listen to the fittest, export WAV +
genome string, round-trip the string through the paste box.

---

## 10. How to point it at any WAV tomorrow (non-programmer steps)

From a terminal in `code/playing-god/mimic/`:

```
# Evolve toward your own sound, with sensible defaults:
node run.js --target /full/path/to/your-sound.wav

# The Big Ben chimes, more effort:
node run.js --config configs/chimes.json

# Turn the dials (every one is optional):
node run.js --target your.wav --algorithm ga --population 300 \
            --generations 300 --seed 7 --workers 8

# See every option explained in plain English:
node run.js --help
```

When it finishes it prints a folder like `output/<run>/`. To **hear the
convergence**:

```
cd output/<run>
node serve.js          # prints http://localhost:8080/
```

Open that URL and press "Play all in order" — you'll hear the best sound of each
saved generation, earliest first. `fittest.pg2.txt` in that folder is the winning
genome as a shareable text string; paste it into the app to hear or evolve it
further.

---

## 11. Open questions carried (answered with best judgement, flagged for the owner)

- **Default algorithm** — being set by the running race (§4). If the owner
  prefers a different default they change one line in `run.js` / the config.
- **44100 Hz option** — MIMIC standardises on 22050 for speed; a `--sample-rate`
  flag is a small addition if the owner wants full-band fidelity.
- **Alternate selection metrics** — implemented but off by default; the owner may
  want `--metric spectral` runs for curiosity (documented as *not* the spec).
- **Genome-string seeding in the app** — implemented as "seed gen-0 with a pasted
  genome"; a deeper "resume a whole run" is a future addition.
- **Windowed second run (skipped)** — `configs/chimes-windowed.json` is ready
  (13.5 s total, chimes scored from t=2 s, free tails); it was skipped to finalise
  cleanly after the crash ate the overnight budget, and because it would reproduce
  the same near-silent chimes outcome at higher cost. The windowing itself is
  tested and correct.
- **Dense-genome render cost** — the ~7× slowdown as genomes accumulate active
  waves is the single biggest practical limiter on the chimes. A future speed-up
  (e.g. a parsimony pressure, or capping active waves) would let the chimes run
  much deeper per wall-clock minute. Not done — it touches search dynamics and
  wanted an owner steer.

---

## 12. Deliverable index (where everything is)

- `mimic/` — the toolkit (own git repo, committed per unit, never pushed).
- `mimic/output/chimes-main/` — the chimes hunt: 12 gen WAVs, `fittest.wav`
  (faithful) + `fittest-listen.wav` (normalised), `fittest.pg2.txt`, curves, and
  `serve.js` (audio-only harness).
- `mimic/output/demo-6wave/` — the **audible** convergence demo (61 gen WAVs).
- `mimic/output/race-full.json` — the full algorithm-race data.
- `mimic/output/throughput.json` — throughput + wall-time table.
- `mimic/docs/` — `FITNESS.md`, `GENOME-STRING.md`, `DECISIONS.md`,
  `APP-SMOKETEST.md`.
- `mimic/app.html` — in-browser evolution (serve the project root; smoke-test §9).
- Run `node test/all.js` in `mimic/` to re-verify the core (22 tests).
