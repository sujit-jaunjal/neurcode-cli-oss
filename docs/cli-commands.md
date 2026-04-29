# Neurcode CLI Commands

This reference follows one canonical workflow.

## Core Workflow

```bash
neurcode start "<intent>"
neurcode generate "<task>"
neurcode verify
neurcode fix
```

## Core Command Reference

### `neurcode start "<intent>"`

Initialize what you are building and create/update `.neurcode/plan.json`.

### `neurcode generate "<task>"`

Generate governed prompt output with policy and scope context.

### `neurcode verify`

Check current diff for policy, warning, and scope issues.

### `neurcode fix`

Get prioritized, actionable guidance from latest verify results.

### `neurcode plan show`

Display current local plan context (`expectedFiles`, `lastUpdated`, optional `intent`).

## Advanced / Legacy Commands

Still supported, but not required for onboarding:

- `allow`, `apply`, `approve`
- `ask`, `audit`, `bootstrap`, `brain`
- `check`, `compat`, `config`, `contract`
- `doctor`, `feedback`, `guard`
- `init`, `login`, `logout`, `map`
- `plan`, `plan-slo`, `policy`, `prompt`
- `refactor`, `remediate`, `repo`, `revert`
- `security`, `session`, `ship`, `ship-runs`, `ship-resume`, `ship-attestation-verify`
- `simulate`, `watch`, `whoami`

For detailed flags, run:

```bash
neurcode --help
neurcode <command> --help
```

For legacy workflow context, see [Advanced / Legacy](./advanced-legacy.md).
