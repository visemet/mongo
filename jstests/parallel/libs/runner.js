load('jstests/libs/parallelTester.js');
load('jstests/parallel/libs/assert.js');
load('jstests/parallel/libs/utils.js');
load('jstests/parallel/libs/worker_thread.js');


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
              "extendWorkload must be called with 2 arguments: $config and callback");
    assert.eq('function', typeof callback,
              "2nd argument to extendWorkload must be a callback");
    assert.eq(2, callback.length,
              "2nd argument to extendWorkload must take 2 arguments: $config and $super");
    var parsedSuperConfig = parseConfig($config);
    var childConfig = Object.extend({}, parsedSuperConfig, true);
    return callback(childConfig, parsedSuperConfig);
}

function runWorkloadsSerially(workloads, clusterOptions) {
    if (typeof workloads === 'string') {
        workloads = [workloads];
    }
    assert.gt(workloads.length, 0);
    workloads.forEach(function(workload) {
        // 'workload' is a JS file expected to set the global $config variable to an object.
        load(workload);
        assert.neq(typeof $config, 'undefined');

        _runWorkload(workload, $config, clusterOptions);
    });
}

function runWorkloadsInParallel(workloads, clusterOptions) {
    assert.gt(workloads.length, 0);

    var context = {};
    workloads.forEach(function(workload) {
        // 'workload' is a JS file expected to set the global $config variable to an object.
        load(workload);
        assert.neq(typeof $config, 'undefined');
        context[workload] = { config: $config };
    });

    _runAllWorkloads(workloads, context, clusterOptions);
}

function runMixtureOfWorkloads(workloads, clusterOptions) {
    assert.gt(workloads.length, 0);

    var context = {};
    workloads.forEach(function(workload) {
        // 'workload' is a JS file expected to set the global $config variable to an object.
        load(workload);
        assert.neq(typeof $config, 'undefined');
        context[workload] = { config: $config };
    });

    clusterOptions = Object.extend({}, clusterOptions, true); // defensive deep copy
    clusterOptions.sameDB = true;
    clusterOptions.sameCollection = true;

    var cluster = setupCluster(clusterOptions, 'fakedb');
    globalAssertLevel = AssertLevel.ALWAYS;

    var cleanup = [];
    var errors = [];

    try {
        prepareCollections(workloads, context, cluster, clusterOptions);
        cleanup = setUpWorkloads(workloads, context);

        var threads = makeAllThreads(workloads, context, clusterOptions, true);

        joinThreads(threads).forEach(function(err) {
            errors.push(err);
        });

    } finally {
        // TODO: does order of calling 'config.teardown' matter?
        cleanup.forEach(function(teardown) {
            try {
                teardown.fn.call(teardown.data, teardown.db, teardown.collName);
            } catch (err) {
                print('Teardown function threw an exception:\n' + err.stack);
            }
        });

        cluster.teardown();
    }

    throwError(errors);
}

// Validate the config object and return a normalized copy of it.
// Normalized means all optional parameters are set to their default values,
// and any parameters that need to be coerced have been coerced.
function parseConfig(config) {
    // make a deep copy so we can mutate config without surprising the caller
    config = Object.extend({}, config, true);
    var allowedKeys = [
        'data',
        'iterations',
        'setup',
        'startState',
        'states',
        'teardown',
        'threadCount',
        'transitions'
    ];
    Object.keys(config).forEach(function(k) {
        assert.gte(allowedKeys.indexOf(k), 0,
                   "invalid config parameter: " + k + ". valid parameters are: " +
                   tojson(allowedKeys));
    });

    assert.eq('number', typeof config.threadCount);

    assert.eq('number', typeof config.iterations);

    config.startState = config.startState || 'init';
    assert.eq('string', typeof config.startState);

    assert.eq('object', typeof config.states);
    assert.gt(Object.keys(config.states).length, 0);
    Object.keys(config.states).forEach(function(k) {
        assert.eq('function', typeof config.states[k],
                   "config.states." + k + " is not a function");
        assert.eq(2, config.states[k].length,
                  "state functions should accept 2 parameters: db and collName");
    });

    // assert all states mentioned in config.transitions are present in config.states
    assert.eq('object', typeof config.transitions);
    assert.gt(Object.keys(config.transitions).length, 0);
    Object.keys(config.transitions).forEach(function(fromState) {
        assert(config.states.hasOwnProperty(fromState),
               "config.transitions contains a state not in config.states: " + fromState);

        assert.gt(Object.keys(config.transitions[fromState]).length, 0);
        Object.keys(config.transitions[fromState]).forEach(function(toState) {
            assert(config.states.hasOwnProperty(toState),
                   "config.transitions." + fromState +
                   " contains a state not in config.states: " + toState);
            assert.eq('number', typeof config.transitions[fromState][toState],
                      "transitions." + fromState + "." + toState + " should be a number");
        });
    });

    config.setup = config.setup || function(){};
    assert.eq('function', typeof config.setup);

    config.teardown = config.teardown || function(){};
    assert.eq('function', typeof config.teardown);

    config.data = config.data || {};
    assert.eq('object', typeof config.data);

    return config;
}

