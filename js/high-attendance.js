/* ============================================================
   high-attendance.js — تحضير المرحلة الثانوية (بأسلوب المتوسط)
   حضور بلا نقاط + مجموعات تنظيمية بسيطة + إدارة طلاب داخل التحضير
   ============================================================ */
(function () {
  'use strict';

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var selectedIds = {};
  var currentFilter = 'all';

  var STATUS_COLOR = { early: '#4f46e5', present: '#10b981', absent: '#f43f5e', unmarked: '#cbd5e1' };
  var ACTIVE_CLASS = { early: 'btn-early-active', present: 'btn-present-active', absent: 'btn-absent-active' };

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

  function currentUser() { return Store.getCurrentUser(); }
  function isAdmin() { var u = currentUser(); return !!u && u.role === 'admin'; }

  function canManage() {
    var u = currentUser();
    if (!u || !u.active || u.role === 'admin') return false;
    return u.role === 'owner' || Store.hasPermission('manageStudents') ||
      (Store.belongsToStage('high') && Store.hasPermission('attendance'));
  }

  function requireAccess() {
    if (!Store.isLoggedIn()) {
      window.location.replace('index.html?next=attendance-high.html');
      return false;
    }
    var user = currentUser();
    var allowed = (user && (user.role === 'admin' || user.role === 'owner')) ||
      (Store.belongsToStage('high') && Store.hasPermission('attendance'));
    if (!allowed) {
      window.location.replace('dashboard.html');
      return false;
    }
    $('#highCurrentUser').textContent = user.name;
    $('#btnManageHigh').hidden = !canManage();
    return true;
  }

  function dateValue() { return $('#highAttendanceDate').value || today(); }

  function statusLabel(status) { return ({ early: 'مبكر', present: 'حاضر', absent: 'غائب' })[status] || 'لم يُحضّر'; }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  function groupName(id) {
    if (!id) return '';
    var g = Store.getHighGroup(id);
    return g ? g.name : '';
  }

  function activeStudents() {
    return Store.getHighStudents().filter(function (student) { return student.active !== false; });
  }

  // فرز حسب المجموعة ثم الاسم (يجمّع طلاب كل مجموعة معًا، وبدون مجموعة أخيرًا)
  function sortByGroupThenName(list) {
    return list.slice().sort(function (a, b) {
      var ga = groupName(a.groupId), gb = groupName(b.groupId);
      if (!ga && gb) return 1;
      if (ga && !gb) return -1;
      if (ga !== gb) return ga.localeCompare(gb, 'ar');
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
  }

  function visibleStudents() {
    var query = ($('#highStudentSearch').value || '').trim().toLowerCase();
    var groupFilter = ($('#highGroupFilter').value) || 'all';
    var date = dateValue();
    var list = activeStudents().filter(function (student) {
      var record = Store.getHighStudentAttendance(date, student.id);
      var status = record && typeof record === 'object' ? record.status : record;
      var matchesName = !query || String(student.name || '').toLowerCase().indexOf(query) !== -1;
      var matchesStatus = currentFilter === 'all' ||
        (currentFilter === 'unmarked' ? !status : status === currentFilter);
      var matchesGroup = groupFilter === 'all' ||
        (groupFilter === 'nogroup' ? !student.groupId : student.groupId === groupFilter);
      return matchesName && matchesStatus && matchesGroup;
    });
    return sortByGroupThenName(list);
  }

  function renderGroupFilter() {
    var select = $('#highGroupFilter');
    var previous = select.value || 'all';
    var groups = Store.getHighGroups();
    var options = ['<option value="all">🗂️ كل المجموعات</option>'];
    groups.forEach(function (g) {
      options.push('<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>');
    });
    options.push('<option value="nogroup">بدون مجموعة</option>');
    select.innerHTML = options.join('');
    select.value = previous;
    if (!select.value) select.value = 'all';
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
    var box = $('#highDayStatus');
    if (closed) {
      box.innerHTML = '<div class="bg-rose-50/80 border border-rose-200 text-rose-800 rounded-xl p-3 flex items-center gap-2 text-xs font-bold">' +
        '<span class="text-lg">🔒</span><div><strong class="block">التحضير مغلق ومعتمد</strong>' +
        '<span class="font-medium">' + (day.closedBy ? 'اعتمده ' + esc(day.closedBy) : 'لا يمكن تعديل الحالات في هذا التاريخ.') + '</span></div></div>';
    } else {
      box.innerHTML = '<div class="bg-emerald-50/80 border border-emerald-200 text-emerald-800 rounded-xl p-3 flex items-center gap-2 text-xs font-bold">' +
        '<span class="text-lg">🟢</span><div><strong class="block">التحضير مفتوح</strong>' +
        '<span class="font-medium">يمكنك تسجيل الحالات وتعديلها.</span></div></div>';
    }
    $('#closeHighAttendanceButton').hidden = closed || !canClose;
    $('#reopenHighAttendanceButton').hidden = !closed || !canClose;
    $('#highBulkBar').style.opacity = (closed || isAdmin()) ? '0.5' : '1';
    $('#highBulkBar').style.pointerEvents = (closed || isAdmin()) ? 'none' : 'auto';
  }

  function renderSelection() {
    var count = Object.keys(selectedIds).filter(function (id) { return selectedIds[id]; }).length;
    $('#highSelectedCount').textContent = count + ' محدد';
  }

  function statusButton(studentId, status, label, active, disabled) {
    return '<button type="button" data-student="' + studentId + '" data-status="' + status + '" ' +
      'class="text-[10px] md:text-xs font-black px-2 py-1.5 rounded-md border border-slate-200 bg-white/80 text-slate-700 active:scale-95 transition-all ' +
      (active ? ACTIVE_CLASS[status] : '') + '" ' + (disabled ? 'disabled' : '') + '>' + label + '</button>';
  }

  function renderStudents() {
    var students = visibleStudents();
    var date = dateValue();
    var closed = Store.isHighAttendanceClosed(date);
    var disabled = closed || isAdmin();
    $('#highListDescription').textContent = students.length + ' طالب';
    $('#highStudentsList').innerHTML = students.length ? students.map(function (student) {
      var record = Store.getHighStudentAttendance(date, student.id);
      var status = record && typeof record === 'object' ? record.status : '';
      var gName = groupName(student.groupId);
      var meta = [];
      if (gName) meta.push('🗂️ ' + esc(gName));
      if (record && typeof record === 'object') {
        var extra = [record.by, formatTime(record.at)].filter(Boolean).join(' · ');
        if (extra) meta.push(esc(extra));
      }
      var subText = meta.length ? meta.join(' — ') : 'لم تُسجّل حالته بعد';
      var color = STATUS_COLOR[status] || STATUS_COLOR.unmarked;
      return '<div class="bg-white/70 backdrop-blur-md p-3 rounded-xl shadow-sm flex items-center gap-2.5 transition-all hover:bg-white" style="border-right:4px solid ' + color + '">' +
        '<input type="checkbox" data-select-student="' + student.id + '" class="w-4 h-4 accent-indigo-600 shrink-0" ' + (selectedIds[student.id] ? 'checked' : '') + (disabled ? ' disabled' : '') + ' />' +
        '<div class="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center shrink-0 text-sm">' + esc(String(student.name || '').trim().charAt(0) || 'ط') + '</div>' +
        '<div class="flex flex-col min-w-0 flex-1 text-right">' +
          '<h3 class="font-extrabold text-sm text-slate-800 truncate">' + esc(student.name) + '</h3>' +
          '<span class="text-[9px] font-bold text-slate-400 truncate">' + subText + '</span>' +
        '</div>' +
        '<div class="flex gap-1 shrink-0">' +
          statusButton(student.id, 'early', 'مبكر', status === 'early', disabled) +
          statusButton(student.id, 'present', 'حاضر', status === 'present', disabled) +
          statusButton(student.id, 'absent', 'غائب', status === 'absent', disabled) +
        '</div>' +
      '</div>';
    }).join('') : '<div class="bg-white/60 rounded-2xl p-8 text-center text-slate-500"><div class="text-3xl mb-2">🎓</div><strong class="block text-sm">لا يوجد طلاب في هذه القائمة</strong><p class="text-xs mt-1">' +
      (activeStudents().length ? 'غيّر البحث أو المرشّح.' : 'أضف طلاب الثانوية من زر «الطلاب والمجموعات».') + '</p></div>';

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
    renderGroupFilter();
    renderSummary();
    renderDayStatus();
    renderStudents();
    renderManage();
  }

  function showToast(message, isError) {
    var toast = $('#highToast');
    toast.textContent = message;
    toast.style.background = isError ? '#be123c' : '#0f172a';
    toast.style.opacity = '1';
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.style.opacity = '0'; }, 2500);
  }

  function markStudents(ids, status) {
    if (isAdmin()) { showToast('لا تملك صلاحية التحضير', true); return; }
    try {
      var operation = ids.length === 1 ?
        Store.setHighAttendance(dateValue(), ids[0], status, Store.getLoggedInTeacher()) :
        Store.setBulkHighAttendance(dateValue(), ids, status, Store.getLoggedInTeacher());
      selectedIds = {};
      renderAll();
      Promise.resolve(operation).then(function () {
        showToast('تم تحديث التحضير');
      }).catch(function (error) {
        showToast(error.message || 'تعذّر مزامنة التحضير', true);
      });
    } catch (error) {
      showToast(error.message || 'تعذّر تحديث التحضير', true);
    }
  }

  function selectedStudentIds() {
    return Object.keys(selectedIds).filter(function (id) { return selectedIds[id]; });
  }

  /* ---------------- مودال الإدارة: المجموعات + الطلاب ---------------- */

  function groupOptionsHtml(selectedId) {
    var opts = ['<option value="">بدون مجموعة</option>'];
    Store.getHighGroups().forEach(function (g) {
      opts.push('<option value="' + esc(g.id) + '"' + (g.id === selectedId ? ' selected' : '') + '>' + esc(g.name) + '</option>');
    });
    return opts.join('');
  }

  function renderManage() {
    var modal = $('#highManageModal');
    if (!modal || modal.classList.contains('hidden')) return;

    // قائمة المجموعات
    var groups = Store.getHighGroups();
    $('#highGroupsList').innerHTML = groups.length ? groups.map(function (g) {
      return '<div class="flex items-center gap-2">' +
        '<input type="text" value="' + esc(g.name) + '" data-group-name="' + g.id + '" class="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500" />' +
        '<button type="button" data-group-save="' + g.id + '" class="text-[11px] font-bold bg-indigo-600 text-white px-2.5 py-2 rounded-lg active:scale-95">حفظ</button>' +
        '<button type="button" data-group-delete="' + g.id + '" class="text-[11px] font-bold bg-rose-100 text-rose-700 px-2.5 py-2 rounded-lg active:scale-95">حذف</button>' +
      '</div>';
    }).join('') : '<p class="text-[11px] text-slate-400 font-bold">لا توجد مجموعات بعد.</p>';

    // قائمة الطلاب في إضافة الأسماء
    $('#newHighStudentsGroup').innerHTML = groupOptionsHtml('');

    // قائمة الطلاب للتعديل
    var students = Store.getHighStudents();
    $('#highStudentsManagerList').innerHTML = students.length ? students.map(function (s) {
      return '<div class="bg-white/70 border border-slate-200/60 rounded-xl p-2.5 flex flex-wrap items-center gap-2">' +
        '<input type="text" value="' + esc(s.name) + '" data-student-name="' + s.id + '" class="flex-1 min-w-[120px] p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500" />' +
        '<select data-student-group="' + s.id + '" class="p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500">' + groupOptionsHtml(s.groupId) + '</select>' +
        '<label class="flex items-center gap-1 text-[11px] font-bold text-slate-600"><input type="checkbox" data-student-active="' + s.id + '" class="accent-indigo-600" ' + (s.active !== false ? 'checked' : '') + ' /> نشط</label>' +
        '<button type="button" data-student-save="' + s.id + '" class="text-[11px] font-bold bg-emerald-600 text-white px-2.5 py-2 rounded-lg active:scale-95">حفظ</button>' +
        '<button type="button" data-student-del="' + s.id + '" class="text-[11px] font-bold bg-rose-100 text-rose-700 px-2.5 py-2 rounded-lg active:scale-95">حذف</button>' +
      '</div>';
    }).join('') : '<p class="text-[11px] text-slate-400 font-bold">لم تتم إضافة طلاب بعد.</p>';

    // ربط أحداث المجموعات
    $$('[data-group-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        try { Store.updateHighGroup(btn.dataset.groupSave, $('[data-group-name="' + btn.dataset.groupSave + '"]').value); showToast('تم حفظ المجموعة'); }
        catch (e) { showToast(e.message, true); }
      });
    });
    $$('[data-group-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var g = Store.getHighGroup(btn.dataset.groupDelete);
        showConfirm('حذف مجموعة "' + (g ? g.name : '') + '"؟ سيبقى الطلاب لكن دون مجموعة.', function (ok) {
          if (!ok) return;
          try { Store.deleteHighGroup(btn.dataset.groupDelete); showToast('تم حذف المجموعة'); }
          catch (e) { showToast(e.message, true); }
        });
      });
    });

    // ربط أحداث الطلاب
    $$('[data-student-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.studentSave;
        try {
          Store.updateHighStudent(id, {
            name: $('[data-student-name="' + id + '"]').value,
            groupId: $('[data-student-group="' + id + '"]').value || null,
            active: $('[data-student-active="' + id + '"]').checked
          });
          showToast('تم حفظ بيانات الطالب');
        } catch (e) { showToast(e.message, true); }
      });
    });
    $$('[data-student-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.studentDel;
        var s = Store.getHighStudent(id);
        showConfirm('حذف الطالب "' + (s ? s.name : '') + '" من القائمة؟', function (ok) {
          if (!ok) return;
          try { Store.deleteHighStudent(id); showToast('تم حذف الطالب'); }
          catch (e) { showToast(e.message, true); }
        });
      });
    });
  }

  function openManage() {
    if (!canManage()) { showToast('لا تملك صلاحية الإدارة', true); return; }
    $('#highManageModal').classList.remove('hidden');
    $('#highManageModal').style.display = 'flex';
    renderManage();
  }
  function closeManage() {
    $('#highManageModal').classList.add('hidden');
    $('#highManageModal').style.display = 'none';
  }

  /* ---------------- ربط الأحداث ---------------- */

  $('#highAttendanceDate').value = today();
  $('#highAttendanceDate').addEventListener('change', function () { selectedIds = {}; renderAll(); });
  $('#highStudentSearch').addEventListener('input', renderStudents);
  $('#highGroupFilter').addEventListener('change', function () { selectedIds = {}; renderStudents(); });

  $$('[data-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      $$('[data-filter]').forEach(function (item) { item.classList.remove('chip-active'); });
      button.classList.add('chip-active');
      currentFilter = button.dataset.filter;
      renderStudents();
    });
  });

  $('#selectVisibleHighStudents').addEventListener('click', function () {
    if (Store.isHighAttendanceClosed(dateValue()) || isAdmin()) return;
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
    showConfirm('هل تريد إغلاق واعتماد تحضير هذا اليوم؟', function (ok) {
      if (!ok) return;
      try { Store.closeHighAttendance(dateValue(), Store.getLoggedInTeacher()); showToast('تم إغلاق واعتماد التحضير'); renderAll(); }
      catch (e) { showToast(e.message, true); }
    });
  });
  $('#reopenHighAttendanceButton').addEventListener('click', function () {
    showConfirm('هل تريد إعادة فتح التحضير للتعديل؟', function (ok) {
      if (!ok) return;
      try { Store.reopenHighAttendance(dateValue()); showToast('تمت إعادة فتح التحضير'); renderAll(); }
      catch (e) { showToast(e.message, true); }
    });
  });

  $('#btnManageHigh').addEventListener('click', openManage);
  $('#closeHighManageModal').addEventListener('click', closeManage);
  $('#highManageModal').addEventListener('click', function (e) { if (e.target === this) closeManage(); });

  $('#btnLogout').addEventListener('click', function () {
    showConfirm('هل تريد تسجيل الخروج؟', function (ok) {
      if (!ok) return;
      Store.logout();
      window.location.replace('index.html');
    });
  });

  $('#addHighGroupButton').addEventListener('click', function () {
    var name = ($('#newHighGroupName').value || '').trim();
    try { Store.addHighGroup(name); $('#newHighGroupName').value = ''; showToast('تمت إضافة المجموعة'); }
    catch (e) { showToast(e.message, true); }
  });

  $('#addHighStudentsButton').addEventListener('click', function () {
    var names = ($('#newHighStudentsNames').value || '').split(/\r?\n|،|,/).map(function (n) { return n.trim(); }).filter(Boolean);
    var groupId = $('#newHighStudentsGroup').value || null;
    if (!names.length) { showToast('اكتب اسمًا واحدًا على الأقل', true); return; }
    try {
      var added = 0;
      names.forEach(function (n) {
        try { Store.addHighStudent(n, groupId); added++; } catch (e) { /* تجاهل المكرر */ }
      });
      if (!added) { showToast('لم تتم إضافة أسماء جديدة', true); return; }
      $('#newHighStudentsNames').value = '';
      showToast('تمت إضافة ' + added + ' طالب');
    } catch (e) { showToast(e.message, true); }
  });

  if (requireAccess()) {
    renderAll();
    Store.subscribe(renderAll);
  }
})();
