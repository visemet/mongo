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

    function assertResult(res) {
        if (db.getMongo().writeMode() === "commands") {
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
            assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
        }
    }

    var states = {
        set: function set(db, collName) {
            // choose a doc and value to use in the update
            var whichDoc = Random.randInt(this.numDocs);
            var value = Random.randInt(5);

            var res = db[collName].update({ n: whichDoc }, { '$set': { value: value } });
            assertResult(res);
        },
        unset: function unset(db, collName) {
            // choose a doc and value to use in the update
            var whichDoc = Random.randInt(this.numDocs);
            var value = Random.randInt(5);

            var res = db[collName].update({ n: whichDoc }, { '$unset': { value: value } });
            assertResult(res);
        }
    };

    var transitions = {
        set: {
            set: 0.5,
            unset: 0.5
        },
        unset: {
            set: 0.5,
            unset: 0.5
        }
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
        iterations: 100,
        startState: 'set',
        states: states,
        transitions: transitions,
        data: {
            // numDocs should be much less than threadCount, to make more threads use the same docs
            numDocs: 10
        },
        setup: setup
    };

})();
