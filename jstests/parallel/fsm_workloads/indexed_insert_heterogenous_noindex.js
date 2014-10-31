/* indexed_insert_heterogenous_noindex.js
 *
 * like indexed_insert_heterogenous.js, but removes the indexes before doing the actual work.
 *
 */
load('jstests/parallel/fsm_libs/runner.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/indexed_insert_heterogenous.js'); // for $config
load('jstests/parallel/fsm_workload_helpers/indexed_noindex.js'); // for indexedNoindex

var $config = extendWorkload($config, indexedNoindex);
