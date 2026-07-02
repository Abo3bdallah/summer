/* ============================================================
   high-attendance.js — تحضير المرحلة الثانوية دون نقاط
   ============================================================ */
(function () {
  'use strict';

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var selectedIds = {};
  var currentFilter = 'all';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function today() {
    var date = new Date();
    var pad = function (value) { return value < 10 ? '0' + value : String(value); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function requireAccess() {
    if (!Store.isLoggedIn()) {
      window.location.replace('index.html?next=attendance-high.html');
      return false;
    }
    if (!Store.belongsToStage('high') || !Store.hasPermission('attendance')) {
      window.location.replace('dashboard.html');
      return false;
    }
    var user = Store.getCurrentUser();
    $('#highCurrentUser').textContent = user.name;
    $('#manageHighStudentsButton').hidden = !Store.hasPermission('manageStudents');
    return true;
  }

  function dateValue() {
    return $('#highAttendanceDate').value || today();
  }

  function statusLabel(status) {
    return ({ early: 'مبكر', present: 'حاضر', absent: 'غائب' })[status] || 'لم يُحضّر';
  }

  function statusIcon(status) {
    return ({ early: '⏰', present: '✅', absent: '❌' })[status] || '○';
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  function activeStudents() {
    return Store.getHighStudents().filter(function (student) { return student.active !== false; });
  }

  function visibleStudents() {
    var query = ($('#highStudentSearch').value || '').trim().toLowerCase();
    var date = dateValue();
    return activeStudents().filter(function (student) {
      var record = Store.getHighStudentAttendance(date, student.id);
      var status = record && typeof record === 'object' ? record.status : record;
      var matchesName = !query || String(student.name || '').toLowerCase().indexOf(query) !== -1;
      var matchesStatus = currentFilter === 'all' ||
        (currentFilter === 'unmarked' ? !status : status === currentFilter);
      return matchesName && matchesStatus;
    });
  }

  function renderSummary() {
    var summary = Store.getHighAttendanceSummary(dateValue());
    $('#highTotal').textContent = summary.total;
    $('#highEarly').textContent = summary.early;
    $('#highPresent').textContent = summary.present;
    $('#highAbsent').textContent = summary.absent;
    $('#highUnmarked').textContent = summary.unmarked;
    var marked = summary.total - summary.unmarked;
    var percent = summary.total ? Math.round((marked / summary.total) * 100) : 0;
    $('#highProgressText').textContent = percent + '%';
    $('#highProgressBar').style.width = percent + '%';
  }

  function renderDayStatus() {
    var date = dateValue();
    var day = Store.getHighAttendance(date);
    var closed = Store.isHighAttendanceClosed(date);
    var canClose = Store.hasPermission('closeAttendance');
    var status = $('#highDayStatus');
    status.className = 'high-day-status ' + (closed ? 'closed' : 'open');
    status.innerHTML = closed ?
      '<span>🔒</span><div><strong>التحضير مغلق ومعتمد</strong><p>' + (day.closedBy ? 'اعتمده ' + esc(day.closedBy) : 'لا يمكن تعديل الحالات في هذا التاريخ.') + '</p></div>' :
      '<span>🟢</span><div><strong>التحضير مفتوح</strong><p>يمكن للمعلمين تسجيل الحالات وتعديلها.</p></div>';
    $('#closeHighAttendanceButton').hidden = closed || !canClose;
    $('#reopenHighAttendanceButton').hidden = !closed || !canClose;
    $('#highBulkBar').classList.toggle('disabled', closed);
  }

  function renderSelection() {
    var count = Object.keys(selectedIds).filter(function (id) { return selectedIds[id]; }).length;
    $('#highSelectedCount').textContent = count + ' محدد';
  }

  function renderStudents() {
    var students = visibleStudents();
    var date = dateValue();
    var closed = Store.isHighAttendanceClosed(date);
    $('#highListDescription').textContent = students.length + ' طالب ظاهر في القائمة';
    $('#highStudentsList').innerHTML = students.length ? students.map(function (student) {
      var record = Store.getHighStudentAttendance(date, student.id);
      var status = record && typeof record === 'object' ? record.status : '';
      var details = record && typeof record === 'object' ?
        [record.by, formatTime(record.at)].filter(Boolean).join(' · ') : '';
      return '<article class="high-student-row status-' + (status || 'unmarked') + '">' +
        '<label class="high-select-box"><input type="checkbox" data-select-student="' + student.id + '" ' + (selectedIds[student.id] ? 'checked' : '') + (closed ? ' disabled' : '') + ' /><span></span></label>' +
        '<div class="high-student-avatar">' + esc(String(student.name || '').trim().charAt(0) || 'ط') + '</div>' +
        '<div class="high-student-name"><strong>' + esc(student.name) + '</strong><small>' + (details ? esc(details) : 'لم تُسجل حالته بعد') + '</small></div>' +
        '<span class="high-status-badge">' + statusIcon(status) + ' ' + statusLabel(status) + '</span>' +
        '<div class="high-status-actions">' +
          '<button type="button" data-student="' + student.id + '" data-status="early" class="' + (status === 'early' ? 'active' : '') + '" ' + (closed ? 'disabled' : '') + '>⏰ مبكر</button>' +
          '<button type="button" data-student="' + student.id + '" data-status="present" class="' + (status === 'present' ? 'active' : '') + '" ' + (closed ? 'disabled' : '') + '>✅ حاضر</button>' +
          '<button type="button" data-student="' + student.id + '" data-status="absent" class="' + (status === 'absent' ? 'active' : '') + '" ' + (closed ? 'disabled' : '') + '>❌ غائب</button>' +
        '</div>' +
      '</article>';
    }).join('') : '<div class="high-empty"><span>🎓</span><strong>لا يوجد طلاب في هذه القائمة</strong><p>' +
      (activeStudents().length ? 'غيّر البحث أو مرشح الحالة.' : 'أضف طلاب الثانوية من زر إدارة الطلاب.') +
      '</p></div>';

    $$('[data-select-student]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) selectedIds[input.dataset.selectStudent] = true;
        else delete selectedIds[input.dataset.selectStudent];
        renderSelection();
      });
    });
    $$('[data-student][data-status]').forEach(function (button) {
      button.addEventListener('click', function () {
        markStudents([button.dataset.student], button.dataset.status);
      });
    });
    renderSelection();
  }

  function renderAll() {
    renderSummary();
    renderDayStatus();
    renderStudents();
    renderManagerList();
  }

  function showToast(message, isError) {
    var toast = $('#highToast');
    toast.textContent = message;
    toast.style.background = isError ? '#be123c' : '#0f172a';
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2500);
  }

  function markStudents(ids, status) {
    try {
      var operation = ids.length === 1 ?
        Store.setHighAttendance(dateValue(), ids[0], status, Store.getLoggedInTeacher()) :
        Store.setBulkHighAttendance(dateValue(), ids, status, Store.getLoggedInTeacher());
      selectedIds = {};
      renderAll();
      Promise.resolve(operation).then(function () {
        showToast('تم تحديث التحضير بنجاح');
      }).catch(function (error) {
        showToast(error.message || 'تعذر مزامنة التحضير', true);
      });
    } catch (error) {
      showToast(error.message || 'تعذر تحديث التحضير', true);
    }
  }

  function selectedStudentIds() {
    return Object.keys(selectedIds).filter(function (id) { return selectedIds[id]; });
  }

  function renderManagerList() {
    var list = $('#highStudentsManagerList');
    if (!list || $('#highStudentsModal').hidden) return;
    var students = Store.getHighStudents();
    list.innerHTML = students.length ? students.map(function (student) {
      return '<div class="high-manager-row">' +
        '<input type="text" value="' + esc(student.name) + '" data-manager-name="' + student.id + '" />' +
        '<label><input type="checkbox" data-manager-active="' + student.id + '" ' + (student.active !== false ? 'checked' : '') + ' /> نشط</label>' +
        '<button type="button" data-manager-save="' + student.id + '">حفظ</button>' +
        '<button type="button" data-manager-delete="' + student.id + '">حذف</button>' +
      '</div>';
    }).join('') : '<div class="owner-empty">لم تتم إضافة طلاب الثانوية بعد.</div>';

    $$('[data-manager-save]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.managerSave;
        try {
          Store.updateHighStudent(id, {
            name: $('[data-manager-name="' + id + '"]').value,
            active: $('[data-manager-active="' + id + '"]').checked
          });
          showToast('تم حفظ بيانات الطالب');
        } catch (error) { showToast(error.message, true); }
      });
    });
    $$('[data-manager-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.dataset.managerDelete;
        var student = Store.getHighStudent(id);
        if (!window.confirm('حذف الطالب "' + (student ? student.name : '') + '" من القائمة؟')) return;
        try {
          Store.deleteHighStudent(id);
          showToast('تم حذف الطالب');
        } catch (error) { showToast(error.message, true); }
      });
    });
  }

  $('#highAttendanceDate').value = today();
  $('#highAttendanceDate').addEventListener('change', function () { selectedIds = {}; renderAll(); });
  $('#highStudentSearch').addEventListener('input', renderStudents);
  $$('[data-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      $$('[data-filter]').forEach(function (item) { item.classList.remove('active'); });
      button.classList.add('active');
      currentFilter = button.dataset.filter;
      renderStudents();
    });
  });
  $('#selectVisibleHighStudents').addEventListener('click', function () {
    if (Store.isHighAttendanceClosed(dateValue())) return;
    visibleStudents().forEach(function (student) { selectedIds[student.id] = true; });
    renderStudents();
  });
  $('#clearHighSelection').addEventListener('click', function () { selectedIds = {}; renderStudents(); });
  $$('[data-bulk-status]').forEach(function (button) {
    button.addEventListener('click', function () {
      var ids = selectedStudentIds();
      if (!ids.length) { showToast('حدد طالبًا واحدًا على الأقل', true); return; }
      markStudents(ids, button.dataset.bulkStatus);
    });
  });
  $('#closeHighAttendanceButton').addEventListener('click', function () {
    if (!window.confirm('هل تريد إغلاق واعتماد تحضير هذا اليوم؟')) return;
    try {
      Store.closeHighAttendance(dateValue(), Store.getLoggedInTeacher());
      showToast('تم إغلاق واعتماد التحضير');
      renderAll();
    } catch (error) { showToast(error.message, true); }
  });
  $('#reopenHighAttendanceButton').addEventListener('click', function () {
    if (!window.confirm('هل تريد إعادة فتح التحضير للتعديل؟')) return;
    try {
      Store.reopenHighAttendance(dateValue());
      showToast('تمت إعادة فتح التحضير');
      renderAll();
    } catch (error) { showToast(error.message, true); }
  });
  $('#manageHighStudentsButton').addEventListener('click', function () {
    $('#highStudentsModal').hidden = false;
    renderManagerList();
  });
  $('#closeHighStudentsModal').addEventListener('click', function () { $('#highStudentsModal').hidden = true; });
  $('#addHighStudentsButton').addEventListener('click', function () {
    var names = ($('#newHighStudentsNames').value || '').split(/\r?\n|،|,/).map(function (name) { return name.trim(); }).filter(Boolean);
    try {
      var count = Store.addHighStudents(names);
      if (!count) { showToast('لم تتم إضافة أسماء جديدة', true); return; }
      $('#newHighStudentsNames').value = '';
      showToast('تمت إضافة ' + count + ' طالب');
      renderAll();
    } catch (error) { showToast(error.message, true); }
  });

  if (requireAccess()) {
    renderAll();
    Store.subscribe(renderAll);
  }
})();
