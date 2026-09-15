# WHEN STUCK — The Escalation Ladder

## Status: CANONICAL (template)

> What an AI does the moment it's blocked or uncertain. Without this, a stuck agent does the worst thing: it guesses, invents context, and produces confident nonsense ("AI slop") — or it loops forever, burning time and money. This ladder forces the opposite: stop, diagnose, escalate cleanly. Enforces `GLOBAL_RULES.md §3.1` (no AI slop) and §2 (honesty). Project-independent; copy unchanged.

---

## Rule zero

**When uncertain, do NOT guess.** A wrong answer delivered confidently is more expensive than an honest "I'm blocked." Stopping is not failure; silent guessing is.

---

## The ladder (climb in order)

**1. Re-ground.** Re-read the relevant docs and `KNOWN_ISSUES.md`. Most blocks are "I missed something already written down."

**2. Diagnose the block.** Name which kind it is:

| Block type | The right move |
|---|---|
| **Missing context** (need a file you weren't given) | Report PARTIAL; list the EXACT files you need. Do not scan directories or invent the content. |
| **Ambiguous spec** (the task can be read two ways) | Stop; state both readings; ask the orchestrator which. Don't pick one and hope. |
| **Scope too big** (it's really several tasks) | Report PARTIAL; propose how to split it. Don't try to do it all and half-finish. |
| **Technical, reversible** (a two-way door) | Decide it yourself, do it, and log the choice. Don't escalate trivial calls. |
| **Technical, irreversible** (a one-way door) | Stop; escalate to the founder with options + a recommendation (`GLOBAL_RULES.md §6`). |
| **Product / business decision** | Always escalate to the founder. Present 2–3 options, recommend one, in plain language. |
| **Technical blocker** (a real error/bug) | Try ONE corrected approach. If it fails, go to the loop guard below. |

**3. The loop guard.** **After two failed attempts at the same thing, STOP.** Do not try a third variation of the same idea. Re-read, re-diagnose, and escalate. Repeating a failing approach is how an AI burns a budget and produces garbage. Per `AGENT_CONSTITUTION.md`: never re-spawn the same failing prompt unchanged.

**4. Always leave a trace.** Even when blocked, reply with Status PARTIAL or FAILED and the open question. A block that isn't recorded gets rediscovered the hard way.

---

## How the orchestrator responds to a block

Read the blocked agent's summary, identify the failure mode from the table above, then: re-decompose (scope), hand over the missing files (context), clarify (ambiguity), or take the decision to the founder (product / one-way door). Then re-spawn with a **changed** prompt — never the same one.
