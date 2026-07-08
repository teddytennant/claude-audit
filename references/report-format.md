# AUDIT.md report format

Write a self-contained Markdown report. Confirmed findings first, ranked
critical→low. Keep `file:line` references intact so they're clickable.

```markdown
# Codebase Audit — <repo name>

**Target:** `<abs path>` · **Date:** <YYYY-MM-DD> · **Dimensions:** correctness, security, performance, quality
**Units audited:** <N> · **Verification:** <votes> independent skeptic(s) per finding
**Result:** <C> confirmed · <U> uncertain · <R> refuted

## Severity (confirmed)

| Critical | High | Medium | Low |
|:-:|:-:|:-:|:-:|
| <n> | <n> | <n> | <n> |

## Top priorities

1. <one line — the single most important fix>
2. ...
3. ...

## Systemic themes

- **<theme>** — <why it matters; the files where it recurs>
- ...

## Findings

### 🔴 C1 · <title>  <!-- 🔴 critical 🟠 high 🟡 medium ⚪ low -->

- **Where:** `path/to/file.ext:123`
- **Dimension:** correctness · **Severity:** critical · **Confidence:** high
- **What:** <the defect, quoting the offending code>
- **Impact:** <concrete: the input/state that triggers wrong behavior>
- **Fix:** <the specific change>

### 🟠 H1 · <title>
... (repeat, numbered per severity band: C1.., H1.., M1.., L1..)

## Uncertain — needs a human

Findings a skeptic couldn't confirm or refute from the code alone. Worth a look;
not asserted as bugs.

- `path:line` — <title> — <why it's ambiguous>

## Methodology

Audited <N> units with one reviewer agent each; every raised finding was checked by
<votes> independent skeptic agent(s) prompted to refute it, and only majority-confirmed
findings appear above. <Note any coverage capped: e.g. "vendored/ and generated code
excluded", "capped at top 30 units — <dir> not audited">.
```

## Principles

- **No unverified claims in the confirmed section.** If a skeptic didn't confirm it,
  it goes under "Uncertain" or not at all.
- **Every finding is actionable** — a reader should know exactly what to change.
- **Say what you didn't cover.** Silent truncation reads as "audited everything."
- **Match the repo's reality**, not a template — drop empty sections (no criticals →
  no critical rows), and let the findings, not filler prose, carry the report.
