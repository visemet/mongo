'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var whitelist = [
//    'map_reduce_replace.js',
    'update_multifield.js', // triggered it
].map(function(file) { return dir + '/' + file; });

runWorkloadsInParallel(whitelist, {}, { numSubsets: 1 });
