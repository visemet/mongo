'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var whitelist = [
    'indexed_insert_large_noindex.js',
//    'map_reduce_reduce.js',
//    'map_reduce_replace.js',
    'indexed_insert_2d.js',
//    'map_reduce_inline.js',
    'indexed_insert_base_noindex.js',
    'remove_multiple_documents.js',
    'update_multifield.js', // triggered it
    'indexed_insert_upsert.js',
    'indexed_insert_heterogeneous_noindex.js',
].map(function(file) { return dir + '/' + file; });

runWorkloadsInParallel(whitelist, {}, { numSubsets: 1 });
