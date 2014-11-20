/**
 * indexed_insert_text_multikey.js
 *
 * like indexed_insert_text.js but the indexed value is an array of strings
 */
load('jstests/parallel/fsm_libs/runner.js'); // for parseConfig
load('jstests/parallel/fsm_workloads/indexed_insert_text.js'); // for $config

var $config = extendWorkload($config, function($config, $super) {

    $config.states.init = function(db, collName) {
        $super.states.init.apply(this, arguments);
    };

    $config.data.getRandomText = function() {
        var len = Random.randInt(5);
        var textArr = [];
        for (var i = 0; i < len; ++i) {
            textArr.push($super.data.getRandomText.call(this, arguments));
        }
        return textArr;
    };

    return $config;
});
