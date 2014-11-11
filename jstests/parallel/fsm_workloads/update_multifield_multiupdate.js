'use strict';

/**
 * update_multifield_multiupdate.js
 *
 * Does updates that affect multiple fields on multiple documents.
 * The collection has an index for each field, and a multikey index for all fields.
 */
load('jstests/parallel/fsm_libs/extend_workload.js'); // for extendWorkload
load('jstests/parallel/fsm_workloads/update_multifield.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.data.multi = true;

    $config.data.assertResult = function(res, db, collName, query) {
        assertAlways.eq(0, res.nUpserted, tojson(res));
        // serverStatus doesn't always report the storageEngine. It's also not clear what we would
        // want to check in a mixed-storage-engine cluster.
        var serverStatus = db.serverStatus();
        if (serverStatus.storageEngine && serverStatus.storageEngine.name === 'mmapv1') {
            // You might expect each document to be matched exactly once, but if a document moves
            // then it can be matched 0 times or more than once instead.
            // So all we can assert is that nMatched >= 0.
            assertWhenOwnColl.gte(res.nMatched, 0, tojson(res));
        } else {
            // TODO can we assert exact equality with wiredtiger?
            assertWhenOwnColl.lte(this.numDocs, res.nMatched, tojson(res));
        }

        if (db.getMongo().writeMode() === 'commands') {
            assertWhenOwnColl.eq(res.nMatched, res.nModified, tojson(res));
        }

        var docs = db[collName].find().toArray();
        docs.forEach(function(doc) {
            assertWhenOwnColl.eq('number', typeof doc.z);
            assertWhenOwnColl.gt(doc.z, 0);
        });
    };

    return $config;
});
