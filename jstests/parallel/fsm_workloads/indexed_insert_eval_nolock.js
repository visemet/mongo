'use strict';

/**
 * indexed_insert_eval_nolock.js
 *
 * Inserts multiple documents into an indexed collection using the eval command
 * with the option { nolock: true }. Asserts that all documents appear in both a
 * collection scan and an index scan.  The indexed value is the thread id.
 */
load('jstests/parallel/fsm_libs/extend_workload.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_eval.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.data.nolock = true;

    // scale up the number of iterations since we're not holding the global lock
    $config.iterations = 100;

    return $config;
});
