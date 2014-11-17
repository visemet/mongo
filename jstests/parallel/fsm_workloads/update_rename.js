/* update_rename.js
 *
 * Each thread does a $rename to cause documents to jump between indexes.
 *
 */
var $config = (function() {

    var fieldNames = ['x', 'y', 'z'];

    function choose(array) {
        assert.gt(array.length, 0, 'can\'t choose an element of an empty array');
        return array[Random.randInt(array.length)];
    }

    var states = {
        update: function update(db, collName) {
            var from = choose(fieldNames);
            var to   = choose(fieldNames.filter(function(n) { return n !== from; }));
            var updater = { $rename: {} };
            updater.$rename[from] = to;

            var query = {};
            query[from] = { $exists: 1 };

            var res = db[collName].update(query, updater);

            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.contains(res.nMatched, [0, 1],  tojson(res));
            if (db.getMongo().writeMode() === 'commands') {
                assertWhenOwnColl.eq(res.nMatched, res.nModified, tojson(res));
            }
        }
    };

    var transitions = {
        update: { update: 1 }
    };

    function setup(db, collName) {
        // create an index on every fieldName except the first one.
        fieldNames.slice(1).forEach(function(fieldName) {
            var indexSpec = {};
            indexSpec[fieldName] = 1;
            db[collName].ensureIndex(indexSpec);
        });

        for (var i = 0; i < this.numDocs; ++i) {
            var fieldName = fieldNames[i % fieldNames.length];
            var doc = {};
            doc[fieldName] = i;
            db[collName].insert(doc);
        }
    }

    var threadCount = 50;
    return {
        threadCount: threadCount,
        iterations: 100,
        startState: 'update',
        states: states,
        transitions: transitions,
        data: {
            // numDocs should be much less than threadCount, to make more threads use the same docs
            numDocs: Math.floor(threadCount / 10)
        },
        setup: setup
    };

})();
