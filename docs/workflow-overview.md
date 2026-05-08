# Core Workflow

Neurcode is designed around one deterministic loop:

`start → verify → fix → patch → verify`

## First Run In 5 Minutes

1. `neurcode start "<intent>"`
2. `neurcode verify --evidence`
3. `neurcode fix`
4. `neurcode patch --file <path>`
5. `neurcode verify`

If needed, rollback a transactional patch with:

`neurcode patch --file <path> --rollback-receipt <receipt-id>`

Dashboard users also get a guided onboarding overlay on first run:

1. Verify
2. Review findings
3. Preview deterministic patch
4. Apply Safe Patch
5. Evidence
6. Replay

You can dismiss and resume the overlay at any time.

## Two Operating Modes

Manual development flow:

`intent → verify → fix → patch → verify`

Autonomous or agentic development flow:

`start → generate/export plan → agent execution → verify → fix → patch → verify → CI`

Both modes converge on the same deterministic verify and remediation loop.

## Workflow Diagram

`Intent → Verify → Fix → Patch → Verify again`

## Step 1: Start (declare intent)

```bash
neurcode start "Add JWT authentication with role checks"
```

Declare what you are building. Initializes `.neurcode/plan.json` with intent, expected file scope, and detected constraints. Run once per feature or meaningful change unit.

## Step 2: Verify

```bash
neurcode verify
```

Evaluate the current git diff against policy rules and plan scope. Returns structured findings: blocking violations, advisory warnings, and scope drift.

## Step 3: Fix

```bash
neurcode fix
```

Convert verify findings into prioritized, file-level remediation guidance. Each suggestion includes a root cause, explanation, and when possible, a safe deterministic patch.

## Step 4: Patch

```bash
neurcode patch --file <path>
```

Apply a deterministic fix to a specific file from `neurcode fix` suggestions. Safe patches are idempotent and do not rewrite surrounding context.

Deterministic remediation is the default and recommended path for production reliability.

AI-assisted remediation proposals, when enabled in your environment, are advisory only and require explicit review plus a follow-up verify pass.

When using dashboard or daemon patch preview/apply:

- preview emits deterministic validation + recipe details
- apply rejects stale previews when filesystem changed since preview
- apply returns patch receipt hashes for replay and audit
- receipt-backed rollback is available for transactional deterministic patches

## Step 5: Verify again

```bash
neurcode verify
```

Re-run verify to confirm the patches resolved all findings. Repeat from Step 3 for any remaining issues.

## Daily Usage Pattern

1. `neurcode start` once per intent / feature.
2. Code your changes.
3. `neurcode verify` → `neurcode fix` → `neurcode patch` as a tight loop.
4. Final `neurcode verify` before committing or opening a PR.

## Dashboard Integration

Run `neurcode daemon` to start a local HTTP bridge on `http://localhost:4321`. This allows the Neurcode dashboard to trigger `fix` and `patch` actions directly without leaving the browser.

```bash
neurcode daemon
```

## Output You Should Trust

- `verify` and `fix` findings align on file counts and violation references.
- CI posts the same governance verdict in PR comments when `--record` is passed to `verify`.
