'use strict';

/**
 * Helpers for dropping collections or databases created by a workload
 * during its execution.
 */

function dropCollections(db, pattern) {
    assert(pattern instanceof RegExp, 'expected pattern to be a regular expression');

    var res = db.runCommand('listCollections', { filter: { name: pattern } });
    assertAlways.commandWorked(res);

    res.collections.forEach(function(collInfo) {
        assertAlways(db[collInfo.name].drop());
    });
}

function dropDatabases(db, pattern) {
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
}

/**
 * Helper for dropping roles or users that were created by a workload
 * during its execution.
 */

function dropRoles(db, pattern) {
    assert(pattern instanceof RegExp, 'expected pattern to be a regular expression');

    db.getRoles().forEach(function(roleInfo) {
        if (pattern.test(roleInfo.name)) {
            assertAlways(db.dropRole(roleInfo.name));
        }
    });
}

function dropUsers(db, pattern) {
    assert(pattern instanceof RegExp, 'expected pattern to be a regular expression');

    db.getUsers().forEach(function(userInfo) {
        if (pattern.test(userInfo.name)) {
            assertAlways(db.dropUser(userInfo.name));
        }
    });
}
