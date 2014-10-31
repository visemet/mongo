/* indexed_insert_base.js
 *
 * Inserts documents to an indexed collection and asserts that they all appear in an index scan and
 * a collection scan. The indexed value is a number, the thread id.
 *
 */
var $config = (function() {

    var states = {
        init: function init(db, collName) {
            this.nInserted = 0;
            this.indexedValue = this.tid;
        },

        insert: function insert(db, collName) {
            var res = db[collName].insert(this.getDoc());
            assertAlways.eq(1, res.nInserted, tojson(res));
            this.nInserted += this.docsPerInsert;
        },

        find: function find(db, collName) {
            // collection scan
            var count = db[collName].find(this.getDoc()).sort({ $natural: 1 }).count();
            assertWhenOwnColl.eq(count, this.nInserted);

            // index scan
            var count = db[collName].find(this.getDoc()).sort(this.getIndexSpec()).count();
            assertWhenOwnColl.eq(count, this.nInserted);
        }
    };

    var transitions = {
        init: { insert: 1 },
        insert: { find: 1 },
        find: { insert: 1 }
    };

    function setup(db, collName) {
        db[collName].ensureIndex(this.getIndexSpec());
    }

    return {
        threadCount: 30,
        iterations: 100,
        states: states,
        transitions: transitions,
        data: {
            getIndexSpec: function() {
                var ixSpec = {};
                ixSpec[this.indexedField] = 1;
                return ixSpec;
            },
            getDoc: function() {
                var doc = {};
                doc[this.indexedField] = this.indexedValue;
                return doc;
            },
            indexedField: 'x',
            docsPerInsert: 1
        },
        setup: setup
    };

})();
