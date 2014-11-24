/**
 * agg_sort.js
 *
 * Runs an aggregation with a $match that returns half the documents followed
 * by a $sort on a field containing a random float.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/agg_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.query = function(db, collName) {
        var otherCollName = collName + '_out_agg_sort_' + this.tid;
        var cursor = db[collName].aggregate([
            { $match: { flag: true } },
            { $sort: { rand: 1 } },
            { $out: otherCollName }
        ]);
        assertAlways.eq(0, cursor.itcount());
        // .count() might be wrong with sharding because SERVER-3645
        assertWhenOwnColl.eq(db[collName].count()/2, db[otherCollName].count());
        assertWhenOwnColl.eq(db[collName].find().itcount()/2, db[otherCollName].find().itcount());
    };

    return $config;
});
