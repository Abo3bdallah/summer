/* ============================================================
   owner.js — إدارة الحسابات والصلاحيات من حساب مالك المنصة
   ============================================================ */
(function () {
  'use strict';

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var OWNER_NAME = 'أحمد الذبياني';
  var selectedAccount = '';

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
      attendance: true,
      closeAttendance: true,
      adminPanel: true,
      manageStudents: true,
      viewDisplays: true,
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
    $('#accountRole').value = isOwner ? 'admin' : account.role;
    $('#accountStage').value = account.stage;
    $('#accountActive').checked = account.active;
    $('#editorKicker').textContent = isOwner ? 'الحساب المحمي' : 'تعديل الحساب';
    $('#editorTitle').textContent = name;
    $('#accountName').disabled = isOwner;
    $('#accountRole').disabled = isOwner;
    $('#accountStage').disabled = isOwner;
    $('#accountActive').disabled = isOwner;
    $('#permissionsFieldset').disabled = isOwner;
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
    if (!window.confirm('هل تريد حذف حساب "' + selectedAccount + '"؟')) return;
    try {
      Store.deleteTeacherAccount(selectedAccount);
      showToast('تم حذف الحساب');
      newAccount();
    } catch (error) {
      showFormError(error.message || 'تعذر حذف الحساب');
    }
  });

  $('#newAccountButton').addEventListener('click', newAccount);
  $('#closeEditorButton').addEventListener('click', closeEditor);
  $('#accountSearch').addEventListener('input', renderAccounts);
  $('#accountRole').addEventListener('change', applySuggestedPermissions);
  $('#accountStage').addEventListener('change', applySuggestedPermissions);

  if (requireOwner()) {
    renderAccounts();
    newAccount();
    Store.subscribe(renderAccounts);
  }
})();
