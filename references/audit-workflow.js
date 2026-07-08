/*
 * audit-workflow.js — fan-out codebase audit.
 *
 * Run from the /audit skill via:
 *   Workflow({ scriptPath: "<skill-dir>/references/audit-workflow.js", args: <config> })
 *
 * The caller (the skill) scouts the repo first and passes a config object as `args`:
 *   {
 *     target:      "/abs/path/to/repo",          // repo root, for display
 *     dimensions:  ["correctness","security","performance","quality"],
 *     units: [                                    // audit units the caller grouped
 *       { name: "auth", paths: ["/abs/src/auth/..."], hint: "session + token handling" },
 *       ...
 *     ],
 *     votes:       2,                             // skeptic verifiers per finding (default 2)
 *   }
 *
 * Returns { confirmed, rejected, unitsAudited, systemic } — the skill writes the report.
 * Scripts have no filesystem access; the SUBAGENTS read the code via their own tools.
 */

export const meta = {
  name: 'audit',
  description: 'Whole-codebase audit: fan out reviewers per unit, adversarially verify every finding, synthesize a ranked report',
  phases: [
    { title: 'Audit',      detail: 'review each unit across the chosen dimensions' },
    { title: 'Verify',     detail: 'independent skeptics try to refute each finding' },
    { title: 'Synthesize', detail: 'surface systemic themes across confirmed findings' },
  ],
}

const cfg        = args || {}
const target     = cfg.target || '.'
const dimensions = (cfg.dimensions && cfg.dimensions.length) ? cfg.dimensions
                 : ['correctness', 'security', 'performance', 'quality']
const units      = cfg.units || []
const votes      = Math.max(1, cfg.votes || 2)

if (!units.length) {
  log('No audit units supplied — nothing to review. The skill should scout the repo and pass `units`.')
  return { confirmed: [], rejected: [], unitsAudited: 0, systemic: null }
}

log(`Auditing ${units.length} unit(s) of ${target} across: ${dimensions.join(', ')}`)

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title:       { type: 'string' },
          dimension:   { type: 'string', enum: ['correctness', 'security', 'performance', 'quality'] },
          severity:    { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file:        { type: 'string', description: 'repo-relative path' },
          line:        { type: 'integer' },
          description: { type: 'string', description: 'what is wrong, citing the exact code' },
          impact:      { type: 'string', description: 'concrete failure: inputs/state -> wrong behavior' },
          fix:         { type: 'string', description: 'the specific change that resolves it' },
          confidence:  { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'dimension', 'severity', 'file', 'description', 'impact', 'fix', 'confidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status:           { type: 'string', enum: ['confirmed', 'rejected', 'uncertain'] },
    reason:           { type: 'string', description: 'the code evidence that decided it' },
    adjustedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
  },
  required: ['status', 'reason'],
}

const SYSTEMIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          theme:     { type: 'string' },
          why:       { type: 'string' },
          relatedFiles: { type: 'array', items: { type: 'string' } },
        },
        required: ['theme', 'why'],
      },
    },
    topPriorities: { type: 'array', items: { type: 'string' } },
  },
  required: ['themes', 'topPriorities'],
}

const auditPrompt = (u) => `You are a meticulous code auditor reviewing ONE unit of the codebase at ${target}.

Unit: "${u.name}"${u.hint ? ` — ${u.hint}` : ''}
Read these paths in full before judging (use your Read/Grep/Bash tools):
${(u.paths || []).map(p => `  - ${p}`).join('\n')}

Review ONLY for these dimensions: ${dimensions.join(', ')}.
Definitions:
  - correctness: logic errors, wrong edge-case handling, off-by-one, null/undefined, races, resource leaks, incorrect error handling, broken invariants.
  - security: injection (SQL/command/path), missing authz/authn, secret leakage, unsafe deserialization, SSRF, weak crypto, unvalidated input crossing a trust boundary.
  - performance: hot-path inefficiency, needless allocation/copies, N+1, blocking I/O on a critical path, accidentally quadratic loops.
  - quality: dead code, duplication, dangerous footguns, missing-but-load-bearing error handling. NOT style/formatting/naming nits.

Rules:
  - Report REAL defects, not hypotheticals. Cite the exact file and line and quote the offending code in your description.
  - Each finding must have a concrete impact: the input or state that triggers wrong behavior.
  - Prefer precision over volume. A false positive is worse than a miss here — a later pass will still catch misses.
  - If the unit is clean, return an empty findings array. Do not invent problems.`

