/**
 * @fileoverview Test enforcement of lines around comments.
 * @author Jamund Ferguson
 * @copyright 2015 Mathieu M-Gosselin. All rights reserved.
 * @copyright 2015 Jamund Ferguson. All rights reserved.
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../resmoke-tags-comment");
var RuleTester = require("eslint/lib/testers/rule-tester");

var afterMessage = "Expected line after comment.", beforeMessage = "Expected line before comment.";

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("resmoke-tags-comment", rule, {

    valid: [

        {
          code: (function basicBlockComment() {
                    /**
                     * @tags: [tag1, tag2]
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
