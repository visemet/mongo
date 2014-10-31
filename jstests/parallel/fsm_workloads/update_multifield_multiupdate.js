/* update_multifield_multiupdate.js
 *
 * Does updates that affect multiple fields on a single document.
 * The collection has an index for each field, and a multikey index for all fields.
 *
 */
var $config = (function() {

    // returns an update doc
    function chooseUpdate(whichDoc) {
        var xvalue = Random.randInt(5);
        var yvalue = Random.randInt(5);
        var zvalue = Random.randInt(5);
        var set = Random.rand() > 0.5;
        var push = Random.rand() > 0.2;
        var updateDoc = {};
        updateDoc[set ? '$set' : '$unset'] = { x: xvalue };
        updateDoc[push ? '$push' : '$pull'] = { y: yvalue };
        updateDoc.$inc = { z: zvalue };

        return updateDoc;
    }

    function assertResult(res) {
        if (db.getMongo().writeMode() === "commands") {
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
            assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
        }
    }

    var states = {
        update: function update(db, collName) {
            // choose a doc to update
            var whichDoc = Random.randInt(this.numDocs);

            // choose an update to apply
            var updateDoc = chooseUpdate.call(this, whichDoc);

            // apply the update
            var res = db[collName].update({ n: whichDoc }, updateDoc, { multi: true });
            assertResult(res);
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
        iterations: 100,
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
