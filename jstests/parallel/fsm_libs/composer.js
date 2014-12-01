'use strict';

load('jstests/parallel/fsm_libs/fsm.js');

var composer = (function() {

    function runCombinedFSM(workloads, configs, options) {
        assert.lte(2, workloads.length, 'need at least two FSMs to compose');

        var composeProb = options.composeProb;
        if (typeof composeProb === 'undefined') {
            composeProb = 0.1;
        }

        // TODO: use a different default number of iterations?
        //       e.g. take the sum of the 'iterations' specified in each workload's config
        var iterations = options.iterations || 100;

        assert.eq(AssertLevel.ALWAYS, globalAssertLevel,
                  'global assertion level is not set as ALWAYS');

        var currentWorkload = getRandomElem(workloads, Random.rand());
        var currentState = configs[currentWorkload].startState;

        var myDB, collName;
        var first = true;

        // Executes the start state of all workloads except for the current one
        workloads.forEach(function(workload) {
            var args = configs[workload];
            if (!first) {
                assert.eq(myDB, args.db, 'expected all workloads to use same database');
                assert.eq(collName, args.collName,
                          'expected all workloads to use same collection');
            }
            myDB = args.db;
            collName = args.collName;
            first = false;

            if (workload !== currentWorkload) {
                args.states[args.startState].call(args.data, myDB, collName);
            }
        });

        // Caches whether or not this workload ever transitions back to its start state
        workloads.forEach(function(workload) {
            var args = configs[workload];
            args.transitionsBack = doesTransitionBackToStartState(args);
        });

        // Caches the list of other states (belonging to other workloads)
        // that the states of this workload are able to transition to
        workloads.forEach(function(workload) {
            var args = configs[workload];
            args.otherStates = getOtherStates(workload, workloads, configs);
        });

        // Runs an interleaving of the specified workloads
        for (var i = 0; i < iterations; ++i) {
            var args = configs[currentWorkload];
            args.states[currentState].call(args.data, myDB, collName);

            var next = getNextState(currentWorkload, currentState, workloads, configs, composeProb);
            currentWorkload = next.workload;
            currentState = next.state;
        }
    }

    function doesTransitionBackToStartState(args) {
        for (var fromState in args.transitions) {
            if (!args.transitions.hasOwnProperty(fromState)) {
                continue;
            }

            var toStates = args.transitions[fromState];
            var prob = toStates[args.startState] || 0;
            if (prob > 0) {
                return true;
            }
        }

        return false;
    }

    function getOtherStates(currentWorkload, workloads, configs) {
        var otherStates = [];
        workloads.forEach(function(workload) {
            if (workload === currentWorkload) {
                return;
            }

            var args = configs[workload];
            Object.keys(args.states).forEach(function(state) {
                // Allow states of 'currentWorkload' to transition to any non-start state
                // of other workloads. Certain workloads assume that their start state
                // is only ever executed once by each thread, so transitioning is only
                // allowed if 'workload' transitions back to its own start state.
                if (state !== args.startState || args.transitionsBack) {
                    otherStates.push({ workload: workload, state: state });
                }
            });
        });

        return otherStates;
    }

    function getNextState(currentWorkload, currentState, workloads, configs, composeProb) {
        var args = configs[currentWorkload];

        // Transition to another valid state of the current workload,
        // with probability '1 - composeProb'
        if (Random.rand() >= composeProb) {
            var nextState = fsm._getWeightedRandomChoice(args.transitions[currentState],
                                                         Random.rand());
            return { workload: currentWorkload, state: nextState };
        }

        // Transition to a state of another workload with probability 'composeProb'
        return getRandomElem(args.otherStates, Random.rand());
    }

    function getRandomElem(items, randVal) {
        assert.gt(items.length, 0);
        return items[Math.floor(randVal * items.length)];
    }

    return {
        run: runCombinedFSM
    };

})();
