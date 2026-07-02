const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map();
const localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  }
};

const windowMock = {
  localStorage,
  console,
  addEventListener() {},
  db: null
};
windowMock.window = windowMock;

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const storeSource = source.split('// ============================================================\n// نظام حوارات التنبيه')[0];
vm.runInNewContext(storeSource, windowMock, { filename: 'store.js' });

const Store = windowMock.Store;
assert.ok(Store, 'Store should be exposed');

assert.equal(Store.login('أحمد الذبياني', '1234'), true);
assert.equal(Store.getCurrentUser().role, 'owner');
assert.equal(Store.hasPermission('managePlatform'), true);

Store.addTeacherAccount({
  name: 'معلم تجريبي',
  password: '2468',
  role: 'teacher',
  stage: 'high',
  active: true,
  permissions: { attendance: true }
});
assert.equal(Store.getTeachers()['معلم تجريبي'].stage, 'high');

Store.updateTeacherAccount('معلم تجريبي', {
  name: 'معلم الثانوية',
  role: 'teacher',
  stage: 'high',
  active: false,
  permissions: { attendance: true }
});
assert.equal(Store.getTeachers()['معلم تجريبي'], undefined);
assert.equal(Store.getTeachers()['معلم الثانوية'].active, false);
assert.equal(Store.login('معلم الثانوية', '2468'), false);

assert.throws(() => Store.deleteTeacherAccount('أحمد الذبياني'), /مالك المنصة/);
Store.deleteTeacherAccount('معلم الثانوية');
assert.equal(Store.getTeachers()['معلم الثانوية'], undefined);

assert.equal(Store.addHighStudents(['طالب أول', 'طالب ثانٍ']), 2);
const highStudents = Store.getHighStudents();
Store.setHighAttendance('2099-01-01', highStudents[0].id, 'present', 'أحمد الذبياني');
Store.setBulkHighAttendance('2099-01-01', [highStudents[1].id], 'absent', 'أحمد الذبياني');
assert.deepEqual(
  JSON.parse(JSON.stringify(Store.getHighAttendanceSummary('2099-01-01'))),
  { total: 2, early: 0, present: 1, absent: 1, unmarked: 0 }
);
Store.closeHighAttendance('2099-01-01', 'أحمد الذبياني');
assert.equal(Store.isHighAttendanceClosed('2099-01-01'), true);
assert.throws(
  () => Store.setHighAttendance('2099-01-01', highStudents[0].id, 'early', 'أحمد الذبياني'),
  /مغلق/
);
Store.reopenHighAttendance('2099-01-01');
assert.equal(Store.isHighAttendanceClosed('2099-01-01'), false);

Store.logout();
assert.equal(Store.login('حاتم الحارثي', '1234'), true);
assert.throws(
  () => Store.addTeacherAccount({ name: 'حساب غير مسموح', password: '1111' }),
  /مالك المنصة/
);
assert.throws(
  () => Store.setHighAttendance('2099-01-02', highStudents[0].id, 'present', 'حاتم الحارثي'),
  /صلاحية/
);

console.log('store account tests passed');
