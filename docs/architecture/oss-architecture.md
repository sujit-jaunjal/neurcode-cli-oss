# OSS Architecture Boundary

This repository is a sanitized export boundary for the Neurcode CLI.

## Public boundary

Included:

- `packages/cli/dist` runtime artifacts
- OSS documentation and contribution files
- safety and boundary validation scripts

Excluded:

- private backend/control-plane code
- private internal workspaces and services
- local runtime/cached artifacts and credentials

## Safety controls

- `scripts/oss-safety-check.mjs`: scans tracked files for forbidden artifacts and secret patterns.
- `scripts/oss-export-boundary-check.mjs`: ensures required public files exist and forbidden private paths are absent.
- CI (`.github/workflows/ci.yml`): runs safety, boundary, and CLI smoke checks on PRs and pushes.

## Data and trust model

- CLI runtime in this repo is public and inspectable.
- Remote APIs (plan generation, cloud verification, org policies) are external service dependencies and require authentication.
- Local policy-only mode remains available for deterministic governance checks without remote dependencies.

