load('jstests/parallel/libs/runner.js');

runWorkloadsInParallel(ls('jstests/parallel/workloads'));
