'use strict';

/**
 * Returns true if the process is a mongos, and false otherwise.
 *
 */
function isMongos(db) {
    var res = db.runCommand('ismaster');
    assert.commandWorked(res);

    return 'isdbgrid' === res.msg;
}

/**
 * Returns true if the process is a mongod, and false otherwise.
 *
 */
function isMongod(db) {
    return !isMongos(db);
}

/**
 * Returns true if the mongod is running with the "mmapv1" storage engine, and false otherwise.
 */
function isMMAPv1(db) {
    var status = db.serverStatus();
    assert.commandWorked(status);

    assert(isMongod(db),
           'no storage engine is reported when connected to mongos');
    assert.neq('undefined', typeof status.storageEngine,
               'missing storage engine info in server status');

    return status.storageEngine.name === 'mmapv1';
}

/**
 * Returns true if the mongod is running with the "wiredTiger" storage engine, and false otherwise.
 */
function isWiredTiger(db) {
    var status = db.serverStatus();
    assert.commandWorked(status);

    assert(isMongod(db),
           'no storage engine is reported when connected to mongos');
    assert.neq('undefined', typeof status.storageEngine,
               'missing storage engine info in server status');

    return status.storageEngine.name === 'wiredTiger';
}

/**
 * Returns true if the mongod is running with a storage engine that supports in-place updates, and
 * false otherwise.
 */
function supportsInPlaceUpdates(db) {
    var storageEngines = ['ephemeralForTest', 'mmapv1'];

    var status = db.serverStatus();
    assert.commandWorked(status);

    assert(isMongod(db),
           'no storage engine is reported when connected to mongos');
    assert.neq('undefined', typeof status.storageEngine,
               'missing storage engine info in server status');

    return storageEngines.indexOf(status.storageEngine.name) >= 0;
}
