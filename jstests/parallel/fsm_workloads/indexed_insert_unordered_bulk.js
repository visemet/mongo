'use strict';

/**
 * indexed_insert_unordered_bulk.js
 *
 * Inserts multiple documents into an indexed collection. Asserts that all
 * documents appear in both a collection scan and an index scan.
 *
 * Uses an unordered, bulk operation to perform the inserts.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.insert = function insert(db, collName) {
        var doc = {};
        doc[this.indexedField] = this.indexedValue;

        var bulk = db[collName].initializeUnorderedBulkOp();
        for (var i = 0; i < this.docsPerInsert; ++i) {
            bulk.insert(doc);
        }
        assertWhenOwnColl.writeOK(bulk.execute());

        this.nInserted += this.docsPerInsert;
    };

    $config.data.docsPerInsert = 15;

    return $config;
});