function setupCluster(clusterOptions, dbName) {
    var cluster = {};

    var allowedKeys = [
        'masterSlave',
        'replication',
        'sameCollection',
        'sameDB',
        'seed',
        'sharded'
    ];
    Object.keys(clusterOptions).forEach(function(opt) {
        assert(0 <= allowedKeys.indexOf(opt),
               "invalid option: " + tojson(opt) + ". valid options are: " + tojson(allowedKeys));
    });

    if (clusterOptions.sharded) {
        // TODO: allow 'clusterOptions' to specify the number of shards
        var shardConfig = {
            shards: 2,
            mongos: 1
        };

        // TODO: allow 'clusterOptions' to specify an 'rs' config
        if (clusterOptions.replication) {
            shardConfig.rs = true;
        }

        var st = new ShardingTest(shardConfig);
        st.stopBalancer();
        var mongos = st.s;

        clusterOptions.addr = mongos.host;
        cluster.db = mongos.getDB(dbName);
        cluster.shardCollection = function() {
            st.shardColl.apply(st, arguments);
        };
        cluster.teardown = function() {
            st.stop();
        };
    } else if (clusterOptions.replication) {
        // TODO: allow 'clusterOptions' to specify the number of nodes
        var replSetConfig = {
            nodes: 3
        };

        var rst = new ReplSetTest(replSetConfig);
        rst.startSet();

        // Send the replSetInitiate command and wait for initiation
        rst.initiate();
        rst.awaitSecondaryNodes();

        var primary = rst.getPrimary();

        clusterOptions.addr = primary.host;
        cluster.db = primary.getDB(dbName);
        cluster.teardown = function() {
            rst.stopSet();
        };
    } else if (clusterOptions.masterSlave) {
        var rt = new ReplTest('replTest');

        var master = rt.start(true);
        rt.start(false); // start slave

        clusterOptions.addr = master.host;
        cluster.db = master.getDB(dbName);
        cluster.teardown = function() {
            rt.stop();
        };
    } else { // standalone server
        cluster.db = db.getSiblingDB(dbName);
        cluster.teardown = function() {};
    }

    return cluster;
}

function _runWorkload(workload, config, clusterOptions) {
    var context = {};
    context[workload] = { config: config };
    _runAllWorkloads([workload], context, clusterOptions);
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
        config = parseConfig(config);
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

    workloads.forEach(function(workload) {
        if (firstWorkload || !clusterOptions.sameCollection) {
            if (firstWorkload || !clusterOptions.sameDB) {
                dbName = uniqueDBName();
            }
            collName = uniqueCollName();

            myDB = cluster.db.getSiblingDB(dbName);
            myDB[collName].drop();

            if (clusterOptions.sharded) {
                // TODO: allow 'clusterOptions' to specify the shard key and split
                cluster.shardCollection(myDB[collName], { _id: 'hashed' }, false);
            }
        }

        context[workload].db = myDB;
        context[workload].dbName = dbName;
        context[workload].collName = collName;
    });
}

