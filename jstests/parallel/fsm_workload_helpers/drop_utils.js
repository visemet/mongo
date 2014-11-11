'use strict';

/**
 * Helpers for dropping collections or databases created by a workload
 * during its execution.
 */

var dropCollections = function(db, pattern) {
    assert(pattern instanceof RegExp, 'expected pattern to be a regular expression');

    var res = db.runCommand('listCollections', { filter: { name: pattern } });
    assertAlways.commandWorked(res);

    res.collections.forEach(function(collInfo) {
        assertAlways(db[collInfo.name].drop());
    });
};

var dropDatabases = function(db, pattern) {
    assert(pattern instanceof RegExp, 'expected pattern to be a regular expression');

    var res = db.adminCommand('listDatabases');
    assertAlways.commandWorked(res);

    res.databases.forEach(function(dbInfo) {
        if (pattern.test(dbInfo.name)) {
            var res = db.getSiblingDB(dbInfo.name).dropDatabase();
            assertAlways.commandWorked(res);
            assertAlways.eq(dbInfo.name, res.dropped);
        }
    });
};
