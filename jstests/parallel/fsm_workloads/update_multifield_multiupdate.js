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
        // lte because documents can move in the middle of an update
        assertWhenOwnColl.lte(this.numDocs, res.nMatched,  tojson(res));
        if (db.getMongo().writeMode() === 'commands') {
            assertWhenOwnColl.lte(this.numDocs, res.nModified, tojson(res));
        }
    };

    return $config;
});
