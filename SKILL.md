---
name: audit
description: Thorough whole-codebase audit using subagents. Fans out reviewer agents across every subsystem, has independent skeptics adversarially verify each finding, and writes a ranked report to AUDIT.md. Use when the user wants to audit, review, or find bugs/security issues across an entire existing codebase (not just a diff) — e.g. "audit this repo", "review the whole codebase", "find bugs everywhere", "security audit". For reviewing a branch/PR diff, prefer /code-review instead.
user-invocable: true
argument-hint: "[path] [--focus correctness,security,performance,quality] [--quick|--deep] [--report FILE]"
---

# /audit — whole-codebase audit with subagents

Audit an entire codebase, not just a diff. You scout the repo, fan out reviewer
subagents across it via a bundled Workflow, have independent skeptics verify every
finding, then write a ranked report. This is the multi-agent complement to
`/code-review` (which is diff-scoped).

**The steps below tell you to call the Workflow tool — that is the intended opt-in;
run it without asking for further permission.**

## 0. Parse the invocation

From the argument string:
- **Target** — first non-flag token is the repo path. Default to the current working
  directory. Resolve to an absolute path.
- **`--focus a,b`** — comma list restricting dimensions. Default all four:
  `correctness, security, performance, quality`.
- **`--quick`** — small repos / fast pass: fewer, coarser units, `votes: 1`.
  **`--deep`** — finer units, `votes: 3`. Default: `votes: 2`.
- **`--report FILE`** — where to write the report. Default `AUDIT.md` in the target root.

If the target isn't a git repo and isn't obviously a codebase, say so and stop.

## 1. Scout the repo (inline — cheap, do this yourself)

Build a map before fanning out. Keep it to a few fast shell/search calls:

- **Inventory:** `git -C <target> ls-files` (fallback `find`, honoring `.gitignore`).
  Get languages, file count, and rough LOC. Skip vendored/generated/lockfiles/build
  output/`node_modules`/`.min.*`/large data & binary files.
- **Shape:** identify entry points, the build/test setup, and the public surface
  (exported APIs, routes, CLI commands).
- **Risk surfaces:** grep for the code that tends to hide real bugs — auth/session,
  crypto/secrets, SQL/DB, `exec`/`spawn`/subprocess, deserialization, file-path
  handling, network/SSRF, `unsafe`/FFI, concurrency primitives. Note where they live.

Now **group files into audit units** — the unit of parallelism. A good unit is one
coherent subsystem a single agent can hold and read in full:
- One unit ≈ a directory / module / layer (e.g. `auth`, `api-routes`, `db`, `parser`).
- Keep each unit reviewable — split anything over ~1,500–2,000 LOC.
- Put each risk surface in its own unit so it gets focused attention.
- Scale count to size and depth: a small lib might be 3–6 units; a large app 20–40.
  `--quick` → coarser/fewer; `--deep` → finer/more. Never silently drop code — if you
  cap the unit count, `log`/say what was left out.

Each unit is `{ name, paths: [<absolute paths or globs>], hint: "<what it does / what to watch>" }`.

## 2. Fan out + verify

Run the same three-phase plan on whatever orchestration primitive your harness
gives you: **audit each unit → verify each finding with independent skeptics →
keep only the majority-confirmed.** Pick the matching subsection.

### Claude Code — the Workflow tool

Call the **Workflow** tool with the bundled script and your scouted config:

```
Workflow({
  scriptPath: "<skill-dir>/references/audit-workflow.js",
  args: {
    target: "<abs target path>",
    dimensions: [<focus dimensions>],
    votes: <1 | 2 | 3>,
    units: [ <the units from step 1> ]
  }
})
```

`<skill-dir>` is the directory containing this SKILL.md — pass its absolute path.
The workflow: audits each unit (dimension-aware), then for every finding spawns
`votes` independent skeptics prompted to *refute* it — a finding is **confirmed** only
on a majority, otherwise **uncertain** or **refuted**. It returns
`{ confirmed, uncertain, rejectedCount, systemic, ... }`, already ranked by severity.

The workflow runs in the background; you'll be notified when it completes. If a
`<transcriptDir>/journal.jsonl` exists and a result looks empty, read it before
concluding there were no findings.

### Wizard (or any `spawn_subagent` harness)

There is no Workflow tool here — drive the fan-out yourself with `spawn_subagent`
(see `wizard/README.md` for install, and `wizard/install.sh` to add the tuned
`auditor`/`skeptic` subagents):

1. **Audit.** For each unit, `spawn_subagent({ subagent: "auditor", task: <a
   self-contained prompt: the unit's paths, the chosen dimensions, and "reply with
   ONLY `{\"findings\":[…]}`">, background: true })`. Use `"worker"` if the bundled
   `auditor` isn't installed. Spawn them all, then poll `subagent_status` until each
   finishes and parse the JSON out of every report.
2. **Verify.** For each finding, `spawn_subagent({ subagent: "skeptic", task: <a
   refute prompt; "reply ONLY `{\"status\",\"reason\",\"adjustedSeverity\"}`">,
   background: true })`. With `votes > 1`, spawn that many per finding. Keep a
   finding only when a majority return `confirmed`.
3. Continue to step 3 with the confirmed set.

The exact prompt wording is in `references/audit-workflow.js` (`auditPrompt` and
`verifyPrompt`) — reuse it verbatim so both harnesses audit identically.

### Any other harness

Same shape with whatever background-agent/Task primitive you have. With none at
all, fall back to a single context: review each unit in turn, then **re-read and
independently verify** each finding before trusting it — the verify pass is the
part that keeps the report honest, so don't skip it.

## 3. Write the report + summarize

Write the report to `--report` (default `AUDIT.md` at the target root) following
`references/report-format.md`. In short:

- **Header:** target, date, dimensions, units audited, `votes`, and counts
  (confirmed / uncertain / refuted).
- **Severity table:** critical / high / medium / low counts for confirmed findings.
- **Systemic themes** and **top priorities** from the workflow's `systemic` result.
- **Findings**, confirmed first (critical→low), then an "Uncertain / needs a human"
  section. Each finding: `file:line`, dimension, severity, what's wrong (with the code),
  concrete impact, and the fix. Use clickable `path:line` references.
- **Methodology footer:** how many agents ran, that every finding was
  adversarially verified, and any coverage the run capped.

Then give the user a tight chat summary: headline counts, the top 3 things to fix
now, and where the report was written. Don't paste the whole report into chat.

## Notes

- **Read-only.** This skill audits and reports; it does not edit code. Offer to fix
  specific findings afterward if the user wants.
- **Cost scales with the codebase.** Every unit spawns an auditor and every finding
  spawns `votes` verifiers. For very large repos, prefer `--focus` and start with the
  riskiest units, or use `--quick`.
- **Precision over volume** is the whole point — the adversarial verify pass exists so
  the report contains defects that are actually real.
