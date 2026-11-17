# /audit

A Claude Code skill for reviewing a whole codebase instead of a diff. It
splits the repo into units, gives each one to a reviewer subagent, then hands
every finding to two more agents whose job is to prove it wrong. Only findings
that survive a majority of those go in the report, `AUDIT.md`. It doesn't
change any code.

```sh
git clone https://github.com/teddytennant/claude-audit ~/.claude/skills/audit
```

Restart Claude Code to pick it up, or clone into a project's
`.claude/skills/audit` to use it there only.

## Use

```
/audit                       # current repo
/audit path/to/repo
/audit --focus security      # correctness, security, performance, quality
/audit --quick               # coarser units, 1 verifier per finding
/audit --deep                # finer units, 3 verifiers
/audit --report review.md
```

It uses the Workflow tool for the fan-out and falls back to plain Agent calls
without it. Cost grows with repo size times verifiers, so on a big repo start
with `--focus` or `--quick`. If it caps anything it says so in the report.

## Wizard

`wizard/install.sh` copies the skill, the `/audit` command and the auditor and
skeptic subagents into `~/.wizard`. See [wizard/README.md](wizard/README.md).

MIT
