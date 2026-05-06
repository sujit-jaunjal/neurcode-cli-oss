#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const FORBIDDEN_PATH_RULES = [
  { id: 'pnpm-store', pattern: /^\.pnpm-store\//, reason: 'Local package cache must never be tracked.' },
  { id: 'npm-auth-temp', pattern: /^packages\/cli\/\.npmrc\.tmp$/, reason: 'Temporary npm auth file can leak publish tokens.' },
  { id: 'local-db', pattern: /^neurcode\.db$/, reason: 'Local SQLite runtime DB should not be committed.' },
  { id: 'audit-dump', pattern: /^neurcode_.*_audit\.txt$/, reason: 'Generated audit dumps are local artifacts.' },
  { id: 'audit-log', pattern: /^neurcode\.policy\.audit\.log\.jsonl$/, reason: 'Local policy audit log should stay untracked.' },
  { id: 'pitch-deck', pattern: /^Neurcode-Pitch_Deck\.pdf$/, reason: 'Internal collateral should not ship in OSS source.' },
  { id: 'backup-file', pattern: /^package\.json\.backup$/, reason: 'Backup scratch files should not be committed.' },
  { id: 'os-artifact', pattern: /\.DS_Store$/, reason: 'OS metadata files should not be tracked.' },
];

const ENV_FILE_PATTERN = /(^|\/)\.env($|\.)/;
const ENV_ALLOW_LIST = new Set(['.env.example', 'env.production.example']);
const MAX_SCAN_FILE_BYTES = 1024 * 1024; // 1MB safety cap

const NEURCODE_ALLOWED_SOURCE_PATTERNS = [
  /^\.neurcode\/policies\/[^/]+\.json$/,
  /^\.neurcode\/templates\/.+/,
  /^\.neurcode\/control-plane\/[^/]+\.json$/,
  /^\.neurcode\/workspaces\/definitions\/[^/]+\.json$/,
];

const NEURCODE_RUNTIME_FORBIDDEN_PATTERNS = [
  /^\.neurcode\/intent-state\.json$/,
  /^\.neurcode\/session\.json$/,
  /^\.neurcode\/cache\//,
  /^\.neurcode\/policies\/[^/]+\.active\.json$/,
  /^\.neurcode\/control-plane\/snapshots\//,
  /^\.neurcode\/workspaces\/index\.json$/,
  /^\.neurcode\/workspaces\/cache\//,
];

const SECRET_LINE_PATTERNS = [
  {
    id: 'npm-token',
    pattern: /_authToken\s*=\s*[A-Za-z0-9_\-]+/,
    reason: 'Potential npm auth token detected.',
  },
  {
    id: 'db-url-with-password',
    pattern: /DATABASE_URL\s*=\s*postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
    reason: 'DATABASE_URL appears to include inline credentials.',
  },
  {
    id: 'service-secret',
    pattern: /(CLERK_SECRET_KEY|DEEPINFRA_API_KEY|RAZORPAY_LIVE_KEY_SECRET|GITHUB_CLIENT_SECRET|LINEAR_CLIENT_SECRET)\s*=\s*["'][^"']{8,}["']/,
    reason: 'Service secret appears with inline value.',
  },
  {
    id: 'npm-token-literal',
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/,
    reason: 'Potential npm token literal detected.',
  },
  {
    id: 'github-token',
    pattern: /\bghp_[A-Za-z0-9]{30,}\b/,
    reason: 'Potential GitHub PAT detected.',
  },
  {
    id: 'github-pat-v2',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
    reason: 'Potential GitHub PAT v2 detected.',
  },
  {
    id: 'hardcoded-sshpass-password',
    pattern: /sshpass\s+-p\s+['"][^$][^'"]+['"]/,
    reason: 'Hardcoded sshpass password detected.',
  },
];

const TEXT_SCAN_EXTENSIONS = new Set([
  '.env',
  '.txt',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.npmrc',
  '.sh',
  '.toml',
]);

