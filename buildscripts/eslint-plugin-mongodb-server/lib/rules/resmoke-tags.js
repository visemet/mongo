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
            category: "Stylistic Issues",
            recommended: false,
        },
        fixable: "whitespace",
        schema: [{
            type: "object",
            properties: {
                $_internalAddTag: {
                    type: "object",
                    properties: {
                        tag: {type: "string"},
                        comment: {type: "string"},
                    },
                    required: ["tag"],
                    additionalProperties: false,
                },
                $_internalListTags: {type: "null"},
                $_internalRemoveTag: {type: "string"},
                $_internalRenameTag: {
                    type: "object",
                    properties: {
                        from: {type: "string"},
                        to: {type: "string"},
                    },
                    required: ["from", "to"],
                    additionalProperties: false,
                },
            },
            oneOf: [
                {required: ["$_internalAddTag"]},
                {required: ["$_internalListTags"]},
                {required: ["$_internalRemoveTag"]},
                {required: ["$_internalRenameTag"]},
            ],
            additionalProperties: false,
        }],
    },

    create(context) {
        // variables should be defined here

        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();
        const options = context.options[0] || {};

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
        function convertToStarredBlock(
            initialOffset, commentLinesList, {addTrailingNewline = false} = {}) {
            const whitespace = " ".repeat(initialOffset);
            const starredLines = commentLinesList.map((line, i) => {
                let prefix = " *";
                if (i === 0) {
                    prefix = "/**";
                } else if (i === commentLinesList.length - 1) {
                    prefix = " */";
                }
                return `${whitespace}${prefix}${line}`;
            });
            const suffix = addTrailingNewline ? `\n${whitespace}` : "";
            return starredLines.join("\n") + suffix;
        }

        /**
         * Converts a comment into separate-line form.
         *
         * @param {number} initialOffset The amount of whitespace to precede each line of the
         * comment group with.
         *
         * @param {string[]} commentLinesList A list of lines to appear in the new separate-line
         * comment.
         *
         * @returns {string} A representation of the comment value in separate-line form.
         */
        function convertToSeparateLines(
            initialOffset, commentLinesList, {addTrailingNewline = false} = {}) {
            const whitespace = " ".repeat(initialOffset);
            const separateLines = commentLinesList.map(line => `${whitespace}//${line}`);
            const suffix = addTrailingNewline ? `\n${whitespace}` : "";
            return separateLines.join("\n") + suffix;
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
                const tagNode = tags[i];

                if (tagNode.commentBefore !== undefined) {
                    for (let line of wrap(tagNode.commentBefore).split(/\r?\n/)) {
                        commentLinesList.push(`${commentPrefix}${line}`);
                    }
                }

                commentLinesList.push(` ${indent}${tagNode.value},`);
            }

            commentLinesList.push(" ]");
            return commentLinesList;
        }

        function checkCommentGroup(commentGroup,
                                   {
                                       allowMissingTagsAnnotation = false,  //
                                       needsNewCommentBlock = false,
                                   } = {}) {
            const commentLines = getCommentLines(commentGroup);

            const commentJoined = commentLines.join("\n");
            const match = JSTEST_TAG_PATTERN.exec(commentJoined);

            if (match === null && !allowMissingTagsAnnotation) {
                return false;
            }

            let lineStart;
            let lineEnd;
            let doc;

            if (match === null) {
                lineStart = (commentJoined.match(/\n/g) || []).length;
                lineEnd = lineStart;
                doc = {contents: {items: []}};
            } else {
                lineStart = (commentJoined.substring(0, match.index).match(/\n/g) || []).length;
                const numLines = (match[1].match(/\n/g) || []).length;
                lineEnd = lineStart + numLines + 1;

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
                    return true;
                }
            }

            const oldArray = commentLines.slice(lineStart, lineEnd);

            const tagsByName = new Map();

            for (let tagNode of doc.contents.items) {
                if (tagsByName.has(tagNode.value)) {
                    context.report({
                        loc: {
                            start: commentGroup[0].loc.start,
                            end: commentGroup[commentGroup.length - 1].loc.end
                        },
                        message: `The tag ${tagNode.value} appears multiple times in the list`,
                    });
                    return;
                }
                tagsByName.set(tagNode.value, tagNode);
            }

            if (options.$_internalAddTag !== undefined) {
                if (tagsByName.has(options.$_internalAddTag.tag)) {
                    tagsByName.get(options.$_internalAddTag.tag).commentBefore =
                        options.$_internalAddTag.comment;
                } else {
                    tagsByName.set(options.$_internalAddTag.tag, {
                        value: options.$_internalAddTag.tag,
                        commentBefore: options.$_internalAddTag.comment,
                    });
                }
            }

            if (options.$_internalListTags !== undefined) {
                context.report({
                    loc: {
                        start: commentGroup[0].loc.start,
                        end: commentGroup[commentGroup.length - 1].loc.end
                    },
                    message: "{{ tags }}",
                    data: {tags: JSON.stringify(Array.from(tagsByName.keys()))},
                });
                return true;
            }

            if (options.$_internalRemoveTag !== undefined) {
                if (tagsByName.has(options.$_internalRemoveTag)) {
                    tagsByName.delete(options.$_internalRemoveTag);
                }
            }

            if (options.$_internalRenameTag !== undefined) {
                if (tagsByName.has(options.$_internalRenameTag.from)) {
                    if (tagsByName.has(options.$_internalRenameTag.to)) {
                        context.report({
                            loc: {
                                start: commentGroup[0].loc.start,
                                end: commentGroup[commentGroup.length - 1].loc.end
                            },
                            message: "Tag '" + options.$_internalRenameTag.to +
                                "' already exists in the file",
                        });
                        return true;
                    }

                    const tagNode = tagsByName.get(options.$_internalRenameTag.from);
                    tagsByName.delete(options.$_internalRenameTag.from);
                    tagNode.value = options.$_internalRenameTag.to;
                    tagsByName.set(options.$_internalRenameTag.to, tagNode);
                }
            }

            for (let tagNode of tagsByName.values()) {
                if (tagNode.commentBefore !== undefined) {
                    tagNode.commentBefore = tagNode.commentBefore.split(/\r?\n/)
                                                .map(commentLine => commentLine.trimStart())
                                                .join(" ");
                }
            }

            const initialOffset = commentGroup[0].loc.start.column;
            const newArray = convertToPaddedCommentList(
                initialOffset,
                Array.from(tagsByName.values())
                    .sort((tagNode1, tagNode2) => tagNode1.value.localeCompare(tagNode2.value)));

            const diff = jsdiff.diffArrays(oldArray, newArray);

            if (diff.filter(change => change.added || change.removed).length > 0) {
                context.report({
                    loc: {
                        start: commentGroup[0].loc.start,
                        end: commentGroup[commentGroup.length - 1].loc.end
                    },
                    message: "Style doesn't match",
                    fix(fixer) {
                        const range = [
                            commentGroup[0].range[0] - initialOffset,
                            commentGroup[commentGroup.length - 1].range[1]
                        ];

                        const commentLinesList = [].concat(commentLines.slice(0, lineStart),
                                                           newArray,
                                                           commentLines.slice(lineEnd));

                        const newComment =
                            ((commentGroup[0].type === "Line") ? convertToSeparateLines
                                                               : convertToStarredBlock)(
                                initialOffset,
                                commentLinesList,
                                {addTrailingNewline: needsNewCommentBlock});

                        return fixer.replaceTextRange(range, newComment);
                    }
                });
            }

            return true;
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        return {

            Program() {
                // TODO: Check for /@tags\s*:/ in any of the lines to know if we should just skip
                // doing all of this work altogether.

                // The logic for grouping comments is copied from v5.1.0 of the
                // multiline-comment-style.js rule.
                const hasTagsAnnotation =
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
                        .reduce((hasTagsAnnotation, commentGroup) => {
                            return checkCommentGroup(commentGroup) || hasTagsAnnotation;
                        }, false);

                if (!hasTagsAnnotation && options.$_internalAddTag !== undefined) {
                    const firstStatement = sourceCode.ast.body[0];

                    let needsNewCommentBlock = false;
                    let comment = comments.find((comment) => {
                        return comment.loc.start.line < 10;
                    });

                    if (comment === undefined) {
                        comment = {
                            type: "Block",
                            value: "*\n",
                            start: firstStatement.start,
                            end: firstStatement.start,
                            loc: {start: firstStatement.loc.start, end: firstStatement.loc.end},
                            range: [firstStatement.range[0], firstStatement.range[0]],
                        };
                        needsNewCommentBlock = true;
                    }

                    checkCommentGroup([comment], {
                        allowMissingTagsAnnotation: true,
                        needsNewCommentBlock: needsNewCommentBlock,
                    });
                }
            }

        };
    }
};
