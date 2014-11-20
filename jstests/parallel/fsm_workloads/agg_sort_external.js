/**
 * agg_sort_external.js
 *
 * Runs an aggregation with a $match that returns half the documents followed
 * by a $sort on a field containing a random float.
 *
 * The data returned by the $match is greater than 100MB, which should force an external sort.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/agg_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    // use enough docs to exceed 100MB, the in-memory limit for $sort and $group
    $config.data.numDocs = 24*1000;
    var MB = 1<<20;
    assertAlways.lte(100*MB, $config.data.numDocs * $config.data.docSize / 2);

    $config.data.getPipeline = function(collName) {
        return [
            { $match: { flag: true } },
            { $sort: { rand: 1 } },
            { $out: collName + '_out_agg_sort_external' }
        ];
    };

    $config.states.query = function(db, collName) {
        var otherCollName = collName + '_out_agg_sort_external_' + this.tid;
        var cursor = db[collName].aggregate([
            { $match: { flag: true } },
            { $sort: { rand: 1 } },
            { $out: otherCollName }
        ], {
            allowDiskUse: true
        });
        assertAlways.eq(0, cursor.itcount());
        // .count() might be wrong with sharding because SERVER-3645
        assertWhenOwnColl.eq(db[collName].count()/2, db[otherCollName].count());
        assertWhenOwnColl.eq(db[collName].find().itcount()/2, db[otherCollName].find().itcount());
    };

    return $config;
});
