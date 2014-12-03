'use strict';

/**
 * indexed_insert_compound.js
 *
 * Inserts documents into an indexed collection and asserts that the documents
 * appear in both a collection scan and an index scan. The collection is indexed
 * with a compound index on three different fields.
 */
load('jstests/parallel/fsm_libs/extend_workload.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function init(db, collName) {
        $super.states.init.apply(this, arguments);
    };

    $config.data.getDoc = function getDoc() {
        return {
            compound_x: this.tid & 0x0f, // lowest 4 bits
            compound_y: this.tid >> 4,   // high bits
            compound_z: String.fromCharCode(33 + this.tid)
        };
    };

    $config.data.getIndexSpec = function getIndexSpec() {
        return { compound_x: 1, compound_y: 1, compound_z: 1 };
    };

    return $config;
});
