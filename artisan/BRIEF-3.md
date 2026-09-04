# ARTISAN — improvement brief v3: tracks and voices

*Successor to `BRIEF-2.md` (2026-09-04) and `BRIEF.md` (2026-09-03). Written 2026-09-04. Owner: Jon Whitten (pronouns they/them — use them everywhere, including code comments and reports).*

**Where this brief comes from.** The owner proposed this direction after hearing v2's results, and proposed it *reluctantly* — their exact fear was that writing it down would make it "a method" and rob the tool of generality. Honour the fear, not just the idea: everything in this brief must work as well on spoken word, modem beeps, birdsong, and the sound of a train as on chimes. The canonical literature says this is achievable, because the core techniques here were invented for speech, not music: McAulay–Quatieri sinusoidal modelling (1986) and Serra & Smith's spectral modeling synthesis. Segmentation must *emerge from the signal*; no rule in this build may know what a "note" is.

**The job in one sentence.** Replace ARTISAN's frequency-first construction with time-first, track-based construction where it measurably pays, and make wave slots reusable across time — one wave serving several sequential sounds via its pitch and amplitude envelopes — judged, as always, solely by SSE under BRIEF-2's ablation discipline, which remains fully in force.

---

## 1. Read these first

1. `BRIEF.md` and `BRIEF-2.md` — **both still bind in full** (hard constraints, disowned invariants, deliverables, mixer, forward compatibility, anytime discipline, technique-ledger discipline). This brief adds to them; where they conflict, this one wins.
2. `output/ARTISAN-REPORT-v2.md` — especially §5 (the recover-6wave correction: measure before believing any prior report's story, including this brief's) and §8 (the measured broadband floors this build is chasing).
3. `technique-ledger.json` — the standing verdicts. This build appends to it; it never deletes rows.
4. `src/construct.js`, `src/envelope.js`, `src/pitch-track.js`, `src/gate-repeat.js`, `src/schedule.js` — v2's machinery, all of which survives. Track-based construction is an *addition to the portfolio*, not a rewrite.
5. `../src/synthesis.js` — you will need its phase-accumulation and envelope-interpolation semantics exactly (see §4.3). The code is ground truth; where any brief and the code disagree, the code wins.
6. `CONTINUATION-v2.md` — v2's judgement calls, dated.

**Precondition check, before anything else:** confirm v2 is actually present — `src/schedule.js`, `src/pitch-track.js`, `src/envelope.js`, `src/gate-repeat.js` exist and `node test/all.js` passes 45/45. If not, the owner's sync-back hasn't happened and you are looking at v1: STOP, write one plain sentence to that effect in your output and in `CONTINUATION-v3.md`, and do nothing else.

## 2. The evidence this avenue targets

- **Slots are the binding constraint on real audio.** v2's chimes genome uses 63 of 64 waves, every one enveloped, and the report's §8 floor analysis says the recording holds far more than 64 significant partials — the measured representational floor (~350–430 SSE) sits well below the delivered number precisely because 64 one-job oscillators run out. Slot reuse is effectively more oscillators.
- **Repeated pitches burn slots.** The delivered chimes genome spends two waves on ~329.5 Hz (the phrase's two E4 strikes) with different envelope onsets, because a global FFT cannot separate two same-pitch events in time. A time-first analysis sees two tracks; a reusable slot serves both.
- **Global energy ranking misses local dominance.** Matching pursuit picks the globally loudest residual peak, so a short quiet event that is locally the entire signal queues behind the tenth partial of a long loud one. Frame-local analysis ranks by what matters *now*.
- **Glides smear.** A swept pitch has no clean global FFT peak. v2's ridge tracker helps per-wave; a track-native front end makes glides first-class.

v2 reached the owner's proposed endpoint for pitch-distinct sequences (per-note waves, envelope-timed) from the frequency-first direction. This build attacks the cases where that direction provably loses, and the slot economy that caps all of it.

## 3. The two capabilities

### 3a. Track-based construction (the time-first front end)

Non-binding sketch, MQ-style: STFT the target (window/hop chosen from the signal, not assumed); pick spectral peaks per frame; link peaks frame-to-frame into **partial tracks** by frequency continuity, with births and deaths; each track carries an amplitude trajectory, a frequency trajectory, and phase. Compile each kept track to wave genes: pitch (or ≤8-node pitch envelope in cents), ≤8-node amplitude envelope in dB, start phase. Then hand over to v2's machinery unchanged — exact least-squares gain solve, per-wave A/B tests, the anytime scheduler, reallocation.

Track construction enters the portfolio **alongside** v2's global matching pursuit, not instead of it: run both constructors (or hybridise — global MP for stationary beds, tracks for transient/sequential content) and let the score choose per target. v2's constructor is what holds recover-2wave at machine-zero; do not degrade it.

### 3b. Slot reuse (voice allocation)

Assigning tracks to ≤64 slots so that no two temporally-overlapping tracks share a slot is interval-graph colouring — solved optimally by a greedy sweep in sorted start order, essentially free. A slot serving consecutive tracks glides between them (pitch envelope) while its amplitude envelope holds it silent, then re-enters for the next track. The 8-node budgets per envelope bound how many tracks one slot can serve (realistically 2–4); the allocator must respect node budgets, not just time-overlap.

**Reuse is a per-decision A/B like everything else:** a slot is reused only when the reused configuration scores at least as well as the two-slot version *or* when the freed slot buys more SSE elsewhere. On a target with fewer tracks than slots, reuse should barely fire — that is correct behaviour, not a failure.

## 4. The load-bearing physics — verify before building

### 4.1 Phase at re-entry

SSE demands the wave arrive at each re-entry phase-exact. A fresh slot gets phase from its phase gene; a reused slot's arrival phase is whatever its pitch trajectory integrated to. The proposed fix — the **silent-glide phase solve**: since the transit happens under a silent amplitude envelope, bend the pitch path (one mid-node's level is a continuous 1-D knob on accumulated phase) so arrival phase lands exactly where the next track needs it. The same trick makes same-pitch reuse possible (a tiny silent pitch detour re-phases between two strikes of one note).

