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

#include "mongo/platform/basic.h"

#include "mongo/db/storage/heap1/heap1_btree_impl.h"

#include <set>

#include "mongo/db/catalog/index_catalog_entry.h"
#include "mongo/db/storage/index_entry_comparison.h"

namespace mongo {
namespace {
    
    bool hasFieldNames(const BSONObj& obj) {
        BSONForEach(e, obj) {
            if (e.fieldName()[0])
                return true;
        }
        return false;
    }

    BSONObj stripFieldNames(const BSONObj& query) {
        if (!hasFieldNames(query))
            return query;

        BSONObjBuilder bb;
        BSONForEach(e, query) {
            bb.appendAs(e, StringData());
        }
        return bb.obj();
    }

    typedef std::set<IndexKeyEntry, IndexEntryComparison> IndexSet;

    // taken from btree_logic.cpp
    Status dupKeyError(const BSONObj& key) {
        StringBuilder sb;
        sb << "E11000 duplicate key error ";
        // sb << "index: " << _indexName << " "; // TODO
        sb << "dup key: " << key;
        return Status(ErrorCodes::DuplicateKey, sb.str());
    }
    
    bool isDup(const IndexSet& data, const BSONObj& key, DiskLoc loc) {
        const IndexSet::const_iterator it = data.find(IndexKeyEntry(key, DiskLoc()));
        if (it == data.end())
            return false;

        // Not a dup if the entry is for the same loc.
        return it->loc != loc;
    }

    class Heap1BtreeBuilderImpl : public SortedDataBuilderInterface {
    public:
        Heap1BtreeBuilderImpl(IndexSet* data, bool dupsAllowed)
                : _data(data),
                  _dupsAllowed(dupsAllowed),
                  _committed(false) {
            invariant(_data->empty());
        }

        ~Heap1BtreeBuilderImpl() {
            if (!_committed)
                _data->clear();
        }

        Status addKey(const BSONObj& key, const DiskLoc& loc) {
            // inserts should be in ascending order.

            invariant(!loc.isNull());
            invariant(loc.isValid());
            invariant(!hasFieldNames(key));

            // TODO optimization: dup check can assume dup is only possible with last inserted key
            // and avoid the log(n) lookup.
            if (!_dupsAllowed && isDup(*_data, key, loc))
                return dupKeyError(key);

            _data->insert(_data->end(), IndexKeyEntry(key.getOwned(), loc));
            return Status::OK();
        }

        unsigned long long commit(bool mayInterrupt) {
            _committed = true;
            return _data->size();
        }

    private:
        IndexSet* const _data;
        const bool _dupsAllowed;
        bool _committed;
    };

    class Heap1BtreeImpl : public SortedDataInterface {
    public:
        Heap1BtreeImpl(const IndexCatalogEntry& info, IndexSet* data) 
            : _info(info),
              _data(data)
        {}

        virtual SortedDataBuilderInterface* getBulkBuilder(OperationContext* txn, bool dupsAllowed) {
            return new Heap1BtreeBuilderImpl(_data, dupsAllowed);
        }

        virtual Status insert(OperationContext* txn,
                              const BSONObj& key,
                              const DiskLoc& loc,
                              bool dupsAllowed) {
            invariant(!loc.isNull());
            invariant(loc.isValid());
            invariant(!hasFieldNames(key));

            // TODO optimization: save the iterator from the dup-check to speed up insert
            if (!dupsAllowed && isDup(*_data, key, loc))
                return dupKeyError(key);

            _data->insert(IndexKeyEntry(key.getOwned(), loc));
            return Status::OK();
        }

        virtual bool unindex(OperationContext* txn, const BSONObj& key, const DiskLoc& loc) {
            invariant(!loc.isNull());
            invariant(loc.isValid());
            invariant(!hasFieldNames(key));

            const size_t numDeleted = _data->erase(IndexKeyEntry(key, loc));
            invariant(numDeleted <= 1);
            return numDeleted == 1;
            
        }

        virtual void fullValidate(OperationContext* txn, long long *numKeysOut) {
            // TODO check invariants?
            *numKeysOut = _data->size();
        }

