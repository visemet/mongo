'use strict';

load('jstests/parallel/fsm_libs/assert.js');
load('jstests/parallel/fsm_libs/cluster.js');
load('jstests/parallel/fsm_libs/name_utils.js');
load('jstests/parallel/fsm_libs/parse_config.js');
load('jstests/parallel/fsm_libs/thread_mgr.js');

var runner = (function() {

    function validateExecutionMode(mode) {
        mode = Object.extend({}, mode, true); // defensive deep copy

        var allowedKeys = [
            'composed',
            'parallel'
        ];

        Object.keys(mode).forEach(function(option) {
            assert.contains(option, allowedKeys,
                            'invalid option: ' + tojson(option) +
                            '; valid options are: ' + tojson(allowedKeys));
        });

        mode.composed = mode.composed || false;
        assert.eq('boolean', typeof mode.composed);

        mode.parallel = mode.parallel || false;
        assert.eq('boolean', typeof mode.parallel);

        assert(!mode.composed || !mode.parallel,
               "properties 'composed' and 'parallel' cannot both be true");

        return mode;
    }

    /**
     * Returns an array containing sets of workloads.
     * Each set of workloads is executed together according to the execution mode.
     *
     * For example, returning [ [ workload1, workload2 ], [ workload2, workload3 ] ]
     * when 'executionMode.parallel == true' causes workloads #1 and #2 to be
     * executed simultaneously, followed by workloads #2 and #3 together.
     */
    function scheduleWorkloads(workloads, executionMode) {
        if (!executionMode.composed && !executionMode.parallel) { // serial execution
            return workloads.map(function(workload) {
                return [workload]; // run each workload by itself
            });
        }

        // TODO: return an array of random subsets
        return [workloads];
    }

    function prepareCollections(workloads, context, cluster, clusterOptions) {
        var dbName, collName, myDB;
        var firstWorkload = true;

        // Clean up the state left behind by other tests in the parallel suite
        // to avoid having too many open files
        db.dropDatabase();

        workloads.forEach(function(workload) {
            if (firstWorkload || !clusterOptions.sameCollection) {
                if (firstWorkload || !clusterOptions.sameDB) {
                    dbName = uniqueDBName();
                }
                collName = uniqueCollName();

                myDB = cluster.getDB(dbName);
                myDB[collName].drop();

                if (cluster.isSharded()) {
                    // TODO: allow 'clusterOptions' to specify the shard key and split
                    cluster.shardCollection(myDB[collName], { _id: 'hashed' }, false);
                }
            }

            context[workload].db = myDB;
            context[workload].dbName = dbName;
            context[workload].collName = collName;

            firstWorkload = false;
        });
    }

    function throwError(workerErrs) {

        // Returns an array containing all unique values from the specified array
        // and their corresponding number of occurrences in the original array.
        function freqCount(arr) {
            var unique = [];
            var freqs = [];

            arr.forEach(function(item) {
                var i = unique.indexOf(item);
                if (i < 0) {
                    unique.push(item);
                    freqs.push(1);
                } else {
                    freqs[i]++;
                }
            });

            return unique.map(function(value, i) {
                return { value: value, freq: freqs[i] };
            });
        }

        // Indents a multiline string with the specified number of spaces.
        function indent(str, size) {
            var prefix = new Array(size + 1).join(' ');
            return prefix + str.split('\n').join('\n' + prefix);
        }

        function pluralize(str, num) {
            var suffix = num > 1 ? 's' : '';
            return num + ' ' + str + suffix;
        }

        function prepareMsg(stackTraces) {
            var uniqueTraces = freqCount(stackTraces);
            var numUniqueTraces = uniqueTraces.length;

            // Special case message when threads all have the same trace
            if (numUniqueTraces === 1) {
                return pluralize('thread', stackTraces.length) + ' threw\n\n' +
                       indent(uniqueTraces[0].value, 8);
            }

            var summary = pluralize('thread', stackTraces.length) + ' threw ' +
                          numUniqueTraces + ' different exceptions:\n\n';

            return summary + uniqueTraces.map(function(obj) {
                var line = pluralize('thread', obj.freq) + ' threw\n';
                return indent(line + obj.value, 8);
            }).join('\n\n');
        }

        if (workerErrs.length > 0) {
            var stackTraces = workerErrs.map(function(e) {
                return e.stack || e.err;
            });

            var err = new Error(prepareMsg(stackTraces) + '\n');

            // Avoid having any stack traces omitted from the logs
            var maxLogLine = 10 * 1024; // 10KB

            // Check if the combined length of the error message and the stack traces
            // exceeds the maximum line-length the shell will log
            if (err.stack.length >= maxLogLine) {
                print(err.stack);
                throw new Error('stack traces would have been snipped, see logs');
            }

            throw err;
        }
    }

    function setupWorkload(workload, context) {
        var myDB = context[workload].db;
        var collName = context[workload].collName;

        var config = context[workload].config;
        config.setup.call(config.data, myDB, collName);
    }

    function teardownWorkload(workload, context) {
        var myDB = context[workload].db;
        var collName = context[workload].collName;

        var config = context[workload].config;
        config.teardown.call(config.data, myDB, collName);
    }

    function runWorkloads(workloads, clusterOptions, executionMode) {
        assert.gt(workloads.length, 0, 'need at least one workload to run');

        executionMode = validateExecutionMode(executionMode);

        clusterOptions = Object.extend({}, clusterOptions, true); // defensive deep copy
        if (executionMode.composed) {
            clusterOptions.sameDB = true;
            clusterOptions.sameCollection = true;
        }

        // Determine how strong to make assertions while simultaneously executing
        // different workloads
        var assertLevel = AssertLevel.OWN_DB;
        if (clusterOptions.sameDB) {
            // The database is shared by multiple workloads, so only make the asserts
            // that apply when the collection is owned by an individual workload
            assertLevel = AssertLevel.OWN_COLL;
        }
        if (clusterOptions.sameCollection) {
            // The collection is shared by multiple workloads, so only make the asserts
            // that always apply
            assertLevel = AssertLevel.ALWAYS;
        }
        globalAssertLevel = assertLevel;

        var context = {};
        workloads.forEach(function(workload) {
            load(workload); // for $config
            assert.neq('undefined', typeof $config, '$config was not defined by ' + workload);
            context[workload] = { config: parseConfig($config) };
        });

        var threadMgr = new ThreadManager(clusterOptions, executionMode);

        var cluster = new Cluster(clusterOptions);
        cluster.setup();

        var maxAllowedConnections = 100;
        Random.setRandomSeed(clusterOptions.seed);

        try {
            var schedule = scheduleWorkloads(workloads, executionMode);
            schedule.forEach(function(workloads) {
                var cleanup = [];
                var errors = [];
                var teardownFailed = false;

                jsTest.log(workloads.join('\n'));

                try {
                    prepareCollections(workloads, context, cluster, clusterOptions);

                    workloads.forEach(function(workload) {
                        setupWorkload(workload, context);
                        cleanup.push(workload);
                    });

                    threadMgr.init(workloads, context, maxAllowedConnections);
                    threadMgr.spawnAll(cluster.getHost());
                    threadMgr.checkFailed(0.2);

                    errors = threadMgr.joinAll();
                } finally {
                    cleanup.forEach(function(workload) {
                        try {
                            teardownWorkload(workload, context);
                        } catch (err) {
                            print('Workload teardown function threw an exception:\n' + err.stack);
                            teardownFailed = true;
                        }
                    });
                }

                throwError(errors);

                if (teardownFailed) {
                    throw new Error('workload teardown function(s) failed, see logs');
                }
            });
        } finally {
            cluster.teardown();
        }
    }

    return {
        serial: function serial(workloads, clusterOptions) {
            runWorkloads(workloads, clusterOptions, {});
        },

        parallel: function parallel(workloads, clusterOptions) {
            runWorkloads(workloads, clusterOptions, { parallel: true });
        },

        composed: function composed(workloads, clusterOptions) {
            runWorkloads(workloads, clusterOptions, { composed: true });
        }
    };

})();

var runWorkloadsSerially = runner.serial;
var runWorkloadsInParallel = runner.parallel;
var runCompositionOfWorkloads = runner.composed;
