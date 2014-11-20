/**
 * agg_base.js
 *
 * Base workload for aggregation. Inserts a bunch of documents in its setup,
 * then each thread does an aggregation with an empty $match.
 */
var $config = (function() {

    var data = {
        numDocs: 1000,
        docSize: 12*1000
    };

    function padDoc(doc, size) {
        doc.padding = "";
        var paddingLength = size - Object.bsonsize(doc);
        assertAlways.lte(0, paddingLength,
                   "document is already bigger than " + size + ": " + tojson(doc));
        doc.padding = new Array(paddingLength + 1).join('x');
        assertAlways.eq(size, Object.bsonsize(doc));
        return doc;
    }

    function setup(db, collName) {
        // load example data
        // TODO: we also test bulk ops separately, but agg will run first because of alphabetical
        // order.
        //  - don't use bulk ops here?
        //  - fix the execution order?
        var bulk = db[collName].initializeUnorderedBulkOp();
        // note: call padDoc outsize the loop because allocating the padding string is slow
        var templateDoc = padDoc({
            flag: false,
            rand: Random.rand(),
            rand10: Random.randInt(10)
        }, this.docSize);
        for (var i = 0; i < this.numDocs; ++i) {
            bulk.insert({
                flag: i % 2 ? true : false,
                rand: Random.rand(),
                randInt: Random.randInt(12*1000),
                padding: templateDoc.padding
            });
        }
        var res = bulk.execute();
        assertWhenOwnColl.writeOK(res);
        assertWhenOwnColl.eq(this.numDocs, res.nInserted);
        assertWhenOwnColl.eq(this.numDocs, db[collName].count());
        assertWhenOwnColl.eq(this.numDocs / 2, db[collName].count({ flag: false }));
        assertWhenOwnColl.eq(this.numDocs / 2, db[collName].count({ flag: true }));
    }

    var states = {
        init: function init(db, collName) {
        },
        query: function query(db, collName) {
            var count = db[collName].aggregate([]).itcount();
            assertWhenOwnColl.eq(count, this.numDocs);
        }
    };

    var transitions = {
        init: { query: 1 },
        query: { query: 1 }
    };

    return {
        // using few threads and iterations because each operation is fairly expensive:
        // a collection scan with more data than most other workloads
        threadCount: 5,
        iterations: 10,
        states: states,
        transitions: transitions,
        data: data,
        setup: setup
    };
})();
