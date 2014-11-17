load('jstests/parallel/fsm_libs/runner.js');

runWorkloadsSerially(['jstests/parallel/fsm_workloads/update_multifield_multiupdate.js']);
