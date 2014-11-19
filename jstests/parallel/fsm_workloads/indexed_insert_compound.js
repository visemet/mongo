/**
 * indexed_insert_compound.js
 *
 * Inserts documents into an indexed collection and asserts that the documents appear in both a
 * collection scan and an index scan. The indexed value is a 1-character string based on the thread
 * id.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);

        this.indexedValue = String.fromCharCode(33 + this.tid);
    };

    $config.data.getDoc = function() {
        return {
            x: this.indexedValue,
            y: this.indexedValue,
            z: this.indexedValue
        };
    };

    $config.data.getIndexSpec = function() {
        return {
            x: 1,
            y: 1,
            z: 1
        };
    };

    return $config;
});
