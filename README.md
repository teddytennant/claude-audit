# /audit — whole-codebase audit skill for Claude Code

A [Claude Code](https://claude.com/claude-code) skill that audits an **entire
codebase** with subagents — not just a diff. It scouts the repo, fans out one
reviewer agent per subsystem, has independent skeptics **adversarially verify every
finding**, and writes a ranked report to `AUDIT.md`.

Think of it as the multi-agent complement to the built-in `/code-review` (which is
scoped to the current diff). `/audit` is for "review the whole thing."

## What it does

1. **Scouts** the repo — languages, entry points, build/test setup, and the risky
   surfaces (auth, crypto, SQL, subprocess, deserialization, path handling, FFI,
   concurrency) — then groups files into coherent **audit units**.
2. **Fans out** a reviewer subagent per unit across correctness, security,
   performance, and quality (dimensions are configurable).
3. **Verifies** each finding with N independent skeptic agents prompted to *refute*
   it. A finding is confirmed only on a majority — this is what keeps the report free
   of plausible-but-wrong noise.
4. **Synthesizes** systemic themes and top priorities, then writes a ranked
   `AUDIT.md`.

The audit is **read-only** — it reports; it doesn't touch your code.

## Install

Clone this repo into your Claude Code skills directory as `audit`:

```sh
git clone https://github.com/teddytennant/claude-audit ~/.claude/skills/audit
```

Restart Claude Code (or run `/skills`) so it picks up the new skill. Per-project
install works too — clone into `.claude/skills/audit` inside a repo.

> Requires the **Workflow** tool (multi-agent orchestration). If it isn't available,
> the skill falls back to driving the same fan-out with the plain Agent tool.

## Use

```
/audit                       # audit the current repo, write AUDIT.md
/audit path/to/repo          # audit a specific codebase
/audit --focus security      # only the security dimension
/audit --deep                # finer units, 3 verifiers per finding
/audit --quick               # coarse/fast pass, 1 verifier
/audit . --report review.md  # custom report path
```

Flags:

| Flag | Effect |
|------|--------|
| `[path]` | Repo to audit (default: current directory) |
| `--focus a,b` | Restrict dimensions: `correctness,security,performance,quality` |
| `--quick` | Fewer/coarser units, 1 verifier per finding |
| `--deep` | Finer units, 3 verifiers per finding |
| `--report FILE` | Report path (default `AUDIT.md` at the repo root) |

## Cost

Every unit spawns a reviewer, and every finding spawns `votes` verifiers, so token
cost scales with codebase size and depth. For very large repos, start with `--focus`
on the riskiest dimension or use `--quick`. The skill logs anything it caps so a
bounded run never reads as "audited everything."

## Use with Wizard and other agents

The skill isn't Claude-Code-only. It runs on [Wizard](https://github.com/teddytennant/wizard)
— and any harness with a subagent/Task primitive — because the audit is defined as a
harness-agnostic plan (scout → fan out reviewers → adversarially verify → report). Only
the orchestration primitive differs: Claude Code uses the `Workflow` tool, Wizard drives
`spawn_subagent` directly. Install for Wizard with:

```sh
wizard/install.sh   # copies the skill, /audit command, and auditor/skeptic subagents into ~/.wizard
```

See [`wizard/README.md`](wizard/README.md) for the details and the full mapping table.

## How it's built

- [`SKILL.md`](SKILL.md) — the skill: scouting instructions + how it drives the workflow.
- [`references/audit-workflow.js`](references/audit-workflow.js) — the fan-out/verify/synthesize Workflow.
- [`references/report-format.md`](references/report-format.md) — the `AUDIT.md` template.

## License

MIT — see [LICENSE](LICENSE).
