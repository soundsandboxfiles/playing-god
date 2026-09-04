# Session note: build a Playing God to-do list

*Filed 2026-09-04 from Jon's offline notes (20:40). Run this as its own fresh session.*
*Recommended model to run it with: **Opus** — this is a judgement task (read the actual state of the tree, infer what each thread needs, match tasks to models), not a heavy build.*

## How to run this

Start a new session, point it at `code/playing-god/`, and give it the note below. First
instruction to honour: **the source of truth is the actual files and their date stamps, not
any "story so far" document** — in particular IGNORE `code/playing-god/THE-STORY-SO-FAR.html`,
which Jon has explicitly flagged as not authoritative. Read the real files:
`artisan/BRIEF*.md`, `artisan/output/ARTISAN-REPORT*.md`, `artisan/CONTINUATION*.md`,
`artisan/technique-ledger.json`, `mimic/` (incl. the two 2026-09-04 24h run logs and outputs),
`impressionist/NOTES-FOR-BRIEF.md`, `impressionist-mimic/HOLD.md`, and the memory area
`/areas/playing-god.md`. Note the sandbox/sync-back state (the ARTISAN v2 code and the two long
runs may live only in the sandbox snapshot until sync-back).

## Jon's note, verbatim

> Please make and save a playing god to do list. There's lots of threads in play and I don't
> want to lose any. Your source of truth is the actual files and their date stamps, not the
> 'story so far' doc. Include with each one which Claude model you'd recommend. So something like
> 1) build brief for x v.2 from notes/ a conversation
> 2) build x v.2
> 3) collect a, b and c type of wavs as targets for a wide and representative test set
> 4) test y with a 24 hour run on x target
> Etc

## Deliverable

A saved to-do list (Jon's vault convention: consider `Cowork/TASKS/` and its index, or a
`code/playing-god/TODO.md` — pick the one that fits how Jon already works and say why). Each
item: the thread it belongs to, its current real state per the files, the concrete next action,
and a recommended Claude model with a one-line reason. Flag any thread that looks stalled,
blocked on sync-back, or waiting on Jon.
