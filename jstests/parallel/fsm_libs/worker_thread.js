var workerThread = (function() {

    // workloads = list of workload filenames
    // args.tid = the thread identifier
    // args.latch = the CountDownLatch instance for starting all threads
    // args.dbName = the database name
    // args.collName = the collection name
    // args.clusterOptions = the configuration of the cluster
    // args.seed = seed for the random number generator
    // args.globalAssertLevel = the global assertion level to use
    // run = callback that takes a map of workloads to their associated $config
    function main(workloads, args, run) {
        var myDB;
        var configs = {};

        if (args.clusterOptions.addr) {
            myDB = new Mongo(args.clusterOptions.addr).getDB(args.dbName);
        } else {
            myDB = db.getSiblingDB(args.dbName);
        }

        // TODO: do we want to explicitly load() assert.js?
        //       it is currently being loaded as a side-effect of loading runner.js
        globalAssertLevel = args.globalAssertLevel;

        // Converts any exceptions to a return status
        try {
            // Ensure that 'args.latch.countDown' gets called so that the parent thread
            // is not blocked when it tries to join the worker threads
            try {
                load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
                workloads.forEach(function(workload) {
                    load(workload);
                    var config = parseConfig($config); // to normalize
                    config.data.tid = args.tid;
                    configs[workload] = {
                        data: config.data,
                        db: myDB,
                        collName: args.collName,
                        startState: config.startState,
                        states: config.states,
                        transitions: config.transitions,
                        iterations: config.iterations
                    };
                });
            } finally {
                args.latch.countDown();
            }
            args.latch.await();

            Random.setRandomSeed(args.seed);
            run(configs);
            return { ok: 1 };
        } catch(e) {
            return { ok: 0, err: e.toString(), stack: e.stack };
        } finally {
            // Avoid retention of connection object
            configs = null;
            myDB = null;
            gc();
        }
    }

    return {
        main: main
    };

})();
