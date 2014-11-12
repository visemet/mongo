/* findAndModify_inc.js
 *
 * The collection contains 1 document. Each thread is assigned a different field name. Each thread
 * does a findAndModify to $inc its field. After each update, the thread asserts that its field has
 * the correct value.
 *
 * Designed to reproduce SERVER-15892.
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
            db[collName].findAndModify({
                query: { _id: 'findAndModify_inc' },
                update: updateDoc
            });
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
        db[collName].insert({ _id: 'findAndModify_inc' });
    }

    return {
        threadCount: 30,
        iterations: 100,
        states: states,
        transitions: transitions,
        setup: setup
    };

})();
