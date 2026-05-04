# Neurcode CLI Commands

This reference follows one canonical workflow.

## Core Workflow

```bash
neurcode start "<intent>"
neurcode verify
neurcode fix
neurcode patch --file <path>
neurcode verify
```

## Core Command Reference

### `neurcode start "<intent>"`

Declare what you are building and initialize `.neurcode/plan.json` with intent, expected file scope, and detected constraints.

```bash
neurcode start "Add JWT authentication with role checks"
```

Options:
- `--json` — output machine-readable onboarding metadata
- `--run-init` — run `neurcode init` immediately after showing the guide

### `neurcode verify`

Evaluate the current git diff against policy rules and plan scope. Returns blocking violations, advisory warnings, and scope drift.

```bash
neurcode verify
neurcode verify --policy-only              # policy checks only, no plan enforcement
neurcode verify --staged                   # verify only staged changes
neurcode verify --base main                # verify against a specific base ref
neurcode verify --record                   # report results to Neurcode Cloud
neurcode verify --compiled-policy neurcode.policy.compiled.json
```

### `neurcode fix`

Convert verify findings into prioritized, file-level remediation guidance. Each suggestion includes a root cause, explanation, and a deterministic patch where possible.

```bash
neurcode fix
neurcode fix --apply-safe                  # auto-apply high-confidence patches
neurcode fix --json                        # machine-readable output
```

### `neurcode patch --file <path>`

Apply a deterministic fix to a specific file from `neurcode fix` suggestions. Safe, idempotent, does not rewrite surrounding context.

```bash
neurcode patch --file src/auth/middleware.ts
neurcode patch --file src/auth/middleware.ts --json
```

### `neurcode daemon`

Start a local HTTP bridge on `http://localhost:4321` so the Neurcode dashboard can trigger `fix` and `patch` actions without leaving the browser.

```bash
neurcode daemon
```

### `neurcode plan show`

Display the current local plan context (`intent`, `expectedFiles`, `lastUpdated`).

### `neurcode policy`

Manage policy packs and compiled policy artifacts.

```bash
neurcode policy install soc2
neurcode policy compile --intent "Do not use console.log"
neurcode policy list
```

### `neurcode login` / `neurcode logout`

Authenticate with Neurcode Cloud.

```bash
neurcode login
neurcode logout
neurcode whoami
```

## Advanced Commands

Supported but not required for the core workflow:

- `allow`, `apply`, `approve`
- `ask`, `audit`, `bootstrap`, `brain`
- `check`, `compat`, `config`, `contract`
- `doctor`, `feedback`, `guard`
- `init`, `map`
- `plan`, `plan-slo`, `prompt`
- `refactor`, `remediate`, `repo`, `revert`
- `security`, `session`, `ship`, `ship-runs`, `ship-resume`, `ship-attestation-verify`
- `simulate`, `watch`

For detailed flags, run:

```bash
neurcode --help
neurcode <command> --help
```

For legacy workflow context, see [Advanced / Legacy](./advanced-legacy.md).
