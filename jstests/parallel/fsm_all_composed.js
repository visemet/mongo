load('jstests/parallel/fsm_libs/runner.js');

var dir = 'jstests/parallel/fsm_workloads';

var blacklist = [
    'drop_database.js', // SERVER-16285
    'indexed_insert_multikey.js', // SERVER-16143
    'indexed_insert_multikey_noindex.js' // SERVER-16143
].map(function(file) { return dir + '/' + file; });

// SERVER-16196 re-enable executing workloads
// runMixtureOfWorkloads(ls(dir).filter(function(file) {
//     return !Array.contains(blacklist, file);
// }));
