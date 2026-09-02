# app.html — owner smoke-test checklist

`app.html` was built **blind** (no browser in the container, like every app
surface in this project). Its DOM-free core — the algorithms, the fitness, the
WAV codec, the genome-string codec, and the *worker scoring kernel* — is
imported from the same modules the CLI uses and is covered by `node test/all.js`
(22 passing tests, including "score-core scorer == serial" and "app import
surface resolves"). What node **cannot** exercise is the DOM wiring, the Web
Workers, WebAudio playback, and file download. Please walk this list.

## How to serve it

The app imports the engine from `../src/` and fetches `targets/…`, so it must be
served with the **project root** (`code/playing-god/`) as the web root — exactly
like the main app. From `code/playing-god/`:

```
python3 -m http.server 8000
#   or:  npx serve .    (any static server rooted here)
```

Then open **http://localhost:8000/mimic/app.html**.

> Opening the file directly (`file://…`) will NOT work — ES modules and workers
> need `http://`.

## The checklist

1. **Page loads** with two panels (controls left, chart right) and the log line
   "ready. Load a target…". The pill by the title reads "—".
2. **Load a target** — three ways, each should populate the "target set" line
   with duration / samples / silence-floor SSE:
   - click **Big Ben chimes** (fetches the bundled WAV — confirms server root),
   - pick a **synthetic** target from the dropdown (sine / chirp / decay),
   - **upload** a 16- or 24-bit PCM WAV of your own.
3. **Listen to target** button plays it (confirms WebAudio + WAV encode).
4. **Start evolving** (defaults are fine). Expect:
   - the pill switches to "N web workers" (or "single core" if workers are
     blocked — see note),
   - the **chart** draws a blue best-SSE curve descending toward/below the dashed
     "silence floor" line,
   - the stat readouts (generation, best SSE, similarity, renders, renders/sec)
     update live,
   - the UI stays responsive; **Stop** halts it.
5. **Listen to current fittest** (enabled after a run) plays the evolved sound.
   On a transient-rich target it should be audibly non-silent; on a pure tone it
   may be near-silent (that is the phase deception, not a bug — see the report).
6. **Export fittest WAV** downloads `mimic-fittest.wav` and it plays in any player.
7. **Copy genome string** fills the PG2 box and copies to clipboard. Paste it
   back into the box, press **Listen to pasted** — it should audition the same
   sound (round-trip).
8. **Seed next run**: paste a PG2 string, tick "seed next run with pasted
   genome", Start — the log should say "seeded gen-0 with pasted genome".
9. **Metric dropdown**: switching to a diagnostic metric still runs (the numbers
   are then not the owner's blunt similarity — the app does not stop you, matching
   the CLI's `--metric`).

## Notes / known-provisional

- **Web Workers with `type: 'module'`** are used for parallelism. All current
  desktop browsers support them; if a browser or a strict CSP blocks worker
  construction, the app **automatically falls back to single-core** (pill shows
  "single core") and still works, just slower. This fallback path is the same
  serial evaluator the tests cover.
- **`navigator.clipboard`** may be blocked outside `https`/localhost; if so the
  genome string is still shown in the box (the log says "clipboard blocked").
- The in-browser run renders at **22050 Hz** like the CLI, so its SSE numbers are
  directly comparable to a CLI run with the same settings/seed.
- Big populations × generations in the browser are CPU-bound on your cores; start
  with the defaults (pop 120 × 80 gens) and scale up once it feels right.

If any of 1–7 fails, note which step and the browser console error; that is
enough to pinpoint the DOM/worker wiring (the computation underneath is tested).
