/* update_multifield.js
 *
 * Does updates that affect multiple fields on a single document.
 * The collection has an index for each field, and a multikey index for all fields.
 *
 */
var $config = (function() {

    // returns an update doc
    function makeRandomUpdateDoc() {
        var x = Random.randInt(5);
        var y = Random.randInt(5);
        var z = Random.randInt(5) + 1;
        var set = Random.rand() > 0.5;
        var push = Random.rand() > 0.2;

        var updateDoc = {};
        updateDoc[set ? '$set' : '$unset'] = { x: x };
        updateDoc[push ? '$push' : '$pull'] = { y: y };
        updateDoc.$inc = { z: z };

        return updateDoc;
    }

    var states = {
        update: function update(db, collName) {
            // choose a doc to update
            var docIndex = Random.randInt(this.numDocs);

            // choose an update to apply
            var updateDoc = makeRandomUpdateDoc();

            // apply this update
            var res = db[collName].update(this.multi ? {} : { n: docIndex }, updateDoc, { multi: this.multi });
            this.assertResult(res);
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

    var threadCount = 50;
    return {
        threadCount: threadCount,
        iterations: 100,
        startState: 'update',
        states: states,
        transitions: transitions,
        data: {
            jssertResult: function(res) {
                assertAlways.eq(0, res.nUpserted, tojson(res));
                assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
                if (db.getMongo().writeMode() === 'commands') {
                    assertWhenOwnColl.eq(1, res.nModified, tojson(res));
                }
            },
            multi: false,
            // numDocs should be much less than threadCount, to make more threads use the same docs
            numDocs: Math.floor(threadCount / 5)
        },
        setup: setup
    };

})();
