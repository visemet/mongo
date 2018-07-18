#!/usr/bin/env node

const util = require("util");

const program = require("commander");
const CLIEngine = require('eslint').CLIEngine;

function lint(files, ruleOptions) {
    const cli = new CLIEngine({
        // We don't use the top-level .eslintrc.yml file but we still enable ES6 features and
        // MongoDB global variables ourselves.
        useEslintrc: false,
        envs: ["es6", "mongo"],

        plugins: ["mongodb-server"],
        rules: {"mongodb-server/resmoke-tags": ruleOptions},
        fix: true,
    });

    const report = cli.executeOnFiles(files);
    if (report.errorCount > 0) {
        // We don't attempt to make changes to the specified files if there are non-fixable errors.
        console.error(util.inspect(report, {
            showHidden: false,
            depth: null,
            colors: true,
            maxArrayLength: null,
        }));
        process.exit(2);
    }

    CLIEngine.outputFixes(report);
    return report;
}

program.command("add-tag <tag> [files...]")
    .description("Adds the resmoke.py tag to the list of files")
    .option("-m|--message [message]", "Optional message to include as a comment for the tag")
    .action((tag, files, cmd) => {
        const options = {tag};
        if (cmd.message !== undefined) {
            options.comment = cmd.message;
        }

        lint(files, ["error", {$_internalAddTag: options}]);
    })
    .on("--help", () => {
        console.log("\n  Note: The comment for the tag will be updated exist if the tag already" +
                    " exists in the file.");
    });

program.command("remove-tag <tag> [files...]")
    .description("Removes the resmoke.py tag from the list of files")
    .action((tag, files) => {
        lint(files, ["error", {$_internalRemoveTag: tag}]);
    });

program.command("rename-tag <from-tag> <to-tag> [files...]")
    .description("Renames the resmoke.py tag in the list of files")
    .action((fromTag, toTag, files) => {
        lint(files, ["error", {$_internalRenameTag: {from: fromTag, to: toTag}}]);
    });

program.command("list-tags [files...]")
    .description("Lists the resmoke.py tags used in the list of files")
    .action((files) => {
        const report = lint(files, ["warn", {$_internalListTags: null}]);
        const allTags = new Set();
        for (let result of report.results) {
            if (result.messages.length === 0) {
                continue;
            }

            for (let tag of JSON.parse(result.messages[0].message)) {
                allTags.add(tag);
            }
        }

        for (let tag of allTags) {
            console.log(tag);
        }
    });

program.parse(process.argv);
