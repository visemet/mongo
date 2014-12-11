'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var whitelist = [
    'map_reduce_reduce.js',
    'map_reduce_replace.js',
//    'map_reduce_inline.js',
//    'remove_multiple_documents.js',
    'update_multifield.js', // triggered it
].map(function(file) { return dir + '/' + file; });

runWorkloadsInParallel(whitelist, {}, { numSubsets: 1 });
