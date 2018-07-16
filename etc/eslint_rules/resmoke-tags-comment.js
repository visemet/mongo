/**
 * @fileoverview Enforces empty lines around comments.
 * @author Jamund Ferguson
 * @copyright 2015 Mathieu M-Gosselin. All rights reserved.
 * @copyright 2015 Jamund Ferguson. All rights reserved.
 * @copyright 2015 Gyandeep Singh. All rights reserved.
 */
"use strict";

// The LINEBREAK_MATCHER constant is copied from v5.1.0 of the ast-utils library.
const LINEBREAK_MATCHER = /\r\n|[\r\n\u2028\u2029]/;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Gets a list of comment lines in a group
 * @param {Token[]} commentGroup A group of comments, containing either multiple line comments or a
 *                               single block comment
 * @returns {string[]} A list of comment lines
 */
function getCommentLines(commentGroup) {
    if (commentGroup[0].type === "Line") {
        return commentGroup.map(comment => comment.value);
    }
    return commentGroup[0].value.split(LINEBREAK_MATCHER).map(line => line.replace(/^\s*\*?/, ""));
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {

    schema: [{
        "type": "object",
        "additionalProperties": false,
    }],

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    create(context) {
        function checkCommentGroup(commentGroup) {
            const commentLines = getCommentLines(commentGroup);
            console.log(commentLines);
        }

        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getAllComments();

        return {

            Program() {
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
