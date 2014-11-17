/* update_multifield_multiupdate.js
 *
 * Does updates that affect multiple fields on multiple documents.
 * The collection has an index for each field, and a multikey index for all fields.
 *
 */
load('jstests/parallel/fsm_libs/runner.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/update_multifield.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.data.multi = true;

    $config.data.assertResult = function(res) {
        assertAlways.eq(0, res.nUpserted, tojson(res));
        // documents can move during an update, causing them to be matched 0 or more than 1 times.
        assertWhenOwnColl.lte(0, res.nMatched,  tojson(res));
        if (db.getMongo().writeMode() === 'commands') {
            assertWhenOwnColl.eq(res.nMatched, res.nModified, tojson(res));
        }
    };

    return $config;
});
