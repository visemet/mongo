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
        assertAlways.eq(0, res.nUpserted, tojson(res));
        assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
        if (db.getMongo().writeMode() === 'commands') {
            assertWhenOwnColl.contains(res.nModified, [0, 1], tojson(res));
        }
    }

    function setOrUnset(db, collName, set) {
            // choose a doc and value to use in the update
            var docIndex = Random.randInt(this.numDocs);
            var value = Random.randInt(5);

            var updater = {};
            updater[set ? '$set' : '$unset'] = { value: value };

            var res = db[collName].update({ n: docIndex }, updater);
            assertResult(res);
    }

    var states = {
        set: function set(db, collName) {
            setOrUnset(db, collName, true);
        },
        unset: function unset(db, collName) {
            setOrUnset(db, collName, false);
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

    var threadCount = 50;
    return {
        threadCount: threadCount,
        iterations: 100,
        startState: 'set',
        states: states,
        transitions: transitions,
        data: {
            // numDocs should be much less than threadCount, to make more threads use the same docs
            numDocs: Math.floor(threadCount / 10)
        },
        setup: setup
    };

})();
