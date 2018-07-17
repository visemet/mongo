/**
 * @fileoverview Enforce a particular style and formatting for resmoke.py tags.
 */
"use strict";

const jsdiff = require("diff");
const yaml = require("yaml").default;

// The LINEBREAK_MATCHER constant is copied from v5.1.0 of the ast-utils library.
const LINEBREAK_MATCHER = /\r\n|[\r\n\u2028\u2029]/;
const JSTEST_TAG_PATTERN = /.*@tags\s*:\s*(\[[^\]]*\])/;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "Enforce a particular style and formatting for resmoke.py tags.",
            category: "Fill me in",
            recommended: false
        },
        fixable: "whitespace",
        schema: [{
            type: "object",
            properties: {
                $_internalAddTag: {type: "string"},
                $_internalRemoveTag: {type: "string"},
            },
            additionalProperties: false,
        }]
    },

    create(context) {
        // variables should be defined here

        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();

        //----------------------------------------------------------------------
        // Helpers
        //----------------------------------------------------------------------

        // any helper functions should go here or else delete this section

        /**
         * Gets a list of comment lines in a group
         * @param {Token[]} commentGroup A group of comments, containing either multiple line
         *                               comments or a single block comment
         * @returns {string[]} A list of comment lines
         */
        function getCommentLines(commentGroup) {
            if (commentGroup[0].type === "Line") {
                return commentGroup.map(comment => comment.value);
            }
            return commentGroup[0]
                .value.split(LINEBREAK_MATCHER)
                .map(line => line.replace(/^\s*\*?/, ""));
        }

        /**
         * Converts a comment into starred-block form.
         *
         * @param {number} initialOffset The amount of whitespace to precede each line of the
         * comment group with.
         *
         * @param {string[]} commentLinesList A list of lines to appear in the new starred-block
         * comment.
         *
         * @returns {string} A representation of the comment value in starred-block form, excluding
         * start and end markers.
         */
        function convertToStarredBlock(initialOffset, commentLinesList) {
            const prefix = `${" ".repeat(initialOffset)}`;
            const starredLines = commentLinesList.map(line => `${prefix} *${line}`);
            return `\n${starredLines.join("\n")}\n${prefix} `;
        }

        function convertToPaddedCommentList(initialOffset, tags) {
            // TODO: Consider making some of these configurable.
            const columnWidth = 100;
            const indentSize = 2;
            const indent = `${" ".repeat(indentSize)}`;
            const commentPrefix = ` ${indent}# `;

            const wrap = require("wordwrap")(columnWidth - initialOffset - commentPrefix.length);

            const commentLinesList = [" @tags: ["];

            for (let i = 0; i < tags.length; ++i) {
                const tagInfo = tags[i];

                if (tagInfo.comment !== undefined) {
                    if (i > 0) {
                        commentLinesList.push("");
                    }

                    for (let line of wrap(tagInfo.comment).split(/\r?\n/)) {
                        commentLinesList.push(`${commentPrefix}${line}`);
                    }
                }

                commentLinesList.push(` ${indent}${tagInfo.name},`);
            }

            commentLinesList.push(" ]");
            return commentLinesList;
        }

        function checkCommentGroup(commentGroup) {
            const commentLines = getCommentLines(commentGroup);
            console.log('commentLines', commentLines);

            const commentJoined = commentLines.join("\n");
            const match = JSTEST_TAG_PATTERN.exec(commentJoined);

            if (match === null) {
                return;
            }

            const lineStart = (commentJoined.substring(0, match.index).match(/\n/g) || []).length;
            const numLines = (match[1].match(/\n/g) || []).length;
            const lineEnd = lineStart + numLines + 1;
            const oldArray = commentLines.slice(lineStart, lineEnd);

            let doc;
            try {
                doc = yaml.parseDocument(match[1]);
            } catch (e) {
                // TODO: We should probably re-throw this exception or report a failure using
                // 'context' still.
                console.error("Found invalid YAML when parsing @tags comment: " + e.message);
                throw e;
            }

            if (doc.contents.items.length === 0) {
                // TODO: Use context.report() here to propagate this as an error.
                console.error("tags list should not be empty");
                return;
            }

            const tags = [];

            for (let tagNode of doc.contents.items) {
                const tagInfo = {name: tagNode.value};

                if (tagNode.commentBefore !== undefined) {
                    const comment = tagNode.commentBefore.split(/\r?\n/)
                                        .map(commentLine => commentLine.trimStart())
                                        .join(" ");
                    tagInfo.comment = comment;
                }

                tags.push(tagInfo);
            }

            const initialOffset = commentGroup[0].loc.start.column;
            console.log('initialOffset', initialOffset);

            const newArray = convertToPaddedCommentList(initialOffset, tags);
            console.log('newArray', newArray);

            const diff = jsdiff.diffArrays(oldArray, newArray);
            console.log('diffArrays', diff);

            if (diff.length > 1) {
                // XXX: Is there a different way we could have split up 'commentLines' so we don't
                // have to remove the empty string elements at the very beginning and at the very
                // end?
                const commentLinesList =
                    [].concat(commentLines.slice(1, lineStart),
                              newArray,
                              commentLines.slice(lineEnd, commentLines.length - 1));

                const starredBlock =
                    `/**${convertToStarredBlock(initialOffset, commentLinesList)}*/`;
                console.log('converted """', starredBlock, '"""');
                console.log('original """',
                            `/*${convertToStarredBlock(initialOffset, commentLines)}*/`,
                            '"""');

                context.report({
                    loc: {
                        start: commentGroup[0].loc.start,
                        end: commentGroup[commentGroup.length - 1].loc.end
                    },
                    message: "Style doesn't match",
                    fix(fixer) {
                        const range = [
                            commentGroup[0].range[0],
                            commentGroup[commentGroup.length - 1].range[1]
                        ];

                        return fixer.replaceTextRange(range, starredBlock);
                    }
                });
            }
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        return {

            Program() {
                console.log('options', context.options);

                // TODO: Check for /@tags\s*:/ in any of the lines to know if we should just skip
                // doing all of this work altogether.

                // The logic for grouping comments is copied from v5.1.0 of the
                // multiline-comment-style.js rule.
                comments
                    .reduce(
                        (commentGroups, comment, index, commentList) => {
                            const tokenBefore = sourceCode.getTokenOrCommentBefore(comment);

                            if (comment.type === "Line" && index > 0 &&
                                commentList[index - 1].type === "Line" && tokenBefore &&
                                tokenBefore.loc.end.line === comment.loc.start.line - 1 &&
                                tokenBefore === commentList[index - 1]) {
                                commentGroups[commentGroups.length - 1].push(comment);
                            } else {
                                commentGroups.push([comment]);
                            }

                            return commentGroups;
                        },
                        [])
                    .forEach(checkCommentGroup);
            }

        };
    }
};
