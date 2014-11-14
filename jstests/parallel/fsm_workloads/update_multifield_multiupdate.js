/* update_multifield_multiupdate.js
 *
 * Does multi-updates that affect multiple fields on a several documents.
 * The collection has an index for each field, and a multikey index for all fields.
 *
 */
load('jstests/parallel/fsm_libs/runner.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/update_multifield.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.data.updateOptions.multi = true;

    return $config;

});
