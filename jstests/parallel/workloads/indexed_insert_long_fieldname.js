/** indexed_insert_long_fieldname.js
 *
 * Inserts documents into an indexed collection and asserts that the documents appear in both a
 * collection scan and an index scan. The indexed field name is a long string.
 */

load('jstests/parallel/libs/runner.js'); // for extendWorkload
load('jstests/parallel/workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.data.indexedField = 'Supercalifragilisticexpialidocious';

    return $config;
});
