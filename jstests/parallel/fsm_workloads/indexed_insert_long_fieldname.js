'use strict';

/**
 * indexed_insert_long_fieldname.js
 *
 * Inserts multiple documents into an indexed collection. Asserts that all
 * documents appear in both a collection scan and an index scan. The indexed
 * field name is a long string.
 */
load('jstests/parallel/fsm_libs/extend_workload.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    // TODO: make this field name even longer?
    $config.data.indexedField = 'indexed_insert_long_fieldname_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    return $config;
});
