# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.20.27] - 2026-07-11

### Added

- Added the canonical governance-reality assessment across contracts, CLI, API, and dashboard with nine evidence-derived runtime capabilities.
- Added `neurcode reality`, JSON output, and strict automation mode for repository-local operational proof.
- Added workspace- and repository-scoped dashboard recovery paths after first activation value.

### Changed

- Exact-path approval is now reported separately from containment; containment is proven only after a neighboring protected path is blocked in the same session.
- Governance readiness copy explicitly distinguishes operational evidence from compliance certification and code-safety guarantees.

## [0.20.25] - 2026-07-10

### Added

- Added `neurcode setup`, the canonical resumable first-run command for explicit workspace login, repository ownership, local Brain indexing, and agent integration.
- Added profile-aware agent selection without silently defaulting to an unrelated coding environment.

### Changed

- Browser device authorization now requires an explicit personal or organization workspace and returns the workspace-scoped credential only once to the waiting CLI.
- `neurcode daemon` is documented as an optional legacy bridge, not an onboarding or runtime prerequisite.
- Login, dashboard setup, public docs, and the OSS export now share the same proof-versus-real-repository entry points.

### Security

- Approval, denial, and credential exchange now serialize on the device request row; expired unclaimed credentials are cleared and revoked.
- CLI authorization routes no longer expose raw internal failures or full connection codes in server logs.

## [0.9.44] - 2026-04-12

### Fixed
- `neurcode verify` now returns a clear `git_repository_required` failure instead of raw git errors when run outside a git repository.
- `neurcode check` now validates git repository context before diff analysis.
- Governance signing fallback now auto-provisions local signing material for logged-in users when signed AI logs are required.

### Changed
- Standardized staged diff collection to `git diff --cached` for stronger git CLI compatibility.
- OSS export sync now preserves professional repository scaffolding (`.github` templates/workflows, smoke checks, enriched README/docs).

## [0.2.0] - 2024-12-22

### Added
- **GitHub Action for CI/CD enforcement** - Released `packages/action` as a gatekeeper action that runs `neurcode verify` on Pull Requests and fails the build if code adherence grade is below the specified threshold
- Support for `--json` flag in `neurcode verify` command for programmatic consumption
- Robust error handling in GitHub Action to gracefully handle scope violations and non-JSON output

### Changed
- CLI version bumped to 0.2.1 with `--json` flag support

### Fixed
- GitHub Action now correctly installs `@neurcode-ai/cli` package
- Action handles scope violations and error cases without crashing

---
