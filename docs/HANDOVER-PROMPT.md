# Handover prompt

Paste the block below into a sandbox Claude Code session started with
`~/Desktop/Claude/sound-sandbox-env/launch-sandbox.sh`.

---

You are building a project called Playing God. Work in
`/sandbox/code/playing-god/`. Everything you need is in that directory or in
the vault at `/sandbox/Cowork/CONTEXT/`.

READ FIRST, IN THIS ORDER
1. `code/playing-god/README.md`
2. `code/playing-god/playing-god-spec.md` — the complete specification. Every value in it
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
2. Run the §5.2 prior sanity check over 1,000 random genomes and write the raw
   distributions to `output/gate-artefacts/`. Report distributions only, with
   no verdict — it is a plumbing check, not a quality judgement.
3. Render 100 random genomes to WAV in `output/gate-artefacts/gate1a-batch/`
   and write a listening harness that plays them in sequence. Build it with an
   **audio-only mode as the default** and visuals as a toggle: Gate 1a asks
   whether the generator is producing anything worth hearing, and visuals would
   change what is being judged. Do not judge them yourself — that gate needs a
   human.
4. Build Stage 2. Run Gates 2a and 2b. Write artefacts to
   `output/gate-artefacts/`.
5. Branch on Gate 2b:
   - PASS  → build EVERYTHING: Stage 3 in full, Gate 3-plumbing with synthetic
             dwell (label every synthetic run `SYNTHETIC` in the logs), the §14
             logging, the §8.6 annotation field, and the export path in
             `docs/EXPORTING-LOGS.md`. Do not stop to wait for a human verdict
             on Gate 1a — see docs/BUILD-ORDER.md for why that is safe.
   - FAIL  → STOP. Do not build Stage 3. Report the numbers and say which of
             playing-god-spec.md §13.3's listed fixes the evidence points to.
6. Write the report to BOTH of these paths — the second one reaches the host
   directly without needing sync-back, so it is the one that gets read first:
   - `/sandbox/code/playing-god/output/OVERNIGHT-REPORT.md`
   - `/output/PLAYING-GOD-OVERNIGHT-REPORT.md`
   Containing:
   - what was built, stage by stage
   - every gate result, measured number against stated threshold
   - anything in the specification you found ambiguous, contradictory or
     impossible, quoted with its section number
   - any place you were tempted to narrow the space, and what you did instead
   - every item in playing-god-spec.md §5.1 you had to choose a value for, what you chose, and
     why — those priors are undesigned and your choices are provisional
   - exactly what is waiting for a human, and how to run it

CODE STYLE
Heavily commented, and the comments explain *why* a decision was taken, not
what the line does. The project owner does not read code and navigates by
comments. Cite specification section numbers in comments wherever a constant
comes from the spec.

The sandbox snapshot excludes `.git/`, so this copy has no history. Run
`git init` in the project root at the start and commit after every meaningful
unit of work — that gives you rollback within the session. Do not attempt to
push to a remote; the real repository lives on the host and pushes happen there
after sync-back.

ENVIRONMENT
Everything you need is already in the snapshot. Do not install dependencies —
the specification requires vanilla JS with no build step and no packages, and
hand-rolled MFCC. If you find yourself running `npm install`, stop and
reconsider: it means you are about to build something the spec forbids.

`/sandbox` is your working copy and persists after the container exits.
`/output` is a separate mount that lands directly on the host.

Work autonomously through the whole task. Do not stop to ask questions —
record every question in the report and carry on with your best judgement,
saying in the report what you assumed. Nobody will be watching.
