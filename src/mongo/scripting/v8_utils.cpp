// v8_utils.cpp

/*    Copyright 2009 10gen Inc.
 *
 *    This program is free software: you can redistribute it and/or modify
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

#include "mongo/scripting/v8_utils.h"

#include <boost/smart_ptr.hpp>
#include <boost/thread/condition_variable.hpp>
#include <boost/thread/mutex.hpp>
#include <boost/thread/thread.hpp>
#include <boost/thread/xtime.hpp>
#include <iostream>
#include <map>
#include <sstream>
#include <vector>

#include "mongo/platform/cstdint.h"
#include "mongo/scripting/engine_v8.h"
#include "mongo/scripting/v8_db.h"
#include "mongo/util/log.h"
#include "mongo/util/mongoutils/str.h"

using namespace std;

namespace mongo {

    std::string toSTLString(const v8::Handle<v8::Value>& o) {
        return StringData(V8String(o)).toString();
    }

    /** Get the properties of an object (and its prototype) as a comma-delimited string */
    std::string v8ObjectToString(const v8::Handle<v8::Object>& o) {
        v8::Local<v8::Array> properties = o->GetPropertyNames();
        v8::String::Utf8Value str(properties);
        massert(16696 , "error converting js type to Utf8Value", *str);
        return std::string(*str, str.length());
    }

    std::ostream& operator<<(std::ostream& s, const v8::Handle<v8::Value>& o) {
        v8::String::Utf8Value str(o);
        s << *str;
        return s;
    }

    std::ostream& operator<<(std::ostream& s, const v8::TryCatch* try_catch) {
        v8::HandleScope handle_scope;
        v8::String::Utf8Value exceptionText(try_catch->Exception());
        v8::Handle<v8::Message> message = try_catch->Message();

        if (message.IsEmpty()) {
            s << *exceptionText << endl;
        }
        else {
            v8::String::Utf8Value filename(message->GetScriptResourceName());
            int linenum = message->GetLineNumber();
            cout << *filename << ":" << linenum << " " << *exceptionText << endl;

            v8::String::Utf8Value sourceline(message->GetSourceLine());
            cout << *sourceline << endl;

            int start = message->GetStartColumn();
            for (int i = 0; i < start; i++)
                cout << " ";

            int end = message->GetEndColumn();
            for (int i = start; i < end; i++)
                cout << "^";

            cout << endl;
        }
        return s;
    }

    class JSThreadConfig {
    public:
        JSThreadConfig(V8Scope* scope, const v8::Arguments& args, bool newScope = false) :
            _started(),
            _done(),
            _newScope(newScope) {
            jsassert(args.Length() > 0, "need at least one argument");
            jsassert(args[0]->IsFunction(), "first argument must be a function");

            // arguments need to be copied into the isolate, go through bson
            BSONObjBuilder b;
            for(int i = 0; i < args.Length(); ++i) {
                scope->v8ToMongoElement(b, "arg" + BSONObjBuilder::numStr(i), args[i]);
            }
            _args = b.obj();
        }

        ~JSThreadConfig() {
        }

        void start() {
            jsassert(!_started, "Thread already started");
            JSThread jt(*this);
            _thread.reset(new boost::thread(jt));
            _started = true;
        }
        void join() {
            jsassert(_started && !_done, "Thread not running");
            _thread->join();
            _done = true;
        }

        BSONObj returnData() {
            if (!_done)
                join();
            return _returnData;
        }

    private:
        class JSThread {
        public:
            JSThread(JSThreadConfig& config) : _config(config) {}

            void operator()() {
                try {
                    _config._scope.reset(static_cast<V8Scope*>(globalScriptEngine->newScope()));
                    v8::Locker v8lock(_config._scope->getIsolate());
                    v8::Isolate::Scope iscope(_config._scope->getIsolate());
                    v8::HandleScope handle_scope;
                    v8::Context::Scope context_scope(_config._scope->getContext());

                    BSONObj args = _config._args;
                    v8::Local<v8::Function> f = v8::Function::Cast(
                            *(_config._scope->mongoToV8Element(args.firstElement(), true)));
                    int argc = args.nFields() - 1;

                    // TODO SERVER-8016: properly allocate handles on the stack
                    v8::Local<v8::Value> argv[24];
                    BSONObjIterator it(args);
                    it.next();
                    for(int i = 0; i < argc && i < 24; ++i) {
                        argv[i] = v8::Local<v8::Value>::New(
                                _config._scope->mongoToV8Element(*it, true));
                        it.next();
                    }
                    v8::TryCatch try_catch;
                    v8::Handle<v8::Value> ret =
                            f->Call(_config._scope->getContext()->Global(), argc, argv);
                    if (ret.IsEmpty() || try_catch.HasCaught()) {
                        string e = _config._scope->v8ExceptionToSTLString(&try_catch);
                        log() << "js thread raised js exception: " << e << endl;
                        ret = v8::Undefined();
                        // TODO propagate exceptions (or at least the fact that an exception was
                        // thrown) to the calling js on either join() or returnData().
                    }
                    // ret is translated to BSON to switch isolate
                    BSONObjBuilder b;
                    _config._scope->v8ToMongoElement(b, "ret", ret);
                    _config._returnData = b.obj();
                }
                catch (const DBException& e) {
                    // Keeping behavior the same as for js exceptions.
                    log() << "js thread threw c++ exception: " << e.toString();
                    _config._returnData = BSON("ret" << BSONUndefined);
                }
                catch (const std::exception& e) {
                    log() << "js thread threw c++ exception: " << e.what();
                    _config._returnData = BSON("ret" << BSONUndefined);
                }
                catch (...) {
                    log() << "js thread threw c++ non-exception";
                    _config._returnData = BSON("ret" << BSONUndefined);
                }
            }

        private:
            JSThreadConfig& _config;
        };

        bool _started;
        bool _done;
        bool _newScope;
        BSONObj _args;
        scoped_ptr<boost::thread> _thread;
        scoped_ptr<V8Scope> _scope;
        BSONObj _returnData;
    };

    class CountDownLatchHolder {
    private:
        struct Latch {
            Latch(int32_t count) : count(count) {}
            boost::condition_variable cv;
            boost::mutex mutex;
            int32_t count;
        };

        boost::shared_ptr<Latch> get(string desc) {
            boost::lock_guard<boost::mutex> lock(mutex);
            Map::iterator iter = _latches.find(desc);
            jsassert(iter != _latches.end(), "not a valid CountDownLatch descriptor");
            return iter->second;
        }

        typedef map< string, boost::shared_ptr<Latch> > Map;
        Map _latches;
        boost::mutex _mutex;
        int32_t _counter;
    public:
        CountDownLatchHolder() : _counter(0) {}
        string make(int32_t count) {
            boost::lock_guard<boost::mutex> lock(_mutex);
            int32_t id = ++_counter;
            string desc;
            {
                stringstream ss;
                ss << "latch" << id;
                desc = ss.str();
            }
            _latches.insert(make_pair(desc, boost::make_shared<Latch>(count)));
            return desc;
        }
        void await(string desc) {
            boost::shared_ptr<Latch> latch = get(desc);
            boost::unique_lock<boost::mutex> lock(latch->mutex);
            while (latch->count != 0) {
                latch->cv.wait(lock);
            }
        }
        void countDown(string desc) {
            boost::shared_ptr<Latch> latch = get(desc);
            boost::unique_lock<boost::mutex> lock(latch->mutex);
            if (latch->count > 0) {
                latch->count--;
            }
            if (latch->count == 0) {
                latch->cv.notify_all();
            }
        }
        int32_t getCount(string desc) {
            boost::shared_ptr<Latch> latch = get(desc);
            boost::unique_lock<boost::mutex> lock(latch->mutex);
            return latch->count;
        }
    };
    namespace {
        CountDownLatchHolder globalCountDownLatchHolder;
    }

    v8::Handle<v8::Value> CountDownLatchNew(V8Scope* scope, const v8::Arguments& args) {
        jsassert(args.Length() == 1, "need exactly one argument");
        jsassert(args[0]->IsInt32(), "argument must be an int32");
        int32_t count = v8::Local<v8::Integer>::Cast(args[0])->Value();
        return v8::String::New(globalCountDownLatchHolder.make(count).c_str());
    }

    v8::Handle<v8::Value> CountDownLatchAwait(V8Scope* scope, const v8::Arguments& args) {
        jsassert(args.Length() == 1, "need exactly one argument");
        jsassert(args[0]->IsString(), "argument must be a string");
        globalCountDownLatchHolder.await(toSTLString(args[0]));
        return v8::Undefined();
    }

    v8::Handle<v8::Value> CountDownLatchCountDown(V8Scope* scope, const v8::Arguments& args) {
        jsassert(args.Length() == 1, "need exactly one argument");
        jsassert(args[0]->IsString(), "argument must be a string");
        globalCountDownLatchHolder.countDown(toSTLString(args[0]));
        return v8::Undefined();
    }

    v8::Handle<v8::Value> CountDownLatchGetCount(V8Scope* scope, const v8::Arguments& args) {
        jsassert(args.Length() == 1, "need exactly one argument");
        jsassert(args[0]->IsString(), "argument must be a string");
        return v8::Int32::New(globalCountDownLatchHolder.getCount(toSTLString(args[0])));
    }

    v8::Handle<v8::Value> ThreadInit(V8Scope* scope, const v8::Arguments& args) {
        v8::Handle<v8::Object> it = args.This();
        // NOTE I believe the passed JSThreadConfig will never be freed.  If this
        // policy is changed, JSThread may no longer be able to store JSThreadConfig
        // by reference.
        it->SetHiddenValue(v8::String::New("_JSThreadConfig"),
                           v8::External::New(new JSThreadConfig(scope, args)));
        return v8::Undefined();
    }

    v8::Handle<v8::Value> ScopedThreadInit(V8Scope* scope, const v8::Arguments& args) {
        v8::Handle<v8::Object> it = args.This();
        // NOTE I believe the passed JSThreadConfig will never be freed.  If this
        // policy is changed, JSThread may no longer be able to store JSThreadConfig
        // by reference.
        it->SetHiddenValue(v8::String::New("_JSThreadConfig"),
                           v8::External::New(new JSThreadConfig(scope, args, true)));
        return v8::Undefined();
    }

    JSThreadConfig *thisConfig(V8Scope* scope, const v8::Arguments& args) {
        v8::Local<v8::External> c = v8::External::Cast(
                *(args.This()->GetHiddenValue(v8::String::New("_JSThreadConfig"))));
        JSThreadConfig *config = (JSThreadConfig *)(c->Value());
        return config;
    }

    v8::Handle<v8::Value> ThreadStart(V8Scope* scope, const v8::Arguments& args) {
        thisConfig(scope, args)->start();
        return v8::Undefined();
    }

    v8::Handle<v8::Value> ThreadJoin(V8Scope* scope, const v8::Arguments& args) {
        thisConfig(scope, args)->join();
        return v8::Undefined();
    }

    v8::Handle<v8::Value> ThreadReturnData(V8Scope* scope, const v8::Arguments& args) {
        BSONObj data = thisConfig(scope, args)->returnData();
        return scope->mongoToV8Element(data.firstElement(), true);
    }

    v8::Handle<v8::Value> ThreadInject(V8Scope* scope, const v8::Arguments& args) {
        v8::HandleScope handle_scope;
        jsassert(args.Length() == 1, "threadInject takes exactly 1 argument");
        jsassert(args[0]->IsObject(), "threadInject needs to be passed a prototype");
        v8::Local<v8::Object> o = args[0]->ToObject();

        // install method on the Thread object
        scope->injectV8Function("init", ThreadInit, o);
        scope->injectV8Function("start", ThreadStart, o);
        scope->injectV8Function("join", ThreadJoin, o);
        scope->injectV8Function("returnData", ThreadReturnData, o);
        return handle_scope.Close(v8::Handle<v8::Value>());
    }

    v8::Handle<v8::Value> ScopedThreadInject(V8Scope* scope, const v8::Arguments& args) {
        v8::HandleScope handle_scope;
        jsassert(args.Length() == 1, "threadInject takes exactly 1 argument");
        jsassert(args[0]->IsObject(), "threadInject needs to be passed a prototype");
        v8::Local<v8::Object> o = args[0]->ToObject();

        scope->injectV8Function("init", ScopedThreadInit, o);
        // inheritance takes care of other member functions

        return handle_scope.Close(v8::Handle<v8::Value>());
    }

    void installFork(V8Scope* scope, v8::Handle<v8::Object>& global,
                     v8::Handle<v8::Context>& context) {
        scope->injectV8Function("_threadInject", ThreadInject, global);
        scope->injectV8Function("_scopedThreadInject", ScopedThreadInject, global);

        scope->setObject("CountDownLatch", BSONObj(), false);
        v8::Handle<v8::Object> cdl = scope->get("CountDownLatch").As<v8::Object>();
        scope->injectV8Function("_new", CountDownLatchNew, cdl);
        scope->injectV8Function("_await", CountDownLatchAwait, cdl);
        scope->injectV8Function("_countDown", CountDownLatchCountDown, cdl);
        scope->injectV8Function("_getCount", CountDownLatchGetCount, cdl);
    }

    v8::Handle<v8::Value> v8AssertionException(const char* errorMessage) {
        return v8::ThrowException(v8::Exception::Error(v8::String::New(errorMessage)));
    }
    v8::Handle<v8::Value> v8AssertionException(const std::string& errorMessage) {
        return v8AssertionException(errorMessage.c_str());
    }
}
