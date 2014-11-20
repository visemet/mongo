/**
 * create_capped_collection.js
 *
 * Repeatedly creates a capped collection. Also verifies that truncation
 * occurs based once the collection reaches a certain size.
 */
var $config = (function() {

    var data = {
        // Use the workload name as a prefix for the collection name,
        // since the workload name is assumed to be unique.
        prefix: 'create_capped_collection'
    };

    var states = (function() {

        var options = {
            capped: true,
            size: 8192
        };

        function uniqueCollectionName(prefix, tid, num) {
            return prefix + tid + '_' + num;
        }

        // Returns a document of the form { _id: ObjectId(...), field: '...' }
        // with specified BSON size.
        function makeDocWithSize(targetSize) {
            var doc = { _id: new ObjectId(), field: '' };

            var size = Object.bsonsize(doc);
            assertAlways.gte(targetSize, size);

            // Set 'field' as string with 'targetSize - size + 1' characters
            doc.field = (new Array(targetSize - size + 1)).join('x');
            assertAlways.eq(targetSize, Object.bsonsize(doc));

            return doc;
        }

        // Inserts a document of a certain size into the specified collection
        // and returns it _id field.
        function insert(db, collName, targetSize) {
            var doc = makeDocWithSize(targetSize);

            var res = db[collName].insert(doc);
            assertAlways.eq(1, res.nInserted);

            return doc._id;
        }

        // Returns an array containing the _id field of all the documents
        // in the collection.
        function getObjectIds(db, collName) {
            return db[collName].find({}, { _id: 1 }).map(function(doc) {
                return doc._id;
            });
        }

        function init(db, collName) {
            this.num = 0;
        }

        // TODO: how to avoid having too many files open?
        function create(db, collName) {
            var myCollName = uniqueCollectionName(this.prefix, this.tid, this.num++);
            assertAlways.commandWorked(db.createCollection(myCollName, options));

            var largeDocSize = Math.floor(options.size / 2) - 1;
            var smallDocSize = Math.floor(options.size / 8) - 1;

            var ids = [];
            var count;

            ids.push(insert(db, myCollName, largeDocSize));
            ids.push(insert(db, myCollName, largeDocSize));

            assertWhenOwnDB.contains(db[myCollName].count(), [1, 2]);

            // Insert another large document and verify that at least one
            // truncation has occurred. There may be 1 or 2 documents in
            // the collection, depending on the storage engine, but they
            // should always be the most recently inserted documents.

            ids.push(insert(db, myCollName, largeDocSize));

            count = db[myCollName].count();
            assertWhenOwnDB.contains(count, [1, 2], 'expected truncate to occur');
            assertWhenOwnDB.eq(ids.slice(ids.length - count), getObjectIds(db, myCollName));

            // Insert multiple small documents and verify that at least one
            // truncation has occurred. There may be 4 or 5 documents in
            // the collection, depending on the storage engine, but they
            // should always be the most recently inserted documents.

            ids.push(insert(db, myCollName, smallDocSize));
            ids.push(insert(db, myCollName, smallDocSize));
            ids.push(insert(db, myCollName, smallDocSize));
            ids.push(insert(db, myCollName, smallDocSize));

            count = db[myCollName].count();
            assertWhenOwnDB.contains(count, [4, 5], 'expected truncate to occur');
            assertWhenOwnDB.eq(ids.slice(ids.length - count), getObjectIds(db, myCollName));
        }

        return {
            init: init,
            create: create
        };

    })();

    var transitions = {
        init: { create: 1 },
        create: { create: 1 }
    };

    var teardown = function(db, collName) {
        var pattern = new RegExp('^' + this.prefix);
        var res = db.runCommand('listCollections', { filter: { name: pattern } });
        assertAlways.commandWorked(res);

        res.collections.forEach(function(collInfo) {
            db[collInfo.name].drop();
        });
    }

    return {
        threadCount: 5,
        iterations: 20,
        data: data,
        states: states,
        transitions: transitions,
        teardown: teardown
    };

})();
