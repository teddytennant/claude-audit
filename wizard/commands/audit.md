---
description: Audit an entire codebase with subagents — fan out reviewers, verify findings, write AUDIT.md
---
Perform a thorough whole-codebase audit following the `audit` skill.

Target: $ARGUMENTS (default to the current repository if empty).

Run it in three phases:

1. **Scout** the repo — languages, entry points, build/test setup, and the risky
   surfaces (auth, crypto, SQL, subprocess, deserialization, path handling, FFI,
   concurrency) — then group files into coherent audit units.
2. **Audit** — for each unit, `spawn_subagent({ subagent: "auditor", task: <unit
   paths + dimensions + "reply with ONLY {\"findings\":[…]}">, background: true })`.
   Poll `subagent_status` until all finish; parse each report's JSON.
3. **Verify** — for each finding, `spawn_subagent({ subagent: "skeptic", task:
   <refute prompt>, background: true })`. Keep only majority-`confirmed` findings.

Then write a ranked report to `AUDIT.md` (format in the skill's
`references/report-format.md`) and give me a tight summary: the counts, the top 3
things to fix now, and where the report is. Read the `audit` skill for the exact
unit-grouping guidance, prompt wording, and report format. Use the `worker`
subagent if `auditor`/`skeptic` aren't installed.
