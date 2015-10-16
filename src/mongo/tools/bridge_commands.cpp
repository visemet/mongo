/**
 * Copyright (C) 2015 MongoDB Inc.
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

#include "mongo/tools/bridge_commands.h"

#include "mongo/base/init.h"
#include "mongo/base/status.h"
#include "mongo/base/status_with.h"
#include "mongo/bson/bsonobj.h"
#include "mongo/util/net/hostandport.h"

namespace mongo {

namespace {

class CmdDelayMessagesFrom final : public Command {
public:
    Status run(const BSONObj& cmdObj, stdx::mutex* settingsMutex, HostSettingsMap& settings) final {
        invariant(settingsMutex);

        auto hostElem = cmdObj["host"];
        if (!hostElem) {
            return {ErrorCodes::BadValue, "Missing required field 'host'"};
        } else if (hostElem.type() != String) {
            return {ErrorCodes::TypeMismatch, "'host' field must be a string"};
        }

        auto delayElem = cmdObj["delay"];
        if (delayElem) {
            if (!delayElem.isNumber()) {
                return {ErrorCodes::TypeMismatch, "'delay' field must be a number"};
            }
        } else {
            return {ErrorCodes::BadValue, "Missing required field 'delay'"};
        }

        HostAndPort host(hostElem.valueStringData());
        int newDelay = delayElem.numberInt();
        {
            stdx::lock_guard<stdx::mutex> lk(*settingsMutex);
            auto& hostSettings = settings[host];
            hostSettings.state = HostSettings::State::kForward;
            hostSettings.delay = newDelay;
        }
        return Status::OK();
    }
};

class CmdAcceptConnectionsFrom final : public Command {
public:
    Status run(const BSONObj& cmdObj, stdx::mutex* settingsMutex, HostSettingsMap& settings) final {
        invariant(settingsMutex);

        auto hostElem = cmdObj["host"];
        if (!hostElem) {
            return {ErrorCodes::BadValue, "Missing required field 'host'"};
        } else if (hostElem.type() != String) {
            return {ErrorCodes::TypeMismatch, "'host' field must be a string"};
        }

        HostAndPort host(hostElem.valueStringData());
        {
            stdx::lock_guard<stdx::mutex> lk(*settingsMutex);
            auto& hostSettings = settings[host];
            hostSettings.state = HostSettings::State::kForward;
        }
        return Status::OK();
    }
};

class CmdRejectConnectionsFrom final : public Command {
public:
    Status run(const BSONObj& cmdObj, stdx::mutex* settingsMutex, HostSettingsMap& settings) final {
        invariant(settingsMutex);

        auto hostElem = cmdObj["host"];
        if (!hostElem) {
            return {ErrorCodes::BadValue, "Missing required field 'host'"};
        } else if (hostElem.type() != String) {
            return {ErrorCodes::TypeMismatch, "'host' field must be a string"};
        }

        HostAndPort host(hostElem.valueStringData());
        {
            stdx::lock_guard<stdx::mutex> lk(*settingsMutex);
            auto& hostSettings = settings[host];
            hostSettings.state = HostSettings::State::kHangUp;
        }
        return Status::OK();
    }
};

StringMap<Command*> commandMap;

MONGO_INITIALIZER(RegisterBridgeCommands)(InitializerContext* context) {
    commandMap["delayMessagesFrom"] = new CmdDelayMessagesFrom();
    commandMap["acceptConnectionsFrom"] = new CmdAcceptConnectionsFrom();
    commandMap["rejectConnectionsFrom"] = new CmdRejectConnectionsFrom();
    return Status::OK();
}

}  // namespace

StatusWith<Command*> Command::findCommand(StringData cmdName) {
    auto it = commandMap.find(cmdName);
    if (it != commandMap.end()) {
        invariant(it->second);
        return it->second;
    }
    return {ErrorCodes::CommandNotFound, str::stream() << "Unknown command: " << cmdName};
}

}  // namespace mongo
