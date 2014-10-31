load('jstests/parallel/libs/runner.js'); // for parseConfig
load('jstests/parallel/example.js');

var $super = parseConfig($config);
var $config = (function() {
    var $config = Object.extend({}, $super, true);

    $config.setup = function(db, collName) {
        $super.setup.apply(this, arguments);

        db[collName].ensureIndex({ exampleIndexedField: 1 });
    };

    return $config;
})();