        virtual Status dupKeyCheck(OperationContext* txn, const BSONObj& key, const DiskLoc& loc) {
            invariant(!hasFieldNames(key));
            if (isDup(*_data, key, loc))
                return dupKeyError(key);
            return Status::OK();
        }

        virtual bool isEmpty() {
            return _data->empty();
        }

        virtual Status touch(OperationContext* txn) const{
            // already in memory...
            return Status::OK();
        }

        class ForwardCursor : public SortedDataInterface::Cursor {
        public:
            ForwardCursor(const IndexSet& data, OperationContext* txn)
                : _txn(txn),
                  _data(data),
                  _it(data.end())
            {}

            virtual int getDirection() const { return 1; }

            virtual bool isEOF() const {
                return _it == _data.end();
            }

            virtual bool pointsToSamePlaceAs(const SortedDataInterface::Cursor& otherBase) const {
                const ForwardCursor& other = static_cast<const ForwardCursor&>(otherBase);
                invariant(&_data == &other._data); // iterators over same index
                return _it == other._it;
            }

            virtual void aboutToDeleteBucket(const DiskLoc& bucket) {
                invariant(!"aboutToDeleteBucket should not be called");
            }

            virtual bool locate(const BSONObj& keyRaw, const DiskLoc& loc) {
                const BSONObj key = stripFieldNames(keyRaw);
                _it = _data.lower_bound(IndexKeyEntry(key, loc)); // lower_bound is >= key
                return _it != _data.end() && (_it->key == key); // intentionally not comparing loc
            }

            virtual void customLocate(const BSONObj& keyBegin,
                                      int keyBeginLen,
                                      bool afterKey,
                                      const vector<const BSONElement*>& keyEnd,
                                      const vector<bool>& keyEndInclusive) {
                // makeQueryObject handles stripping of fieldnames for us.
                _it = _data.lower_bound(IndexKeyEntry(IndexEntryComparison::makeQueryObject(
                                                        keyBegin,
                                                        keyBeginLen,
                                                        afterKey,
                                                        keyEnd,
                                                        keyEndInclusive,
                                                        1), // forward
                                                   DiskLoc()));
            }

            void advanceTo(const BSONObj &keyBegin,
                           int keyBeginLen,
                           bool afterKey,
                           const vector<const BSONElement*>& keyEnd,
                           const vector<bool>& keyEndInclusive) {
                // XXX I think these do the same thing????
                customLocate(keyBegin, keyBeginLen, afterKey, keyEnd, keyEndInclusive);
            }

            virtual BSONObj getKey() const {
                return _it->key;
            }

            virtual DiskLoc getDiskLoc() const {
                return _it->loc;
            }

            virtual void advance() {
                if (_it != _data.end())
                    ++_it;
            }

            virtual void savePosition() {
                if (_it == _data.end()) {
                    _savedAtEnd = true;
                    return;
                }

                _savedKey = _it->key;
                _savedLoc = _it->loc;
            }

            virtual void restorePosition() {
                if (_savedAtEnd) {
                    _it = _data.end();
                }
                else {
                    locate(_savedKey, _savedLoc);
                }
            }

        private:
            OperationContext* _txn; // not owned
            const IndexSet& _data;
            IndexSet::const_iterator _it;

            // For save/restorePosition since _it may be invalidated durring a yield.
            bool _savedAtEnd;
            BSONObj _savedKey;
            DiskLoc _savedLoc;
        };

        // TODO see if this can share any code with ForwardIterator
        class ReverseCursor : public SortedDataInterface::Cursor {
        public:
            ReverseCursor(const IndexSet& data, OperationContext* txn)
                : _txn(txn),
                  _data(data),
                  _it(data.rend())
            {}

            virtual int getDirection() const { return -1; }

            virtual bool isEOF() const {
                return _it == _data.rend();
            }

            virtual bool pointsToSamePlaceAs(const SortedDataInterface::Cursor& otherBase) const {
                const ReverseCursor& other = static_cast<const ReverseCursor&>(otherBase);
                invariant(&_data == &other._data); // iterators over same index
                return _it == other._it;
            }