const verifyPrompt = (f, seed) => `You are an adversarial verifier. A prior auditor filed this finding against ${target}. Your job is to REFUTE it. Default to "rejected" or "uncertain" unless the code plainly confirms it. (verifier #${seed})

Finding: ${f.title}
Dimension: ${f.dimension} | Claimed severity: ${f.severity}
File: ${f.file}${f.line ? `:${f.line}` : ''}
Claim: ${f.description}
Claimed impact: ${f.impact}

Open the actual file(s), read the surrounding code and callers, and check:
  1. Does the cited code actually exist and say what the finding claims?
  2. Is the impact reachable — can real inputs/state trigger it, or is it guarded/dead/handled elsewhere?
  3. Is the severity honest, or inflated?

Return status "confirmed" ONLY if you independently reproduced the defect from the code. Otherwise "rejected" (it's wrong/guarded) or "uncertain" (can't tell). Give the specific code evidence that decided it, and set adjustedSeverity to the honest level.`

// pipeline: each unit audits, then its findings verify — no barrier between units.
phase('Audit')
const perUnit = await pipeline(
  units,
  (u) => agent(auditPrompt(u), { label: `audit:${u.name}`, phase: 'Audit', schema: FINDINGS_SCHEMA }),
  (review, u) => {
    const findings = (review && review.findings) || []
    if (!findings.length) return []
    return parallel(findings.map((f) => () => {
      // N independent skeptics per finding; confirmed only on a majority.
      return parallel(Array.from({ length: votes }, (_, i) => () =>
        agent(verifyPrompt(f, i + 1), { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      )).then((verdicts) => {
        const vs = verdicts.filter(Boolean)
        const confirmed = vs.filter(v => v.status === 'confirmed').length
        const rejected  = vs.filter(v => v.status === 'rejected').length
        const status = confirmed > vs.length / 2 ? 'confirmed'
                     : rejected  >= vs.length / 2 ? 'rejected'
                     : 'uncertain'
        // honest severity = worst confirmed adjustment, else the original
        const sevRank = { critical: 3, high: 2, medium: 1, low: 0 }
        const adj = vs.map(v => v.adjustedSeverity).filter(Boolean)
          .sort((a, b) => sevRank[b] - sevRank[a])[0]
        return { ...f, unit: u.name, status, severity: adj || f.severity, verdicts: vs }
      })
    }))
  }
)

const all       = perUnit.flat().filter(Boolean)
const confirmed = all.filter(f => f.status === 'confirmed')
const uncertain = all.filter(f => f.status === 'uncertain')
const rejected  = all.filter(f => f.status === 'rejected')

log(`Findings: ${all.length} raised, ${confirmed.length} confirmed, ${uncertain.length} uncertain, ${rejected.length} refuted.`)

// systemic synthesis over the survivors (confirmed + uncertain)
phase('Synthesize')
let systemic = null
const survivors = confirmed.concat(uncertain)
if (survivors.length) {
  systemic = await agent(
    `These are the verified findings from a full audit of ${target} (JSON). Identify cross-cutting/systemic issues — patterns that recur across files, architectural weaknesses, or a single root cause behind several findings — and the top priorities to fix first. Be concrete; reference files.\n\n${JSON.stringify(survivors.map(f => ({ title: f.title, dimension: f.dimension, severity: f.severity, file: f.file, status: f.status })), null, 2)}`,
    { label: 'systemic', phase: 'Synthesize', schema: SYSTEMIC_SCHEMA }
  )
}

const sevRank = { critical: 3, high: 2, medium: 1, low: 0 }
const rank = (arr) => arr.slice().sort((a, b) =>
  (sevRank[b.severity] - sevRank[a.severity]) || String(a.file).localeCompare(String(b.file)))

return {
  target,
  dimensions,
  unitsAudited: units.length,
  confirmed: rank(confirmed),
  uncertain: rank(uncertain),
  rejectedCount: rejected.length,
  systemic,
}
