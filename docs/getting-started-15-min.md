# Neurcode Quick Start (10 Min)

This guide is optimized for first-time onboarding.

## Goal

In under 10 minutes, you should be able to:
- declare intent and initialize a plan
- verify code against policies
- get prioritized, file-level fixes
- apply a deterministic patch
- confirm everything passes

## Prerequisites

- Node.js ≥ 18
- A git repository with at least one commit
- `npm install -g @neurcode-ai/cli`

## Core Commands

```bash
neurcode start "Add auth"     # declare intent
neurcode verify               # check for violations
neurcode fix                  # get remediation guidance
neurcode patch --file <path>  # apply a deterministic fix
neurcode verify               # confirm clean
```

## What To Expect

### 1. `neurcode start "<intent>"`

- creates or updates `.neurcode/plan.json`
- sets initial expected file scope from your intent
- prints next-step guidance and detected constraints

### 2. `neurcode verify`

- evaluates current diff against policy and scope
- returns structured findings: blocking violations + advisory warnings
- exits non-zero when blocking issues are found (CI-safe)

### 3. `neurcode fix`

- turns verify findings into prioritized, file-specific actions
- each suggestion has: root cause, explanation, and a safe patch where possible
- `--apply-safe` flag auto-applies high-confidence deterministic patches

### 4. `neurcode patch --file <path>`

- applies a deterministic fix to a specific file
- safe and idempotent — does not rewrite surrounding context
- use the file path from `neurcode fix` output

### 5. `neurcode verify` (again)

- confirm patches resolved all findings
- repeat from step 3 for any remaining issues

## Fast Loop

Repeat this tight loop while coding:

`Intent → Verify → Fix → Patch → Verify`

## Dashboard Integration

Run the daemon to connect the dashboard to your local CLI:

```bash
neurcode daemon
```

This starts a local HTTP bridge at `http://localhost:4321`. The Neurcode dashboard can then trigger fix and patch actions directly.

## Policy-First Mode (no login required)

```bash
neurcode policy install soc2
neurcode policy compile --intent "Do not use console.log; Do not use TODO"
neurcode verify --policy-only
```

Run inside a git repository. If you are in a new folder:

```bash
git init && git add . && git commit -m "chore: baseline"
```

## If You See "No Issues"

- verify is clean for the current diff context
- if no changes are detected, stage changes or compare against a base branch:

```bash
neurcode verify --staged
neurcode verify --base main
```

## Next

- [Core Workflow](./workflow-overview.md)
- [CLI Commands](./cli-commands.md)
- [CI Integration](./ci-integration.md)