function listTrackedFiles() {
  const output = execSync('git ls-files -z', { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
  return output
    .toString('utf-8')
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getNeurcodePathViolation(filePath) {
  if (!filePath.startsWith('.neurcode/')) {
    return null;
  }
  if (NEURCODE_RUNTIME_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return {
      rule: 'neurcode-runtime',
      reason: 'Runtime-only .neurcode state must never be tracked.',
    };
  }
  if (NEURCODE_ALLOWED_SOURCE_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return null;
  }
  return {
    rule: 'neurcode-non-allowlisted',
    reason: 'Only .neurcode/policies/*.json, .neurcode/templates/**, .neurcode/control-plane/*.json, and .neurcode/workspaces/definitions/*.json may be tracked.',
  };
}

function scanContentForSecrets(filePath) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) return [];

  let size = 0;
  try {
    size = statSync(absPath).size;
  } catch {
    return [];
  }
  if (size > MAX_SCAN_FILE_BYTES) return [];

  let content = '';
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }

  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of SECRET_LINE_PATTERNS) {
      if (rule.pattern.test(line)) {
        findings.push({
          rule: rule.id,
          reason: rule.reason,
          filePath,
          line: i + 1,
        });
      }
    }
  }
  return findings;
}

function main() {
  let trackedFiles;
  try {
    trackedFiles = listTrackedFiles();
  } catch (error) {
    console.error('❌ Failed to list tracked files. Run from the repository root.');
    process.exit(1);
  }

  const forbiddenPathFindings = [];
  const envPathFindings = [];
  const contentFindings = [];

  for (const filePath of trackedFiles) {
    const neurcodeViolation = getNeurcodePathViolation(filePath);
    if (neurcodeViolation) {
      forbiddenPathFindings.push({
        filePath,
        reason: neurcodeViolation.reason,
        rule: neurcodeViolation.rule,
      });
    }

    for (const rule of FORBIDDEN_PATH_RULES) {
      if (rule.pattern.test(filePath)) {
        forbiddenPathFindings.push({ filePath, reason: rule.reason, rule: rule.id });
      }
    }

    if (ENV_FILE_PATTERN.test(filePath)) {
      const base = filePath.split('/').pop() || filePath;
      if (!ENV_ALLOW_LIST.has(base)) {
        envPathFindings.push({
          filePath,
          reason: 'Tracked .env file detected. Commit only template examples.',
        });
      }
    }

    const envTemplateAllowed = (() => {
      if (!ENV_FILE_PATTERN.test(filePath)) return false;
      const base = filePath.split('/').pop() || filePath;
      return ENV_ALLOW_LIST.has(base);
    })();

    const extension = (() => {
      const basename = filePath.split('/').pop() || filePath;
      const dotIndex = basename.lastIndexOf('.');
      return dotIndex >= 0 ? basename.slice(dotIndex) : '';
    })();

    const shouldContentScan = !envTemplateAllowed && (
      filePath.endsWith('.npmrc') ||
      filePath.endsWith('.npmrc.tmp') ||
      ENV_FILE_PATTERN.test(filePath) ||
      TEXT_SCAN_EXTENSIONS.has(extension)
    );

    if (shouldContentScan) {
      contentFindings.push(...scanContentForSecrets(filePath));
    }
  }

  if (forbiddenPathFindings.length === 0 && envPathFindings.length === 0 && contentFindings.length === 0) {
    console.log('✅ OSS safety check passed: no forbidden tracked artifacts or obvious secret leaks found.');
    return;
  }

  console.error('❌ OSS safety check failed.');

  if (forbiddenPathFindings.length > 0) {
    console.error('\nForbidden tracked paths:');
    for (const finding of forbiddenPathFindings) {
      console.error(`- ${finding.filePath} (${finding.reason})`);
    }
  }

  if (envPathFindings.length > 0) {
    console.error('\nTracked env files:');
    for (const finding of envPathFindings) {
      console.error(`- ${finding.filePath} (${finding.reason})`);
    }
  }

  if (contentFindings.length > 0) {
    console.error('\nPotential secret-bearing content:');
    for (const finding of contentFindings) {
      console.error(`- ${finding.filePath}:${finding.line} [${finding.rule}] ${finding.reason}`);
    }
  }

  console.error('\nRecommended remediation:');
  console.error('- Untrack runtime-only .neurcode artifacts (intent/session/cache/*.active.json/control-plane snapshots).');
  console.error('- Keep only allowlisted .neurcode sources: .neurcode/policies/*.json, .neurcode/templates/**, .neurcode/control-plane/*.json.');
  console.error('- Untrack local artifacts: git rm --cached -r .pnpm-store');
  console.error('- Remove leaked auth files: git rm --cached packages/cli/.npmrc.tmp');
  console.error('- Rotate any exposed credentials before publishing.');
  process.exit(1);
}

main();
