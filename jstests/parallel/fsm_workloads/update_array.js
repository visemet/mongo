/* update_array.js
 *
 * Each thread does a $push or $pull on a random doc, pushing or pulling its tid.
 *
 */
var $config = (function() {

    function assertResult(res) {
        if (db.getMongo().writeMode() === "commands") {
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
            assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
        }
    }

    function doPush(db, collName, whichDoc, value) {
        var res = db[collName].update({ n: whichDoc }, { '$push': { arr: value } });
        assertResult(res);

        // find the doc and make sure it was updated
        var doc = db[collName].findOne({ n: whichDoc });
        assertWhenOwnColl.contains(value, doc.arr,
                                   "doc.arr doesn't contain value (" + value + ") after $push: " +
                                   tojson(doc.arr));

        // try to assert doc is in the index
        var indexedDocs = db[collName].find({ arr: value }).toArray().filter(function(d) {
            return d._id.equals(doc._id);
        });
        assertWhenOwnColl.eq(1, indexedDocs.length);
    }

    function doPull(db, collName, whichDoc, value) {
        var res = db[collName].update({ n: whichDoc }, { '$pull': { arr: value } });
        assertResult(res);

        // find the doc and make sure it was updated
        var doc = db[collName].findOne({ n: whichDoc });
        assertWhenOwnColl.eq([], doc.arr.filter(function(v) { return v === value; }),
                             "doc.arr contains removed value (" + value + ") after $pull: " +
                             tojson(doc.arr));

        // try to assert doc is not in the index
        var indexedDocs = db[collName].find({ arr: value }).toArray().filter(function(d) {
            return d._id.equals(doc._id);
        });
        assertWhenOwnColl.eq(0, indexedDocs.length);
    }

    var states = {
        push: function(db, collName) {
            var whichDoc = Random.randInt(this.numDocs);
            var value = this.tid;

            doPush(db, collName, whichDoc, value);
        },
        pull: function(db, collName) {
            var whichDoc = Random.randInt(this.numDocs);
            var value = this.tid;

            doPull(db, collName, whichDoc, value);
        }
    };

    var transitions = {
        push: {
            push: 0.8,
            pull: 0.2
        },
        pull: {
            push: 0.8,
            pull: 0.2
        }
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
        iterations: 100,
        startState: 'push',
        states: states,
        transitions: transitions,
        data: {
            numDocs: 10
        },
        setup: setup
    };

})();
