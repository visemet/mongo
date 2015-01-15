'use strict';

/**
 * collmod_separate_collections.js
 *
 * Generates some random data and inserts it into a collection with a
 * TTL index. Runs a collMod command to change the value of the
 * expireAfterSeconds setting to a random integer.
 *
 * Each thread updates a TTL index on a separate collection.
 */
load('jstests/concurrency/fsm_libs/extend_workload.js'); // for extendWorkload
load('jstests/concurrency/fsm_workloads/collmod.js'); // for $config
load('jstests/concurrency/fsm_workload_helpers/drop_utils.js'); // for dropCollections

var $config = extendWorkload($config, function($config, $super) {
    $config.data.prefix = 'collmod_separate_collections';

    $config.setup = function setup(db, collName) {
        this.threadCollName = this.prefix + '_' + this.tid;
        $super.setup.apply(this, arguments);
    };

    $config.teardown = function teardown(db, collName) {
        var pattern = new RegExp('^' + this.prefix + '_\\d+$');
        dropCollections(db, pattern);
        $super.teardown.apply(this, arguments);
    };

    return $config;
});
