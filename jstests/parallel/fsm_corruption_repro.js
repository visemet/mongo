'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var whitelist = [
    'update_multifield.js',
    'map_reduce_replace.js'
].map(function(file) { return dir + '/' + file; });

runWorkloadsInParallel(whitelist, {}, { numSubsets: 1 });
