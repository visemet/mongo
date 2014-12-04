load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'drop_database.js', // SERVER-16285
    'indexed_insert_multikey.js', // SERVER-16143
    'indexed_insert_multikey_noindex.js', // SERVER-16143
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js' // SERVER-16262
].map(function(file) { return dir + '/' + file; });

// runCompositionOfWorkloads(ls(dir).filter(function(file) {
//     return !Array.contains(blacklist, file);
// }));

var whitelist = [
//    'jstests/parallel/fsm_workloads/update_inc.js',
//    'jstests/parallel/fsm_workloads/rename_capped_collection_dbname_droptarget.js',
//    'jstests/parallel/fsm_workloads/drop_collection.js',
//    'jstests/parallel/fsm_workloads/update_ordered_bulk_inc.js',
    'jstests/parallel/fsm_workloads/map_reduce_merge.js',
//    'jstests/parallel/fsm_workloads/rename_capped_collection_droptarget.js',
//    'jstests/parallel/fsm_workloads/map_reduce_inline.js',
//    'jstests/parallel/fsm_workloads/indexed_insert_text_multikey.js',
//    'jstests/parallel/fsm_workloads/indexed_insert_long_fieldname_noindex.js',
    'jstests/parallel/fsm_workloads/findAndModify_inc.js',
];

runCompositionOfWorkloads(whitelist, {}, { numSubsets: 1 });
