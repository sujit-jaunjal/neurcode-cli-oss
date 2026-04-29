# Core Workflow

Neurcode is designed around one default workflow:

`start -> generate -> verify -> fix`

## Workflow Diagram

`Intent -> Generate -> Verify -> Fix -> Repeat`

## Step 1: Start

```bash
neurcode start "Add JWT authentication with role checks"
```

Use this to declare intent and initialize local plan context.

## Step 2: Generate

```bash
neurcode generate "Implement JWT middleware for protected routes"
```

Use this to produce a governed prompt with policy and scope context attached.

## Step 3: Verify

```bash
neurcode verify
```

Use this to check policy violations, warnings, and scope drift in the current diff context.

## Step 4: Fix

```bash
neurcode fix
```

Use this to get prioritized, file-level remediation guidance.

## Daily Usage Pattern

1. Start once per feature intent.
2. Generate when defining implementation tasks.
3. Verify after meaningful code changes.
4. Fix issues, then re-run verify.

## Output You Should Trust

- `verify` and `fix` should align on counts and files.
- CI should post the same governance direction in PR comments.
