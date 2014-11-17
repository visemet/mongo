/**
 * create_collection.js
 *
 * Repeatedly creates a collection.
 */
var $config = (function() {

    var data = {
        // Use the workload name as a prefix for the collection name,
        // since the workload name is assumed to be unique.
        prefix: 'create_collection'
    };

    var states = (function() {

        function uniqueCollectionName(prefix, tid, num) {
            return prefix + tid + '_' + num;
        }

        function init(db, collName) {
            this.num = 0;
        }

        // TODO: how to avoid having too many files open?
        function create(db, collName) {
            // TODO: should we ever do something different?
            var myCollName = uniqueCollectionName(this.prefix, this.tid, this.num++);
            assertAlways.commandWorked(db.createCollection(myCollName));
        }

        return {
            init: init,
            create: create
        };

    })();

    var transitions = {
        init: { create: 1 },
        create: { create: 1 }
    };

    var teardown = function(db, collName) {
        var pattern = new RegExp('^' + this.prefix);
        var res = db.runCommand('listCollections', { filter: { name: pattern } });
        assertAlways.commandWorked(res);

        res.collections.forEach(function(collInfo) {
            db[collInfo.name].drop();
        });
    }

    return {
        threadCount: 5,
        iterations: 20,
        data: data,
        states: states,
        transitions: transitions,
        teardown: teardown
    };

})();
