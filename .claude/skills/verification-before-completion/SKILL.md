---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |
| Endpoint with CORS works | Request it WITH `-H "Origin: …"`, see the `access-control-allow-origin` header come back | A 200 from plain curl (curl sends no Origin, so it never exercises CORS) |
| Cached response is correct | Repeat the real-client request several times and read the cache-status header (`x-vercel-cache`/`age`) | One request — with a cache in front, one observation is not a measurement, and yours may be the copy everyone gets |
| The standards-correct fix works | Observe the deployed behaviour | The spec says it should — your CDN may not implement it (Vercel ignores `Vary: Origin`) |

## Verify Through The User's Path, Not The Convenient One

A command that succeeds is not evidence unless it exercises **the same path the user's client
takes**. The gap between them is where "works on my machine" lives — and it does not announce
itself, because the convenient check returns a confident green.

Ask, before believing your own check: **what does the real client do that I just didn't do?**
Different origin, different auth, different headers, cold cache vs warm, browser vs server.

Failure that produced this section (20/08/2026, `central`): a public JSON endpoint returned a
perfect `200` to `curl`, so it was reported as working. In the browser it was broken. `curl`
sends no `Origin`, so it never triggered CORS — and worse, that first Origin-less request was
the one the CDN cached and then served to everyone for the next 10 minutes, stripped of the
`Access-Control-Allow-Origin` the browser needed. **The verification did not merely miss the
bug: it caused it.** The user found it before we did, from a screenshot.

```
✅ curl -sS -D- -H "Origin: https://the-real-site.com" <url>   → 200 + access-control-allow-origin
❌ curl -sS <url>                                              → 200, proves nothing about CORS
```

**Then it happened a second time, the same day, to the fix itself.** The fix added the header the
HTTP spec prescribes for this exact situation (`Vary: Origin`, "do not share this copy between
origins"). It was verified with one request through the real path — correct header, correct
origin — and it came back green. It was still broken: that CDN does not key its cache on `Origin`
at all, and strips the `Vary` header on the way out. The single green request had simply landed on
a freshly-stored copy. Twelve requests in a row, run only because the first result felt too easy,
showed 12/12 serving the poisoned copy.

Two rules fall out of that, and the second is the one that was missed twice:

1. **A correct-by-the-spec fix is a hypothesis about your infrastructure, not a result.** Verify
   the behaviour, never the standard.
2. **Where there is a cache, one observation is not a measurement.** A cache means identical
   requests legitimately return different things. Repeat the check, vary the order, and read the
   cache-status header (`x-vercel-cache`, `cf-cache-status`, `age`) — a check that cannot tell a
   HIT from a MISS cannot tell you what the next visitor will get.

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

From 24 failure memories:
- your human partner said "I don't believe you" - trust broken
- Undefined functions shipped - would crash
- Missing requirements shipped - incomplete features
- Time wasted on false completion → redirect → rework
- Violates: "Honesty is a core value. If you lie, you'll be replaced."

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.
