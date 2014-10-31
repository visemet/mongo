/** indexed_insert_multikey.js
 *
 * Inserts documents into an indexed collection and asserts that the documents appear in both a
 * collection scan and an index scan. The indexed value is a 10-element array of numbers.
 *
 */
load('jstests/parallel/libs/runner.js'); // for parseConfig
load('jstests/parallel/workloads/indexed_insert_base.js');

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);

        this.indexedValue = [0,1,2,3,4,5,6,7,8,9].map(function(n) {
            return this.tid * 10 + n;
        }.bind(this));
    };

    $config.threadCount = 8;

    return $config;
});
