/* indexed_insert_large_noindex.js
 *
 * like indexed_insert_large.js, but removes the indexes before doing the actual work.
 *
 */
load('jstests/parallel/libs/runner.js'); // for extendWorkload
load('jstests/parallel/workloads/indexed_insert_large.js'); // for $config
load('jstests/parallel/workload-helpers/indexed_noindex.js');

var $config = extendWorkload($config, indexedNoindex);