            virtual void aboutToDeleteBucket(const DiskLoc& bucket) {
                invariant(!"aboutToDeleteBucket should not be called");
            }

            virtual bool locate(const BSONObj& keyRaw, const DiskLoc& loc) {
                const BSONObj key = stripFieldNames(keyRaw);
                _it = lower_bound(IndexKeyEntry(key, loc)); // lower_bound is <= query
                return _it != _data.rend() && (_it->key == key); // intentionally not comparing loc
            }

            virtual void customLocate(const BSONObj& keyBegin,
                                      int keyBeginLen,
                                      bool afterKey,
                                      const vector<const BSONElement*>& keyEnd,
                                      const vector<bool>& keyEndInclusive) {
                // makeQueryObject handles stripping of fieldnames for us.
                _it = lower_bound(IndexKeyEntry(IndexEntryComparison::makeQueryObject(
                                                  keyBegin,
                                                  keyBeginLen,
                                                  afterKey,
                                                  keyEnd,
                                                  keyEndInclusive,
                                                  -1), // reverse
                                             DiskLoc()));
            }

            void advanceTo(const BSONObj &keyBegin,
                           int keyBeginLen,
                           bool afterKey,
                           const vector<const BSONElement*>& keyEnd,
                           const vector<bool>& keyEndInclusive) {
                // XXX I think these do the same thing????
                customLocate(keyBegin, keyBeginLen, afterKey, keyEnd, keyEndInclusive);
            }

            virtual BSONObj getKey() const {
                return _it->key;
            }

            virtual DiskLoc getDiskLoc() const {
                return _it->loc;
            }

            virtual void advance() {
                if (_it != _data.rend())
                    ++_it;
            }

            virtual void savePosition() {
                if (_it == _data.rend()) {
                    _savedAtEnd = true;
                    return;
                }

                _savedKey = _it->key;
                _savedLoc = _it->loc;
            }

            virtual void restorePosition() {
                if (_savedAtEnd) {
                    _it = _data.rend();
                }
                else {
                    locate(_savedKey, _savedLoc);
                }
            }

        private:
            /**
             * Returns the first entry <= query. This is equivalent to ForwardCursors use of
             * _data.lower_bound which returns the first entry >= query.
             */
            IndexSet::const_reverse_iterator lower_bound(const IndexKeyEntry& query) const {
                // using upper_bound since we want to the right-most entry matching the query.
                IndexSet::const_iterator it = _data.upper_bound(query);

                // upper_bound returns the entry to the right of the one we want. Helpfully,
                // converting to a reverse_iterator moves one to the left. This also correctly
                // handles the case where upper_bound returns end() by converting to rbegin(),
                // meaning that all data is to the right of the query.
                return IndexSet::const_reverse_iterator(it);
            }

            OperationContext* _txn; // not owned
            const IndexSet& _data;
            IndexSet::const_reverse_iterator _it;

            // For save/restorePosition since _it may be invalidated durring a yield.
            bool _savedAtEnd;
            BSONObj _savedKey;
            DiskLoc _savedLoc;
        };

        virtual SortedDataInterface::Cursor* newCursor(OperationContext* txn, int direction) const {
            if (direction == 1)
                return new ForwardCursor(*_data, txn);

            invariant(direction == -1);
            return new ReverseCursor(*_data, txn);
        }

        virtual Status initAsEmpty(OperationContext* txn) {
            // No-op
            return Status::OK();
        }

    private:
        const IndexCatalogEntry& _info;
        IndexSet* _data;
    };
} // namespace

    // IndexCatalogEntry argument taken by non-const pointer for consistency with other Btree
    // factories. We don't actually modify it.
    SortedDataInterface* getHeap1BtreeImpl(IndexCatalogEntry* info, boost::shared_ptr<void>* dataInOut) {
        invariant(info);
        invariant(dataInOut);
        if (!*dataInOut) {
            *dataInOut = boost::make_shared<IndexSet>(IndexEntryComparison(info->ordering()));
        }
        return new Heap1BtreeImpl(*info, static_cast<IndexSet*>(dataInOut->get()));
    }

}  // namespace mongo
