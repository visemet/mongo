load('jstests/parallel/libs/runner.js');

runWorkloadsSerially(ls('jstests/parallel/workloads'), { sharded: true });
