'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'create_capped_collection.js',
    'create_capped_collection_maxdocs.js',
    'create_collection.js',
    'drop_collection.js',
    'drop_database.js', // SERVER-16285
    'map_reduce_merge.js',
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js', // SERVER-16262
    'map_reduce_replace_nonexistent.js',
    'rename_capped_collection_dbname_chain.js',
    'rename_capped_collection_dbname_droptarget.js',
    'rename_capped_collection_droptarget.js',
    'rename_collection_dbname_chain.js',
    'rename_collection_dbname_droptarget.js',
    'rename_collection_droptarget.js',
].map(function(file) { return dir + '/' + file; });

runWorkloadsSerially(ls(dir).filter(function(file) {
    return !Array.contains(blacklist, file);
}));
