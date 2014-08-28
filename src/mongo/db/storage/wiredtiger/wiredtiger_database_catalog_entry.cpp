// wiredtiger_database_catalog_entry.cpp

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

#include "mongo/db/storage/wiredtiger/wiredtiger_database_catalog_entry.h"

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

#include "mongo/db/catalog/collection_options.h"
#include "mongo/db/index/2d_access_method.h"
#include "mongo/db/index/btree_access_method.h"
#include "mongo/db/index/fts_access_method.h"
#include "mongo/db/index/hash_access_method.h"
#include "mongo/db/index/haystack_access_method.h"
#include "mongo/db/index/index_access_method.h"
#include "mongo/db/index/index_descriptor.h"
#include "mongo/db/index/s2_access_method.h"
#include "mongo/db/json.h"
#include "mongo/db/operation_context.h"
#include "mongo/db/operation_context.h"
#include "mongo/db/storage/wiredtiger/wiredtiger_index.h"
#include "mongo/db/storage/wiredtiger/wiredtiger_recovery_unit.h"

#include "mongo/db/storage_options.h"
#include "mongo/util/log.h"

namespace mongo {

    WiredTigerDatabaseCatalogEntry::WiredTigerDatabaseCatalogEntry(
                WiredTigerDatabase &db,
                const StringData& name )
        : DatabaseCatalogEntry( name ), _db(db) {

            _loadAllCollections();
    }

    WiredTigerDatabaseCatalogEntry::~WiredTigerDatabaseCatalogEntry() {
        for ( EntryMap::const_iterator i = _entryMap.begin(); i != _entryMap.end(); ++i ) {
            delete i->second;
        }
        _entryMap.clear();
    }

    bool WiredTigerDatabaseCatalogEntry::isEmpty() const {
        boost::mutex::scoped_lock lk( _entryMapLock );
        return _entryMap.empty();
    }

    void WiredTigerDatabaseCatalogEntry::appendExtraStats( OperationContext* txn,
                                                      BSONObjBuilder* out,
                                                      double scale ) const {
    }

    CollectionCatalogEntry* WiredTigerDatabaseCatalogEntry::getCollectionCatalogEntry(
            OperationContext* txn,
            const StringData& ns ) const {
        boost::mutex::scoped_lock lk( _entryMapLock );
        EntryMap::const_iterator i = _entryMap.find( ns.toString() );
        if ( i == _entryMap.end() )
            return NULL;
        return i->second;
    }

    RecordStore* WiredTigerDatabaseCatalogEntry::getRecordStore( OperationContext* txn,
                                                            const StringData& ns ) {
        boost::mutex::scoped_lock lk( _entryMapLock );
        EntryMap::iterator i = _entryMap.find( ns.toString() );
        if ( i == _entryMap.end() )
            return NULL;
        return i->second->rs.get();
    }

    void WiredTigerDatabaseCatalogEntry::_loadAllCollections( ) {
        boost::mutex::scoped_lock lk( _entryMapLock );

        /* Only do this once. */
        if (!_entryMap.empty())
            return;

        WiredTigerSession swrap(_db);
        WiredTigerCursor cursor("metadata:", swrap);
        WT_CURSOR *c = cursor.Get();
        invariant(c != NULL);

        int ret;
        const char *key;
        std::string table_prefix = "table:" + name();
        while ((ret = c->next(c)) == 0) {
            ret = c->get_key(c, &key);
            invariant(ret == 0);
            if (strcmp("metadata:", key) == 0)
                continue;
            if (strncmp(table_prefix.c_str(), key, table_prefix.length()) != 0)
                continue;
            if (strstr(key, ".$") != NULL)
                continue;

            // Initialize the namespace we found - skip the table: prefix.
            _loadCollection(swrap, key + 6);
        }
        invariant(ret == WT_NOTFOUND || ret == 0);
        name();
    }

