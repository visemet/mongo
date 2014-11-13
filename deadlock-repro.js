load('jstests/parallel/libs/runner.js');

var options = { replication: true };
runWorkloadsSerially(['jstests/parallel/workloads/indexed_insert_multikey.js'], options);
