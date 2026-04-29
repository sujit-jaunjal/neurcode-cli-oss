# Neurcode Quick Start (10 Min)

This guide is optimized for first-time onboarding.

## Goal

In under 10 minutes, you should be able to:
- set intent
- generate governed implementation context
- verify changes
- get actionable fixes

## Core Commands

```bash
neurcode start "Add auth"
neurcode generate "Add login endpoint"
neurcode verify
neurcode fix
```

## What To Expect

1. `neurcode start "..."`
- creates or updates `.neurcode/plan.json`
- sets initial expected file scope from your intent
- prints next-step guidance

2. `neurcode generate "..."`
- injects governance context into your request
- prints:
  - original prompt
  - injected context
  - final prompt
- does not call an LLM directly

3. `neurcode verify`
- evaluates current diff against policy and scope
- returns structured findings (blocking + advisory)

4. `neurcode fix`
- turns verify findings into prioritized, file-specific actions
- gives the fastest path to resolution

## Fast Loop

Repeat this loop while coding:

`Intent -> Generate -> Verify -> Fix -> Repeat`

## If You See “No Issues”

- verify is clean for the current diff context
- if no changes are detected, stage changes or compare against a base branch and re-run `neurcode verify`

## Next

- [Core Workflow](./workflow-overview.md)
- [CI Integration](./ci-integration.md)
- [How Neurcode Works](./how-neurcode-works.md)
