'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    // Disable all map-reduce workloads for now
    'map_reduce_inline.js',
    'map_reduce_merge.js',
    'map_reduce_merge_nonatomic.js',
    'map_reduce_reduce.js',
    'map_reduce_reduce_nonatomic.js',
    'map_reduce_replace.js',
    'map_reduce_replace_nonexistent.js',

    // Disable all rename collection workloads for now
    'rename_capped_collection_chain.js',
    'rename_capped_collection_dbname_chain.js',
    'rename_capped_collection_dbname_droptarget.js',
    'rename_capped_collection_droptarget.js',
    'rename_collection_chain.js',
    'rename_collection_dbname_chain.js',
    'rename_collection_dbname_droptarget.js',
    'rename_collection_droptarget.js',

    'drop_database.js', // SERVER-16285
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js' // SERVER-16262
].map(function(file) { return dir + '/' + file; });

// SERVER-16196 re-enable executing workloads
// runCompositionOfWorkloads(ls(dir).filter(function(file) {
//     return !Array.contains(blacklist, file);
// }));
