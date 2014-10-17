// kv_engine_test_utils.cpp

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

#include "mongo/db/storage/kv/kv_engine_test_utils.h"

#include "mongo/db/storage/bson_collection_catalog_entry.h"
#include "mongo/db/storage/kv/kv_catalog.h"
#include "mongo/db/storage/kv/kv_engine.h"

using std::string;
using std::vector;

namespace mongo {

    // Operations on collections

    Status KVEngineHelper::createCollection( const StringData& ns,
                                             bool rollback ) {
        KVOperationContext opCtx( _engine );
        WriteUnitOfWork uow( &opCtx );

        Status status = _catalog->newCollection( &opCtx, ns, CollectionOptions() );
        if ( !rollback ) {
            uow.commit();
        }

        return status;

    }

    Status KVEngineHelper::renameCollection( const StringData& fromNS,
                                             const StringData& toNS,
                                             bool rollback ) {

        KVOperationContext opCtx( _engine );
        WriteUnitOfWork uow( &opCtx );

        Status status = _catalog->renameCollection( &opCtx, fromNS, toNS, false );
        if ( !rollback ) {
            uow.commit();
        }

        return status;
    }

    Status KVEngineHelper::dropCollection( const StringData& ns,
                                           bool rollback ) {

        KVOperationContext opCtx( _engine );
        WriteUnitOfWork uow( &opCtx );

        Status status = _catalog->dropCollection( &opCtx, ns );
        if ( !rollback ) {
            uow.commit();
        }

        return status;
    }

    string KVEngineHelper::getCollectionIdent( const StringData& ns ) {
        return _catalog->getCollectionIdent( ns );
   }

    vector<string> KVEngineHelper::listCollections() {
        vector<string> collections;
        _catalog->getAllCollections( &collections );
        return collections;
    }

    // Operations on indexes

    Status KVEngineHelper::createIndex( const StringData& ns,
                                        const StringData& idxName,
                                        bool rollback ) {

        // TODO acquire X collection lock to protect metadata?
        KVOperationContext opCtx( _engine );
        BSONCollectionCatalogEntry::MetaData md = _catalog->getMetaData( &opCtx, ns );

        if ( 0 <= md.findIndexOffset( idxName ) ) {
            return Status( ErrorCodes::IndexAlreadyExists, "index already exists" );
        }

        md.indexes.push_back( BSONCollectionCatalogEntry::IndexMetaData( BSON( "name" << idxName ),
                                                                         false,
                                                                         DiskLoc(),
                                                                         false ));

        WriteUnitOfWork uow( &opCtx );

        _catalog->putMetaData( &opCtx, ns, md );
        if ( !rollback ) {
            uow.commit();
        }

        return Status::OK();
    }

    Status KVEngineHelper::dropIndex( const StringData& ns,
                                      const StringData& idxName,
                                      bool rollback ) {

        // TODO acquire X collection lock to protect metadata?
        KVOperationContext opCtx( _engine );
        BSONCollectionCatalogEntry::MetaData md = _catalog->getMetaData( &opCtx, ns );

        bool success = md.eraseIndex( idxName );

        if ( !success ) {
            return Status( ErrorCodes::IndexNotFound, "index not found" );
        }

        WriteUnitOfWork uow( &opCtx );

        _catalog->putMetaData( &opCtx, ns, md );
        if ( !rollback ) {
            uow.commit();
        }

        return Status::OK();
    }

    vector<string> KVEngineHelper::listIndexes( const StringData& ns ) {
        KVOperationContext opCtx( _engine );
        BSONCollectionCatalogEntry::MetaData md = _catalog->getMetaData( &opCtx, ns );

        vector<string> indexes;
        for ( size_t i = 0; i < md.indexes.size(); ++i ) {
            indexes.push_back( md.indexes[i].name() );
        }
        return indexes;
    }

    string KVEngineHelper::getIndexIdent( const StringData& ns,
                               const StringData& idxName ) {

        KVOperationContext opCtx( _engine );
        return _catalog->getIndexIdent( &opCtx, ns, idxName );
    }
};
