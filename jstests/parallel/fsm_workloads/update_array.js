/* update_array.js
 *
 * Creates several docs. On each iteration, each thread chooses:
 *  - a random doc to update
 *  - whether to $push or $pull
 *  - a value to $push or $pull
 * After doing the update, each thread does some reads to assert that the update happened.
 *
 */
var $config = (function() {

    var states = {
        update: function update(db, collName) {
            // choose a doc and value to use in the update
            var whichDoc = Math.floor(Random.rand() * this.numDocs);
            // keep the cardinality of 'value' low, to make it likely that we'll pull values that
            // are actually present in the array
            var value = Math.floor(Random.rand() * 5);

            // choose whether to $push or $pull the field
            // but make push more likely, so we actually get arrays with several items on average
            var push = Random.rand() > 0.2;
            var updateDoc = {};
            updateDoc[push ? '$push' : '$pull'] = { arr: value };

            var res = db[collName].update({ n: whichDoc }, updateDoc);
            if (db.getMongo().writeMode() === "commands") {
                assertAlways.eq(0, res.nUpserted, tojson(res));
                assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
                assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
            }

            // find the doc and make sure it was updated
            var doc = db[collName].findOne({ n: whichDoc });
            if (push) {
                assertWhenOwnColl.contains(value, doc.arr,
                                           "doc.arr doesn't contain value (" +
                                           value + ") after $push: " + tojson(doc.arr));
            } else {
                assertWhenOwnColl.eq([], doc.arr.filter(function(v) { return v === value; }),
                                     "doc.arr contains removed value (" +
                                     value + ") after $pull: " + tojson(doc.arr));
            }
            // try to assert doc is in the index
            var indexedDocs = db[collName].find({ arr: value }).toArray().filter(function(d) {
                return d._id.equals(doc._id);
            });
            assertWhenOwnColl.eq(1, indexedDocs.length);
        }
    };

    var transitions = {
        update: { update: 1 }
    };

    function setup(db, collName) {
        // index on 'arr', the field being updated
        db[collName].ensureIndex({ arr: 1 });
        for (var i = 0; i < this.numDocs; ++i) {
            db[collName].insert({ n: i });
        }
    }

    return {
        threadCount: 50,
        iterations: 500,
        startState: 'update',
        states: states,
        transitions: transitions,
        data: {
            numDocs: 10
        },
        setup: setup
    };

})();
