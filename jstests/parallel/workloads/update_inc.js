/* update_inc.js
 *
 * The collection contains 1 document. Each thread is assigned a different field name.
 * Each thread updates its field with an $inc. After each update, it asserts that the field has the
 * correct value (each thread tracks the number of $inc updates it has performed).
 *
 */
var $config = (function() {

    var data = {
        // uses the workload name as _id on the document.
        // assumes this name will be unique.
        id: 'update_inc'
    };

    var states = {
        init: function init(db, collName) {
            this.fieldName = 't' + this.tid;
            this.count = 0;
        },

        update: function update(db, collName) {
            var updateDoc = { $inc: {} };
            updateDoc.$inc[this.fieldName] = 1;

            var res = db[collName].update({ _id: this.id }, updateDoc);
            assertAlways.eq(0, res.nUpserted, tojson(res));
            assertWhenOwnColl.eq(1, res.nMatched, tojson(res));

            if (db.getMongo().writeMode() === 'commands') {
                assertWhenOwnColl.eq(1, res.nModified, tojson(res));
            }

            ++this.count;
        },

        find: function find(db, collName) {
            var docs = db[collName].find().toArray();
            assertWhenOwnColl.eq(1, docs.length);
            assertWhenOwnColl((function() {
                var doc = docs[0];
                assertWhenOwnColl.eq(this.count, doc[this.fieldName]);
            }).bind(this));
        }
    };

    var transitions = {
        init: { update: 1 },
        update: { find: 1 },
        find: { update: 1 }
    };

    function setup(db, collName) {
        db[collName].insert({ _id: this.id });
    }

    return {
        threadCount: 30,
        iterations: 100,
        data: data,
        states: states,
        transitions: transitions,
        setup: setup
    };

})();
