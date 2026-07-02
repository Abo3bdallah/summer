/* ============================================================
   portal.js — بوابة الدخول ولوحة التحكم الموحدة
   تعمل فوق Store الحالي تمهيدًا لنقل المصادقة إلى Firebase Auth.
   ============================================================ */
(function () {
  'use strict';

  var page = document.body.getAttribute('data-portal-page');
  var $ = function (selector) { return document.querySelector(selector); };

  function activeTeachers() {
    var teachers = Store.getTeachers();
    return Object.keys(teachers).filter(function (name) {
      var teacher = teachers[name];
      return !teacher || typeof teacher === 'string' || teacher.active !== false;
    }).sort(function (a, b) {
      var aRole = teachers[a] && teachers[a].role;
      var bRole = teachers[b] && teachers[b].role;
      if (aRole === 'owner' && bRole !== 'owner') return -1;
      if (bRole === 'owner' && aRole !== 'owner') return 1;
      return a.localeCompare(b, 'ar');
    });
  }

  function safeNextPage() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get('next') || 'dashboard.html';
    var allowed = ['dashboard.html', 'attendance.html', 'attendance-high.html', 'admin.html', 'owner.html', 'display.html', 'individual-display.html'];
    return allowed.indexOf(next) !== -1 ? next : 'dashboard.html';
  }

  function initLogin() {
    if (Store.isLoggedIn()) {
      window.location.replace(safeNextPage());
      return;
    }

    var select = $('#loginTeacher');
    var password = $('#loginPassword');
    var form = $('#loginForm');
    var error = $('#loginError');
    var button = $('#loginSubmit');
    var teachers = activeTeachers();

    select.innerHTML = '<option value="">اختر اسمك من القائمة</option>' +
      teachers.map(function (name) {
        var teacher = Store.getTeachers()[name];
        var ownerLabel = teacher && teacher.role === 'owner' ? ' — مالك المنصة' : '';
        return '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + ownerLabel + '</option>';
      }).join('');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.hidden = true;
      button.disabled = true;
      button.textContent = 'جارٍ الدخول...';

      if (Store.login(select.value, password.value)) {
        window.location.replace(safeNextPage());
        return;
      }

      error.textContent = select.value ? 'كلمة المرور غير صحيحة، حاول مرة أخرى.' : 'اختر اسمك أولًا.';
      error.hidden = false;
      password.focus();
      button.disabled = false;
      button.textContent = 'دخول إلى المنصة';
    });
  }

  function roleLabel(user) {
    if (user.role === 'owner') return 'مالك المنصة';
    if (user.role === 'admin') return 'الإدارة العامة';
    if (user.stage === 'high') return 'معلم المرحلة الثانوية';
    return 'معلم المرحلة المتوسطة';
  }

  function setCardVisibility(id, visible) {
    var card = document.getElementById(id);
    if (card) card.hidden = !visible;
  }

  function initDashboard() {
    if (!Store.isLoggedIn()) {
      window.location.replace('index.html?next=dashboard.html');
      return;
    }

    var user = Store.getCurrentUser();
    if (!user || !user.active) {
      Store.logout();
      window.location.replace('index.html');
      return;
    }

    $('#dashboardUserName').textContent = user.name;
    $('#dashboardUserRole').textContent = roleLabel(user);
    $('#dashboardWelcome').textContent = 'مرحبًا ' + user.name.split(' ')[0] + '، اختر المهمة التي تريد البدء بها.';

    var middle = Store.belongsToStage('middle');
    var high = Store.belongsToStage('high');
    setCardVisibility('cardAttendance', middle && Store.hasPermission('attendance'));
    setCardVisibility('cardHighPending', high && Store.hasPermission('attendance'));
    setCardVisibility('cardAdmin', middle && Store.hasPermission('adminPanel'));
    setCardVisibility('cardGroupDisplay', middle && Store.hasPermission('viewDisplays'));
    setCardVisibility('cardIndividualDisplay', middle && Store.hasPermission('viewDisplays'));
    setCardVisibility('cardOwner', user.role === 'owner');
    setCardVisibility('ownerStatus', user.role === 'owner');

    $('#dashboardLogout').addEventListener('click', function () {
      Store.logout();
      window.location.replace('index.html');
    });
  }

  if (page === 'login') initLogin();
  if (page === 'dashboard') initDashboard();
})();