    void WiredTigerDatabaseCatalogEntry::_loadCollection(
        WiredTigerSession& swrap, const std::string &name) {

        // Create the collection
        CollectionOptions *options = new CollectionOptions();
        Entry *entry = new Entry(mongo::StringData(name), *options);
        entry->rs.reset(new WiredTigerRecordStore(name, _db));

        _entryMap[name.c_str()] = entry;

        // Open any existing indexes
        WiredTigerCursor cursor("metadata:", swrap);
        WT_CURSOR *c = cursor.Get();
        invariant(c != NULL);

        std::string tbl_uri = std::string("table:" + name);
        c->set_key(c, tbl_uri.c_str());
        int cmp, ret = c->search_near(c, &cmp);
        if (cmp < 0)
            ret = c->next(c);
        while (ret == 0) {
            const char *uri_str;
            ret = c->get_key(c, &uri_str);
            invariant ( ret == 0);
            std::string uri(uri_str);
            // No more indexes for this table
            if (uri.substr(0, tbl_uri.size()) != tbl_uri)
                break;

            size_t pos;
            if ((pos = uri.find('$')) != std::string::npos && pos < uri.size() - 1) {
                std::string idx_name = uri.substr(pos + 1);
                // Skip to the start of the index name
                const char *idx_meta;
                ret = c->get_value(c, &idx_meta);
                invariant( ret == 0 );
                WT_CONFIG_PARSER *cp;
                ret = wiredtiger_config_parser_open(
                        NULL, idx_meta, strlen(idx_meta), &cp);
                invariant ( ret == 0 );
                WT_CONFIG_ITEM cval;
                ret = cp->get(cp, "app_metadata", &cval);
                invariant ( ret == 0 );

                BSONObj b( fromjson(std::string(cval.str, cval.len)));
                std::string name(b.getStringField("name"));
                IndexDescriptor desc(0, "unknown", b);
                auto_ptr<IndexEntry> newEntry( new IndexEntry() );
                newEntry->name = name;
                newEntry->spec = desc.infoObj();
                // TODO: How can we track these and set them up properly?
                newEntry->ready = true;
                newEntry->isMultikey = false;

                entry->indexes[name] = newEntry.release();
            }

            ret = c->next(c);
        }
    }

    void WiredTigerDatabaseCatalogEntry::getCollectionNamespaces(
            std::list<std::string>* out ) const {
        boost::mutex::scoped_lock lk( _entryMapLock );
        for ( EntryMap::const_iterator i = _entryMap.begin(); i != _entryMap.end(); ++i ) {
            out->push_back( i->first );
        }
    }

    Status WiredTigerDatabaseCatalogEntry::createCollection( OperationContext* txn,
                                                        const StringData& ns,
                                                        const CollectionOptions& options,
                                                        bool allocateDefaultSpace ) {
        boost::mutex::scoped_lock lk( _entryMapLock );
        Entry*& entry = _entryMap[ ns.toString() ];
        if ( entry )
            return Status( ErrorCodes::NamespaceExists,
                           "cannot create collection, already exists" );

        int ret = WiredTigerRecordStore::Create(_db, ns, options, allocateDefaultSpace);
        invariant(ret == 0);

        entry = new Entry( ns, options );

        if ( options.capped ) {
            entry->rs.reset(new WiredTigerRecordStore(ns,
                            _db,
                            true,
                            options.cappedSize
                                ? options.cappedSize : 4096, // default size
                            options.cappedMaxDocs
                                ? options.cappedMaxDocs : -1)); // no limit
        } else {
            entry->rs.reset( new WiredTigerRecordStore( ns, _db ) );
        }
        _entryMap[ns.toString()] = entry;

        return Status::OK();
    }

    Status WiredTigerDatabaseCatalogEntry::dropAllCollections( OperationContext* txn ) {
        // Keep setting the iterator to the beginning since drop is removing entries
        // as it goes along
        for ( EntryMap::const_iterator i = _entryMap.begin();
            i != _entryMap.end(); i = _entryMap.begin() ) {
            Status status = dropCollection(txn, i->first);
            if (!status.isOK()) 
                return status;
        }
        return Status::OK();
    }

    Status WiredTigerDatabaseCatalogEntry::dropCollection( OperationContext* txn,
                                                      const StringData& ns ) {
        //TODO: invariant( txn->lockState()->isWriteLocked( ns ) );

        boost::mutex::scoped_lock lk( _entryMapLock );
        EntryMap::iterator i = _entryMap.find( ns.toString() );

        if ( i == _entryMap.end() ) {
            return Status( ErrorCodes::NamespaceNotFound, "namespace not found" );
        }

        Entry *entry = i->second;
        // Remove the underlying table from WiredTiger
        WiredTigerSession &swrap = WiredTigerRecoveryUnit::Get(txn).GetSession();
        WT_SESSION *session = swrap.Get();
        int ret;
        std::string uri = "table:" + ns.toString();
        ret = session->drop(session, uri.c_str(), NULL);
        if (ret != 0)
            return Status( ErrorCodes::OperationFailed, "Collection drop failed" );

        std::vector<std::string> names;
        entry->getAllIndexes( txn, &names );
        std::vector<std::string>::const_iterator idx;
        for (idx = names.begin(); idx != names.end(); ++idx) {
            Status s = entry->removeIndex(txn, StringData(*idx));
            invariant(s.isOK());
        }
        delete entry;
        _entryMap.erase( i );

        return Status::OK();
    }


