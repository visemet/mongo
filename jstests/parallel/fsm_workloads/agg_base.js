/**
 * agg_base.js
 *
 * Base workload for aggregation. Inserts a bunch of documents in its setup,
 * then each thread does an aggregation with an empty $match.
 */
var $config = (function() {

    var data = {
        numDocs: 1000,
        // Use 12KB documents by default. This number is useful because 12,000 documents each of
        // size 12KB take up more than 100MB in total, an 100MB is the in-memory limit for $sort and
        // $group.
        docSize: 12*1000
    };

    var getStringOfLength = (function() {
        var cache = {};
        return function getStringOfLength(size) {
            if (!cache[size]) {
                cache[size] = new Array(size + 1).join('x');
            }
            return cache[size];
        }
    })();
    function padDoc(doc, size) {
        doc.padding = "";
        var paddingLength = size - Object.bsonsize(doc);
        assertAlways.lte(0, paddingLength,
                   "document is already bigger than " + size + ": " + tojson(doc));
        doc.padding = getStringOfLength(paddingLength);
        assertAlways.eq(size, Object.bsonsize(doc));
        return doc;
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

    function setup(db, collName) {
        // load example data
        // TODO: we also test bulk ops separately, but agg will run first because of alphabetical
        // order.
        //  - don't use bulk ops here?
        //  - fix the execution order?
        var bulk = db[collName].initializeUnorderedBulkOp();
        for (var i = 0; i < this.numDocs; ++i) {
            // note: padDoc caches the large string after allocating it once, so it's ok to call
            // in this loop
            bulk.insert(padDoc({
                flag: i % 2 ? true : false,
                rand: Random.rand(),
                randInt: Random.randInt(this.numDocs)
            }, this.docSize));
        }
        var res = bulk.execute();
        assertWhenOwnColl.writeOK(res);
        assertWhenOwnColl.eq(this.numDocs, res.nInserted);
        assertWhenOwnColl.eq(this.numDocs, db[collName].find().itcount());
        assertWhenOwnColl.eq(this.numDocs / 2, db[collName].find({ flag: false }).itcount());
        assertWhenOwnColl.eq(this.numDocs / 2, db[collName].find({ flag: true }).itcount());
    }

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
