# Neurcode Quick Start (15 Min)

This guide is optimized for first-time onboarding. In under 15 minutes, you should be able to:

- install the CLI and verify prerequisites
- run your first policy check against a real repository
- read a finding and understand blocking vs advisory
- export remediation context for your AI assistant
- set up the CI integration

---

## Prerequisites

- Node.js ≥ 20
- A git repository with at least one commit
- Internet access for cloud features (optional — policy-only mode works offline)

---

## Step 1 — Install

```bash
npm install -g @neurcode-ai/cli@latest
neurcode --version
neurcode doctor
```

`neurcode doctor` checks all prerequisites and reports configuration issues before you start.

---

## Step 2 — Initialize and verify

```bash
cd your-repository
neurcode init
neurcode verify --ci --policy-only --json
```

`--ci` runs headless (no prompts, exits non-zero on findings).  
`--policy-only` enforces structural rules + default policy pack without requiring a declared plan.  
`--json` writes machine-readable output.

Expected on a clean codebase: `"verdict": "PASS"`, exit 0.  
Expected when violations exist: `"verdict": "FAIL"`, non-zero exit, findings list included.

---

## Step 3 — Read the output

Findings are classified into two types:

**BLOCKING** — deterministic structural violation or policy gate. CI fails. Fix before merge.

```
PY003 · Broad except clause swallowing errors
  File: src/utils/webhook.py:63
  except Exception:  ← catches ALL exceptions including SystemExit
  Fix: re-raise after handling, or narrow the exception type
```

**ADVISORY** — heuristic risk flag. Visible in PR comment. Does not block merge by default.

Each finding includes `operationalImplication` (why it matters) and `remediation` (what to do).

---

## Step 4 — Export remediation context

For each blocking finding, export a structured context bundle:

```bash
neurcode verify --ci --policy-only --json > verify-output.json
neurcode remediation-export --finding-id <id> --output remediation-export.json
```

The export contains: file path, line, code span, surrounding context, operational explanation, and a `suggestedPromptHint`. Pass the hint to your AI coding assistant (Cursor, Claude, Copilot) to perform the fix. Re-run `neurcode verify` after changes.

Neurcode governs. Your AI assistant remediates. Neurcode does not autonomously modify production code.

---

## Step 5 — Evidence artifacts

Enable structured evidence collection for audit and replay:

```bash
neurcode verify --ci --policy-only --evidence --json
```

Evidence is written to `.neurcode/evidence/`. Upload this directory as a CI artifact for later replay inspection.

---

## Step 6 — Account setup (optional for policy-only, required for cloud features)

```bash
neurcode login          # browser auth flow
neurcode init --org your-org-id --project-id your-project-id
```

With an account, `neurcode verify --record` pushes results to the Neurcode dashboard (governance timeline, pilot report, replay).

---

## Step 7 — CI setup

Add to any pull-request workflow:

```yaml
- uses: neurcode-ai/action@latest
  with:
    github_token: ${{ github.token }}
    api_key: ${{ secrets.NEURCODE_API_KEY }}
    base_ref: 'HEAD~1'
    fail_on_violation: 'true'
    record: 'true'
```

Start with `fail_on_violation: 'false'` (audit-only) to baseline noise before enabling merge blocking.

---

## Additional CLI commands

```bash
neurcode ask "Where is orgId resolved in auth middleware?"   # read-only Q&A
neurcode prompt "Harden session middleware"                  # governed AI prompt
neurcode ship "Harden session middleware" --max-fix-attempts 3 --test-command "pnpm test:ci"
neurcode brain status                                        # context cache status
```

---

## What to expect

| Situation | Normal behavior |
|-----------|----------------|
| First-run replay is `bounded-degradation` | Evidence upload not yet established in CI |
| Advisory list longer than expected | Tune via policy pack selection or suppression |
| Verify latency 3–8s | Warm cache on second run; CI runners vary |

---

## Next

- [Evaluator Day-1 Walkthrough](./enterprise/30-evaluator-day1-walkthrough.md) — enterprise pilot entry point
- [CI Integration](./enterprise/15-ci-integration.md)
- [Enterprise Rollout Modes](./enterprise/28-enterprise-rollout-modes.md)
- [Known Limitations](./enterprise/09-known-limitations-boundaries.md)
