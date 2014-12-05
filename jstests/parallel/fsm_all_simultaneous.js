'use strict';

load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'drop_database.js', // SERVER-16285
    'map_reduce_merge_nonatomic.js', // SERVER-16262
    'map_reduce_reduce_nonatomic.js' // SERVER-16262
].map(function(file) { return dir + '/' + file; });

runWorkloadsInParallel(ls(dir).filter(function(file) {
    return !Array.contains(blacklist, file);
}));
