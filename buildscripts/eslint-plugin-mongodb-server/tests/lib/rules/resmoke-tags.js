/**
 * @fileoverview Enforce a particular style and formatting for resmoke.py tags.
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require("../../../lib/rules/resmoke-tags");
const RuleTester = require("eslint").RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run("resmoke-tags", rule, {

    valid: [
        {
          code: (function basicBlockComment() {
                    /**
                     * @tags: [tag1, tag2]
                     */
                }).toString()
        },

        {
          code: (function blockCommentSpanningMultipleLines() {
                    /**
                     * @tags: [
                     *   tag1,
                     *   tag2,
                     * ]
                     */
                }).toString()
        },

        {
          code: (function blockCommentSpanningMultipleLinesWithInlineComments() {
                    /**
                     * @tags: [
                     *   # comment for tags1
                     *   tag1,
                     *
                     *   # multi-line
                     *   # comment for tags2
                     *   tag2,
                     * ]
                     */
                }).toString()
        },

        {
          code: (function basicLineComment() {
                    //
                    // @tags: [tag1, tag2]
                    //
                }).toString()
        }
    ],

    invalid: [],
});
