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
                     *   # multi-line < . . . . . . . . . . . . . . . . . . . . . . . filler text >
                     *   # comment for tags2
                     *   tag2,
                     * ]
                     */
                }).toString()
        },

        {
          code: (function blockCommentSpanningMultipleLinesWithHeaderComment() {
                    /**
                     * This comment is unrelated to the tags.
                     *
                     * @tags: [
                     *   tag1,
                     *   tag2,
                     * ]
                     */
                }).toString()
        },

        {
          code: (function lineCommentSpanningMultipleLines() {
                    //
                    // @tags: [
                    //   tag1,
                    //   tag2,
                    // ]
                    //
                }).toString()
        },

        {
          code: (function lineCommentSpanningMultipleLinesWithInlineComments() {
                    //
                    // @tags: [
                    //   # comment for tags1
                    //   tag1,
                    //
                    //   # multi-line < . . . . . . . . . . . . . . . . . . . . . . . filler text >
                    //   # comment for tags2
                    //   tag2,
                    // ]
                    //
                }).toString()
        },
    ],

    invalid: [
        {
          code:  //
              (function missingSpaceBetweenTags() {
                  /**
                   * @tags: [tag1,tag2]
                   */
              }).toString(),

          errors: 1,
          output:  //
              (function missingSpaceBetweenTags() {
                  /**
                   * @tags: [
                   *   tag1,
                   *   tag2,
                   * ]
                   */
              }).toString()
        },

        {
          code:  //
              (function missingSpaceBetweenTagsWithSurroundingComments() {
                  /**
                   * This comment is unrelated to the tags.
                   *
                   * @tags: [tag1,tag2]
                   *
                   * This comment is also unrelated to the tags.
                   */
              }).toString(),

          errors: 1,
          output:  //
              (function missingSpaceBetweenTagsWithSurroundingComments() {
                  /**
                   * This comment is unrelated to the tags.
                   *
                   * @tags: [
                   *   tag1,
                   *   tag2,
                   * ]
                   *
                   * This comment is also unrelated to the tags.
                   */
              }).toString()
        },

        {
          code:  //
              (function missingTrailingComma() {
                  //
                  // @tags: [
                  //   tag1,
                  //   tag2
                  // ]
                  //
              }).toString(),

          errors: 1,
          output:  //
              (function missingTrailingComma() {
                  //
                  // @tags: [
                  //   tag1,
                  //   tag2,
                  // ]
                  //
              }).toString()
        },

        {
          code:  //
              (function missingTrailingCommaWithSurroundingComments() {
                  // This comment is unrelated to the tags.
                  //
                  // @tags: [
                  //   tag1,
                  //   tag2
                  // ]
                  //
                  // This comment is also unrelated to the tags.
              }).toString(),

          errors: 1,
          output:  //
              (function missingTrailingCommaWithSurroundingComments() {
                  // This comment is unrelated to the tags.
                  //
                  // @tags: [
                  //   tag1,
                  //   tag2,
                  // ]
                  //
                  // This comment is also unrelated to the tags.
              }).toString()
        },

        {
          code:  //
              (function addingTag2() {
                  /**
                   * @tags: [
                   *   tag1,
                   *   tag3,
                   * ]
                   */
              }).toString(),
          options: [{$_internalAddTag: {tag: "tag2"}}],

          errors: 1,
          output:  //
              (function addingTag2() {
                  /**
                   * @tags: [
                   *   tag1,
                   *   tag2,
                   *   tag3,
                   * ]
                   */
              }).toString()
        },

        {
          code:  //
              (function addingTag2WithAComment() {
                  /**
                   * @tags: [
                   *   tag1,
                   *   tag3,
                   * ]
                   */
              }).toString(),
          options: [{$_internalAddTag: {tag: "tag2", comment: "This is a comment for tag2."}}],

          errors: 1,
          output:  //
              (function addingTag2WithAComment() {
                  /**
                   * @tags: [
                   *   tag1,
                   *
                   *   # This is a comment for tag2.
                   *   tag2,
                   *   tag3,
                   * ]
                   */
              }).toString()
        },
    ],
});
