const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function nestedAssign(target, dottedKey, value) {
  const parts = dottedKey.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor[parts[i]] = cursor[parts[i]] || {};
    cursor = cursor[parts[i]];
  }
  const key = parts[parts.length - 1];
  if (value && value.__delete) delete cursor[key];
  else cursor[key] = value;
}

function applyUpdate(doc, update) {
  Object.keys(update || {}).forEach((key) => {
    const value = update[key];
    if (value && value.__inc) {
      doc[key] = (doc[key] || 0) + value.__inc;
    } else if (key.indexOf('.') !== -1) {
      nestedAssign(doc, key, value);
    } else if (value && value.__delete) {
      delete doc[key];
    } else {
      doc[key] = value;
    }
  });
}

function createFakeDb(delayMs) {
  const docs = new Map();
  const keyOf = (segments) => segments.join('/');
  const ensureDoc = (segments) => {
    const key = keyOf(segments);
    if (!docs.has(key)) docs.set(key, {});
    return docs.get(key);
  };
  const snapshotFor = (segments) => {
    const key = keyOf(segments);
    const data = docs.get(key);
    return { exists: !!data, data: () => Object.assign({}, data || {}) };
  };
  const makeDocRef = (segments) => ({
    set(data, options) {
      const current = options && options.merge ? ensureDoc(segments) : {};
      docs.set(keyOf(segments), Object.assign(current, data));
      return Promise.resolve();
    },
    update(data) {
      const current = ensureDoc(segments);
      applyUpdate(current, data);
      return Promise.resolve();
    },
    collection(name) {
      return makeCollection(segments.concat(name));
    },
    onSnapshot(cb) {
      setTimeout(() => cb(snapshotFor(segments)), 0);
      return function () {};
    }
  });
  const makeCollection = (segments) => ({
    doc(id) {
      return makeDocRef(segments.concat(id));
    },
    onSnapshot(cb) {
      setTimeout(() => cb({
        forEach() {},
        size: 0
      }), 0);
      return function () {};
    },
    orderBy() { return this; },
    limit() { return this; },
    get() {
      return Promise.resolve({ forEach() {}, size: 0 });
    }
  });
  return {
    docs,
    collection(name) {
      return makeCollection([name]);
    },
    batch() {
      const ops = [];
      return {
        set(ref, data, options) { ops.push(() => ref.set(data, options)); },
        update(ref, data) { ops.push(() => ref.update(data)); },
        delete() {},
        commit() {
          ops.forEach((op) => op());
          return Promise.resolve();
        }
      };
    },
    runTransaction(fn) {
      const tx = {
        get(ref) {
          return Promise.resolve(snapshotFor(ref.__segments || []));
        },
        set(ref, data, options) {
          ref.set(data, options);
        },
        update(ref, data) {
          ref.update(data);
        }
      };
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          Promise.resolve(fn(tx)).then(resolve, reject);
        }, delayMs);
      });
    },
    _makeDocRef: makeDocRef
  };
}

function attachSegments(db) {
  const originalCollection = db.collection.bind(db);
  db.collection = function (name) {
    const collection = originalCollection(name);
    const originalDoc = collection.doc.bind(collection);
    collection.doc = function (id) {
      const ref = originalDoc(id);
      ref.__segments = [name, id];
      const originalNested = ref.collection.bind(ref);
      ref.collection = function (nestedName) {
        const nested = originalNested(nestedName);
        const nestedDoc = nested.doc.bind(nested);
        nested.doc = function (nestedId) {
          const nestedRef = nestedDoc(nestedId);
          nestedRef.__segments = [name, id, nestedName, nestedId];
          return nestedRef;
        };
        return nested;
      };
      return ref;
    };
    return collection;
  };
  return db;
}

(async function testCloseWaitsForPendingMiddleWrites() {
  const localValues = new Map();
  const db = attachSegments(createFakeDb(25));
  const windowMock = {
    localStorage: {
      getItem(key) { return localValues.has(key) ? localValues.get(key) : null; },
      setItem(key, value) { localValues.set(key, String(value)); },
      removeItem(key) { localValues.delete(key); }
    },
    console,
    addEventListener() {},
    db,
    firebase: {
      firestore: {
        FieldValue: {
          increment(n) { return { __inc: n }; },
          delete() { return { __delete: true }; }
        }
      }
    }
  };
  windowMock.window = windowMock;

  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
  const storeSource = source.split('// ============================================================\n// ظ†ط¸ط§ظ… ط­ظˆط§ط±ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡')[0];
  vm.runInNewContext(storeSource, windowMock, { filename: 'store.js' });

  const Store = windowMock.Store;
  assert.equal(Store.login('أحمد الذبياني', '1234'), true);
  Store.getState().students.push({ id: 's-race-1', name: 'طالب اختبار السباق', groupId: 'qimma', points: 0 });

  const date = '2099-03-01';
  const savePromise = Store.setAttendance(date, 's-race-1', 'present', 'أحمد الذبياني');
  const closePromise = Store.closeAttendance(date, 'أحمد الذبياني');
  await closePromise;
  await savePromise;

  const serverDay = db.docs.get('attendance/' + date);
  assert.equal(serverDay.status, 'closed');
  assert.equal(serverDay.records['s-race-1'].status, 'present');
  assert.equal(Store.getStudentAttendance(date, 's-race-1'), 'present');
  assert.equal(Store.isAttendanceClosed(date), true);
  console.log('attendance close race test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
