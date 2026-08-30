# Handover prompt

Paste the block below into a sandbox Claude Code session started with
`~/Desktop/Claude/sound-sandbox-env/launch-sandbox.sh`.

---

You are building a project called Playing God. Work in
`/sandbox/code/playing-god/`. Everything you need is in that directory or in
the vault at `/sandbox/Cowork/CONTEXT/`.

READ FIRST, IN THIS ORDER
1. `code/playing-god/README.md`
2. `code/playing-god/SPEC.md` — the complete specification. Every value in it
   is a decision, not a suggestion. Where you disagree, implement it as written
   and record the disagreement in your report.
3. `code/playing-god/docs/BUILD-ORDER.md` — the stage sequence and its gates.
4. `Cowork/CONTEXT/projects/playing-god.md` — the reasoning behind the
   constants, and the decisions already taken against the designer's instinct
   with the reasons they were taken. Read this before proposing any change; it
   will stop you re-proposing things that were considered and rejected.
5. `Cowork/CONTEXT/beliefs/vastness-is-the-point.md` — the governing value.

THE RULE THAT OVERRIDES YOUR JUDGEMENT
Priors bias sampling; they never truncate the space. This system exists to find
something nobody could have specified in advance. If you find yourself about to
improve the output by narrowing what can be produced — constraining a range,
filtering candidates, adding a validity check that rejects genomes, hard-coding
a musical assumption — stop. That is wrong by construction, it has happened
three times already during design, and it is the single thing most likely to go
wrong in this build. Note the temptation in your report instead of acting on it.

Equally: do not add any metric that judges whether a sound is good. The system
does not know what will score well and neither do you.

BUILD TO THE GATES, NOT TO COMPLETION
Follow `docs/BUILD-ORDER.md` exactly. Gates are stop conditions. Do not build
Stage 3 until Gate 2b has passed. If a gate fails, stop and report — do not
work around it, do not loosen the threshold, do not proceed hoping it resolves.

Constraints of this environment, which shape the architecture:
- There is no audio device. You cannot hear anything. Do not try.
- There is no browser. Every automated gate must run under plain `node`.
  Keep `src/` free of DOM dependencies so gates can import it directly.
- Hand-roll the MFCC implementation rather than adding a dependency.

WHAT TO DO, IN ORDER
1. Build Stage 1 plus its §14 logging. Run Gate 1b-mech.
2. Render 100 random genomes to WAV in `output/gate-artefacts/gate1a-batch/`
   and write a listening harness that plays them in sequence with the
   legibility display. Do not judge them — that gate needs a human.
3. Build Stage 2. Run Gates 2a and 2b. Write artefacts to
   `output/gate-artefacts/`.
4. Branch on Gate 2b:
   - PASS  → build Stage 3, run Gate 3-plumbing with synthetic dwell, and
             label every synthetic run `SYNTHETIC` in the logs.
   - FAIL  → STOP. Do not build Stage 3. Report the numbers and say which of
             SPEC §13.3's listed fixes the evidence points to.
5. Write `output/OVERNIGHT-REPORT.md` containing:
   - what was built, stage by stage
   - every gate result, measured number against stated threshold
   - anything in the specification you found ambiguous, contradictory or
     impossible, quoted with its section number
   - any place you were tempted to narrow the space, and what you did instead
   - exactly what is waiting for a human, and how to run it

CODE STYLE
Heavily commented, and the comments explain *why* a decision was taken, not
what the line does. The project owner does not read code and navigates by
comments. Cite specification section numbers in comments wherever a constant
comes from the spec.

Commit after every meaningful unit of work. Do not attempt to push to a remote;
this sandbox has no git history and pushes happen host-side.

Work autonomously. Do not stop to ask questions — record them in the report.
