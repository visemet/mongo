'use strict';

/**
 * remove_single_document.js
 *
 * Repeatedly remove a document from the collection.
 */
var $config = (function() {

    var states = {
        remove: function remove(db, collName) {
            // try removing a random document
            var res = db[collName].remove({ rand: { $gte: Random.rand() } }, { justOne: true });
            assertAlways.lte(res.nRemoved, 1);
            if (res.nRemoved === 0) {
                // if that fails, try removing an arbitrary document
                res = db[collName].remove({}, { justOne: true });
                assertAlways.lte(res.nRemoved, 1);
            }
            // when running on its own collection, this iteration should remove exactly one document
            assertWhenOwnColl.writeOK(res);
            assertWhenOwnColl.eq(1, res.nRemoved);
        }
    };

    var transitions = {
        remove: { remove: 1 }
    };

    var threadCount = 30;
    var iterations = 100;

    function setup(db, collName) {
        // insert enough documents so that each thread can remove exactly one per iteration
        var num = threadCount * iterations;
        for (var i = 0; i < num; ++i) {
            db[collName].insert({ i: i, rand: Random.rand() });
        }
        assertWhenOwnColl.eq(db[collName].find().itcount(), num);
    }

    return {
        threadCount: threadCount,
        iterations: iterations,
        states: states,
        transitions: transitions,
        setup: setup,
        startState: 'remove'
    };

})();