    IndexAccessMethod* WiredTigerDatabaseCatalogEntry::getIndex( OperationContext* txn,
                        const CollectionCatalogEntry* collection,
                        IndexCatalogEntry* index ) {
        const Entry* entry = dynamic_cast<const Entry*>( collection );

        Entry::Indexes::const_iterator i = entry->indexes.find( index->descriptor()->indexName() );
        if ( i == entry->indexes.end() ) {
            // index doesn't exist
            return NULL;
        }

        const string& type = index->descriptor()->getAccessMethodName();

        // Need the Head to be non-Null to avoid asserts. TODO remove the asserts.
        index->headManager()->setHead(txn, DiskLoc(0xDEAD, 0xBEAF));

        std::auto_ptr<SortedDataInterface> wtidx(getWiredTigerIndex(
                _db, collection->ns().ns(),
                index->descriptor()->indexName(),
                *index, &i->second->data));

        if ("" == type)
            return new BtreeAccessMethod( index, wtidx.release() );

        if (IndexNames::HASHED == type)
            return new HashAccessMethod( index, wtidx.release() );

        if (IndexNames::GEO_2DSPHERE == type)
            return new S2AccessMethod( index, wtidx.release() );

        if (IndexNames::TEXT == type)
            return new FTSAccessMethod( index, wtidx.release() );

        if (IndexNames::GEO_HAYSTACK == type)
            return new HaystackAccessMethod( index, wtidx.release() );

        if (IndexNames::GEO_2D == type)
            return new TwoDAccessMethod( index, wtidx.release() );

        log() << "Can't find index for keyPattern " << index->descriptor()->keyPattern();
        fassertFailed(28518);
    }

    Status WiredTigerDatabaseCatalogEntry::renameCollection( OperationContext* txn,
                                                        const StringData& fromNS,
                                                        const StringData& toNS,
                                                        bool stayTemp ) {
        int ret;
        boost::mutex::scoped_lock lk( _entryMapLock );
        EntryMap::iterator i = _entryMap.find( toNS.toString() );
        if ( i != _entryMap.end() )
            return Status( ErrorCodes::NamespaceNotFound, "to namespace already exists for rename" );

        i = _entryMap.find( fromNS.toString() );
        if ( i == _entryMap.end() )
            return Status( ErrorCodes::NamespaceNotFound, "namespace not found for rename" );

        Entry *entry = i->second;

        // Remove the entry from the entryMap
        _entryMap.erase( i );

        WiredTigerSession &swrap = WiredTigerRecoveryUnit::Get(txn).GetSession();
        WT_SESSION *session = swrap.Get();

        // Rename all indexes in the entry
        std::vector<std::string> names;
        entry->getAllIndexes( txn, &names );
        std::vector<std::string>::const_iterator idx;
        for (idx = names.begin(); idx != names.end(); ++idx) {
            //std::string fromName = *idx;
            //std::string toName(toNS.toString() + fromName.substr(fromNS.toString().length()));
            ret = session->rename(session,
                    WiredTigerIndex::_getURI(fromNS.toString(), *idx).c_str(),
                    WiredTigerIndex::_getURI(toNS.toString(), *idx).c_str(),
                    "force");
            invariant(ret == 0);
        }

        // Rename the primary WiredTiger table
        std::string fromUri = "table:" + fromNS.toString();
        std::string toUri = "table:" + toNS.toString();
        ret = session->rename(session, fromUri.c_str(), toUri.c_str(), NULL);
        if (ret != 0)
            return Status( ErrorCodes::OperationFailed, "Collection rename failed" );

        // Now delete the old entry.
        delete entry;

        // Load the newly renamed collection into memory
        _loadCollection(swrap, toNS.toString());
        return Status::OK();
    }

