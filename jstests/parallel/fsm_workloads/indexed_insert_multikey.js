'use strict';

/**
 * indexed_insert_multikey.js
 *
 * Inserts multiple documents into an indexed collection. Asserts that all
 * documents appear in both a collection scan and an index scan. The indexed
 * value is an array of numbers.
 */
load('jstests/parallel/fsm_libs/extend_workload.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function init(db, collName) {
        $super.states.init.apply(this, arguments);

        this.indexedValue = [0,1,2,3,4,5,6,7,8,9].map(function(n) {
            return this.tid * 10 + n;
        }.bind(this));
    };

    return $config;
});
