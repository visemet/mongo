'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'create_capped_collection.js',
    'create_capped_collection_maxdocs.js',
    'create_collection.js',
    'drop_collection.js',
    'drop_database.js', // SERVER-16285
    'indexed_insert_multikey.js',
    'indexed_insert_text.js',
    'indexed_insert_text_multikey.js',
    'map_reduce_merge.js',
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js', // SERVER-16262
    'map_reduce_replace_nonexistent.js',
    'rename_capped_collection_chain.js',
    'rename_capped_collection_dbname_chain.js',
    'rename_capped_collection_dbname_droptarget.js',
    'rename_capped_collection_droptarget.js',
    'rename_collection_chain.js',
    'rename_collection_dbname_chain.js',
    'rename_collection_dbname_droptarget.js',
    'rename_collection_droptarget.js',
    'update_multifield_isolated_multiupdate.js',
    'update_multifield_isolated_multiupdate_noindex.js',
    'update_multifield_multiupdate.js',
    'update_multifield_multiupdate_noindex.js',
    'update_upsert_multi.js',
    'update_upsert_multi_noindex.js',
].map(function(file) { return dir + '/' + file; });

runWorkloadsInParallel(ls(dir).filter(function(file) {
    return !Array.contains(blacklist, file);
}));
