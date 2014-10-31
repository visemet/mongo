/** indexed_insert_array_bulk.js
 *
 * Inserts several documents, by passing an array to insert, into an indexed collection and asserts
 * that the documents appear in both a collection scan and an index scan.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.insert = function(db, collName) {
        var doc = {};
        doc[this.indexedField] = this.indexedValue;

        var docs = [];
        for (var i = 0; i < this.docsPerInsert; ++i) {
            docs.push(doc);
        }
        assertWhenOwnColl.writeOK(db[collName].insert(docs));

        this.nInserted += this.docsPerInsert;
    };

    $config.data.docsPerInsert = 15;

    return $config;
});
