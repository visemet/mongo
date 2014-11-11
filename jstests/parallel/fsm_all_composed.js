load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'drop_database.js', // SERVER-16285
    'indexed_insert_multikey.js', // SERVER-16143
    'indexed_insert_multikey_noindex.js', // SERVER-16143
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js' // SERVER-16262
].map(function(file) { return dir + '/' + file; });

// SERVER-16196 re-enable executing workloads
// runCompositionOfWorkloads(ls(dir).filter(function(file) {
//     return !Array.contains(blacklist, file);
// }));
