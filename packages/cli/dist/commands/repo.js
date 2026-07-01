"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.repoCommand = repoCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const project_root_1 = require("../utils/project-root");
const repo_links_1 = require("../utils/repo-links");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
function toAbsolutePath(pathArg, cwd) {
    if ((0, path_1.isAbsolute)(pathArg))
        return pathArg;
    return (0, path_1.resolve)(cwd, pathArg);
}
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function listRepoLinks(options) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const links = (0, repo_links_1.loadRepoLinks)(projectRoot);
    if (options.json) {
        emitJson({
            success: true,
            projectRoot,
            linksPath: (0, repo_links_1.getRepoLinksPath)(projectRoot),
            links,
            count: links.length,
        });
        return;
    }
    console.log(chalk.bold.cyan('\n🔗 Linked Repositories\n'));
    console.log(chalk.white(`Project root: ${projectRoot}`));
    if (links.length === 0) {
        console.log(chalk.dim('No linked repositories configured.'));
        console.log(chalk.dim('Use `neurcode repo link <path>` to allow explicit cross-repo access.'));
        console.log('');
        return;
    }
    for (const link of links) {
        console.log(chalk.white(`- ${chalk.bold(link.alias)} -> ${link.path}`));
    }
    console.log('');
}
function linkRepo(pathArg, options) {
    try {
        const cwd = process.cwd();
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(cwd);
        const absolutePath = toAbsolutePath(pathArg, cwd);
        if (!(0, fs_1.existsSync)(absolutePath)) {
            throw new Error(`Path does not exist: ${absolutePath}`);
        }
        const stat = (0, fs_1.statSync)(absolutePath);
        if (!stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${absolutePath}`);
        }
        const link = (0, repo_links_1.upsertRepoLink)(projectRoot, {
            path: absolutePath,
            alias: options.alias,
        });
        if (options.json) {
            emitJson({
                success: true,
                projectRoot,
                linksPath: (0, repo_links_1.getRepoLinksPath)(projectRoot),
                linked: link,
                message: 'Repository link saved',
            });
            return;
        }
        console.log(chalk.green(`✅ Linked repository "${link.alias}"`));
        console.log(chalk.dim(`   ${link.path}`));
        console.log(chalk.dim('   Cross-repo overrides remain blocked unless target path matches an explicit link.'));
        console.log('');
    }
    catch (error) {
        if (options.json) {
            emitJson({
                success: false,
                message: error instanceof Error ? error.message : String(error),
            });
        }
        else {
            console.error(chalk.red(`❌ ${error instanceof Error ? error.message : String(error)}`));
        }
        process.exit(1);
    }
}
function unlinkRepo(aliasOrPath, options) {
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const current = (0, repo_links_1.findRepoLink)(projectRoot, aliasOrPath);
        const removed = (0, repo_links_1.removeRepoLink)(projectRoot, aliasOrPath);
        if (!removed) {
            throw new Error(`No linked repository found for "${aliasOrPath}"`);
        }
        if (options.json) {
            emitJson({
                success: true,
                projectRoot,
                linksPath: (0, repo_links_1.getRepoLinksPath)(projectRoot),
                removed,
                previousMatch: current,
                message: 'Repository link removed',
            });
            return;
        }
        console.log(chalk.green(`✅ Unlinked repository "${removed.alias}"`));
        console.log(chalk.dim(`   ${removed.path}`));
        console.log('');
    }
    catch (error) {
        if (options.json) {
            emitJson({
                success: false,
                message: error instanceof Error ? error.message : String(error),
            });
        }
        else {
            console.error(chalk.red(`❌ ${error instanceof Error ? error.message : String(error)}`));
        }
        process.exit(1);
    }
}
function repoCommand(program) {
    const repoCmd = program
        .command('repo')
        .description('Manage explicit cross-repository links (deny-by-default access model)');
    repoCmd
        .command('connect')
        .description('Connect this repository to a Neurcode workspace (alias for `neurcode init`)')
        .option('--org <org-id>', 'Organization/workspace ID to bind this repository to')
        .option('--create <name>', 'Create a project ownership record with this name')
        .option('--project-id <id>', 'Link to an existing project ID')
        .action(async (options) => {
        const { initCommand } = await Promise.resolve().then(() => __importStar(require('./init')));
        await initCommand({
            orgId: options.org,
            create: options.create,
            projectId: options.projectId,
        });
    });
    repoCmd
        .command('list')
        .description('List linked repositories that can be explicitly used for cross-repo overrides')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        listRepoLinks(options);
    });
    repoCmd
        .command('link')
        .description('Link an external repository path for explicit cross-repo access')
        .argument('<path>', 'Absolute or relative path to repository root')
        .option('--alias <name>', 'Optional alias for this link')
        .option('--json', 'Output machine-readable JSON')
        .action((pathArg, options) => {
        linkRepo(pathArg, options);
    });
    repoCmd
        .command('unlink')
        .description('Remove a linked repository by alias or path')
        .argument('<alias-or-path>', 'Alias or path to unlink')
        .option('--json', 'Output machine-readable JSON')
        .action((aliasOrPath, options) => {
        unlinkRepo(aliasOrPath, options);
    });
}
//# sourceMappingURL=repo.js.map