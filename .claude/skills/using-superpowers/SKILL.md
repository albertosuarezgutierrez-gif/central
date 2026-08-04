---
name: using-superpowers
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill (via the `Skill` tool) BEFORE any response or action — including clarifying questions. If an invoked skill turns out not to fit, you don't need to follow it.
</EXTREMELY-IMPORTANT>

## Instruction Priority

1. **User's explicit instructions** (CLAUDE.md, AGENTS.md, direct requests) — highest.
2. **Superpowers skills** — override default system behavior where they conflict.
3. **Default system prompt** — lowest.

## Rules

- Access skills ONLY with the `Skill` tool (never Read skill files directly). Announce: "Using [skill] to [purpose]". If the skill has a checklist, create one todo per item and follow it exactly.
- **Priority when several apply:** process skills first (brainstorming, systematic-debugging determine HOW), implementation skills second. "Build X" → brainstorming first; "fix this bug" → debugging first. Before EnterPlanMode, brainstorm first if you haven't.
- **Rigid vs flexible:** rigid skills (TDD, debugging) are followed exactly; flexible ones adapt to context. The skill says which.
- User instructions say WHAT, not HOW — "add X" or "fix Y" doesn't mean skip workflows.

## Red Flags — you're rationalizing if you think:

"just a simple question" / "I need context first" / "let me explore or gather info first" / "I can check files quickly" / "doesn't need a formal skill" / "I remember this skill" (skills evolve — read the current version) / "the skill is overkill" / "I'll just do this one thing first". In ALL these cases: check for skills FIRST, before any action or question.
