/**
 * agg_group_external.js
 *
 * Runs an aggregation with a $group.
 *
 * The data passed to the $group is greater than 100MB, which should force
 * disk to be used.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/agg_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    // use enough docs to exceed 100MB, the in-memory limit for $sort and $group
    $config.data.numDocs = 24 * 1000;
    var MB = 1024 * 1024; // bytes
    assertAlways.lte(100 * MB, $config.data.numDocs * $config.data.docSize / 2);

    $config.states.query = function(db, collName) {
        var otherCollName = collName + '_out_agg_sort_external_' + this.tid;
        var cursor = db[collName].aggregate([
            { $group: { _id: '$randInt', count: { $sum: 1 } } },
            { $out: otherCollName }
        ], {
            allowDiskUse: true
        });
        assertAlways.eq(0, cursor.itcount());
        assertWhenOwnColl(function() {
            // sum the .count fields in the output coll
            var sum = db[otherCollName].aggregate([
                { $group: { _id: null, totalCount: { $sum: '$count' } } }
            ]).toArray()[0].totalCount;
            assertWhenOwnColl.eq(this.numDocs, sum);
        }.bind(this));
    };

    return $config;
});
