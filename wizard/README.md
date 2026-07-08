# /audit for Wizard

The `/audit` skill runs on [Wizard](https://github.com/teddytennant/wizard) too.
Wizard has the same building blocks Claude Code does — model-invoked **skills**, a
`spawn_subagent` tool for the fan-out, custom `/commands`, and `/reload` to pick up
new files without a restart — so the same audit works; only the orchestration
primitive differs (Wizard has no `Workflow` tool, so it drives the fan-out with
`spawn_subagent` directly).

## Install

From the repo root:

```sh
wizard/install.sh
```

That copies:

- `SKILL.md` + `references/` → `~/.wizard/skills/audit/` — the audit procedure, loaded
  into Wizard's skills section.
- `wizard/commands/audit.md` → `~/.wizard/commands/audit.md` — the `/audit` slash command.
- `wizard/subagents/{auditor,skeptic}.toml` → `~/.wizard/subagents/` — read-only,
  purpose-built reviewer and adversarial verifier.

Then run `/reload` in Wizard (or restart). Set `WIZARD_HOME` to install somewhere
other than `~/.wizard`.

## Use

```
/audit                 # audit the current repo
/audit path/to/repo    # audit a specific codebase
```

Wizard executes the same three phases: scout → fan out one `auditor` subagent per
unit (`background: true`) → spawn `skeptic` subagents to adversarially verify each
finding → write a ranked `AUDIT.md`. The `auditor`/`skeptic` subagents are scoped
read-only, so an audit never edits your code.

## How the mapping works

| Claude Code | Wizard |
|-------------|--------|
| `Workflow` tool + `references/audit-workflow.js` | model drives `spawn_subagent` per unit/finding |
| Workflow `schema` forces JSON | subagents are told to reply with **only** a JSON object; the parent parses |
| `pipeline`/`parallel` concurrency | `spawn_subagent({ background: true })` + `subagent_status` polling |
| user-invocable skill = `/audit` | a `~/.wizard/commands/audit.md` command triggers the skill |

If you skip `install.sh` and just want the subagents ad hoc, Wizard's built-in
`worker` subagent works too — the skill falls back to it when `auditor`/`skeptic`
aren't installed.
