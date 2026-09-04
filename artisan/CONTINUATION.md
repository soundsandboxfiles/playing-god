# CONTINUATION.md — ARTISAN
**Resumption phrase:** "Consult artisan/CONTINUATION.md and proceed."

> **Protocol for any Claude instance reading this after an interruption:**
> 1. Read this whole file, then every FILE MAP entry marked ✅ or 🔄.
> 2. Trust only the LEDGER for what is done. A task is DONE only if its output file exists AND its verification passes. If a ✅ row fails its check, treat it as NOT done.
> 3. Resume from the NOW line. Don't redo ✅ work; do re-verify it cheaply (exists, non-empty).
> 4. Update this file immediately after each ledger item. Update NOW *before* starting long work.
> 5. Honour STANDING CONSTRAINTS without exception.

## STANDING CONSTRAINTS
- **Owner:** Jon Whitten, pronouns **they/them** — everywhere, including code comments and reports. Non-programmer: README + `--help` in plain English; never ask them to read code.
- **The genome format is the only cage.** Deliverable must be a valid `PG2:` genome string; delivered WAV must be the *unmodified engine's* raw render of that genome, 16-bit encoded. (BRIEF §3.1)
- **Engine read-only, one-way.** Artisan imports `../src/*` and `../mimic/lib/*` read-only; never modifies them; nothing in Playing God/MIMIC imports Artisan. (BRIEF §3.2)
- **Raw render, never normalised.** Score/deliver via raw `render()` (mimic `render-raw.js`), never `renderNormalized`. (BRIEF §2)
- **Local, offline, zero runtime network.** Verifier runs in plain node, zero deps, always. (BRIEF §3.3, §5)
- **Measurement honesty in full.** Real numbers, real ceilings, incidents reported plainly. Discovery-project invariants are DISOWNED here (BRIEF §4) — narrow/bias/canonicalise/set-genes-directly at will.
- **Never hard-code 64 / 96 / 23 / 6167.** Read slot count + layout from `../src/genome.js` and the PG2 codec. (BRIEF §9)
- **Autonomous build (untether Step 3):** no check-ins, no AskUserQuestion. State option + one-line reason, proceed. Commit locally, NEVER push. Every stopping point leaves the artifact runnable (DESIGN principle 10). Commit when a ledger row flips ✅ (principle 9).

## NOW
**BUILD COMPLETE except one documented gate miss.** All official runs delivered + verified:
recover-2wave SSE **0.0** (machine-zero, ∞× MIMIC), chimes SSE **1935.2** (4.11× MIMIC), recover-6wave SSE **33.29** (3.93× MIMIC, 137.7× floor). 33/33 tests pass. Report written + mirrored to /output. HONEST GATE STATUS: BRIEF §10.1 (verify) ✅, §10.3 (chimes) ✅, §10.4 (tests) ✅; §10.2 (recoverability ≥100×) **PARTIAL** — 2wave crushed (the emblem), 6wave beats MIMIC 3.93× but not 100× (additive ceiling; PM/AM modulation not oscillator-representable; report §5). Remaining OPTIONAL: a structural modulation-recovery stage could crack 6wave (sketched, not built — the clean avenue for future work). Final commit pending.

## LEDGER
Status: ☐ todo · 🔄 in progress · ✅ done (file exists + check passes) · ⛔ blocked

