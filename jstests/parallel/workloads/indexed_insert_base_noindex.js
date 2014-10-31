/* indexed_insert_base_noindex.js
 *
 * like indexed_insert_base.js, but removes the indexes before doing the actual work.
 *
 */
load('jstests/parallel/libs/runner.js'); // for extendWorkload
load('jstests/parallel/workloads/indexed_insert_base.js'); // for $config
load('jstests/parallel/workload-helpers/indexed_noindex.js');

var $config = extendWorkload($config, indexedNoindex);
