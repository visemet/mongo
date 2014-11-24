/**
 * agg_match.js
 *
 * Runs an aggregation with a $match that returns half the documents.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/agg_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.query = function(db, collName) {
        var otherCollName = collName + '_out_agg_base';
        var cursor = db[collName].aggregate([
            { $match: { flag: true } },
            { $out: otherCollName }
        ]);
        assertAlways.eq(0, cursor.itcount(), 'cursor returned by $out should always be empty');
        // NOTE: there is a bug SERVER-3645 where .count() is wrong on sharded collections.
        // But I really want to call .count() here, because I want the count instantly;
        // I don't want to create a cursor that could be invalidated if the collection is replaced
        // while I'm iterating.
        assertWhenOwnColl.eq(db[collName].count() / 2, db[otherCollName].count());
    };

    return $config;
});