### 4.2 The gate on all of §3b

Build reuse **only after** a phase-control experiment passes: construct a synthetic two-event target, attempt single-slot reuse with the silent-glide solve, and measure whether arrival phase is controllable to the precision SSE needs, through the real engine and float32 quantisation. If the engine's semantics make arrival phase uncontrollable or too brittle, report that with the measurement, ship track construction alone (it pays without reuse), and record reuse in the ledger as tried-and-blocked with the number. That is a respectable outcome; a reuse feature that sometimes lands out of phase is not.

### 4.3 Engine semantics to pin down first

From `../src/synthesis.js`, not from memory: how instantaneous frequency is computed from the pitch envelope (interpolation, curve/tension semantics); whether phase accumulates as the integral of instantaneous frequency; how envelope node times map to the render (proportional to whole render length — so the render-length choice interacts with node resolution); and what float32 storage does to all of it. One page of measured notes in `CONTINUATION-v3.md` before any reuse code.

## 5. Guardrails — the owner's fear, encoded

1. **No music rules.** No note grammar, no scale or pitch quantisation, no tempo or beat assumptions, no thresholds tuned to chimes. Every parameter of the front end must be signal-derived (relative to frame energy, window length from spectral content) or a config knob with a signal-agnostic default. The test: nothing in the code would read differently if music didn't exist.
2. **Ablation discipline, verbatim from BRIEF-2 §4b.** Track construction and slot reuse are ledger avenues (append as rows 9, 10, 11: tracks, reuse/allocation, phase-corrected re-entry). Each is kept only where it measurably lowers SSE on at least one benchmark, dropped with its number where it doesn't. Investigation exhaustive, use contribution-tested.
3. **Generality is a gate, not a hope (§6.2).** The benchmark suite grows so that "works on chimes" cannot masquerade as "works".

## 5b. Avenue to re-open — blended shapes as slot-compression (owner, 2026-09-04)

