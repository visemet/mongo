// kv_engine_test_utils.h

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

#pragma once

#include "mongo/db/operation_context_noop.h"
#include "mongo/db/storage/kv/kv_catalog.h"
#include "mongo/db/storage/kv/kv_engine.h"

namespace mongo {

    class KVOperationContext : public OperationContextNoop {
    public:
        KVOperationContext( KVEngine* engine )
            : OperationContextNoop( engine->newRecoveryUnit() ) {
        }
    };

    class KVEngineHelper {
    public:

        // Operations on collections

        Status createCollection( const StringData& ns,
                                 bool rollback = false );

        Status renameCollection( const StringData& fromNS,
                                 const StringData& toNS,
                                 bool rollback = false );

        Status dropCollection( const StringData& ns,
                               bool rollback = false );

        std::string getCollectionIdent( const StringData& ns );

        std::vector<std::string> listCollections();

        // Operations on indexes

        Status createIndex( const StringData& ns,
                            const StringData& idxName,
                            bool rollback = false );

        Status dropIndex( const StringData& ns,
                          const StringData& idxName,
                          bool rollback = false );

        std::vector<std::string> listIndexes( const StringData& ns );

        std::string getIndexIdent( const StringData& ns,
                                   const StringData& idxName );

    private:
        KVEngine* _engine; // not owned here
        KVCatalog* _catalog; // not owned here
    };

} // namespace mongo
