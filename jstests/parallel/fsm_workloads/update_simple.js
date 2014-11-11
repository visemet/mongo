/* update_simple.js
 *
 * Creates several docs. On each iteration, each thread chooses:
 *  - a random doc
 *  - whether to $set or $unset its field
 *  - what value to $set the field to
 * After performing the update, each thread does some reads to assert that the update happened.
 *
 */
var $config = (function() {

    var states = {
        update: function update(db, collName) {
            // choose a doc and value to use in the update
            var whichDoc = Math.floor(Random.rand() * this.numDocs);
            var value = Math.floor(Random.rand() * 5);

            // choose whether to $set or $unset the field
            var set = Random.rand() > 0.5;
            var updateDoc = {};
            updateDoc[set ? '$set' : '$unset'] = { value: value };

            var res = db[collName].update({ n: whichDoc }, updateDoc);
            if (db.getMongo().writeMode() === "commands") {
                assertAlways.eq(0, res.nUpserted, tojson(res));
                assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
                assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
            }

            // find the doc
            var doc = db[collName].findOne({ n: whichDoc });
            if (set) {
                assertWhenOwnColl.contains('value', Object.keys(doc),
                                           "doc.value not present after $set");
                assertWhenOwnColl.eq(value, doc.value,
                                     "doc.value has wrong value after $set: " + tojson(doc));
            } else { // unset
                assertWhenOwnColl.eq(undefined, doc.value,
                                     "doc.value present after $unset: " + tojson(doc));
            }
            // make sure doc is present by (what is hopefully) an index lookup
            var indexedDocs = db[collName].find({ value: value }).toArray().filter(function(d) {
                return d._id.equals(doc._id);
            });
            assertWhenOwnColl.eq(1, indexedDocs);
        }
    };

    var transitions = {
        update: { update: 1 }
    };

    function setup(db, collName) {
        // index on 'value', the field being updated
        db[collName].ensureIndex({ value: 1 });
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
            // numDocs should be much less than threadCount, to make more threads use the same docs
            numDocs: 10
        },
        setup: setup
    };

})();
