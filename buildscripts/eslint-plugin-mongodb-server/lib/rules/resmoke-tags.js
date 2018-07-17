/**
 * @fileoverview Enforce a particular style and formatting for resmoke.py tags.
 */
"use strict";

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

        function checkCommentGroup(commentGroup) {
            const commentLines = getCommentLines(commentGroup);
            console.log('commentLines', commentLines);

            const match = JSTEST_TAG_PATTERN.exec(commentLines.join("\n"));
            console.log('match', match);

            if (match === null) {
                return;
            }

            let doc;
            try {
                doc = yaml.parseDocument(match[1]);
            } catch (e) {
                // TODO: We should probably re-throw this exception or report a failure using
                // 'context' still.
                console.error("Found invalid YAML when parsing @tags comment: " + e.message);
                throw e;
            }

            console.log('doc', doc.contents);

            if (doc.contents.items.length === 0) {
                // TODO: Use context.report() here to propagate this as an error.
                console.error("tags list should not be empty");
                return;
            }

            // TODO: We need to subtract the starting offset of the comment plus some additional
            // whitespace and comment markers.
            const wrap = require("wordwrap")(100);

            const tags = [];

            for (let tagNode of doc.contents.items) {
                const tagInfo = {name: tagNode.value};

                if (tagNode.commentBefore !== undefined) {
                    const comment = tagNode.commentBefore.split(/\r?\n/)
                                        .map(commentLine => commentLine.trimStart())
                                        .join(" ");
                    console.log('unwrapped version """', comment, '"""');
                    console.log('wrapped version """', wrap(comment), '"""');

                    tagInfo.comment = comment;
                }

                tags.push(tagInfo);
            }

            let text = "";
            for (let i = 0; i < tags.length; ++i) {
                const tagInfo = tags[i];

                if (tagInfo.comment !== undefined) {
                    if (i > 0) {
                        text += "\n";
                    }

                    text += "# ";
                    text += wrap(tagInfo.comment);
                    text += "\n";
                }

                text += tagInfo.name;
                text += ",\n";
            }

            console.log('text """', text, '"""');
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
