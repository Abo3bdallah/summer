/* ============================================================
   owner.js — إدارة الحسابات والصلاحيات من حساب مالك المنصة
   ============================================================ */
(function () {
  'use strict';

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var OWNER_NAME = 'أحمد الذبياني';
  var selectedAccount = '';
  var pendingBackupText = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function requireOwner() {
    if (!Store.isLoggedIn()) {
      window.location.replace('index.html?next=owner.html');
      return false;
    }
    var user = Store.getCurrentUser();
    if (!user || user.role !== 'owner') {
      window.location.replace('dashboard.html');
      return false;
    }
    $('#ownerCurrentName').textContent = user.name;
    return true;
  }

  function roleLabel(role) {
    if (role === 'owner') return 'مالك المنصة';
    if (role === 'admin') return 'إدارة عامة';
    return 'معلم';
  }

  function stageLabel(stage) {
    if (stage === 'all') return 'المرحلتان';
    if (stage === 'high') return 'الثانوية';
    return 'المتوسطة';
  }

  function normalizedAccount(name, raw) {
    if (typeof raw === 'string') {
      return {
        name: name,
        password: raw,
        role: name === OWNER_NAME ? 'owner' : 'teacher',
        stage: name === OWNER_NAME ? 'all' : 'middle',
        active: true,
        permissions: {}
      };
    }
    return {
      name: name,
      password: raw.password || '',
      role: name === OWNER_NAME ? 'owner' : (raw.role || 'teacher'),
      stage: name === OWNER_NAME ? 'all' : (raw.stage || 'middle'),
      active: name === OWNER_NAME ? true : raw.active !== false,
      permissions: raw.permissions || {}
    };
  }

  function allAccounts() {
    var teachers = Store.getTeachers();
    return Object.keys(teachers).map(function (name) {
      return normalizedAccount(name, teachers[name]);
    }).sort(function (a, b) {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }

  function renderSummary(accounts) {
    $('#accountsTotal').textContent = accounts.length;
    $('#accountsActive').textContent = accounts.filter(function (account) { return account.active; }).length;
    $('#accountsMiddle').textContent = accounts.filter(function (account) { return account.stage === 'middle'; }).length;
    $('#accountsHigh').textContent = accounts.filter(function (account) { return account.stage === 'high'; }).length;
  }

  function renderAccounts() {
    var accounts = allAccounts();
    var query = ($('#accountSearch').value || '').trim().toLowerCase();
    var filtered = accounts.filter(function (account) {
      return !query || account.name.toLowerCase().indexOf(query) !== -1 ||
        roleLabel(account.role).indexOf(query) !== -1 || stageLabel(account.stage).indexOf(query) !== -1;
    });
    renderSummary(accounts);

    $('#accountsList').innerHTML = filtered.length ? filtered.map(function (account) {
      var selected = selectedAccount === account.name ? ' selected' : '';
      var inactive = account.active ? '' : ' inactive';
      return '<button class="account-row' + selected + inactive + '" type="button" data-account="' + esc(account.name) + '">' +
        '<span class="account-avatar">' + (account.role === 'owner' ? '👑' : account.role === 'admin' ? '🛡️' : '👤') + '</span>' +
        '<span class="account-main"><strong>' + esc(account.name) + '</strong><small>' + roleLabel(account.role) + ' · ' + stageLabel(account.stage) + '</small></span>' +
        '<span class="account-state ' + (account.active ? 'active' : 'disabled') + '">' + (account.active ? 'نشط' : 'موقوف') + '</span>' +
      '</button>';
    }).join('') : '<div class="owner-empty">لا توجد حسابات مطابقة للبحث.</div>';

    $$('[data-account]', $('#accountsList')).forEach(function (button) {
      button.addEventListener('click', function () { editAccount(button.dataset.account); });
    });
  }

  function permissionInputs() {
    var permissions = {};
    $$('[data-permission]').forEach(function (input) {
      permissions[input.dataset.permission] = input.checked;
    });
    return permissions;
  }

  function applySuggestedPermissions() {
    if (selectedAccount === OWNER_NAME) return;
    var role = $('#accountRole').value;
    var stage = $('#accountStage').value;
    var suggested = role === 'admin' ? {
      attendance: false,
      closeAttendance: false,
      adminPanel: false,
      manageStudents: false,
      viewDisplays: false,
      viewReports: true
    } : {
      attendance: true,
      closeAttendance: false,
      adminPanel: false,
      manageStudents: false,
      viewDisplays: stage !== 'high',
      viewReports: false
    };
    $$('[data-permission]').forEach(function (input) {
      input.checked = !!suggested[input.dataset.permission];
    });
    if (role === 'admin') $('#accountStage').value = 'all';
    $('#accountStage').disabled = role === 'admin';
    // السماح بتعديل الصلاحيات للمشرفين من حساب المالك
    $('#permissionsFieldset').disabled = false;
    $('#adminRoleHelp').hidden = role !== 'admin';
  }

  function openEditor() {
    $('#accountEditor').classList.add('open');
  }

  function closeEditor() {
    $('#accountEditor').classList.remove('open');
  }

  function newAccount() {
    selectedAccount = '';
    $('#accountForm').reset();
    $('#originalAccountName').value = '';
    $('#accountActive').checked = true;
    $('#editorKicker').textContent = 'حساب جديد';
    $('#editorTitle').textContent = 'إضافة مستخدم';
    $('#accountName').disabled = false;
    $('#accountRole').disabled = false;
    $('#accountStage').disabled = false;
    $('#accountActive').disabled = false;
    $('#permissionsFieldset').disabled = false;
    $('#accountPassword').placeholder = 'كلمة المرور الجديدة (مطلوبة)';
    $('#adminRoleHelp').hidden = true;
    $('#deleteAccountButton').hidden = true;
    $('#accountFormError').hidden = true;
    applySuggestedPermissions();
    renderAccounts();
    openEditor();
    $('#accountName').focus();
  }

  function editAccount(name) {
    var raw = Store.getTeachers()[name];
    if (!raw) return;
    var account = normalizedAccount(name, raw);
    var isOwner = account.role === 'owner';
    selectedAccount = name;

    $('#originalAccountName').value = name;
    $('#accountName').value = name;
    $('#accountPassword').value = '';
    $('#accountPassword').placeholder = 'اتركها فارغة للإبقاء على الحالية';
    $('#accountRole').value = isOwner ? 'admin' : account.role;
    $('#accountStage').value = account.stage;
    $('#accountActive').checked = account.active;
    $('#editorKicker').textContent = isOwner ? 'الحساب المحمي' : 'تعديل الحساب';
    $('#editorTitle').textContent = name;
    $('#accountName').disabled = isOwner;
    $('#accountRole').disabled = isOwner;
    $('#accountStage').disabled = isOwner || account.role === 'admin';
    $('#accountActive').disabled = isOwner;
    $('#permissionsFieldset').disabled = isOwner;
    $('#adminRoleHelp').hidden = account.role !== 'admin';
    $('#deleteAccountButton').hidden = isOwner;
    $('#accountFormError').hidden = true;

    $$('[data-permission]').forEach(function (input) {
      input.checked = isOwner || !!account.permissions[input.dataset.permission];
    });
    renderAccounts();
    openEditor();
  }

  function formData() {
    return {
      name: $('#accountName').value,
      password: $('#accountPassword').value,
      role: $('#accountRole').value,
      stage: $('#accountStage').value,
      active: $('#accountActive').checked,
      permissions: permissionInputs()
    };
  }

  function showToast(message) {
    var toast = $('#ownerToast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  function showFormError(message) {
    var error = $('#accountFormError');
    error.textContent = message;
    error.hidden = false;
  }

  function auditActionLabel(action) {
    return ({
      add_account: 'إضافة حساب',
      update_account: 'تعديل حساب',
      delete_account: 'حذف حساب',
      update_owner_password: 'تحديث حساب المالك',
      change_password: 'تغيير كلمة مرور',
      change_permission: 'تعديل صلاحية',
      add_student: 'إضافة طالب',
      add_students: 'إضافة طلاب',
      update_student: 'تعديل طالب',
      delete_student: 'حذف طالب',
      close_attendance: 'إغلاق التحضير',
      reopen_attendance: 'إعادة فتح التحضير',
      reset_points: 'تصفير النقاط',
      add_memo: 'إرسال توجيه',
      toggle_memo: 'تغيير حالة توجيه',
      delete_memo: 'حذف توجيه',
      restore_backup: 'استعادة نسخة',
      start_migration: 'بدء ترحيل البيانات',
      complete_migration: 'اكتمال ترحيل البيانات',
      migration_mismatch: 'اختلاف بعد الترحيل',
      migration_failed: 'فشل ترحيل البيانات'
    })[action] || action;
  }

  function renderAuditLogs() {
    var list = $('#auditLogList');
    if (!list) return;
    var query = ($('#auditSearch').value || '').trim().toLowerCase();
    var entries = Store.getAuditLogs().filter(function (entry) {
      return !query || (auditActionLabel(entry.action) + ' ' + entry.subject + ' ' + entry.details + ' ' + entry.actor).toLowerCase().indexOf(query) !== -1;
    });
    list.innerHTML = entries.length ? entries.map(function (entry) {
      var when = entry.at ? new Date(entry.at).toLocaleString('ar-SA') : '—';
      return '<article class="audit-log-row">' +
        '<span class="audit-log-icon">🧾</span>' +
        '<div><strong>' + esc(auditActionLabel(entry.action)) + '</strong><p>' + esc(entry.subject || '—') + (entry.details ? ' · ' + esc(entry.details) : '') + '</p></div>' +
        '<div class="audit-log-meta"><span>' + esc(entry.actor || 'النظام') + '</span><small>' + esc(when) + '</small></div>' +
      '</article>';
    }).join('') : '<div class="owner-empty">لا توجد عمليات مطابقة.</div>';
  }

  function renderMigrationPreview() {
    var preview = Store.getMiddleMigrationPreview();
    $('#migrationPreview').innerHTML =
      '<span><b>' + preview.students + '</b> طالب</span>' +
      '<span><b>' + preview.attendanceDays + '</b> يوم تحضير</span>' +
      '<span><b>' + preview.logsLoaded + '</b> عملية محملة</span>' +
      '<span><b>' + preview.totalPoints + '</b> مجموع النقاط</span>';
  }

  function showMigrationResult(result) {
    var box = $('#migrationResult');
    box.className = 'migration-result ' + (result.ok ? 'ok' : 'error');
    box.innerHTML =
      '<strong>' + (result.ok ? '✅ البيانات متطابقة' : '⚠️ يوجد اختلاف يحتاج مراجعة') + '</strong>' +
      '<span>المصدر: ' + result.source.students + ' طالب، ' + result.source.attendanceDays + ' يوم، ' + result.source.logs + ' عملية، ' + result.source.totalPoints + ' نقطة</span>' +
      '<span>النسخة: ' + result.target.students + ' طالب، ' + result.target.attendanceDays + ' يوم، ' + result.target.logs + ' عملية، ' + result.target.totalPoints + ' نقطة</span>';
    box.hidden = false;
  }

  $('#accountForm').addEventListener('submit', function (event) {
    event.preventDefault();
    $('#accountFormError').hidden = true;
    try {
      if (selectedAccount) {
        selectedAccount = Store.updateTeacherAccount(selectedAccount, formData());
        showToast('تم حفظ تعديلات الحساب');
      } else {
        var data = formData();
        selectedAccount = Store.addTeacherAccount(data);
        showToast('تم إنشاء الحساب بنجاح');
      }
      editAccount(selectedAccount);
    } catch (error) {
      showFormError(error.message || 'تعذر حفظ الحساب');
    }
  });

  $('#deleteAccountButton').addEventListener('click', function () {
    if (!selectedAccount || selectedAccount === OWNER_NAME) return;
    showConfirm('هل تريد حذف حساب "' + selectedAccount + '"؟', function (confirmed) {
      if (!confirmed) return;
      try {
        Store.deleteTeacherAccount(selectedAccount);
        showToast('تم حذف الحساب');
        newAccount();
      } catch (error) {
        showFormError(error.message || 'تعذر حذف الحساب');
      }
    });
  });

  $('#newAccountButton').addEventListener('click', newAccount);
  $('#closeEditorButton').addEventListener('click', closeEditor);
  $('#accountSearch').addEventListener('input', renderAccounts);
  $('#accountRole').addEventListener('change', applySuggestedPermissions);
  $('#accountStage').addEventListener('change', applySuggestedPermissions);
  $('#auditSearch').addEventListener('input', renderAuditLogs);
  $('#verifyMiddleMigration').addEventListener('click', function () {
    var button = this;
    button.disabled = true;
    button.textContent = 'جارٍ الفحص...';
    Store.verifyMiddleMigration().then(showMigrationResult).catch(function (error) {
      showToast(error.message || 'تعذر فحص الترحيل');
    }).finally(function () {
      button.disabled = false;
      button.textContent = 'فحص النسخة الحالية';
    });
  });
  $('#runMiddleMigration').addEventListener('click', function () {
    showConfirm('سيتم نسخ بيانات المتوسطة إلى الهيكل الجديد دون حذف الجداول القديمة. هل تريد المتابعة؟', function (confirmed) {
      if (!confirmed) return;
      var button = $('#runMiddleMigration');
      button.disabled = true;
      button.textContent = 'جارٍ النسخ والتحقق...';
      downloadBackup('نسخة-قبل-الترحيل');
      Store.migrateMiddleData().then(function (result) {
        showMigrationResult(result);
        showToast(result.ok ? 'اكتمل الترحيل وتطابقت البيانات' : 'اكتمل النسخ مع وجود اختلاف');
      }).catch(function (error) {
        showToast(error.message || 'تعذر تنفيذ الترحيل');
      }).finally(function () {
        button.disabled = false;
        button.textContent = 'بدء النسخ والتحقق';
      });
    });
  });

  function downloadBackup(prefix) {
    var blob = new Blob([Store.exportData()], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = (prefix || 'نسخة-رحال') + '-' + date + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  $('#downloadFullBackup').addEventListener('click', function () {
    downloadBackup('نسخة-رحال');
    showToast('تم تجهيز النسخة الاحتياطية');
  });

  $('#restoreBackupFile').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    pendingBackupText = '';
    $('#backupPreview').hidden = true;
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        pendingBackupText = String(reader.result || '');
        var info = Store.inspectBackup(pendingBackupText);
        var summary = info.summary;
        $('#backupPreviewText').innerHTML =
          '<strong>نسخة إصدار ' + esc(info.version) + '</strong>' +
          '<span>المتوسطة: ' + summary.middleStudents + ' طالب · الثانوية: ' + summary.highStudents + ' طالب</span>' +
          '<span>الحسابات: ' + summary.accounts + ' · سجلات العمليات: ' + summary.logs + '</span>';
        $('#backupPreview').hidden = false;
      } catch (error) {
        pendingBackupText = '';
        showToast(error.message || 'ملف النسخة غير صالح');
      }
    };
    reader.readAsText(file, 'UTF-8');
  });

  $('#confirmBackupRestore').addEventListener('click', function () {
    if (!pendingBackupText) return;
    showConfirm('ستستبدل الاستعادة بيانات المنصة الحالية بمحتوى النسخة. هل تريد المتابعة؟', function (confirmed) {
      if (!confirmed) return;
      try {
        downloadBackup('نسخة-قبل-الاستعادة');
        Promise.resolve(Store.importData(pendingBackupText)).then(function () {
          pendingBackupText = '';
          $('#backupPreview').hidden = true;
          $('#restoreBackupFile').value = '';
          showToast('تمت استعادة النسخة بنجاح، جارٍ تحديث الصفحة...');
          setTimeout(function () {
            window.location.reload();
          }, 1500);
        }).catch(function (error) {
          showToast(error.message || 'تعذرت استعادة النسخة');
        });
      } catch (error) {
        showToast(error.message || 'تعذرت استعادة النسخة');
      }
    });
  });

  if (requireOwner()) {
    renderAccounts();
    newAccount();
    renderAuditLogs();
    renderMigrationPreview();
    Store.subscribe(function () {
      renderAccounts();
      renderAuditLogs();
    });
  }
})();
