/**
 *    Copyright (C) 2008 10gen Inc.
 *
 *    This program is free software: you can redistribute it and/or  modify
 *    it under the terms of the GNU Affero General Public License, version 3,
 *    as published by the Free Software Foundation.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *    As a special exception, the copyright holders give permission to link the
 *    code of portions of this program with the OpenSSL library under certain
 *    conditions as described in each individual source file and distribute
 *    linked combinations including the program with the OpenSSL library. You
 *    must comply with the GNU Affero General Public License in all respects
 *    for all of the code used other than as permitted herein. If you modify
 *    file(s) with this exception, you may extend this exception to your
 *    version of the file(s), but you are not obligated to do so. If you do not
 *    wish to do so, delete this exception statement from your version. If you
 *    delete this exception statement from all source files in the program,
 *    then also delete it in the license file.
 */

#define MONGO_LOG_DEFAULT_COMPONENT ::mongo::logger::LogComponent::kDefault

#include "mongo/platform/basic.h"

#include <boost/optional.hpp>

#include "mongo/base/init.h"
#include "mongo/base/initializer.h"
#include "mongo/client/dbclientinterface.h"
#include "mongo/db/dbmessage.h"
#include "mongo/db/service_context.h"
#include "mongo/db/service_context_noop.h"
#include "mongo/rpc/command_request.h"
#include "mongo/rpc/factory.h"
#include "mongo/rpc/reply_builder_interface.h"
#include "mongo/rpc/request_interface.h"
#include "mongo/stdx/memory.h"
#include "mongo/stdx/mutex.h"
#include "mongo/stdx/thread.h"
#include "mongo/tools/bridge_commands.h"
#include "mongo/tools/mongobridge_options.h"
#include "mongo/util/log.h"
#include "mongo/util/mongoutils/str.h"
#include "mongo/util/net/listen.h"
#include "mongo/util/net/message.h"
#include "mongo/util/exit_code.h"
#include "mongo/util/quick_exit.h"
#include "mongo/util/static_observer.h"
#include "mongo/util/signal_handlers.h"
#include "mongo/util/text.h"
#include "mongo/util/timer.h"

namespace mongo {

namespace {

boost::optional<HostAndPort> extractHostInfo(const rpc::RequestInterface& request) {
    BSONObj args = request.getCommandArgs();
    if (auto hostInfoElem = args["hostInfo"]) {
        if (hostInfoElem.type() == String) {
            return HostAndPort{hostInfoElem.valueStringData()};
        }
    }
    return boost::none;
}

class Forwarder {
public:
    Forwarder(MessagingPort& mp, stdx::mutex* settingsMutex, HostSettingsMap& settings)
        : _mp(mp), _settingsMutex(settingsMutex), _settings(settings) {}

    void operator()() {
        DBClientConnection dest;

        {
            const int kConnectTimeoutSecs = 30;
            std::string errMsg;
            Timer connectTimer;
            while (!dest.connect(HostAndPort{mongoBridgeGlobalParams.destUri}, errMsg)) {
                if (connectTimer.seconds() >= kConnectTimeoutSecs) {
                    warning() << "Unable to establish connection to "
                              << mongoBridgeGlobalParams.destUri << " after " << kConnectTimeoutSecs
                              << " seconds: " << errMsg;
                    log() << "end connection " << _mp.psock->remoteString();
                    _mp.shutdown();
                    return;
                }
                sleepmillis(500);
            }
        }

        bool receivingFirstMessage = true;
        boost::optional<HostAndPort> host;

        Message request;
        Message response;

        while (true) {
            try {
                request.reset();
                if (!_mp.recv(request)) {
                    log() << "end connection " << _mp.psock->remoteString();
                    _mp.shutdown();
                    break;
                }

                if (request.operation() == dbQuery || request.operation() == dbCommand) {
                    auto cmdRequest = rpc::makeRequest(&request);
                    if (receivingFirstMessage) {
                        host = extractHostInfo(*cmdRequest);
                    }

                    std::string hostName = "<unknown>";
                    if (host) {
                        hostName = host->toString();
                    }
                    LOG(0) << "Received \"" << cmdRequest->getCommandName()
                           << "\" command with arguments " << cmdRequest->getCommandArgs()
                           << " from " << hostName;
                }
                receivingFirstMessage = false;

                int requestId = request.header().getId();
                if (auto status = maybeProcessBridgeCommand(request)) {
                    auto replyBuilder = rpc::makeReplyBuilder(rpc::Protocol::kOpCommandV1);
                    BSONObj metadata;
                    BSONObj reply;
                    StatusWith<BSONObj> commandReply(reply);
                    if (!status->isOK()) {
                        commandReply = StatusWith<BSONObj>(*status);
                    }
                    auto cmdResponse =
                        replyBuilder->setMetadata(metadata).setCommandReply(commandReply).done();
                    _mp.say(*cmdResponse, requestId);
                    continue;
                }

                HostSettings hostSettings;
                if (host) {
                    stdx::lock_guard<stdx::mutex> lk(*_settingsMutex);
                    hostSettings = _settings[*host];
                }

                switch (hostSettings.state) {
                    case HostSettings::State::kForward:
                        sleepmillis(hostSettings.delay);
                        break;
                    case HostSettings::State::kHangUp:
                        log() << "Rejecting connection from " << host->toString()
                              << ", end connection " << _mp.psock->remoteString();
                        _mp.shutdown();
                        return;
                }

                if (request.operation() == dbQuery || request.operation() == dbMsg ||
                    request.operation() == dbGetMore || request.operation() == dbCommand) {
                    // Forward the message to 'dest' and receive its reply in 'response'.
                    response.reset();
                    dest.port().call(request, response);

                    // If there's nothing to respond back to '_mp' with, then close the connection.
                    if (response.empty()) {
                        log() << "Received an empty response, end connection "
                              << _mp.psock->remoteString();
                        _mp.shutdown();
                        break;
                    }

                    _mp.say(response, requestId);

                    // If 'exhaust' is true, then instead of trying to receive another message from
                    // '_mp', receive messages from 'dest' until it returns a cursor id of zero.
                    bool exhaust = false;
                    if (request.operation() == dbQuery) {
                        DbMessage d(request);
                        QueryMessage q(d);
                        exhaust = q.queryOptions & QueryOption_Exhaust;
                    }
                    while (exhaust) {
                        MsgData::View header = response.header();
                        QueryResult::View qr = header.view2ptr();
                        if (qr.getCursorId()) {
                            response.reset();
                            dest.port().recv(response);
                            _mp.say(response, requestId);
                        } else {
                            exhaust = false;
                        }
                    }
                } else {
                    dest.port().say(request, requestId);
                }
            } catch (const DBException& ex) {
                error() << "Caught DBException in Forwarder: " << ex << ", end connection "
                        << _mp.psock->remoteString();
                _mp.shutdown();
                break;
            } catch (const std::exception& ex) {
                severe() << "Caught std::exception in Forwarder: " << ex.what() << ", terminating";
                quickExit(EXIT_UNCAUGHT);
            } catch (...) {
                severe() << "Caught unknown exception in Forwarder, terminating";
                quickExit(EXIT_UNCAUGHT);
            }
        }
    }

private:
    Status runBridgeCommand(StringData cmdName, BSONObj cmdObj) {
        auto status = Command::findCommand(cmdName);
        if (!status.isOK()) {
            return status.getStatus();
        }

        Command* command = status.getValue();
        return command->run(cmdObj, _settingsMutex, _settings);
    }

