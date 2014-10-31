/* update_inc.js
 *
 * The collection contains 1 document. Each thread is assigned a different field name.
 * Each thread updates its field with an $inc. After each update, it asserts that the field has the
 * correct value (each thread tracks the number of $inc updates it has performed).
 *
 */
var $config = (function() {

    var states = {
        init: function init(db, collName) {
            this.fieldName = 't' + this.tid;
            this.count = 0;
        },

        update: function update(db, collName) {
            var updateDoc = { $inc: {} };
            updateDoc.$inc[this.fieldName] = 1;

            var res = db[collName].update({}, updateDoc);
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched, tojson(res));
            assertWhenOwnColl.eq(1, res.nModified, tojson(res));
            ++this.count;
        },

        find: function find(db, collName) {
            var docs = db[collName].find().toArray();
            assertWhenOwnColl.eq(1, docs.length);
            var doc = docs[0];
            assertWhenOwnColl.eq(this.count, doc[this.fieldName]);
        }
    };

    var transitions = {
        init: { update: 1 },
        update: { find: 1 },
        find: { update: 1 }
    };


    function setup(db, collName) {
        db[collName].insert({});
    }

    return {
        threadCount: 30,
        iterations: 100,
        states: states,
        transitions: transitions,
        setup: setup
    };

})();
