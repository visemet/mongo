/**
 * map_reduce_reduce_nonatomic.js
 *
 * Generates some random data and inserts it into a collection. Runs a
 * map-reduce command over the collection that computes the frequency
 * counts of the 'value' field and stores the results in an existing
 * collection.
 *
 * Uses the "reduce" action to combine the results with the contents
 * of the output collection.
 *
 * Specifies nonAtomic=true and writes the results of each thread to
 * the same collection.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/map_reduce_inline.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    // Use the workload name as the collection name,
    // since the workload name is assumed to be unique.
    var uniqueCollectionName = 'map_reduce_reduce_nonatomic';

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);

        this.outCollName = uniqueCollectionName;
    };

    $config.states.mapReduce = function(db, collName) {
        var fullName = db[this.outCollName].getFullName();
        assertAlways(db[this.outCollName].exists() !== null,
                     "output collection '" + fullName + "' should exist");

        // Have all threads combine their results into the same collection
        var options = {
            finalize: this.finalizer,
            out: {
                reduce: this.outCollName,
                nonAtomic: true
            }
        };

        var res = db[collName].mapReduce(this.mapper, this.reducer, options);
        assertAlways.commandWorked(res);
    };

    $config.setup = function(db, collName) {
        $super.setup.apply(this, arguments);

        assertAlways.commandWorked(db.createCollection(uniqueCollectionName));
    };

    return $config;
});
