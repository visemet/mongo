/**
 * map_reduce_inline.js
 *
 * TODO: write description
 */
var $config = (function() {

    var data = {
        numDocs: 2000
    };

    var states = (function() {

        // TODO: modify mapper to produce { this.value : 1 } so that 'out' can be
        //       changed to replace, merge, or reduce
        function mapper() {
            if (this.hasOwnProperty('key') && this.hasOwnProperty('value')) {
                emit(this.key, this.value);
            }
        }

        function reducer(key, values) {
            var res = {};

            values.forEach(function(value) {
                if (typeof value !== 'number') {
                    return;
                }

                if (!res.hasOwnProperty(value)) {
                    res[value] = 0;
                }
                res[value]++;
            });

            return res;
        }

        function finalizer(key, reducedValue) {
            return reducedValue;
        }

        function init(db, collName) {
            // no-op
        }

        function mapReduce(db, collName) {
            var options = { finalize: finalizer, out: { inline: 1 } };
            var res = db[collName].mapReduce(mapper, reducer, options);
            assertAlways.commandWorked(res);
        }

        return {
            init: init,
            mapReduce: mapReduce
        };

    })();

    var transitions = {
        init: { mapReduce: 1 },
        mapReduce: { mapReduce: 1 }
    };

    function makeDoc(keyLimit, valueLimit) {
        return {
            _id: ObjectId(),
            key: Random.randInt(keyLimit),
            value: Random.randInt(valueLimit)
        };
    }

    var setup = function(db, collName) {
        // TODO: do we want to use the bulk API for doing the inserts?
        for (var i = 0; i < this.numDocs; ++i) {
            // TODO: this actually does assume that there are no unique indexes
            var res = db[collName].insert(makeDoc(this.numDocs / 100, this.numDocs));
            assertAlways.writeOK(res);
            assertAlways.eq(1, res.nInserted);
        }
    }

    return {
        threadCount: 20,
        iterations: 100,
        data: data,
        states: states,
        transitions: transitions,
        setup: setup
    };

})();
