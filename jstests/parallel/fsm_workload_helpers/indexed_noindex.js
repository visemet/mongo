/* Defines a modifier for indexed workloads that drops the index at the end of setup.
 */
function indexedNoindex($config, $super) {

    $config.setup = function(db, collName) {
        $super.setup.apply(this, arguments);

        var res = db[collName].dropIndex(this.getIndexSpec());
        assertAlways.commandWorked(res);
    };

    return $config;
}