/* This is the function that most other run*Workload* functions delegate to.
 * It takes an array of workload filenames and runs them all in parallel.
 *
 * TODO: document the other two parameters
 */
function _runAllWorkloads(workloads, context, clusterOptions) {
    clusterOptions = Object.extend({}, clusterOptions, true); // defensive deep copy
    var cluster = setupCluster(clusterOptions, 'fakedb');

    // Determine how strong to make assertions while simultaneously executing different workloads
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

    var cleanup = [];
    var errors = [];

    try {
        prepareCollections(workloads, context, cluster, clusterOptions);
        cleanup = setUpWorkloads(workloads, context);

        var threads = makeAllThreads(workloads, context, clusterOptions, false);

        joinThreads(threads).forEach(function(err) {
            errors.push(err);
        });
    } finally {
        // TODO: does order of calling 'config.teardown' matter?
        cleanup.forEach(function(teardown) {
            try {
                teardown.fn.call(teardown.data, teardown.db, teardown.collName);
            } catch (err) {
                print('Teardown function threw an exception:\n' + err.stack);
            }
        });

        cluster.teardown();
    }

    throwError(errors);
}

function makeAllThreads(workloads, context, clusterOptions, compose) {
    var threadFn, getWorkloads;
    if (compose) {
        // Worker threads need to load() all workloads when composed
        threadFn = workerThread.composed;
        getWorkloads = function() { return workloads; };
    } else {
        // Worker threads only need to load() the specified workload
        threadFn = workerThread.pfsm;
        getWorkloads = function(workload) { return [workload]; };
    }

    function sumRequestedThreads() {
        var threadCounts = workloads.map(function(wl) {
            return context[wl].config.threadCount;
        });
        return threadCounts.reduce(function(x, y) { return x + y; }, 0);
    }

    // TODO: pick a better cap for maximum allowed threads?
    var maxAllowedThreads = 500;
    var requestedNumThreads = sumRequestedThreads();
    if (requestedNumThreads > maxAllowedThreads) {
        print('\n\ntoo many threads requested: ' + requestedNumThreads);
        // scale down each workload's requested threadCount so the sum fits within maxAllowedThreads
        workloads.forEach(function(wl) {
            // use Math.floor to convert to an integer and prevent the sum from exceeding
            // maxAllowedThreads
            context[wl].config.threadCount = Math.floor(
                (context[wl].config.threadCount * maxAllowedThreads) / requestedNumThreads
            );
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
            var args = {
                tid: tid++,
                latch: latch,
                dbName: context[workload].dbName,
                collName: context[workload].collName,
                clusterOptions: clusterOptions,
                seed: Random.randInt(1e13), // contains range of Date.getTime()
                globalAssertLevel: globalAssertLevel
            };

            var t = new ScopedThread(threadFn, workloadsToLoad, args);
            threads.push(t);
            t.start();
        }
    });

    latch.await(); // wait for all threads to start
    return threads;
}

function joinThreads(workerThreads) {
    var workerErrs = [];

    workerThreads.forEach(function(t) {
        t.join();

        var data = t.returnData();
        if (!data.ok) {
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
        })
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
            return pluralize('thread', stackTraces.length) + ' threw\n\n'
                   + indent(uniqueTraces[0].value, 8);
        }

        var summary = pluralize('thread', stackTraces.length) + ' threw '
                      + numUniqueTraces + ' different exceptions:\n\n';

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

workerThread.pfsm = function(workloads, args) {
    load('jstests/parallel/libs/worker_thread.js'); // for workerThread.main
    load('jstests/parallel/libs/pfsm.js'); // for pfsm.run

    return workerThread.main(workloads, args, function(configs) {
        var workloads = Object.keys(configs);
        assert.eq(1, workloads.length);
        pfsm.run(configs[workloads[0]]);
    });
}

workerThread.composed = function(workloads, args) {
    load('jstests/parallel/libs/worker_thread.js'); // for workerThread.main
    load('jstests/parallel/libs/composer.js'); // for composer.run

    return workerThread.main(workloads, args, function(configs) {
        // TODO: make mixing probability configurable
        composer.run(workloads, configs, 0.1);
    });
}
