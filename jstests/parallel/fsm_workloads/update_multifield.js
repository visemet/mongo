/* update_multifield.js
 *
 * Does updates that affect multiple fields on a single document.
 * The collection has an index for each field, and a multikey index for all fields.
 *
 */
var $config = (function() {

    var states = {
        update: function update(db, collName) {
            // choose a doc to update
            var whichDoc = Math.floor(Random.rand() * this.numDocs);

            // choose an update to apply
            var xvalue = Math.floor(Random.rand() * 5);
            var yvalue = Math.floor(Random.rand() * 5);
            var zvalue = Math.floor(Random.rand() * 5);
            var set = Random.rand() > 0.5;
            var push = Random.rand() > 0.2;
            var updateDoc = {};
            updateDoc[set ? '$set' : '$unset'] = { x: xvalue };
            updateDoc[push ? '$push' : '$pull'] = { y: yvalue };
            updateDoc.$inc = { z: zvalue };

            var res = db[collName].update({ n: whichDoc }, updateDoc);
            if (db.getMongo().writeMode() === "commands") {
                assertAlways.eq(0, res.nUpserted, tojson(res));
                assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
                assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
            }

            // find the doc and assert the update happened
            var doc = db[collName].findOne({ n: whichDoc });

            if (set) {
                assertWhenOwnColl.contains('x', Object.keys(doc),
                                           "doc.x not present after $set");
                assertWhenOwnColl.eq(xvalue, doc.x,
                                     "doc.x has wrong value after $set: " + tojson(doc));
            } else { // unset
                assertWhenOwnColl.eq(undefined, doc.x,
                                     "doc.x present after $unset: " + tojson(doc));
            }

            if (push) {
                assertWhenOwnColl.contains(yvalue, doc.y,
                                           "doc.y doesn't contain yvalue (" +
                                           yvalue + ") after $push: " + tojson(doc.y));
            } else {
                assertWhenOwnColl.eq([], doc.y.filter(function(v) { return v === yvalue; }),
                                     "doc.y contains removed yvalue (" +
                                     yvalue + ") after $pull: " + tojson(doc.y));
            }

            assertWhenOwnColl.contains('z', Object.keys(doc),
                                       "doc.z not present after $inc");

            // make sure doc is present by (what is hopefully) an index lookup on each index
            var sameDoc = function(d) { return d._id.equals(doc._id); };
            var queryX = { x: xvalue };
            var queryY = { y: yvalue };
            var queryZ = { z: { $exists: 1 } };
            var queryAll = { x: xvalue, y: yvalue, z: { $exists: 1 } };
            assertWhenOwnColl.eq(1, db[collName].find(queryX).toArray().filter(sameDoc).length);
            assertWhenOwnColl.eq(1, db[collName].find(queryY).toArray().filter(sameDoc).length);
            assertWhenOwnColl.eq(1, db[collName].find(queryZ).toArray().filter(sameDoc).length);
            assertWhenOwnColl.eq(1, db[collName].find(queryAll).toArray().filter(sameDoc).length);

        }
    };

    var transitions = {
        update: { update: 1 }
    };

    function setup(db, collName) {
        db[collName].ensureIndex({ x: 1 });
        db[collName].ensureIndex({ y: 1 });
        db[collName].ensureIndex({ z: 1 });
        db[collName].ensureIndex({ x: 1, y: 1, z: 1 });
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
