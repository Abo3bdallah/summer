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
Store.resetPoints(false);
assert.equal(Store.getHighStudents().length, 2, 'middle round reset must preserve high-school students');
assert.equal(Store.getHighAttendanceSummary('2099-01-01').total, 2, 'middle round reset must preserve high-school attendance');

const memoId = Store.addMemo({
  message: 'توجيه تجريبي',
  target: 'high',
  level: 'info',
  expiresAt: Date.now() + 60_000
});
assert.equal(Store.getActiveMemos('high').length, 1);
assert.equal(Store.getActiveMemos('middle').length, 0);
Store.setMemoActive(memoId, false);
assert.equal(Store.getActiveMemos('high').length, 0);
Store.deleteMemo(memoId);
assert.equal(Store.getMemos().length, 0);
assert.equal(Store.getAuditLogs().some((entry) => entry.action === 'add_account'), true);
assert.equal(Store.getAuditLogs().some((entry) => entry.action === 'close_attendance'), true);
const backupText = Store.exportData();
const backupInfo = Store.inspectBackup(backupText);
assert.equal(backupInfo.version, '2.0');
assert.equal(backupInfo.summary.highStudents, 2);
assert.equal(backupInfo.summary.accounts >= 1, true);
assert.equal(backupInfo.summary.auditLogs > 0, true);
assert.throws(() => Store.inspectBackup('{"data":{"students":[]}}'), /مفقودة/);
const migrationPreview = Store.getMiddleMigrationPreview();
assert.equal(migrationPreview.students >= 0, true);
assert.equal(migrationPreview.attendanceDays >= 0, true);
Store.addTeacherAccount({
  name: 'إدارة تجريبية',
  password: '1357',
  role: 'admin',
  stage: 'middle',
  permissions: {
    attendance: true,
    closeAttendance: true,
    adminPanel: true,
    manageStudents: true,
    viewDisplays: true,
    viewReports: true
  }
});
const adminAccount = Store.getTeachers()['إدارة تجريبية'];
assert.equal(adminAccount.stage, 'all');
assert.equal(adminAccount.permissions.attendance, true);
assert.equal(adminAccount.permissions.adminPanel, true);
assert.equal(adminAccount.permissions.viewDisplays, true);
assert.equal(adminAccount.permissions.viewReports, true);

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
assert.throws(
  () => Store.addMemo({ message: 'غير مسموح', target: 'all' }),
  /صلاحية/
);
assert.throws(
  () => Store.importData(backupText),
  /مالك المنصة/
);
assert.throws(
  () => Store.migrateMiddleData(),
  /مالك المنصة/
);
assert.throws(
  () => Store.verifyMiddleMigration(),
  /مالك المنصة/
);

Store.logout();
assert.equal(Store.login('إدارة تجريبية', '1357'), true);
assert.equal(Store.hasPermission('viewReports'), true);
assert.equal(Store.hasPermission('attendance'), false);
assert.equal(Store.hasPermission('closeAttendance'), false);
assert.equal(Store.hasPermission('adminPanel'), false);
assert.equal(Store.hasPermission('manageStudents'), false);
assert.equal(Store.hasPermission('viewDisplays'), false);
assert.throws(
  () => Store.setAttendance('2099-01-03', 'student-test', 'present', 'إدارة تجريبية'),
  /صلاحية/
);
assert.throws(
  () => Store.addMemo({ message: 'توجيه غير مسموح', target: 'all' }),
  /صلاحية/
);

console.log('store account tests passed');