| # | Task | Output file | Verification | Status |
|---|------|-------------|--------------|--------|
| T0 | Create this doc | CONTINUATION.md | exists | ✅ |
| T1 | Skeleton + engine-import smoke + git init-commit | package.json, src/engine.js, src/score.js | `node -e` imports engine + renders + scores a genome without error | ✅ |
| T2 | Config + target loader (WAV decode / recover synth) + window plan | src/config.js, src/target.js | loads chimes.wav and builds recover-2wave; window arithmetic (y offset, len≥y+x) unit-checked | ✅ |
| T3 | PG2 round-trip + float32 quantisation harness | src/engine.js (re-export), test | encode→decode a set genome bit-exact; render identical pre/post round-trip | ✅ |
| T4 | verify.js (zero-dep) + prove against a known genome | verify.js | standalone `node verify.js <run>` decodes→renders→confirms sample-identity + recomputes SSE | ✅ |
| T5 | Analysis: FFT (pure node) + STFT + peak/partial + envelope extract | src/fft.js, src/analysis.js | FFT matches naive DFT to 1e-9; recovers a known 440Hz sine's freq/phase | ✅ |
| T6 | Constructive builder + linear-LS amplitude solve | src/genome-build.js, src/linfit.js, src/construct.js | construction beats MIMIC decisively w/ EXACT additivity (gap<1e-6): 2wave 34.6 (44×), chimes 2261 (3.5×). 6wave (4486) needs T7 — its PM/AM+pitch-env aren't sum-of-sines. The ≤15.24 gate moves to T12 (post-refine). | ✅ |
| T7 | Refinement: coordinate descent / pattern search + hand-rolled CMA-ES on TRUE engine | src/optimize.js, src/additive-model.js | elitist refine() improves SSE (2wave 8e-9→0.0; 6wave 36→33.5); additive model reconciles vs true engine (gap<2e-7) | ✅ |
| T8 | Orchestrator (matching-pursuit + refine) + streaming deliverable + assembly WAVs | src/pipeline.js, src/deliverable.js | streams best-so-far genome+WAV+curve on each improvement; honours --max-minutes deadline (tested) | ✅ |
| T9 | run.js CLI + configs (quick-demo, recover, chimes) + --help plain English | run.js, configs/*.json | `node run.js --config configs/quick-demo.json` finishes (5.7s), run dir passes verify.js | ✅ |
| T10 | Mixer HTML per run (real engine inlined, honest re-render) | src/mixer.js | mixer.html generated w/ engine inlined; inlined engine compiles+decode/renders headlessly (browser interactivity needs human smoke-test) | ✅ |
| T11 | Test suite (BRIEF §10.4) | test/all.js | 33/33 pass: decode round-trip, window arith, fitness parity, PG2 float32, verify vs known genome, surrogate parity(n/a) | ✅ |
| T12 | GATE 2 recoverability run: recover-2wave & recover-6wave beat MIMIC ≥100× | output/recover-2wave/, output/recover-6wave/ | **PARTIAL (honest):** 2wave SSE **0.0** (machine-zero, ∞× MIMIC ✅≫15.24) verify PASS; 6wave SSE **33.29** (3.93× MIMIC, 137.7× floor) verify PASS but **misses ≤1.309** — additive ceiling, its PM/AM modulation not oscillator-representable (report §5). | ⚠️ |
| T13 | GATE 3 chimes showcase: beat MIMIC decisively, full artifact set | output/chimes/ | ✅ SSE 1935.2 (4.11× MIMIC 7943, 4.12× below floor); verify.js PASS; mixer(1.2MB)+65 assembly WAVs present | ✅ |
| T14 | README (plain English) + ARTISAN-REPORT.md + host outbox mirror + handoff | README.md, output/ARTISAN-REPORT.md | ✅ README + report (untether §4 format) written; mirrored to /output/PLAYING-GOD-ARTISAN-REPORT.md; every gate result stated honestly incl. the 6wave miss | ✅ |

## DECISIONS (append-only)
- 2026-09-03: **Pure Node, zero external dependencies for the entire tool** (not just the verifier). The true engine (`../src/synthesis.js`) is cheap enough (~28 renders/s for a 2s target, single worker) to optimise on directly, so no PyTorch/NumPy surrogate is needed. WHY: BRIEF §5 prefers fewest moving parts (every dep is something Jon must keep alive) and §5(a) mandates a zero-dep verifier regardless. Consequence: **there is no surrogate, so surrogate-vs-engine drift is identically zero** — the strongest possible answer to §5's surrogate-parity requirement. Optimisation is gradient-FREE: analytic FFT init + linear least-squares for amplitudes (exact) + coordinate/pattern-search + hand-rolled CMA-ES for nonlinear genes.
- 2026-09-03: **Default render length = shortest window-covering length = y + x samples** (with y=0, = target length). WHY: BRIEF §2 notes the engine maps envelope node times over the whole render, so the shortest containing render maximises envelope resolution in the window; it also matches how the recover targets were rendered (lengthS=2.0 → N=44100), making their SSE=0 solution reachable. `--render-length` overrides.
- 2026-09-03: **recover-2wave is effectively a single audible wave** (w59: 4658.36 Hz gated saw, −6 dB). w27 has gain_out_on=false and modulates nobody → contributes zero to output. Recorded because it explains MIMIC's blind stall (high-freq saw needle) and sets ARTISAN's easy sighted win. recover-6wave IS dense (PM/AM, pitch env, gates, mixed shapes).
- 2026-09-03: **The additive mix is LINEAR in each wave's linear output gain** when no AM/PM couples the waves. Exploit: fix oscillator bases (shape/freq/phase/envelope-shape/gate), solve per-wave linear amplitudes by closed-form least-squares over the scored window → globally optimal amplitudes, threading the "needle" analytically instead of by search.
- 2026-09-03: MIMIC exact recorded bests pulled from `mimic/output/race-full.json`: recover-2wave GA best **1524.40** (floor 1561.66); recover-6wave GA best **130.92** (floor 4583.69); chimes delivered best **7943.73** gen77 (floor ~7976), report notes a lost pre-cap run ~7160. Gates: 2wave ≤15.24, 6wave ≤1.309, chimes ≪7160.
- 2026-09-03: **Engine facts nailed empirically for the builder.** (a) Single-sine output law: `out[n] = G·sin(2π·((n+1)·f/rate + phase0))`, confirmed to 6e-8; phaseAcc increments EVERY sample (even during pre_wait/gate-off), so phase is referenced from n=0 independent of the gate. Cosine atom {amp,φ} → `phase0 = (φ+π/2)/(2π) − f/rate (mod 1)`, gain_out_lin = amp. (b) **Globals are phenotype-inert** — `render()` reads only per-wave genes + render length; fundamental_cents/tempo/etc. are never read by synthesis. So ARTISAN optimises ONLY per-wave genes of active waves; globals stay 0. (c) `pre_prop×period` rounds to preSamp; to get preSamp=0 keep period ≤ ~22s at pre_prop floor 1e-6. (d) recover targets are **gated within the 2s window** (2wave w59: one on-cycle 0.029–0.879s then silence; 6wave: mixed gates + PM/AM + pitch env), so the method needs gate detection + true-engine refinement, not just stationary spectral LS.
- 2026-09-03: **Per-atom SHAPE selection + low-frequency search were the two decisive upgrades.** (a) Trying all 4 engine shapes per atom collapses a sawtooth target to ONE saw wave → recover-2wave hits **machine-zero SSE=0** (the emblem MIMIC stalled on at its silence floor). (b) A render-free decimated low-freq search catches sub-bin waves the FFT can't resolve → recover-6wave's dominant 0.223Hz sine (97.5% of energy) is finally captured, lifting 6wave from 0.03× to ~3.9× MIMIC.
- 2026-09-03: **recover-6wave ceiling ≈ 33.5 SSE (3.9× MIMIC, 137× below floor); the ≤1.309 (100×) gate is NOT reachable by additive methods.** Diagnostic decomposition of the (diagnostic-only) solution genome: 97.5% of its energy is a single unmodulated 0.223Hz sine (captured well), but the rest is per-wave PM+AM+pitch-envelope+gated waves whose time-varying spectra a sum of independent oscillators cannot reproduce to machine precision. MIMIC itself did WELL here (130.92, because the target carries matchable envelope structure), so 100× beyond it demands near-exact modulation recovery. Honest call per the measurement-honesty discipline: report the true number + this ceiling analysis; a structural PM/AM-recovery stretch may be attempted if build time remains. Contrast: MIMIC's HARD case (2wave, pure phase needle) is ARTISAN's EASIEST (machine-zero), exactly the thesis (BRIEF §6).
- 2026-09-03: **SPEC vs CODE flag** — `genome.js` header records a spec/appendix contradiction (GLOBAL_GENES 21 vs 22 enumerated; GENOME_SIZE 6101 vs 6102 v1). Code implements 23 globals / 6167 total (v2). Artisan reads all counts from the loaded schema (BRIEF §9), so it is unaffected; flagged not guessed, per BRIEF §1 read-list instruction.

## CONTEXT DISTILLATE
- **The failure this project fears:** MIMIC lost 8.75h by writing the deliverable only at the end. → Stream every best-so-far to disk immediately; honour `--max-minutes`; commit often; keep runnable between ledger rows.
- **ARTISAN's reason to exist:** MIMIC proved the blind time-domain SSE landscape has a *silence attractor* + phase needle that blind mutation can't thread. ARTISAN is *sighted*: FFT hands you the needle (freq+phase). Hardest blind case = easiest sighted case.
- **The one inherited discipline:** measurement honesty. Everything else from the discovery project (vastness, priors-never-truncate, listens-as-scarce, variation operators) is explicitly disowned (BRIEF §4). Set genes directly, canonicalise, bias — all fine.
- **Engine semantics that bite:** (1) phaseAcc increments BEFORE the sample is emitted, so sample n uses phase ∝ freq·(n+1)/SR — a half-sample-ish offset; the `phase` gene absorbs a constant offset. (2) envelope time t=n/(N-1) couples to render length N. (3) shape output is normalised by enabled-weight sum. (4) saw/square are naive (aliased) — target 4658Hz saw has aliasing that the engine reproduces exactly, so an exact-gene match is exactly reproducible. (5) gain_out_on=false ⇒ that wave is silent in the mix (gainOutLin=0) but can still be a modulator. (6) mid_wait_on gives a repeating on/off gate with period durSamp+midSamp.
- **Jon can't read diffs.** Report/README must translate to plain English and give recommendations, not raw evidence.

## FILE MAP
- `BRIEF.md` — ✅ the governing brief (read-only input).
- `CONTINUATION.md` — 🔄 this ledger.
- `package.json` — ✅ `{"type":"module"}`, zero deps.
- `src/engine.js` — ✅ read-only wrappers over ../src + ../mimic/lib (genome, synthesis, render-raw, genome-string, wavio, fitness).
- `src/score.js` — ✅ window plan + SSE (wraps mimic fitness) + silence floor.
- `src/config.js` — ✅ config load + CLI overrides + defaults + OPTION_HELP.
- `src/target.js` — ✅ target loader (WAV decode via mimic wavio; recover synth via mimic targets) + window plan.
- `src/fft.js` — ✅ pure-node FFT + real-signal helpers.
- `src/analysis.js` — ✅ projectAt/refineFreq/spectralPeaks/amplitudeEnvelope.
- `src/genome-build.js` — ✅ analytic atom → genes (single-sine law, phase map, gate, gains, amp-env fit).
- `src/linfit.js` — ✅ Cholesky least-squares amplitude solver.
- `src/construct.js` — ✅ constructive matching pursuit (OMP + global LS re-solve) + gate detection + assembly.
- `src/optimize.js` — ✅ gate-lock + coordinate descent + CMA-ES + refine() orchestrator.
- `src/additive-model.js` — ✅ fast cached additive scorer (reconciles vs true engine).
- `src/pipeline.js` — ✅ measure→construct→refine→deliver orchestrator.
- `src/deliverable.js` — ✅ per-run outputs + streaming + assembly + report.
- `src/mixer.js` — ✅ self-contained mixer.html generator (engine inlined).
- `run.js` — ✅ plain-English CLI + --help.
- `configs/` — ✅ quick-demo, recover-2wave, recover-6wave, chimes.
- `verify.js` — ✅ zero-dep verifier (proven pass+fail); copied into each run dir.
- `test/all.js` — ✅ 33-test suite (all pass).
- `README.md` — ✅ plain-English usage guide for the owner.
- `output/ARTISAN-REPORT.md` — 🔄 the master build report (untether §4 handoff format).
- `output/recover-2wave/`, `output/chimes/`, `output/recover-6wave/`, `output/quick-demo/` — delivered runs (each: genome.pg2.txt, final.wav, mixer.html, verify.js, report.md, assembly/).
