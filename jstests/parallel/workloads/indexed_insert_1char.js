/** indexed_insert_1char.js
 *
 * Inserts documents into an indexed collection and asserts that the documents appear in both a
 * collection scan and an index scan. The indexed value is a 1-character string based on the thread
 * id.
 *
 */
load('jstests/parallel/libs/runner.js'); // for parseConfig
load('jstests/parallel/workloads/indexed_insert_base.js');

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);

        this.indexedValue = String.fromCharCode(33 + this.tid);
    };

    return $config;
});
