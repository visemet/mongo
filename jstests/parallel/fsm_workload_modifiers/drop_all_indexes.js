'use strict';

/**
 * drop_all_indexes.js
 *
 * Defines a modifier for workloads that drops all indexes except { _id: 1 } at the end of setup.
 */

function dropAllIndexes($config, $super) {

    $config.setup = function setup(db, collName) {
        $super.setup.apply(this, arguments);

        var res = db[collName].dropIndexes();
        assertAlways.commandWorked(res);
    };

    return $config;
}
