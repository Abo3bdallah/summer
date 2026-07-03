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
    var allowed = ['dashboard.html', 'attendance.html', 'attendance-high.html', 'admin.html', 'admin-portal.html', 'owner.html', 'display.html', 'individual-display.html'];
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

  function setCardAccess(id, allowed, reason) {
    var card = document.getElementById(id);
    if (!card) return;
    card.hidden = false;
    if (!card.dataset.destination) card.dataset.destination = card.getAttribute('href') || '';
    card.classList.toggle('dashboard-card-locked', !allowed);
    
    // ترتيب ديناميكي: تظهر الصفحات المفتوحة أولاً (الترتيب 1) والمغلقة أخيراً (الترتيب 2)
    card.style.order = allowed ? '1' : '2';

    var note = card.querySelector('.dashboard-access-note');
    if (!note) {
      note = document.createElement('span');
      note.className = 'dashboard-access-note';
      card.querySelector('div').appendChild(note);
    }
    if (allowed) {
      card.setAttribute('href', card.dataset.destination);
      card.removeAttribute('aria-disabled');
      note.remove();
      return;
    }
    card.removeAttribute('href');
    card.removeAttribute('target');
    card.removeAttribute('rel');
    card.setAttribute('aria-disabled', 'true');
    note.textContent = '🔒 ' + reason;
    var arrow = card.querySelector('.dashboard-arrow');
    if (arrow) arrow.textContent = '🔒';
    card.addEventListener('click', function (event) { event.preventDefault(); });
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
    var isAdmin = user.role === 'admin';
    var isOwner = user.role === 'owner';
    setCardAccess('cardAttendance', isAdmin || isOwner || (middle && Store.hasPermission('attendance')), 'مخصص لمعلمي المرحلة المتوسطة');
    setCardAccess('cardHighPending', isAdmin || isOwner || (high && Store.hasPermission('attendance')), 'مخصص لمعلمي المرحلة الثانوية');
    setCardAccess('cardAdmin', middle && Store.hasPermission('adminPanel'), 'مخصص لإدارة النقاط في المرحلة المتوسطة');
    setCardAccess('cardAdminPortal', user.role === 'owner' || user.role === 'admin' || Store.hasPermission('viewReports'), 'مخصص للإدارة العامة');
    setCardAccess('cardGroupDisplay', middle && Store.hasPermission('viewDisplays'), 'مخصص للمرحلة المتوسطة');
    setCardAccess('cardIndividualDisplay', middle && Store.hasPermission('viewDisplays'), 'مخصص للمرحلة المتوسطة');
    setCardAccess('cardOwner', user.role === 'owner', 'مخصص لمالك المنصة');
    $('#ownerStatus').hidden = user.role !== 'owner';

    $('#dashboardLogout').addEventListener('click', function () {
      Store.logout();
      window.location.replace('index.html');
    });
  }

  if (page === 'login') initLogin();
  if (page === 'dashboard') initDashboard();
})();
