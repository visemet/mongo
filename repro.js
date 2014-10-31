load('jstests/parallel/libs/runner.js');

runWorkloadsSerially(['jstests/parallel/workloads/indexed_insert_multikey.js']);
