load('jstests/parallel/fsm_libs/runner.js');

runWorkloadsSerially(ls('jstests/parallel/fsm_workloads'));
