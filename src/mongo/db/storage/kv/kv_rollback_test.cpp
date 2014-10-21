// kv_rollback_test.cpp
/**
 *    Copyright (C) 2013-2014 MongoDB Inc.
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

#include "mongo/util/log.h"

#include "mongo/db/storage/kv/kv_engine_test_harness.h"

#include <algorithm>

#include "mongo/db/operation_context_noop.h"
#include "mongo/db/index/index_descriptor.h"
#include "mongo/db/storage/kv/kv_catalog.h"
#include "mongo/db/storage/kv/kv_engine.h"
#include "mongo/db/storage/kv/kv_engine_test_fixture.h"
#include "mongo/db/storage/kv/kv_engine_test_utils.h"
#include "mongo/db/storage/record_store.h"
#include "mongo/db/storage/sorted_data_interface.h"
#include "mongo/unittest/unittest.h"

namespace mongo {

namespace {

    // TODO: move this to header file
    class MyOperationContext : public OperationContextNoop {
    public:
        MyOperationContext( KVEngine* engine )
            : OperationContextNoop( engine->newRecoveryUnit() ) {
        }
    };

}; // namespace

    /**
     * Catches TestAssertionFailureException and rethrows in the joining thread.
     */
    class TestBackgroundJob : public BackgroundJob {
    public:
        virtual void testRun() = 0;
        void rethrow( unsigned msTimeOut = 0 ) {
            invariant( getState() == Done );
            if ( _savedTestExn ) {
                throw *_savedTestExn;
            }
            if ( _savedDbExnInfo ) {
                DBException exn( *_savedDbExnInfo );
                log() << "background job had caught a DBException: " << exn;
                log() << "  rethrowing it";
                throw exn;
            }
            if ( _savedStdExnMsg ) {
                // TODO: in C++11 we can use std::exception_pointer to preserve the type.
                // But we have to at least rethrow something, to prevent hiding failures.
                throw std::runtime_error( *_savedStdExnMsg );
            }
        }
        void run() {
            try {
                testRun();
            } catch( unittest::TestAssertionFailureException& exn ) {
                _savedTestExn.reset( new unittest::TestAssertionFailureException( exn ) );
            } catch( DBException& exn ) {
                log() << "background job catching DBException: " << exn;
                _savedDbExnInfo.reset( new ExceptionInfo(exn.getInfo()) );
            } catch( std::exception& exn ) {
                _savedStdExnMsg.reset( new string(exn.what()) );
            }
        }
    private:
        scoped_ptr<unittest::TestAssertionFailureException> _savedTestExn;
        scoped_ptr<ExceptionInfo> _savedDbExnInfo;
        scoped_ptr<string> _savedStdExnMsg;
    };

    class KVBackgroundJob : public TestBackgroundJob {
    public:
        KVBackgroundJob( KVEngineHelper* helper ) : _helper( helper ) { }
    protected:
        KVEngineHelper* _helper; // not owned here
    };

    class ListCollectionsJob : public KVBackgroundJob {
    private:
        int _iterations;
    public:
        ListCollectionsJob( KVEngineHelper* helper,
                            int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations( iterations ) { }
        virtual string name() const { return "ListCollectionsJob"; }
        virtual void testRun() {
            for (int i = 0; i < _iterations; ++i) {
                std::vector<std::string> collNames = _helper->listCollections();
                ASSERT( collNames.size() == 0 || collNames.size() == 1 );
            }
        }
    };

    class CreateDropJob : public KVBackgroundJob {
    private:
        int _iterations;
        CollectionOptions _collectionOptions;
    public:
        CreateDropJob( KVEngineHelper* helper,
                       int iterations = 10000,
                       CollectionOptions collectionOptions = CollectionOptions() )
            : KVBackgroundJob( helper ),
              _iterations( iterations ),
              _collectionOptions( collectionOptions ) { }
        virtual string name() const { return "CreateDropJob"; }
        virtual void testRun() {
            for (int i = 0; i < _iterations; ++i) {
                ASSERT_OK( _helper->createCollection( "a.b" ) );
                ASSERT_OK( _helper->dropCollection( "a.b" ) );
            }
        }
    };

    // Create a collection and verify that it exists within the list of namespaces.
    class CreateCollectionJob : public KVBackgroundJob {
    public:
        CreateCollectionJob( KVEngineHelper* helper,
                             string ns,
                             int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _ns( ns ),
              _iterations( iterations ) { }
        virtual string name() const { return "CreateCollectionJob"; }
        virtual void testRun() {
            for ( int i = 0; i < _iterations; ++i ) {
                ASSERT_OK( _helper->createCollection( _ns ) );

                vector<string> collNames = _helper->listCollections();
                vector<string>::iterator it = std::find( collNames.begin(), collNames.end(), _ns );
                ASSERT( it != collNames.end() );
                ASSERT_EQUALS( _ns, *it );

                ASSERT_OK( _helper->dropCollection( _ns ) );

                collNames = _helper->listCollections();
                it = std::find( collNames.begin(), collNames.end(), _ns );
                ASSERT( it == collNames.end() );
            }
        }
    private:
        string _ns;
        int _iterations;
    };

    // Create a collection and verify that trying to create a collection
    // with the same namespace fails.
    class CreateSameCollectionJob : public KVBackgroundJob {
    public:
        CreateSameCollectionJob( KVEngineHelper* helper,
                                 string ns,
                                 int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _ns( ns ),
              _iterations( iterations ) { }
        virtual string name() const { return "CreateSameCollectionJob"; }
        virtual void testRun() {
            ASSERT_OK( _helper->createCollection( _ns ) );

            vector<string> collNames = _helper->listCollections();
            vector<string>::iterator it = std::find( collNames.begin(), collNames.end(), _ns );
            ASSERT( it != collNames.end() );
            ASSERT_EQUALS( _ns, *it );

            for ( int i = 0; i < _iterations; ++i ) {
                ASSERT_EQUALS( ErrorCodes::NamespaceExists, _helper->createCollection( _ns ) );
            }
        }
    private:
        string _ns;
        int _iterations;
    };

    // Create a collection and verify that its identifier does not change.
    class GetCollectionIdentJob : public KVBackgroundJob {
    public:
        GetCollectionIdentJob( KVEngineHelper* helper,
                               string ns,
                               int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _ns( ns ),
              _iterations( iterations ) { }
        virtual string name() const { return "GetCollectionIdentJob"; }
        virtual void testRun() {
            ASSERT_OK( _helper->createCollection( _ns ) );

            string ident = _helper->getCollectionIdent( _ns );
            ASSERT( ident[0] != '\0' );

            for ( int i = 0; i < _iterations; ++i ) {
                ASSERT_EQUALS( ident, _helper->getCollectionIdent( _ns ) );
            }
        }
    private:
        string _ns;
        int _iterations;
    };

    // Create many collections and verify that none of them have the same identifier.
    class UniqueCollectionIdentJob : public KVBackgroundJob {
    public:
        UniqueCollectionIdentJob( KVEngineHelper* helper,
                                  string ns,
                                  int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _ns( ns ),
              _iterations( iterations ) { }
        virtual string name() const { return "UniqueCollectionIdentJob"; }
        virtual void testRun() {
            set<string> idents;

            for ( int i = 0; i < _iterations; ++i ) {
                ASSERT_OK( _helper->createCollection( _ns ) );

                string ident = _helper->getCollectionIdent( _ns );
                ASSERT( idents.insert( ident ).second );

                ASSERT_OK( _helper->dropCollection( _ns ) );
            }
        }
    private:
        string _ns;
        int _iterations;
    };

    // Create a collection and verify that it keeps its identifier, even upon rename.
    class RenameCollectionIdentJob : public KVBackgroundJob {
    public:
        RenameCollectionIdentJob( KVEngineHelper* helper,
                                  string ns,
                                  int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _nsPrefix( ns ),
              _iterations( iterations ) { }
        virtual string name() const { return "RenameCollectionIdentJob"; }
        virtual void testRun() {
            int i = 1;
            string toNS;
            string fromNS;

            {
                stringstream ss;
                ss << _nsPrefix << (i - 1);
                toNS = ss.str();
            }

            ASSERT_OK( _helper->createCollection( toNS ) );
            string ident = _helper->getCollectionIdent( toNS );

            for ( ; i < _iterations; ++i ) {
                fromNS = toNS;

                stringstream ss;
                ss << _nsPrefix << i;
                toNS = ss.str();

                ASSERT_OK( _helper->renameCollection( fromNS, toNS ) );
                ASSERT_EQUALS( ident, _helper->getCollectionIdent( toNS ) );
            }
        }
    private:
        string _nsPrefix;
        int _iterations;
    };

    class IndexIdentNonexistentCollectionJob : public KVBackgroundJob {
    private:
        int _iterations;
        string _ns;
    public:
        IndexIdentNonexistentCollectionJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns.toString()) {
        }
        virtual string name() const { return "IndexIdentNonexistentCollectionJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            for (int i=0; i<_iterations; ++i) {
                _helper->getIndexIdent( _ns, idxName );
            }
        }
    };

    class IndexIdentNonexistentIndexJob : public KVBackgroundJob {
    private:
        int _iterations;
        string _ns;
    public:
        IndexIdentNonexistentIndexJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns.toString()) {
        }
        virtual string name() const { return "IndexIdentNonexistentIndexJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            ASSERT_OK( _helper->createCollection( _ns ) );
            for (int i=0; i<_iterations; ++i) {
                _helper->getIndexIdent( _ns, idxName );
            }
        }
    };

    class IndexIdentJob : public KVBackgroundJob {
    private:
        int _iterations;
        string _ns;
    public:
        IndexIdentJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns.toString()) {
        }
        virtual string name() const { return "IndexIdentJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            ASSERT_OK( _helper->createCollection( _ns ) );
            for (int i=0; i<_iterations; ++i) {
                ASSERT_OK( _helper->createIndex( _ns, idxName ) );
                string ident = _helper->getIndexIdent( _ns, idxName );
                ASSERT( !ident.empty() );
                ASSERT_OK( _helper->dropIndex( _ns, idxName ) );
            }
        }
    };

    class IndexIdentDifferentJob : public KVBackgroundJob {
    private:
        int _iterations;
        string _ns;
    public:
        IndexIdentDifferentJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns.toString()) {
        }
        virtual string name() const { return "IndexIdentDifferentJob"; }
        virtual void testRun() {
            string idxName0 = "foo_index";
            string idxName1 = "bar_index";
            ASSERT_OK( _helper->createCollection( _ns ) );
            for (int i=0; i<_iterations; ++i) {
                ASSERT_OK( _helper->createIndex( _ns, idxName0 ) );
                ASSERT_OK( _helper->createIndex( _ns, idxName1 ) );
                string ident0 = _helper->getIndexIdent( _ns, idxName0 );
                string ident1 = _helper->getIndexIdent( _ns, idxName1 );
                ASSERT( ident0 != ident1 );
                ASSERT_OK( _helper->dropIndex( _ns, idxName0 ) );
                ASSERT_OK( _helper->dropIndex( _ns, idxName1 ) );
            }
        }
    };

    class IndexIdentDifferentOverTimeJob : public KVBackgroundJob {
    private:
        int _iterations;
        string _ns;
    public:
        IndexIdentDifferentOverTimeJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns.toString()) {
        }
        virtual string name() const { return "IndexIdentDifferentOverTimeJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            ASSERT_OK( _helper->createCollection( _ns ) );
            for (int i=0; i<_iterations; ++i) {
                // create and drop the same index twice

                ASSERT_OK( _helper->createIndex( _ns, idxName ) );
                string ident0 = _helper->getIndexIdent( _ns, idxName );
                ASSERT_OK( _helper->dropIndex( _ns, idxName ) );

                ASSERT_OK( _helper->createIndex( _ns, idxName ) );
                string ident1 = _helper->getIndexIdent( _ns, idxName );
                ASSERT_OK( _helper->dropIndex( _ns, idxName ) );

                // the idents should be different even though the two indexes never
                // existed at the same time.
                ASSERT( ident0 != ident1 );
            }
        }
    };

    class ListIndexesJob : public KVBackgroundJob {
    private:
        int _iterations;
        string _ns;
    public:
        ListIndexesJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns.toString()) {
        }
        virtual string name() const { return "ListIndexesJob"; }
        virtual void testRun() {
            vector<string> indexNames;
            indexNames.push_back( "foo_index" );
            indexNames.push_back( "bar_index" );
            indexNames.push_back( "baz_index" );
            vector<string> indexNamesSorted = indexNames;
            std::sort( indexNamesSorted.begin(), indexNamesSorted.end() );

            ASSERT_OK( _helper->createCollection( _ns ) );

            for (int i=0; i<_iterations; ++i) {
                for (size_t j=0; j<indexNames.size(); ++j) {
                    ASSERT_OK( _helper->createIndex( _ns, indexNames[j] ) );
                }

                vector<string> indexes = _helper->listIndexes( _ns );
                std::sort( indexes.begin(), indexes.end() );
                ASSERT( indexes == indexNamesSorted );

                for (size_t j=0; j<indexNames.size(); ++j) {
                    ASSERT_OK( _helper->dropIndex( _ns, indexNames[j] ) );
                }
            }
        }
    };

    TEST_F( KVEngineTest, HelloWorld ) {
        scoped_ptr<KVEngineHelper> helper( getKVEngineHelper() );

        CreateDropJob createDropJob( helper.get() );
        ListCollectionsJob listCollectionsJob( helper.get() );

        createDropJob.go();
        listCollectionsJob.go();

        createDropJob.wait();
        listCollectionsJob.wait();
    }

    TEST_F( KVEngineTest, Collections ) {
        scoped_ptr<KVEngineHelper> helper( getKVEngineHelper() );

        CreateCollectionJob createCollectionJob( helper.get(), "test.cc" );
        CreateSameCollectionJob createSameCollectionJob( helper.get(), "test.csc" );
        GetCollectionIdentJob getCollectionIdentJob( helper.get(), "test.gci" );
        UniqueCollectionIdentJob uniqueCollectionIdentJob( helper.get(), "test.uci" );
        RenameCollectionIdentJob renameCollectionIdentJob( helper.get(), "test.rci" );

        createCollectionJob.go();
        createSameCollectionJob.go();
        getCollectionIdentJob.go();
        uniqueCollectionIdentJob.go();
        renameCollectionIdentJob.go();

        createCollectionJob.wait();
        createSameCollectionJob.wait();
        getCollectionIdentJob.wait();
        uniqueCollectionIdentJob.wait();
        renameCollectionIdentJob.wait();

        createCollectionJob.rethrow();
        createSameCollectionJob.rethrow();
        getCollectionIdentJob.rethrow();
        uniqueCollectionIdentJob.rethrow();
        renameCollectionIdentJob.rethrow();
    }

    TEST_F( KVEngineTest, Indexes ) {
        scoped_ptr<KVEngineHelper> helper( getKVEngineHelper() );

        IndexIdentNonexistentCollectionJob indexIdentNonexistentCollectionJob( helper.get(), "foo.coll0" );
        IndexIdentNonexistentIndexJob indexIdentNonexistentIndexJob( helper.get(), "foo.coll1" );
        IndexIdentJob indexIdentJob( helper.get(), "foo.coll2" );
        IndexIdentDifferentJob indexIdentDifferentJob( helper.get(), "foo.coll3" );
        IndexIdentDifferentOverTimeJob indexIdentDifferentOverTimeJob( helper.get(), "foo.coll4" );
        ListIndexesJob listIndexesJob( helper.get(), "foo.coll5" );

        log() << "about to spawn all jobs";

        //indexIdentNonexistentCollectionJob.go();  // invariant failure
        //indexIdentNonexistentIndexJob.go();  // "invalid parameter: expected an object ()"
        indexIdentJob.go();
        indexIdentDifferentJob.go();
        indexIdentDifferentOverTimeJob.go();
        listIndexesJob.go();

        log() << "about to wait on all jobs";

        //indexIdentNonexistentCollectionJob.wait();
        //indexIdentNonexistentIndexJob.wait();
        indexIdentJob.wait();
        indexIdentDifferentJob.wait();
        indexIdentDifferentOverTimeJob.wait();
        listIndexesJob.wait();

        log() << "done with all jobs";

        log() << "checking if any job threw an exception";
        //indexIdentNonexistentCollectionJob.rethrow();
        //indexIdentNonexistentIndexJob.rethrow();
        indexIdentJob.rethrow();
        indexIdentDifferentJob.rethrow();
        indexIdentDifferentOverTimeJob.rethrow();
        listIndexesJob.rethrow();

    }

}; // namespace mongo
