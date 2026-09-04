# ARTISAN

**Give ARTISAN a sound. It designs a Playing God "genome" that plays that sound back as closely as it possibly can — ideally note-for-note, sample-for-sample.**

ARTISAN is the third program in the Playing God set, and the opposite number of the other two:

- **Playing God** is the blind watchmaker — no target, it wanders and finds sounds nobody asked for.
- **MIMIC** has a target but stays half-blind — it *evolves* toward the sound by trial and error.
- **ARTISAN is sighted.** It has a target *and* it's allowed to use any method at all: it measures the sound, takes it apart, and builds the genome on purpose. Where MIMIC gropes, ARTISAN looks.

A "genome" is the little string of settings that Playing God turns into sound. ARTISAN's whole job is to hand you a genome string you can paste straight into Playing God (or share, or keep) that reproduces your target.

---

## What you need

Just **Node.js** (version 18 or newer). Nothing else — no libraries to install, no internet, no accounts. Everything runs on your machine and costs nothing but a little time.

To check you have Node, open a terminal in this folder and type `node --version`. If it prints a number, you're set.

---

## Quick start

From a terminal **in this folder** (`.../playing-god/artisan/`):

```
# A fast demo (finishes in seconds) — recovers a test sound perfectly:
node run.js --config configs/quick-demo.json

# Match your own sound (any .wav file):
node run.js --target /full/path/to/your-sound.wav

# The Big Ben chimes, the showcase run:
node run.js --config configs/chimes.json

# See every option explained in plain English:
node run.js --help
```

**How long should I let it run?** ARTISAN keeps improving for as long as you give it,
and stops early only if it truly can't do better. Pick a budget to fit your patience —
there are ready-made ones:

```
node run.js --config configs/standard-1h.json     # ~1 hour
node run.js --config configs/overnight-8h.json    # ~8 hours (leave it overnight)
node run.js --config configs/full-24h.json        # ~24 hours (the most it will use)
```

Point any of them at your own sound by adding `--target /path/to/your-sound.wav`.
It writes its best result to disk *continuously*, so you can stop it any time (or a
crash can happen) and whatever it had is already saved and valid.

When a run finishes it prints a folder like `output/quick-demo/` and, most importantly, the line:

```
Genome:  output/quick-demo/genome.pg2.txt   ← paste this into Playing God
```

That `.pg2.txt` file is the prize. Open it, copy the text inside, and paste it into Playing God.

---

## What each run gives you (in `output/<run>/`)

| File | What it is |
|---|---|
| **`genome.pg2.txt`** | **The prize.** The genome as a line of text. Paste it into Playing God. |
| **`final.wav`** | The sound ARTISAN made — the engine's own recording of that genome. |
| **`target-scored.wav`** | Your target, exactly as ARTISAN heard it, so you can A/B the two. |
| **`mixer.html`** | Open it in a web browser. Every wave in the genome gets a row with an on/off switch and a little picture of its loudness. Flip a switch and hear that wave drop out — the page rebuilds the real sound each time. This is for *listening*, and it's the fun one. |
| **`assembly/`** | The sound being built up one wave at a time — wave 1 alone, waves 1–2, 1–3, … so you can hear it assemble. |
| **`report.md`** | What it achieved, in plain English, with the honest numbers. |
| **`verify.js`** | The proof (see below). |

---

## The score, in plain terms

ARTISAN measures how close it got with one blunt number: **SSE** — add up, sample by sample, how far its sound is from your target, and square each difference. **Lower is better; 0 means a flawless, sample-identical match.** It's deliberately unforgiving: a sound that's *right but quieter*, or *right but shifted a hair in time*, still scores badly. (That's the same yardstick MIMIC used — the owner wanted a blunt tool, "if I just wanted fidelity, mp3 already exists.")

Every report also tells you how you did against **silence** (a silent render is the score to beat) and against **MIMIC's** best on the same sound.

Some sounds can be matched *perfectly* (SSE = 0) — especially sounds that were themselves made by a genome. Real-world audio usually can't be perfect, because the engine only has 64 simple waves, tops out around 11 kHz, and delivers in 16-bit — so ARTISAN reports the real floor it reached and, honestly, what stopped it going lower.

---

## Proof it's real — `verify.js`

You don't have to take the numbers on faith. In any run folder:

```
cd output/<run>
node verify.js
```

It independently re-creates the sound from the genome string using the **real, unmodified** Playing God engine, checks that the delivered `final.wav` is *exactly* that, re-computes the score, and prints a plain-English **PASS / FAIL**. A run isn't considered done until this passes. (It needs to sit inside the Playing God project folder, because it borrows the real engine to check.)

---

## A note about length (worth knowing before you paste into Playing God)

The genome is tuned for **one specific render length** (printed in the report). The engine stretches a wave's shape over the whole render, so the *same* genome at a *different* length is a cousin, not a twin — it'll sound related but not identical. If you drop the genome into Playing God and it sounds a bit different, that's why: Playing God may be rendering it at another length. Nothing's broken.

---

## The options (all optional)

Run `node run.js --help` for the full list in plain English. The ones you're most likely to touch:

- `--target` — the sound to match (a `.wav`, or a built-in test name).
- `--offset` — start matching a little way *into* the render, in seconds.
- `--max-waves` — the most waves ARTISAN may use (up to 64).
- `--max-minutes` — the **budget** to spend. ARTISAN fills it with useful work and stops early only on genuine convergence; it stops cleanly and keeps everything it found.
- `--workers` — how many of your CPU cores to use. With more than one, ARTISAN runs several independent attempts at once and keeps the best (capped at 4 to leave your machine responsive).
- `--shapeSearch` — try all wave shapes, not just sine. Great for buzzy/harmonic sounds; worth turning off for pure bell-like tones (it just costs time there).
- `--ampEnv` / `--pitchEnv` / `--gateRepeat` — let a wave fade over time / glide in pitch / repeat as a burst. All on by default; each is kept per-wave only when it actually helps.

Settings can live in a `--config` file (see `configs/`), and any flag on the command line overrides the file.

---

## For the curious: how it works

1. **Measure.** An FFT reads the target's frequencies, phases and volumes — including a special hunt for very slow (sub-Hz) waves that a plain FFT misses. This is the "sight": the exact thing MIMIC had to find by blind trial and error is simply *read off* the sound.
2. **Build.** ARTISAN adds one wave at a time, each explaining the loudest thing still unexplained, and gives that wave the *powers it needs*: the best oscillator **shape** (a buzzy sawtooth becomes one sawtooth, not a pile of sines); a **fade-over-time** envelope so a struck note can decay instead of holding one loudness (the single biggest improvement over the first version); a **pitch glide** if the note slides; a **repeating burst** if it pulses. Each extra power is kept only when it measurably helps that wave. After every wave it re-solves *all* the volumes at once, exactly, with a little linear algebra.
3. **Spend the budget.** It then runs an "anytime" loop until your time budget is gone: polishing every setting, and — crucially — **reallocating** waves (killing the least useful one and re-spending it on the biggest thing still unexplained). It streams its best result to disk the whole time and stops early only if nothing helps any more.

There's no separate "practice" simulator that could drift from reality — ARTISAN tunes against the true engine the whole way, so what it measures is exactly what you get. `verify.js` re-proves that from scratch.

Full detail, the honest numbers, the first-version-vs-this-version comparison, and the ceilings hit are in `output/ARTISAN-REPORT-v2.md` (the earlier `ARTISAN-REPORT.md` is the first version's story).