Add to the ledger and test properly: **does continuous shape-blending (a single wave summing e.g. 0.7 sine + 0.3 saw) allow a more accurate build than single-shape-per-wave?** This is NOT a fully-closed question. v2's ledger row 6 ("Mixed shapes") investigated it and dropped it — but its finding was specifically that blends buy **slot efficiency, not new reachable spectra** (separate single-shape waves *span* the same space, so on an uncapped test they match a blend), and it was tested on a synthetic 1-wave target, not under a slot-starved real-audio build. v3's whole premise is that **slots are the binding constraint on real audio** (v2's chimes genome spends 63 of 64). That is exactly the regime v2 did not test: if one blended wave can carry what two single-shape waves carried, the freed slots buy more partials elsewhere — which under the cap could raise accuracy, not just save slots. So the honest status is *investigated for reachability, NOT tested for slot-efficiency under the budget cap*. Re-open it: try blend-vs-separate head-to-head on chimes and speech at the 64-slot cap, keep it if it lowers SSE, drop it with its number if it doesn't. The construction A/B machinery already exists (it's how envelopes/glides are chosen); this is one more per-wave option. ARTISAN's constructor currently picks one pure shape per wave — that choice, not a genome limit, is why every delivered wave is single-shape; the genome blends continuously by design.

## 6. Acceptance gates

Pull all baseline numbers from what is on disk at your launch — including `output/chimes-long/` and `output/recover6-long/`, whose final numbers post-date the v2 report — never from any brief's recollection.

1. **Regression:** every v2 result holds or improves. recover-2wave machine-zero; 45+ tests stay green and grow to cover the STFT front end, tracking, allocation, and the phase solve.
2. **New synthetic benchmarks (build them as genome renders, so SSE = 0 provably exists, and add them to the configs):**
   - `seq-notes`: ≥8 sequential enveloped tones including **two same-pitch events**, more total events than would be comfortable one-slot-each. Gate: v3 beats v2 at equal budget by ≥10×, and at least one delivered wave verifiably serves ≥2 sequential events (visible in its envelope, confirmed by `verify.js`).
   - `glide`: a slow wide pitch glide (within the phase-coherence regime v2's report §8 mapped). Gate: v3 beats v2's stationary-approximation result decisively and delivers it as a pitch-enveloped wave or waves.
3. **Chimes:** reach **SSE ≤500** within a ≤2-hour budget — closing most of the measured gap to the ~350–430 floor — and re-derive the floor estimate from v3's own residual (`src/residual.js`), since v2's floor is itself a claim to re-test, not an inherited truth.
4. **Speech:** reach **SSE ≤160** — at v2's measured floor band (147–164). If v3's residual analysis moves that floor, in either direction, report the new number with the measurement.
5. **Budget discipline unchanged:** anytime scheduler fills the budget; early exit only on measured convergence.
6. **The escape hatch, unchanged from BRIEF-2 §5.6:** an unmet numeric gate with a measured, quantified ceiling or block is an acceptable outcome; an unmet gate without one is not.

## 7. Deliverables

- The full per-run artifact set, unchanged (genome, final.wav, target-scored.wav, verify.js, report.md, streamed curve, assembly WAVs, mixer). The mixer's per-wave envelope graphics already make a multi-event wave legible (a multi-hump envelope); make sure a reused wave's pitch path is drawn too, so the owner can *see* a voice hand itself from one bell to the next.

**Mixer bug to fix first (owner feedback, 2026-09-04).** In the v2 mixer the per-wave loudness graphics are drawn on an ABSOLUTE amplitude scale, so every quiet wave (most of them — a chimes genome runs −25 to −40 dB on all but a few) hugs the zero line and the graphic is invisible, wasting the space. Fix: draw each wave's envelope **normalised to fill its canvas height** (so its *shape* over time is always legible), and encode its **absolute loudness separately** — the owner's suggestion of colour-coding the row/fill by peak dB is a good one; a small peak-dB label on the row is a cheap complement. The scored-window shading stays. The point is that the graphic must show shape-in-time at a glance AND absolute level at a glance, for a wave at any volume. Also show each wave's **shape weights explicitly** on its row (e.g. "0.7 sine + 0.3 saw", not just "sine+saw") — the current label lists which shapes are enabled but drops the continuous blend proportions, which are invisible exactly when they matter (a blended wave).
- **`output/ARTISAN-REPORT-v3.md`** — v1/v2/v3 table on all benchmarks (old and new), the updated ledger verdicts, re-measured floors, the phase-control experiment's result stated plainly, untether handoff format. Plain English throughout; the owner is functionally code-illiterate.
- Updated README, `--help`, and configs (the new synthetic benchmarks get configs; `quick-demo` stays minutes-fast).

## 8. Pace, autonomy, surviving a dead session, operations

- Same as BRIEF-2 §7–8 in every particular: session runs as long as it needs; no check-ins (untether conventions — state options, pick one with a one-line reason, proceed); Continuation System (`felix-pitch-project/continuation-system/DESIGN.md`, copy `TEMPLATE.md` to `artisan/CONTINUATION-v3.md` as your first act after the §1 precondition check; earlier CONTINUATION files stay untouched as history); commit early and often, never push; engine and MIMIC strictly read-only; every stopping point leaves something runnable.
- **Compute courtesy:** host processes are invisible from the container. If launched before Saturday morning 2026-09-05 (~07:00), assume the two 24-hour MIMIC runs are still occupying the host: cap `--workers` accordingly. Check the date first.
- Prove the method at the 1–2 hour scale; leave the definitive 24-hour run to the owner (the `full-24h` config should now use the best constructor portfolio automatically).
