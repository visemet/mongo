/** indexed_insert_unordered_bulk.js
 *
 * Inserts several documents, using unordered bulk inserts, into an indexed collection and asserts
 * that the documents appear in both a collection scan and an index scan.
 */
load('jstests/parallel/libs/runner.js'); // for extendWorkload
load('jstests/parallel/workloads/indexed_insert_base.js');

var $config = extendWorkload($config, function($config, $super) {

    $config.states.insert = function(db, collName) {
        var doc = {};
        doc[this.indexedField] = this.indexedValue;

        var bulk = db[collName].initializeUnorderedBulkOp();
        for (var i = 0; i < this.docsPerInsert; ++i) {
            bulk.insert(doc);
        }
        assertWhenOwnColl.writeOK(bulk.execute());

        this.nInserted += this.docsPerInsert;
    };

    $config.data.docsPerInsert = 15;

    return $config;
});
