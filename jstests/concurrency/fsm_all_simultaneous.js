'use strict';

load('jstests/concurrency/fsm_libs/runner.js');

var dir = 'jstests/concurrency/fsm_workloads';

var blacklist = [
    // Disabled due to MongoDB restrictions and/or workload restrictions

    // These workloads implcitly assume that their tid range is [0, $config.threadCount). This isn't
    // guaranteed to be true when they are run in parallel with other workloads.
    'list_indexes.js',
    'update_inc_capped.js',

    // indexed_insert_base_capped.js sometimes fails due to "CappedPositionLost CollectionScan died
    // due to position in capped collection being deleted" when run with worklaods that cause the
    // server to trigger more frequently yielding.
    'indexed_insert_base_capped',
].map(function(file) { return dir + '/' + file; });

// SERVER-16196 re-enable executing workloads
runWorkloadsInParallel(ls(dir).filter(function(file) {
    return !Array.contains(blacklist, file);
}));
