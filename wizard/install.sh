#!/usr/bin/env bash
# Install the /audit skill for Wizard: copies the skill, the /audit command, and
# the tuned auditor/skeptic subagents into ~/.wizard, then reminds you to /reload.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"     # .../claude-audit/wizard
REPO="$(cd "$HERE/.." && pwd)"            # .../claude-audit
WZ="${WIZARD_HOME:-$HOME/.wizard}"

mkdir -p "$WZ/skills/audit/references" "$WZ/commands" "$WZ/subagents"

# Skill: Wizard loads SKILL.md; references/ stays alongside for the model to read.
cp "$REPO/SKILL.md"            "$WZ/skills/audit/SKILL.md"
cp "$REPO/references/"*        "$WZ/skills/audit/references/"

# The /audit slash command and the read-only reviewer/verifier subagents.
cp "$HERE/commands/audit.md"   "$WZ/commands/audit.md"
cp "$HERE/subagents/"*.toml    "$WZ/subagents/"

echo "Installed /audit into $WZ"
echo "  skills/audit/, commands/audit.md, subagents/{auditor,skeptic}.toml"
echo "Run /reload in Wizard (or restart), then:  /audit <path>"