    boost::optional<Status> maybeProcessBridgeCommand(Message& msg) {
        if (msg.operation() != dbCommand) {
            return boost::none;
        }

        rpc::CommandRequest request{&msg};
        if (auto forBridge = request.getMetadata()["$forBridge"]) {
            if (!forBridge.trueValue()) {
                return boost::none;
            }
            return runBridgeCommand(request.getCommandName(), request.getCommandArgs());
        }

        return boost::none;
    }

    MessagingPort& _mp;

    stdx::mutex* _settingsMutex;
    HostSettingsMap& _settings;
};

class BridgeListener final : public Listener {
public:
    BridgeListener() : Listener("bridge", "", mongoBridgeGlobalParams.port) {}

    void acceptedMP(MessagingPort* mp) final {
        _ports.insert(mp);
        Forwarder f(*mp, &_settingsMutex, _settings);
        stdx::thread t(f);
        t.detach();
    }

    void shutdownAll() {
        for (auto mp : _ports) {
            mp->shutdown();
        }
    }

private:
    std::set<MessagingPort*> _ports;

    stdx::mutex _settingsMutex;
    HostSettingsMap _settings;
};

std::unique_ptr<mongo::BridgeListener> listener;

MONGO_INITIALIZER(SetGlobalEnvironment)(InitializerContext* context) {
    setGlobalServiceContext(stdx::make_unique<ServiceContextNoop>());
    return Status::OK();
}

}  // namespace

bool inShutdown() {
    return false;
}

void logProcessDetailsForLogRotate() {}

void exitCleanly(ExitCode code) {
    ListeningSockets::get()->closeAll();
    listener->shutdownAll();
    quickExit(code);
}

int bridgeMain(int argc, char** argv, char** envp) {
    static StaticObserver staticObserver;
    setupSignalHandlers(false);
    runGlobalInitializersOrDie(argc, argv, envp);
    startSignalProcessingThread();

    listener = stdx::make_unique<BridgeListener>();
    listener->setupSockets();
    listener->initAndListen();

    return EXIT_CLEAN;
}

}  // namespace mongo

#if defined(_WIN32)
// In Windows, wmain() is an alternate entry point for main(), and receives the same parameters
// as main() but encoded in Windows Unicode (UTF-16); "wide" 16-bit wchar_t characters.  The
// WindowsCommandLine object converts these wide character strings to a UTF-8 coded equivalent
// and makes them available through the argv() and envp() members.  This enables bridgeMain()
// to process UTF-8 encoded arguments and environment variables without regard to platform.
int wmain(int argc, wchar_t* argvW[], wchar_t* envpW[]) {
    WindowsCommandLine wcl(argc, argvW, envpW);
    int exitCode = mongo::bridgeMain(argc, wcl.argv(), wcl.envp());
    mongo::quickExit(exitCode);
}
#else
int main(int argc, char* argv[], char** envp) {
    int exitCode = mongo::bridgeMain(argc, argv, envp);
    mongo::quickExit(exitCode);
}
#endif
