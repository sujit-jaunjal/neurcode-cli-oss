"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchApplyCommand = patchApplyCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const patch_engine_1 = require("../patch-engine");
const cli_json_1 = require("../utils/cli-json");
const chalk = (0, cli_json_1.loadChalk)();
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function patchApplyCommand(options) {
    const filePath = (0, path_1.resolve)(process.cwd(), options.file);
    if (!(0, fs_1.existsSync)(filePath)) {
        if (options.json) {
            emitJson({ success: false, message: `File not found: ${options.file}` });
        }
        else {
            console.log(chalk.red(`File not found: ${options.file}`));
        }
        process.exit(1);
        return;
    }
    let content;
    try {
        content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read file';
        if (options.json) {
            emitJson({ success: false, message });
        }
        else {
            console.log(chalk.red(`Could not read ${options.file}: ${message}`));
        }
        process.exit(1);
        return;
    }
    const result = (0, patch_engine_1.applyFirstMatchingPatch)(options.file, content);
    if (!result) {
        if (options.json) {
            emitJson({
                success: false,
                file: options.file,
                message: `No applicable patch found for ${options.file}`,
            });
        }
        else {
            console.log(chalk.yellow(`No applicable patch found for ${options.file}.`));
            console.log(chalk.dim('Tip: run `neurcode fix` to see which violations exist.'));
        }
        return;
    }
    try {
        (0, fs_1.writeFileSync)(filePath, result.updatedContent, 'utf-8');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not write file';
        if (options.json) {
            emitJson({ success: false, message });
        }
        else {
            console.log(chalk.red(`Could not write ${options.file}: ${message}`));
        }
        process.exit(1);
        return;
    }
    if (options.json) {
        emitJson({
            success: true,
            file: options.file,
            patternKind: result.patternKind,
            patchConfidence: result.patchConfidence,
            message: 'Patch applied successfully',
        });
    }
    else {
        console.log(chalk.green('Patch applied successfully'));
        console.log(chalk.dim(`  File:       ${options.file}`));
        console.log(chalk.dim(`  Pattern:    ${result.patternKind}`));
        console.log(chalk.dim(`  Confidence: ${result.patchConfidence}`));
        console.log(chalk.dim('  Run `neurcode verify` to confirm the fix.'));
    }
}
//# sourceMappingURL=patch-apply.js.map