#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const SECRET_PATTERNS = [
  { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{30,}\b/, reason: 'Potential npm token literal detected.' },
  { id: 'github-token', pattern: /\bghp_[A-Za-z0-9]{30,}\b/, reason: 'Potential GitHub PAT detected.' },
  { id: 'github-pat-v2', pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, reason: 'Potential GitHub PAT v2 detected.' },
  { id: 'db-url-credential', pattern: /DATABASE_URL\s*=\s*postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i, reason: 'Inline database credentials detected.' },
  { id: 'generic-auth-token', pattern: /_authToken\s*=\s*[A-Za-z0-9_\-]+/, reason: 'Potential npm auth token assignment detected.' },
];

const TEXT_FILE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.sh',
  '.gitignore',
]);

const MAX_SCAN_FILE_BYTES = 5 * 1024 * 1024; // 5MB

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
]);

const PROFILE_RULES = {
  cli: {
    required: [
      /^packages\/cli\/dist\/index\.js$/,
      /^packages\/cli\/package\.json$/,
      /^packages\/cli\/README\.md$/,
    ],
    forbidden: [
      /^packages\/cli\/src\//,
      /^packages\/action\//,
      /^packages\/github-action\//,
      /^packages\/analysis\//,
      /^packages\/brain\//,
      /^packages\/core\//,
      /^packages\/diff-parser\//,
      /^packages\/governance-runtime\//,
      /^packages\/policy\//,
      /^packages\/policy-engine\//,
      /^packages\/contracts\//,
      /^packages\/mcp-server\//,
      /^services\//,
      /^web\//,
      /^\.neurcode\//,
      /^neurcode\.db$/,
      /(^|\/)\.env($|\.)/,
      /^.*\.map$/,
    ],
  },
  action: {
    required: [
      /^action\.yml$/,
      /^dist\/index\.js$/,
      /^package\.json$/,
    ],
    forbidden: [
      /^src\//,
      /^test\//,
      /^tests\//,
      /^packages\//,
      /^services\//,
      /^web\//,
      /^\.neurcode\//,
      /^neurcode\.db$/,
      /(^|\/)\.env($|\.)/,
      /^.*\.map$/,
    ],
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  let target = '.';
  let profile = 'cli';

  for (const arg of args) {
    if (arg.startsWith('--profile=')) {
      profile = arg.split('=')[1] || profile;
      continue;
    }
    if (!arg.startsWith('-')) {
      target = arg;
    }
  }

  if (!(profile in PROFILE_RULES)) {
    console.error(`❌ Unknown profile: ${profile}`);
    console.error(`Supported profiles: ${Object.keys(PROFILE_RULES).join(', ')}`);
    process.exit(1);
  }

  return {
    profile,
    target: resolve(target),
  };
}

function listFiles(rootDir) {
  const files = [];
  const stack = [''];
  while (stack.length > 0) {
    const relDir = stack.pop();
    const absDir = join(rootDir, relDir);
    const entries = readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = join(rootDir, rel);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(rel);
        continue;
      }
      if (entry.isFile()) {
        files.push({ rel, abs });
      }
    }
  }
  return files;
}

function isTextFile(filePath) {
  const base = filePath.split('/').pop() || filePath;
  if (base === '.gitignore') return true;
  return TEXT_FILE_EXTENSIONS.has(extname(filePath));
}

function scanSecrets(files) {
  const findings = [];
  for (const { rel, abs } of files) {
    if (!isTextFile(rel)) continue;

    let size = 0;
    try {
      size = statSync(abs).size;
    } catch {
      continue;
    }
    if (size > MAX_SCAN_FILE_BYTES) continue;

    let content = '';
    try {
      content = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }

    for (const rule of SECRET_PATTERNS) {
      if (rule.pattern.test(content)) {
        findings.push({
          file: rel,
          rule: rule.id,
          reason: rule.reason,
        });
      }
    }
  }
  return findings;
}

function main() {
  const { profile, target } = parseArgs();
  if (!existsSync(target)) {
    console.error(`❌ Export directory does not exist: ${target}`);
    process.exit(1);
  }

  const rules = PROFILE_RULES[profile];
  const files = listFiles(target);
  const relativePaths = files.map((entry) => entry.rel);

  const missingRequired = rules.required.filter((pattern) => !relativePaths.some((file) => pattern.test(file)));
  const forbiddenHits = [];
  for (const file of relativePaths) {
    for (const pattern of rules.forbidden) {
      if (pattern.test(file)) {
        forbiddenHits.push(file);
        break;
      }
    }
  }

  const secretFindings = scanSecrets(files);

  if (missingRequired.length === 0 && forbiddenHits.length === 0 && secretFindings.length === 0) {
    console.log(`✅ OSS export boundary check passed (${profile}).`);
    return;
  }

  console.error(`❌ OSS export boundary check failed (${profile}).`);

  if (missingRequired.length > 0) {
    console.error('\nMissing required paths/patterns:');
    for (const pattern of missingRequired) {
      console.error(`- ${String(pattern)}`);
    }
  }

  if (forbiddenHits.length > 0) {
    console.error('\nForbidden files in export:');
    for (const file of forbiddenHits.slice(0, 100)) {
      console.error(`- ${file}`);
    }
    if (forbiddenHits.length > 100) {
      console.error(`- ... and ${forbiddenHits.length - 100} more`);
    }
  }

  if (secretFindings.length > 0) {
    console.error('\nPotential secret-bearing content:');
    for (const finding of secretFindings.slice(0, 40)) {
      console.error(`- ${finding.file} [${finding.rule}] ${finding.reason}`);
    }
    if (secretFindings.length > 40) {
      console.error(`- ... and ${secretFindings.length - 40} more`);
    }
  }

  process.exit(1);
}

main();
