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

#include "mongo/db/storage/kv/kv_engine_test_harness.h"

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
        bool wait( unsigned msTimeOut = 0 ) {
            bool done = BackgroundJob::wait( msTimeOut );
            if ( !done ) {
                return false;
            }
            if ( _savedExn ) {
                throw *_savedExn;
            }
            return true;
        }
        void run() {
            try {
                testRun();
            } catch( unittest::TestAssertionFailureException& exn ) {
                _savedExn.reset( new unittest::TestAssertionFailureException( exn ) );
            }
        }
    private:
        scoped_ptr<unittest::TestAssertionFailureException> _savedExn;
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
              _ns(ns) {
        }
        virtual string name() const { return "IndexIdentNonexistentCollectionJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            for (int i=0; i<_iterations; ++i) {
                _helper->getIndexIdent( ns, idxName );
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
              _ns(ns) {
        }
        virtual string name() const { return "IndexIdentNonexistentIndexJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            ASSERT_OK( _helper->createCollection( ns ) );
            for (int i=0; i<_iterations; ++i) {
                _helper->getIndexIdent( ns, idxName );
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
              _ns(ns) {
        }
        virtual string name() const { return "IndexIdentJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            ASSERT_OK( _helper->createCollection( ns ) );
            ASSERT_OK( _helper->createIndex( ns, idxName ) );
            for (int i=0; i<_iterations; ++i) {
                string ident = _helper->getIndexIdent( ns, idxName );
                ASSERT( !ident.empty() );
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
              _ns(ns) {
        }
        virtual string name() const { return "IndexIdentDifferentJob"; }
        virtual void testRun() {
            string idxName0 = "foo_index";
            string idxName1 = "bar_index";
            ASSERT_OK( _helper->createCollection( ns ) );
            ASSERT_OK( _helper->createIndex( ns, idxName ) );
            for (int i=0; i<_iterations; ++i) {
                string ident0 = _helper->getIndexIdent( ns, idxName0 );
                string ident1 = _helper->getIndexIdent( ns, idxName1 );
                ASSERT( ident0 != ident1 );
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
              _ns(ns) {
        }
        virtual string name() const { return "IndexIdentDifferentOverTimeJob"; }
        virtual void testRun() {
            string idxName = "foo_index";
            ASSERT_OK( _helper->createCollection( ns ) );
            for (int i=0; i<_iterations; ++i) {
                // create and drop the same index twice

                ASSERT_OK( _helper->createIndex( ns, idxName ) );
                string ident0 = _helper->getIndexIdent( ns, idxName );
                ASSERT_OK( _helper->dropIndex( ns, idxName ) );

                ASSERT_OK( _helper->createIndex( ns, idxName ) );
                string ident1 = _helper->getIndexIdent( ns, idxName );
                ASSERT_OK( _helper->dropIndex( ns, idxName ) );

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
        IndexIdentDifferentJob( KVEngineHelper* helper,
                                       const StringData& ns,
                                       int iterations = 10000 )
            : KVBackgroundJob( helper ),
              _iterations(iterations),
              _ns(ns) {
        }
        virtual string name() const { return "IndexIdentDifferentJob"; }
        virtual void testRun() {
            vector<string> indexNames;
            indexNames.push_back( "foo_index" );
            indexNames.push_back( "bar_index" );
            indexNames.push_back( "baz_index" );

            ASSERT_OK( _helper->createCollection( ns ) );
            for (int i=0; i<indexNames.length; ++i) {
                ASSERT_OK( _helper->createIndex( ns, indexNames[i] ) );
            }

            std::sort( indexNames.begin(), indexNames.end() );
            for (int i=0; i<_iterations; ++i) {
                vector<string> indexes = _helper->listIndexes( ns );
                std::sort( indexes.begin(), indexes.end() );
                ASSERT( indexes == indexNames );
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

}; // namespace mongo
