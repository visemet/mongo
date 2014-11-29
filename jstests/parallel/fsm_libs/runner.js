load('jstests/libs/parallelTester.js');
load('jstests/parallel/fsm_libs/cluster.js');
load('jstests/parallel/fsm_libs/name_utils.js');
load('jstests/parallel/fsm_libs/parse_config.js');
load('jstests/parallel/fsm_libs/worker_thread.js');

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

        assert(!(mode.composed && mode.parallel),
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
        assert.gt(workloads.length, 0);

        executionMode = validateExecutionMode(executionMode);

        var context = {};
        workloads.forEach(function(workload) {
            load(workload); // for $config
            assert.neq('undefined', typeof $config, '$config was not defined by ' + workload);
            context[workload] = { config: parseConfig($config) };
        });

        clusterOptions = Object.extend({}, clusterOptions, true); // defensive deep copy
        if (executionMode.composed) {
            clusterOptions.sameDB = true;
            clusterOptions.sameCollection = true;
        }

        var cluster = new Cluster(clusterOptions);
        cluster.setup();

        try {
            var schedule = scheduleWorkloads(workloads, executionMode);
            schedule.forEach(function(workloads) {
                var cleanup = [];
                var errors = [];

                try {
                    prepareCollections(workloads, context, cluster, clusterOptions);
                    cleanup = setUpWorkloads(workloads, context);

                    var threads = makeAllThreads(workloads, context, clusterOptions,
                                                 executionMode.composed);

                    errors = joinThreads(threads);

                } finally {
                    // TODO: does order of calling 'config.teardown' matter?
                    cleanup.forEach(function(teardown) {
                        try {
                            teardown.fn.call(teardown.data, teardown.db, teardown.collName);
                        } catch (err) {
                            // TODO: throw error (at end) if 'errors' is empty
                            print('Teardown function threw an exception:\n' + err.stack);
                        }
                    });
                }

                throwError(errors);
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

function makeAllThreads(workloads, context, clusterOptions, composed) {
    var threadFn, getWorkloads;
    if (composed) {
        // Worker threads need to load() all workloads when composed
        threadFn = workerThread.composed;
        getWorkloads = function() { return workloads; };
    } else {
        // Worker threads only need to load() the specified workload
        threadFn = workerThread.fsm;
        getWorkloads = function(workload) { return [workload]; };
    }

    function sumRequestedThreads() {
        return Array.sum(workloads.map(function(wl) {
            return context[wl].config.threadCount;
        }));
    }

    // TODO: pick a better cap for maximum allowed threads?
    var maxAllowedThreads = 100;
    var requestedNumThreads = sumRequestedThreads();
    if (requestedNumThreads > maxAllowedThreads) {
        print('\n\ntoo many threads requested: ' + requestedNumThreads);
        // Scale down the requested '$config.threadCount' values to make
        // them sum to less than 'maxAllowedThreads'
        var factor = maxAllowedThreads / requestedNumThreads;
        workloads.forEach(function(workload) {
            var threadCount = context[workload].config.threadCount;
            threadCount = Math.floor(factor * threadCount);
            threadCount = Math.max(1, threadCount); // ensure workload is executed
            context[workload].config.threadCount = threadCount;
        });
    }
    var numThreads = sumRequestedThreads();
    print('using num threads: ' + numThreads);
    assert.lte(numThreads, maxAllowedThreads);

    var latch = new CountDownLatch(numThreads);

    var threads = [];

    jsTest.log(workloads.join('\n'));
    Random.setRandomSeed(clusterOptions.seed);

    var tid = 0;
    workloads.forEach(function(workload) {
        var workloadsToLoad = getWorkloads(workload);
        var config = context[workload].config;

        for (var i = 0; i < config.threadCount; ++i) {
            config.data.tid = tid++;
            var args = {
                data: config.data,
                latch: latch,
                dbName: context[workload].dbName,
                collName: context[workload].collName,
                clusterOptions: clusterOptions,
                seed: Random.randInt(1e13), // contains range of Date.getTime()
                globalAssertLevel: globalAssertLevel
            };

            // Wrap threadFn with try/finally to make sure it always closes the db connection
            // that is implicitly created within the thread's scope.
            var guardedThreadFn = function(threadFn, args) {
                try {
                    return threadFn.apply(this, args);
                } finally {
                    db = null;
                    gc();
                }
            };

            var t = new ScopedThread(guardedThreadFn, threadFn, [workloadsToLoad, args]);
            threads.push(t);
            t.start();

            // Wait a little before starting the next thread
            // to avoid creating new connections at the same time
            sleep(10);
        }
    });

    var failedThreadIndexes = [];
    while (latch.getCount() > 0) {
        threads.forEach(function(t, i) {
            if (t.hasFailed() && !Array.contains(failedThreadIndexes, i)) {
                failedThreadIndexes.push(i);
                latch.countDown();
            }
        });

        sleep(100);
    }

    var failedThreads = failedThreadIndexes.length;
    if (failedThreads > 0) {
        print(failedThreads + ' thread(s) threw a JS or C++ exception while spawning');
    }

    var allowedFailure = 0.2;
    if (failedThreads / numThreads > allowedFailure) {
        throw new Error('Too many worker threads failed to spawn - aborting');
    }

    return threads;
}

function joinThreads(workerThreads) {
    var workerErrs = [];

    workerThreads.forEach(function(t) {
        t.join();

        var data = t.returnData();
        if (data && !data.ok) {
            workerErrs.push(data);
        }
    });

    return workerErrs;
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

workerThread.fsm = function(workloads, args) {
    load('jstests/parallel/fsm_libs/worker_thread.js'); // for workerThread.main
    load('jstests/parallel/fsm_libs/fsm.js'); // for fsm.run

    return workerThread.main(workloads, args, function(configs) {
        var workloads = Object.keys(configs);
        assert.eq(1, workloads.length);
        fsm.run(configs[workloads[0]]);
    });
};

workerThread.composed = function(workloads, args) {
    load('jstests/parallel/fsm_libs/worker_thread.js'); // for workerThread.main
    load('jstests/parallel/fsm_libs/composer.js'); // for composer.run

    return workerThread.main(workloads, args, function(configs) {
        // TODO: make mixing probability configurable
        composer.run(workloads, configs, 0.1);
    });
};
