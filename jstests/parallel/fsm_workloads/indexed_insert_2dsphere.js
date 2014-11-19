/**
 * indexed_insert_2dsphere.js
 *
 * Inserts documents into an indexed collection and asserts that the documents appear in both a
 * collection scan and an index scan. The indexed value is a 2-element array of numbers, indexed
 * with a 2dsphere index.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);

        // assume fewer than 180*180 = 32400 threads, so we can assign each thread to a
        // point
        assertAlways.lt(this.tid, 180*180);
        this.indexedValue = [Math.floor(this.tid / 180), this.tid % 180];
    };

    $config.data.getIndexSpec = function() {
        var ix = {};
        ix[this.indexedField] = '2dsphere';
        return ix;
    };

    return $config;
});
