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
            assert(0 <= allowedKeys.indexOf(option),
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

    function scheduleWorkloads(workloads, executionMode) {
        if (!executionMode.composed && !executionMode.parallel) { // serial execution
            return workloads.map(function(workload) {
                return [workload];
            });
        }

        // TODO: return an array of random subsets
        return [workloads];
    }

    function runWorkloads(workloads, clusterOptions, executionMode) {
        assert.gt(workloads.length, 0, 'need at least one workload to run');

        executionMode = validateExecutionMode(executionMode);

        clusterOptions = Object.extend({}, clusterOptions, true); // defensive deep copy
        if (executionMode.composed) {
            clusterOptions.sameDB = true;
            clusterOptions.sameCollection = true;
        }

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
                    cleanup = setUpWorkloads(workloads, context);

                    threadMgr.init(workloads, context, maxAllowedConnections);
                    threadMgr.spawnAll(cluster.getHost());
                    threadMgr.checkFailed(0.2);

                    errors = threadMgr.joinAll();

                } finally {
                    // TODO: does order of calling 'config.teardown' matter?
                    cleanup.forEach(function(teardown) {
                        try {
                            teardown.fn.call(teardown.data, teardown.db, teardown.collName);
                        } catch (err) {
                            print('Teardown function threw an exception:\n' + err.stack);
                            teardownFailed = true;
                        }
                    });
                }

                throwError(errors);

                if (teardownFailed) {
                    throw new Error('workload teardown function(s) threw an exception, see logs');
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

/** extendWorkload usage:
 *
 * $config = extendWorkload($config, function($config, $super) {
 *   // ... modify $config ...
 *   $config.foo = function() { // override a method
 *     $super.foo.call(this, arguments); // call super
 *   };
 *   return $config;
 * });
 */
function extendWorkload($config, callback) {
    assert.eq(2, arguments.length,
              'extendWorkload must be called with 2 arguments: $config and callback');
    assert.eq('function', typeof callback,
              '2nd argument to extendWorkload must be a callback');
    assert.eq(2, callback.length,
              '2nd argument to extendWorkload must take 2 arguments: $config and $super');
    var parsedSuperConfig = parseConfig($config);
    var childConfig = Object.extend({}, parsedSuperConfig, true);
    return callback(childConfig, parsedSuperConfig);
}

// TODO: give this function a more descriptive name?
// Calls the 'config.setup' function for each workload, and returns
// an array of 'config.teardown' functions to execute with the appropriate
// arguments. Note that the implementation relies on having 'db' and 'collName'
// set as properties on context[workload].
function setUpWorkloads(workloads, context) {
    return workloads.map(function(workload) {
        var myDB = context[workload].db;
        var collName = context[workload].collName;

        var config = context[workload].config;
        config.setup.call(config.data, myDB, collName);

        return {
            fn: config.teardown,
            data: config.data,
            db: myDB,
            collName: collName
        };
    });
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

            if (clusterOptions.sharded) {
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
