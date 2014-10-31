load('jstests/parallel/fsm_libs/runner.js');

runWorkloadsInParallel(ls('jstests/parallel/fsm_workloads'));
