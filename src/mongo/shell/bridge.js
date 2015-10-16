/**
 * Wrapper around a mongobridge process. Construction of a MongoBridge instance will start a new
 * mongobridge process that listens on 'options.port' and forwards messages to 'options.dest'.
 *
 * @param {Object} options
 * @param {string} options.dest - The host:port to forward messages to.
 * @param {string} [options.hostName=localhost] - The hostname to specify when connecting to the
 * mongobridge process.
 * @param {number} [options.port=allocatePort()] - The port number the mongobridge should listen on.
 *
 * @returns {Proxy} Acts as a typical connection object to options.hostName:options.port that has
 * additional functions exposed to shape network traffic from other processes.
 */
function MongoBridge(options) {
    'use strict';

    if (!(this instanceof MongoBridge)) {
        return new MongoBridge(options);
    }

    options = options || {};
    if (!options.hasOwnProperty('dest')) {
        throw new Error('Missing required field "dest"');
    }

    var hostName = options.hostName || 'localhost';

    this.dest = options.dest;
    this.port = options.port || allocatePort();

    var userConn;

    // Starts the mongobridge on port 'this.port' routing network traffic to 'this.dest'.
    (function start() {
        var pid = _startMongoProgram('mongobridge', '--port', this.port, '--dest', this.dest);

        var failedToStart = false;
        assert.soon((function() {
            try {
                userConn = new Mongo(hostName + ':' + this.port);
                return true;
            } catch (e) {
                if (!checkProgram(pid)) {
                    failedToStart = true;
                    return true;
                }
            }
            return false;
        }).bind(this), 'failed to connect to the mongobridge on port ' + this.port);
        assert(!failedToStart, 'mongobridge failed to start on port ' + this.port);
    }).call(this);

    // Use a separate (hidden) connection for configuring the mongobridge process.
    var controlConn = new Mongo(hostName + ':' + this.port);

    /**
     * Terminates the mongobridge process.
     */
    this.stop = function stop() {
        _stopMongoProgram(this.port);
    };

    // Throws an error if 'obj' is not a MongoBridge instance.
    function throwErrorIfNotMongoBridgeInstance(obj) {
        if (!(obj instanceof MongoBridge)) {
            throw new Error('Expected MongoBridge instance, but got ' + tojson(obj));
        }
    }

    // Runs a command intended to configure the mongobridge by sending an OP_COMMAND message with
    // metadata={$forBridge: true}.
    function runBridgeCommand(conn, cmdName, cmdArgs) {
        var dbName = 'test';
        var metadata = {$forBridge: true};
        var response = conn.runCommandWithMetadata(dbName, cmdName, metadata, cmdArgs);
        return response.commandReply;
    }

    /**
     * Allows communication between 'this.dest' and the 'dest' of each of the 'bridges'.
     *
     * Configures 'this' bridge to accept new connections from the 'dest' of each of the 'bridges'.
     * Additionally configures each of the 'bridges' to accept new connections from 'this.dest'.
     *
     * @param {(MongoBridge|MongoBridge[])} bridges
     */
    this.reconnect = function reconnect(bridges) {
        if (!Array.isArray(bridges)) {
            bridges = [bridges];
        }
        bridges.forEach(throwErrorIfNotMongoBridgeInstance);

        this.acceptConnectionsFrom(bridges);
        bridges.forEach(function(bridge) {
            bridge.acceptConnectionsFrom(this);
        }, this);
    };

    /**
     * Disallows communication between 'this.dest' and the 'dest' of each of the 'bridges'.
     *
     * Configures 'this' bridge to close existing connections and reject new connections from the
     * 'dest' of each of the 'bridges'. Additionally configures each of the 'bridges' to close
     * existing connections and reject new connections from 'this.dest'.
     *
     * @param {(MongoBridge|MongoBridge[])} bridges
     */
    this.disconnect = function disconnect(bridges) {
        if (!Array.isArray(bridges)) {
            bridges = [bridges];
        }
        bridges.forEach(throwErrorIfNotMongoBridgeInstance);

        this.rejectConnectionsFrom(bridges);
        bridges.forEach(function(bridge) {
            bridge.rejectConnectionsFrom(this);
        }, this);
    };

    /**
     * Configures 'this' bridge to accept new connections from the 'dest' of each of the 'bridges'.
     *
     * @param {(MongoBridge|MongoBridge[])} bridges
     */
    this.acceptConnectionsFrom = function acceptConnectionsFrom(bridges) {
        if (!Array.isArray(bridges)) {
            bridges = [bridges];
        }
        bridges.forEach(throwErrorIfNotMongoBridgeInstance);

        bridges.forEach(function(bridge) {
            var res = runBridgeCommand(controlConn, 'acceptConnectionsFrom', {host: bridge.dest});
            assert.commandWorked(res, 'failed to configure the mongobridge listening on port ' +
                                 this.port + ' to accept new connections from ' + bridge.dest);
        }, this);
    };

    /**
     * Configures 'this' bridge to close existing connections and reject new connections from the
     * 'dest' of each of the 'bridges'.
     *
     * @param {(MongoBridge|MongoBridge[])} bridges
     */
    this.rejectConnectionsFrom = function rejectConnectionsFrom(bridges) {
        if (!Array.isArray(bridges)) {
            bridges = [bridges];
        }
        bridges.forEach(throwErrorIfNotMongoBridgeInstance);

        bridges.forEach(function(bridge) {
            var res = runBridgeCommand(controlConn, 'rejectConnectionsFrom', {host: bridge.dest});
            assert.commandWorked(res, 'failed to configure the mongobridge listening on port ' +
                                 this.port + ' to hang up connections from ' + bridge.dest);
        }, this);
    };

    /**
     * Configures 'this' bridge to delay forwarding requests from the 'dest' of each of the
     * 'bridges' to 'this.dest' by the specified amount.
     *
     * @param {(MongoBridge|MongoBridge[])} bridges
     * @param {number} delay - The delay to apply in milliseconds.
     */
    this.delayMessagesFrom = function delayMessagesFrom(bridges, delay) {
        if (!Array.isArray(bridges)) {
            bridges = [bridges];
        }
        bridges.forEach(throwErrorIfNotMongoBridgeInstance);

        bridges.forEach(function(bridge) {
            var res = runBridgeCommand(controlConn, 'delayMessagesFrom', {
                host: bridge.dest,
                delay: delay,
            });
            assert.commandWorked(res, 'failed to configure the mongobridge listening on port ' +
                                 this.port + ' to delay messages from ' + bridge.dest + ' by ' +
                                 delay + ' milliseconds');
        }, this);
    };

    // Use a Proxy to "extend" the underlying connection object. The C++ functions, e.g.
    // runCommand(), require that they are called on the Mongo instance itself and so typical
    // prototypical inheritance isn't possible.
    return new Proxy(this, {
        get: function get(target, property, receiver) {
            // Delegate any properties not in the prototype chain of the MongoBridge instance to the
            // the Mongo instance.
            if (property in target) {
                return target[property];
            }
            var value = userConn[property];
            if (typeof value === 'function') {
                return value.bind(userConn);
            }
            return value;
        },
    });
}
