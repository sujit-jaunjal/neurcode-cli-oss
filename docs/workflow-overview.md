# Core Workflow

Neurcode is designed around one canonical governance loop:

`Declare intent -> verify -> review findings -> replay/evidence -> remediation export -> external remediation -> re-verify -> CI`

## First Run In 5 Minutes

1. `neurcode start "<intent>"`
2. `neurcode verify --evidence`
3. Review blocking and advisory findings
4. `neurcode remediate-export --finding-index 0`
5. Apply edits outside Neurcode, then run `neurcode verify` again

## Canonical Workflow

### Step 1: Declare intent and governance context

```bash
neurcode start "Add JWT authentication with role checks"
```

`start` declares the expected implementation scope for this unit of work. The intent becomes governance context: expected files, bounded change expectations, and the human-readable reason for the change.

### Step 2: Verify against intent and policies

```bash
neurcode verify --evidence
```

`verify` evaluates the current diff against:

- deterministic structural rules
- local and compiled policies
- bounded change expectations from declared intent
- repo and workspace trust boundaries

Use `--evidence` when you want the run captured as a deterministic local artifact for replay and audit.

### Step 3: Review governance findings

The output from `verify` is the decision surface:

- blocking findings
- advisory findings
- scope or boundary drift
- deterministic evidence hashes and policy context

This is the point where Neurcode owns the governance verdict. It does not own the code change itself.

### Step 4: Inspect replay and evidence

```bash
neurcode replay --json
```

Replay reconstructs governance state from local evidence, activity records, and snapshots. Use it when you need to understand what happened, prove what was evaluated, or investigate drift across runs.

### Step 5: Export remediation context

```bash
neurcode remediate-export --finding-index 0
```

This exports a bounded remediation payload for one finding. The payload is meant for an external coding tool or engineer. Neurcode detects and governs; the external tool or engineer performs the remediation.

### Step 6: Re-verify external edits

```bash
neurcode verify
```

After external remediation, run `verify` again to confirm the result against the same deterministic governance rules and intent context.

### Step 7: Enforce the same loop in CI

Run the same verification path in pull requests so merge decisions reflect the same policy and replay-oriented evidence model used locally.

## Dashboard Integration

Run `neurcode daemon` to bridge the dashboard to the local deterministic runtime:

```bash
neurcode daemon
```

The primary dashboard workflow is:

1. Verify
2. Review findings
3. Inspect evidence/replay
4. Export remediation context
5. Re-verify

## Legacy / Advanced Paths

Older flows such as `generate`, `patch`, `fix --apply-safe`, `ship`, and autonomous pipeline material remain in the repository for compatibility, but they are not the canonical trust boundary for Neurcode.
