'use strict';

/**
 * indexed_insert_upsert.js
 *
 * Inserts documents into an indexed collection and asserts that the documents
 * appear in both a collection scan and an index scan. The indexed value is a
 * number, the thread id.
 *
 * Instead of inserting via coll.insert(), this workload inserts using an
 * upsert.
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/indexed_insert_base.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);

        this.counter = 0;
    };

    $config.states.insert = function(db, collName) {
        var doc = this.getDoc();
        doc.counter = this.counter++; // ensure doc is unique to guarantee an upsert occurs

        var res = db[collName].update(doc, { $inc: { unused: 0 } }, { upsert: true });
        assertAlways.eq(0, res.nMatched, tojson(res));
        assertAlways.eq(1, res.nUpserted, tojson(res));
        if (db.getMongo().writeMode() === 'commands') {
            assertAlways.eq(0, res.nModified, tojson(res));
        }

        this.nInserted += this.docsPerInsert;
    };

    return $config;
});
