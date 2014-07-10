// storage_engine.cpp

/**
*    Copyright (C) 2014 MongoDB Inc.
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
*    must comply with the GNU Affero General Public License in all respects for
*    all of the code used other than as permitted herein. If you modify file(s)
*    with this exception, you may extend this exception to your version of the
*    file(s), but you are not obligated to do so. If you do not wish to do so,
*    delete this exception statement from your version. If you delete this
*    exception statement from all source files in the program, then also delete
*    it in the license file.
*/

#include "mongo/db/storage/storage_engine.h"

#include "mongo/db/storage_options.h"
#include "mongo/db/storage/heap1/heap1_engine.h"
#include "mongo/db/storage/mmap_v1/mmap_v1_engine.h"
#include "mongo/db/storage/rocks/rocks_engine.h"
#include "mongo/util/log.h"

namespace mongo {

    StorageEngine* globalStorageEngine = 0;

    namespace {
        std::map<std::string,const StorageEngine::Factory*> factorys;
    } // namespace

    void StorageEngine::registerFactory( const std::string& name,
                                         const StorageEngine::Factory* factory ) {
        invariant( factorys.count(name) == 0 );
        factorys[name] = factory;
    }

    void initGlobalStorageEngine() {
        // TODO these should use the StorageEngine::Factory system
        if ( storageGlobalParams.engine == "mmapv1" ) {
            globalStorageEngine = new MMAPV1Engine();
        }
        else if ( storageGlobalParams.engine == "heap1" ) {
            globalStorageEngine = new Heap1Engine();
        }
        else if ( storageGlobalParams.engine == "rocks" ) {
            globalStorageEngine = new RocksEngine( storageGlobalParams.dbpath );
        }
        else {
            const StorageEngine::Factory* factory = factorys[storageGlobalParams.engine];
            uassert(18525, "unknown storage engine: " + storageGlobalParams.engine,
                    factory);
            globalStorageEngine = factory->create( storageGlobalParams );
        }
    }
}

