const program = require("commander");

const CLIEngine = require('eslint').CLIEngine;
const plugins = require("eslint/lib/config/plugins");

program.command("add-tag <tag> [files...]")
    .description("Adds the resmoke.py tag to the list of files")
    .option("-m|--message [message]", "Optional message to include as a comment for the tag")
    .action((tag, files, cmd) => {
        console.log("add-tag", tag, files, cmd.message);

        // XXX: Omitting `plugins.load("mongodb-server")` causes the schema of the rules' options to
        // not get validated for some reason.
        plugins.load("mongodb-server");

        var cli = new CLIEngine({
            plugins: ["mongodb-server"],
            rules: {"mongodb-server/resmoke-tags": ["error", {$_internalAddTag: tag}]},
            fix: true,
        });

        const report = cli.executeOnFiles(files);
        if (report.errorCount > 0) {
            console.error(report.results[0].messages);
        }
        CLIEngine.outputFixes(report);
    });

program.parse(process.argv);
