load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'drop_database.js', // SERVER-16285
    'indexed_insert_multikey.js', // SERVER-16143
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js' // SERVER-16262
].map(function(file) { return dir + '/' + file; });

// runWorkloadsInParallel(ls(dir).filter(function(file) {
//     return !Array.contains(blacklist, file);
// }));

var whitelist = [
    'jstests/parallel/fsm_workloads/rename_capped_collection_chain.js',
    'jstests/parallel/fsm_workloads/rename_capped_collection_dbname_droptarget.js',
    // 'jstests/parallel/fsm_workloads/indexed_insert_1char.js',
    // 'jstests/parallel/fsm_workloads/indexed_insert_upsert.js',
    'jstests/parallel/fsm_workloads/indexed_insert_ttl.js',
    // 'jstests/parallel/fsm_workloads/indexed_insert_2d.js',
    // 'jstests/parallel/fsm_workloads/indexed_insert_heterogeneous_noindex.js',
    'jstests/parallel/fsm_workloads/rename_capped_collection_dbname_chain.js',
    'jstests/parallel/fsm_workloads/rename_collection_dbname_droptarget.js',
    // 'jstests/parallel/fsm_workloads/remove_single_document.js',
];

runWorkloadsInParallel(whitelist);