    // ------------------

    WiredTigerDatabaseCatalogEntry::Entry::Entry(
        const StringData& ns, const CollectionOptions& o )
        : CollectionCatalogEntry( ns ), options( o ) {
    }

    WiredTigerDatabaseCatalogEntry::Entry::~Entry() {
        for ( Indexes::const_iterator i = indexes.begin(); i != indexes.end(); ++i )
            delete i->second;
        indexes.clear();
    }

    int WiredTigerDatabaseCatalogEntry::Entry::getTotalIndexCount( OperationContext* txn ) const {
        return static_cast<int>( indexes.size() );
    }

    int WiredTigerDatabaseCatalogEntry::Entry::getCompletedIndexCount( OperationContext* txn ) const {
        int ready = 0;
        for ( Indexes::const_iterator i = indexes.begin(); i != indexes.end(); ++i )
            if ( i->second->ready )
                ready++;
        return ready;
    }

    void WiredTigerDatabaseCatalogEntry::Entry::getAllIndexes( OperationContext* txn, std::vector<std::string>* names ) const {
        for ( Indexes::const_iterator i = indexes.begin(); i != indexes.end(); ++i )
            names->push_back( i->second->name );
    }

    BSONObj WiredTigerDatabaseCatalogEntry::Entry::getIndexSpec( OperationContext *txn, const StringData& idxName ) const {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        return i->second->spec; 
    }

    bool WiredTigerDatabaseCatalogEntry::Entry::isIndexMultikey( OperationContext* txn, const StringData& idxName) const {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        return i->second->isMultikey;
    }

    bool WiredTigerDatabaseCatalogEntry::Entry::setIndexIsMultikey(OperationContext* txn,
                                                              const StringData& idxName,
                                                              bool multikey ) {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        if (i->second->isMultikey == multikey)
            return false;

        i->second->isMultikey = multikey;
        return true;
    }

    DiskLoc WiredTigerDatabaseCatalogEntry::Entry::getIndexHead( OperationContext* txn, const StringData& idxName ) const {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        return i->second->head;
    }

    void WiredTigerDatabaseCatalogEntry::Entry::setIndexHead( OperationContext* txn,
                                                         const StringData& idxName,
                                                         const DiskLoc& newHead ) {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        i->second->head = newHead;
    }

    bool WiredTigerDatabaseCatalogEntry::Entry::isIndexReady( OperationContext* txn, const StringData& idxName ) const {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        return i->second->ready;
    }

    Status WiredTigerDatabaseCatalogEntry::Entry::removeIndex( OperationContext* txn,
                                                          const StringData& idxName ) {
        WiredTigerSession &swrap = WiredTigerRecoveryUnit::Get(txn).GetSession();
        WT_SESSION *session = swrap.Get();
        int ret = session->drop(session, WiredTigerIndex::_getURI(ns().toString(), idxName.toString()).c_str(), "force");
        invariant(ret == 0);
        indexes.erase( idxName.toString() );
        return Status::OK();
    }

    Status WiredTigerDatabaseCatalogEntry::Entry::prepareForIndexBuild( OperationContext* txn,
                                                                   const IndexDescriptor* spec ) {
        auto_ptr<IndexEntry> newEntry( new IndexEntry() );
        newEntry->name = spec->indexName();
        newEntry->spec = spec->infoObj();
        newEntry->ready = false;
        newEntry->isMultikey = false;

        indexes[spec->indexName()] = newEntry.release();
        return Status::OK();
    }

    void WiredTigerDatabaseCatalogEntry::Entry::indexBuildSuccess( OperationContext* txn,
                                                              const StringData& idxName ) {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );
        i->second->ready = true;
    }

    void WiredTigerDatabaseCatalogEntry::Entry::updateTTLSetting( OperationContext* txn,
                                                             const StringData& idxName,
                                                             long long newExpireSeconds ) {
        Indexes::const_iterator i = indexes.find( idxName.toString() );
        invariant( i != indexes.end() );

        BSONObjBuilder b;
        for ( BSONObjIterator bi( i->second->spec ); bi.more(); ) {
            BSONElement e = bi.next();
            if ( e.fieldNameStringData() == "expireAfterSeconds" ) {
                continue;
            }
            b.append( e );
        }

        b.append( "expireAfterSeconds", newExpireSeconds );

        i->second->spec = b.obj();
    }
}
