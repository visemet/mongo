var $config = (function() {

    // 'data' is passed (copied) to the children threads, and bound
    // as 'this' for each state function
    var data = {};

    // 'states' are run within the context of each child thread, so
    // they cannot refer to variables in an outer scope. To pass data
    // from the parent thread to a child thread, specify it as a property
    // of 'data' in the $config.
    var states = {
        init: function init(db, collName) {
            this.start = 10 * this.tid;
        },

        scan: function scan(db, collName) {
            db[collName].find({ _id: { $gt: this.start } }).itcount();
        }
    };

    var transitions = {
        init: { scan: 1 },
        scan: { scan: 1 }
    };

    // 'setup' and 'teardown' are run once within the context of the
    // parent thread. 'setup' is called before the children thread are
    // spawned, and 'teardown' is called after the children thread are
    // reaped. They do not have anything passed in as 'this', but can
    // instead directly refer to variables in an outer scope.
    function setup(db, collName) {
        for (var i = 0; i < 1000; ++i) {
            db[collName].insert({ _id: i });
        }
    }

    function teardown(db, collName) {}

    return {
        threadCount: 5,
        iterations: 10,
        startState: 'init',        // optional, default 'init'
        states: states,
        transitions: transitions,
        setup: setup,              // optional, default empty function
        teardown: teardown,        // optional, default empty function
        data: data                 // optional, default empty object
    };

})();
