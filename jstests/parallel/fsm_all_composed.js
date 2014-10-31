load('jstests/parallel/fsm_libs/runner.js');

runMixtureOfWorkloads(ls('jstests/parallel/fsm_workloads'));
