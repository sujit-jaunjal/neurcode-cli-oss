/**
 * neurcode profile
 *
 * Builds a deterministic Repo Governance Profile from:
 *   - git ls-files (paths only — no source contents)
 *   - CODEOWNERS (3 standard locations)
 *   - primary manifest (package.json / pyproject.toml / go.mod / Cargo.toml / pom.xml)
 *
 * Writes .neurcode/profile.json and prints a summary to the terminal.
 * Zero network calls. Zero code transmission. Same inputs → same profileHash.
 */
import type { Command } from 'commander';
export declare function profileCommand(program: Command): void;
//# sourceMappingURL=profile.d.ts.map