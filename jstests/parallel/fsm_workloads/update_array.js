/* update_array.js
 *
 * Each thread does a $push or $pull on a random doc, pushing or pulling its tid.
 *
 */
var $config = (function() {

    var states = (function() {
        // res: WriteResult
        // nModifiedPossibilities: array of allowed values for res.nModified
        function assertUpdateSuccess(res, nModifiedPossibilities) {
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched,  tojson(res));
            if (db.getMongo().writeMode() === 'commands') {
                assertWhenOwnColl.contains(res.nModified, nModifiedPossibilities, tojson(res));
            }
        }
        function doPush(db, collName, docIndex, value) {
            var res = db[collName].update({ n: docIndex }, { $push: { arr: value } });

            // assert the update reported success
            assertUpdateSuccess(res, [1]);

            // find the doc and make sure it was updated
            var doc = db[collName].findOne({ n: docIndex });
            assertWhenOwnColl.contains(value, doc.arr,
                                       'doc.arr doesni\'t contain value (' + value + ') after $push: ' +
                                       tojson(doc.arr));
        }

        function doPull(db, collName, docIndex, value) {
            var res = db[collName].update({ n: docIndex }, { $pull: { arr: value } });

            // assert the update reported success
            assertUpdateSuccess(res, [0, 1]);

            // find the doc and make sure it was updated
            var doc = db[collName].findOne({ n: docIndex });
            assertWhenOwnColl.eq(-1, doc.arr.indexOf(value),
                                 'doc.arr contains removed value (' + value + ') after $pull: ' +
                                 tojson(doc.arr));
        }

        return {
            init: function(db, collName) {
                // noop
            },
            push: function(db, collName) {
                var docIndex = Random.randInt(this.numDocs);
                var value = this.tid;

                doPush(db, collName, docIndex, value);
            },
            pull: function(db, collName) {
                var docIndex = Random.randInt(this.numDocs);
                var value = this.tid;

                doPull(db, collName, docIndex, value);
            }
        };
    })();

    var transitions = {
        init: {
            push: 0.8,
            pull: 0.2
        },
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
        states: states,
        transitions: transitions,
        data: {
            numDocs: 10
        },
        setup: setup
    };

})();
