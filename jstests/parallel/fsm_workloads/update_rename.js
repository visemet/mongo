/* update_rename.js
 *
 * Each thread does a $rename to cause documents to jump between indexes.
 *
 */
var $config = (function() {

    function doRename(db, collName, from, to) {
        var updater = { $rename: {} };
        updater.$rename[from] = to;

        var res = db[collName].update({}, updater);
        if (db.getMongo().writeMode() === "commands") {
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
            assertWhenOwnColl(res.nModified === 0 || res.nModified === 1, tojson(res));
        }
    }

    var fieldNames = ['x', 'y', 'z'];

    function choose(array) {
        return array[Random.randInt(array.length)];
    }

    var states = {
        update: function update(db, collName) {
            var from = choose(fieldNames);
            var to   = choose(fieldNames.filter(function(n) { return n !== from; }));
            doRename(db, collName, from, to);
        }
    };

    var transitions = {
        update: { update: 1 }
    };

    function setup(db, collName) {
        db[collName].ensureIndex({ x: 1 });
        db[collName].ensureIndex({ y: 1 });
        for (var i = 0; i < this.numDocs; ++i) {
            var fieldName = fieldNames[i % 3];
            var doc = {};
            doc[fieldName] = i;
            db[collName].insert(doc);
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
