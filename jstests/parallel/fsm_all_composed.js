load('jstests/parallel/libs/runner.js');

runMixtureOfWorkloads(ls('jstests/parallel/workloads'));
