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
            } catch(unittest::TestAssertionFailureException& exn) {
                _savedExn.reset(new unittest::TestAssertionFailureException(exn));
            }
        }
    private:
        scoped_ptr<unittest::TestAssertionFailureException> _savedExn;
    };

    class KVBackgroundJob : public TestBackgroundJob {
    public:
        KVBackgroundJob(KVCatalog* catalog, KVEngine* engine)
            : _catalog(catalog)
            , _engine(engine)
        {}
    protected:
        KVCatalog* _catalog;
        KVEngine* _engine;
    };

    class ListCollectionsJob : public KVBackgroundJob {
    private:
        int _iterations;
    public:
        ListCollectionsJob(
                KVCatalog* catalog, KVEngine* engine,
                int iterations = 10000
            ):
            KVBackgroundJob(catalog, engine),
            _iterations(iterations)
        {}
        virtual string name() const { return "ListCollectionsJob"; }
        virtual void testRun() {
            for (int i=0; i<_iterations; ++i) {
                std::vector<std::string> collNames;
                _catalog->getAllCollections( &collNames );
                ASSERT( collNames.size() == 0 || collNames.size() == 1 );
            }
        }
    };

    class CreateDropJob : public KVBackgroundJob {
    private:
        int _iterations;
        CollectionOptions _collectionOptions;
    public:
        CreateDropJob(
                KVCatalog* catalog, KVEngine* engine,
                int iterations = 10000,
                CollectionOptions collectionOptions = CollectionOptions()
            ):
            KVBackgroundJob(catalog, engine),
            _iterations(iterations),
            _collectionOptions(collectionOptions)
        {}
        virtual string name() const { return "CreateDropJob"; }
        virtual void testRun() {
            for (int i=0; i<_iterations; ++i) {
                // create a collection called a.b
                {
                    MyOperationContext opCtx( _engine );
                    WriteUnitOfWork uow( &opCtx );
                    ASSERT_OK( _catalog->newCollection( &opCtx, "a.b", _collectionOptions ) );
                    uow.commit();
                }

                // drop the collection called a.b
                {
                    MyOperationContext opCtx( _engine );
                    WriteUnitOfWork uow( &opCtx );
                    ASSERT_OK( _catalog->dropCollection( &opCtx, "a.b" ) );
                    uow.commit();
                }
            }

        }
    };

    TEST( KVEngineTestHarness, HelloWorld ) {
        scoped_ptr<KVHarnessHelper> helper( KVHarnessHelper::create() );
        KVEngine* engine = helper->getEngine();
        ASSERT( engine );

        // create a KVCatalog with a backing RecordStore
        scoped_ptr<RecordStore> rs;
        scoped_ptr<KVCatalog> catalog;
        {
            MyOperationContext opCtx( engine );
            WriteUnitOfWork uow( &opCtx );
            ASSERT_OK( engine->createRecordStore( &opCtx, "catalog", "catalog", CollectionOptions() ) );
            rs.reset( engine->getRecordStore( &opCtx, "catalog", "catalog", CollectionOptions() ) );
            catalog.reset( new KVCatalog( rs.get() ) );
            uow.commit();
        }

        CreateDropJob createDropJob( catalog.get(), engine );
        ListCollectionsJob listCollectionsJob( catalog.get(), engine );
        createDropJob.go();
        listCollectionsJob.go();

        createDropJob.wait();
        listCollectionsJob.wait();
    }

}; // namespace mongo
