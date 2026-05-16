# @neurcode-ai/cli

Neurcode CLI is the local execution path for **deterministic operational governance in AI-assisted software delivery**.

It enforces declared **intent contracts** against the working tree: scope guard, forbidden-boundary enforcement, dependency-overreach detection, generated-code spillover detection, and drift narrative synthesis — all running offline, with a **replay-grade canonical checksum** that is byte-identical for the same diff + intent.

Verification is one phase of the lifecycle, not the product. The canonical loop is:

```
intent  →  scoped execution  →  governance verification  →  drift detection
                                                              ↓
re-verification  ←  remediation export  ←  replay continuity  ←  posture synthesis
```

For terminology, see [docs/governance-vocabulary.md](https://github.com/sujit-jaunjal/neurcode/blob/main/docs/governance-vocabulary.md).

## Install

```bash
npm install -g @neurcode-ai/cli@latest
neurcode --version
```

## Canonical Governance Loop

The five commands every pilot should adopt before anything else.

```bash
# 1. Declare governance intent + bounded scope.
neurcode start "Add health endpoint for worker process; stay in celery/worker."

# 2. Run the AI-assisted edit in your tool of choice (Cursor, Claude Code, Codex,
#    Copilot). Neurcode does NOT mutate code.

# 3. Verify the diff against intent + structural rules + posture.
neurcode verify --evidence

# 4. If findings remain, export bounded remediation context for the external tool.
#    Neurcode produces structured data; the external AI assistant performs the fix.
neurcode remediate-export --finding-index 0

# 5. After the external remediation lands, re-verify. The replay checksum reflects
#    the new canonical finding set; replay continuity preserves lineage.
neurcode verify --evidence
```

Add to CI:

```bash
neurcode verify --ci --local-only --require-intent-runtime --json
```

`--require-intent-runtime` makes silent downgrade (intent-pack missing or unparseable) a hard failure instead of letting the run quietly drop into structural-only mode. See [docs/runtime-profiles.md](https://github.com/sujit-jaunjal/neurcode/blob/main/docs/runtime-profiles.md) for the full runtime capability envelope schema.

## Runtime Capability Envelope

Every verify run emits a `runtimeCapabilities` block declaring **what actually executed** (intent-runtime active vs synthesised vs inactive, scope-guard enforced vs unenforced, drift intelligence active vs inactive, replay determinism enforced, API contract matched/offline/mismatched, observed boundary types). Enterprise CI gates assert against this envelope; they do not infer governance state from absent fields.

```bash
neurcode verify --local-only --head --json \
  | jq '.runtimeCapabilities | {intentRuntime, scopeGuard, intentRuntimeRequirementSatisfied}'
```

## Replay

```bash
# Deterministic reconstruction of governance state from local evidence.
neurcode replay --json
```

Returns a `neurcode.replay.state.v1` envelope with `artifactHash`, confidence subscores (provenance / graph / semantic / federation / artifacts), and `confidenceDriftSummaries` when the verify hash changes across runs. Audit-grade by design.

## Enterprise Governance Signing (Optional Hardening)

Signed AI change logs for fail-closed governance in `verify`:

```bash
# Optional strict mode: require signed logs (fail closed when key material is missing)
export NEURCODE_GOVERNANCE_REQUIRE_SIGNED_LOGS=1

# Optional: honor org-level signed log requirement from control plane
export NEURCODE_GOVERNANCE_ENFORCE_ORG_SIGNED_LOG_REQUIREMENT=1

# Single-key mode
export NEURCODE_GOVERNANCE_SIGNING_KEY="<strong-random-secret>"
export NEURCODE_GOVERNANCE_SIGNING_KEY_ID="kid-prod-2026-03"

# Key rotation mode (key ring)
export NEURCODE_GOVERNANCE_SIGNING_KEYS="kid-prev=<old-secret>,kid-prod-2026-03=<new-secret>"
export NEURCODE_GOVERNANCE_SIGNING_KEY_ID="kid-prod-2026-03"
```

Notes:
- `verify` writes and verifies `.neurcode/ai-change-log.json` with integrity chain checks.
- If strict signed-log mode is enabled and integrity/signature checks fail, `verify` exits non-zero.
- `policy compile` and `plan` auto-sign deterministic artifacts when governance signing keys are configured.
- Use `--require-signed-artifacts` (or `NEURCODE_VERIFY_REQUIRE_SIGNED_ARTIFACTS=1`) to fail closed on unsigned/tampered artifacts.
- Default onboarding flow is non-blocking unless strict signing is explicitly enabled.

## Optional / Advanced Surfaces

The commands below exist for backward compatibility, large-repo context, or specialised enterprise workflows. They are **not part of the canonical governance loop** and should not be the entry point for new pilots.

```bash
# Bootstrap a deterministic policy pack (advanced; only when you need a curated rule set).
neurcode bootstrap --pack soc2 --auto-detect

# Import an external AI-generated plan as a binding change contract (advanced).
neurcode contract import --provider codex --auto-detect --no-confirm

# Read-only architectural Q&A over the repository graph (large repos).
neurcode ask "Where is orgId resolved in auth middleware?"

# Brain — optional local context cache for monorepos.
neurcode brain status
neurcode brain mode --storage-mode no-code
neurcode brain doctor "is userid used instead of org id"

# Legacy autonomous remediation surfaces (kept for compatibility — NOT the canonical
# remediation path; the trust boundary is "Neurcode detects, external AI assistant
# remediates"). Prefer `neurcode remediate-export` and your AI tool of choice.
neurcode ship "Harden session middleware" --max-fix-attempts 3 --test-command "pnpm test:ci"
```

## Docs

- Canonical workflow: https://github.com/sujit-jaunjal/neurcode/blob/main/docs/workflow-overview.md
- Governance vocabulary: https://github.com/sujit-jaunjal/neurcode/blob/main/docs/governance-vocabulary.md
- Enterprise setup: https://github.com/sujit-jaunjal/neurcode/blob/main/docs/enterprise-setup.md
- Runtime profiles + capability envelope: https://github.com/sujit-jaunjal/neurcode/blob/main/docs/runtime-profiles.md
- CLI command reference: https://neurcode.com/docs/cli
- Repo: https://github.com/sujit-jaunjal/neurcode
