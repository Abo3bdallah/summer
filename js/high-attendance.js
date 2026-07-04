/* ============================================================
   high-attendance.js — تحضير المرحلة الثانوية (بأسلوب المتوسط)
   4 صفحات بتنقّل سفلي: التحضير • المتابعة • السجل والإحصائيات • الطلاب
   حضور بلا نقاط + مجموعات تنظيمية بسيطة + إدارة طلاب كاملة
   ============================================================ */
(function () {
  'use strict';

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var selectedIds = {};
  var currentFilter = 'all';   // فلتر حالة التحضير
  var trackFilter = 'all';     // فلتر صفحة المتابعة
  var currentTab = 'attendance';

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

  function fmtDateAr(dateStr) {
    if (!dateStr) return '';
    var p = dateStr.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : dateStr;
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
    return true;
  }

  function dateValue() { return $('#highAttendanceDate').value || today(); }

  function statusLabel(status) { return ({ early: 'مبكر', present: 'حاضر', absent: 'غائب' })[status] || 'لم يُحضّر'; }
  function statusIcon(status) { return ({ early: '⏰', present: '✅', absent: '❌' })[status] || '○'; }

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

  function statusOf(record) {
    return record && typeof record === 'object' ? record.status : record;
  }

  /* ---------------- إحصاءات تراكمية عبر كل الأيام ---------------- */
  function allHighDays() {
    var map = Store.getState().highAttendance || {};
    return Object.keys(map).sort().reverse().map(function (d) { return { date: d, day: map[d] }; });
  }

  function dayCounts(dayObj) {
    var c = { early: 0, present: 0, absent: 0, marked: 0 };
    var recs = (dayObj && dayObj.records) || {};
    Object.keys(recs).forEach(function (id) {
      var st = statusOf(recs[id]);
      if (st === 'early') { c.early++; c.marked++; }
      else if (st === 'present') { c.present++; c.marked++; }
      else if (st === 'absent') { c.absent++; c.marked++; }
    });
    return c;
  }

  function studentStats(studentId) {
    var map = Store.getState().highAttendance || {};
    var s = { present: 0, early: 0, absent: 0, marked: 0 };
    Object.keys(map).forEach(function (d) {
      var recs = map[d].records || {};
      var st = statusOf(recs[studentId]);
      if (st === 'early') { s.early++; s.marked++; }
      else if (st === 'present') { s.present++; s.marked++; }
      else if (st === 'absent') { s.absent++; s.marked++; }
    });
    s.rate = s.marked ? Math.round(((s.marked - s.absent) / s.marked) * 100) : 0;
    return s;
  }

  /* ---------------- التنقّل بين الصفحات ---------------- */
  function switchTab(tab) {
    currentTab = tab;
    ['attendance', 'tracking', 'stats', 'students'].forEach(function (t) {
      var view = $('#view' + t.charAt(0).toUpperCase() + t.slice(1));
      if (view) view.classList.toggle('hidden', t !== tab);
    });
    $$('[data-tab]').forEach(function (btn) {
      var active = btn.dataset.tab === tab;
      btn.classList.toggle('htab-active', active);
      btn.classList.toggle('htab-inactive', !active);
    });
    // شريط التاريخ وحالة اليوم يظهران للتحضير والمتابعة فقط
    var showDate = (tab === 'attendance' || tab === 'tracking');
    $('#highDateBar').style.display = showDate ? '' : 'none';
    $('#highDayStatus').style.display = showDate ? '' : 'none';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- عناصر مشتركة ---------------- */
  function renderGroupFilter() {
    var select = $('#highGroupFilter');
    var previous = select.value || 'all';
    var groups = Store.getHighGroups();
    var options = ['<option value="all">🗂️ كل المجموعات</option>'];
    groups.forEach(function (g) { options.push('<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>'); });
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

  /* ---------------- صفحة التحضير ---------------- */
  function visibleStudents() {
    var query = ($('#highStudentSearch').value || '').trim().toLowerCase();
    var groupFilter = ($('#highGroupFilter').value) || 'all';
    var date = dateValue();
    var list = activeStudents().filter(function (student) {
      var status = statusOf(Store.getHighStudentAttendance(date, student.id));
      var matchesName = !query || String(student.name || '').toLowerCase().indexOf(query) !== -1;
      var matchesStatus = currentFilter === 'all' || (currentFilter === 'unmarked' ? !status : status === currentFilter);
      var matchesGroup = groupFilter === 'all' || (groupFilter === 'nogroup' ? !student.groupId : student.groupId === groupFilter);
      return matchesName && matchesStatus && matchesGroup;
    });
    return sortByGroupThenName(list);
  }

  function statusButton(studentId, status, label, active, disabled) {
    return '<button type="button" data-student="' + studentId + '" data-status="' + status + '" ' +
      'class="text-[10px] md:text-xs font-black px-2 py-1.5 rounded-md border border-slate-200 bg-white/80 text-slate-700 active:scale-95 transition-all ' +
      (active ? ACTIVE_CLASS[status] : '') + '" ' + (disabled ? 'disabled' : '') + '>' + label + '</button>';
  }

  function renderStudents() {
    var students = visibleStudents();
    var date = dateValue();
    var disabled = Store.isHighAttendanceClosed(date) || isAdmin();
    $('#highListDescription').textContent = students.length + ' طالب';
    $('#highStudentsList').innerHTML = students.length ? students.map(function (student) {
      var record = Store.getHighStudentAttendance(date, student.id);
      var status = statusOf(record) || '';
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
      (activeStudents().length ? 'غيّر البحث أو المرشّح.' : 'أضف طلاب الثانوية من صفحة «الطلاب».') + '</p></div>';

    $$('[data-select-student]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) selectedIds[input.dataset.selectStudent] = true;
        else delete selectedIds[input.dataset.selectStudent];
        renderSelection();
      });
    });
    $$('#highStudentsList [data-student][data-status]').forEach(function (button) {
      button.addEventListener('click', function () { markStudents([button.dataset.student], button.dataset.status); });
    });
    renderSelection();
  }

  function renderAttendanceView() {
    renderGroupFilter();
    renderSummary();
    renderStudents();
  }

  /* ---------------- صفحة المتابعة ---------------- */
  function renderTracking() {
    var query = ($('#highTrackSearch').value || '').trim().toLowerCase();
    var date = dateValue();
    var list = activeStudents().map(function (student) {
      var todayStatus = statusOf(Store.getHighStudentAttendance(date, student.id)) || '';
      var stats = studentStats(student.id);
      return { student: student, todayStatus: todayStatus, stats: stats };
    }).filter(function (row) {
      if (query && String(row.student.name || '').toLowerCase().indexOf(query) === -1) return false;
      if (trackFilter === 'absent') return row.todayStatus === 'absent';
      if (trackFilter === 'unmarked') return !row.todayStatus;
      if (trackFilter === 'risk') return row.stats.absent > 0;
      return true;
    });

    if (trackFilter === 'risk') {
      list.sort(function (a, b) { return b.stats.absent - a.stats.absent; });
    } else {
      list = sortByGroupThenName(list.map(function (r) { return r.student; })).map(function (s) {
        return list.filter(function (r) { return r.student.id === s.id; })[0];
      });
    }

    $('#highTrackingList').innerHTML = list.length ? list.map(function (row) {
      var s = row.stats;
      var gName = groupName(row.student.groupId);
      var risk = s.absent >= 3 || (s.marked >= 3 && s.rate < 60);
      var badgeColor = STATUS_COLOR[row.todayStatus] || STATUS_COLOR.unmarked;
      var rateColor = s.rate >= 80 ? 'text-emerald-600' : (s.rate >= 60 ? 'text-amber-600' : 'text-rose-600');
      return '<div class="bg-white/70 backdrop-blur-md p-3 rounded-xl shadow-sm flex items-center gap-2.5" style="border-right:4px solid ' + badgeColor + '">' +
        '<div class="w-9 h-9 rounded-full ' + (risk ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700') + ' font-black flex items-center justify-center shrink-0 text-sm">' + esc(String(row.student.name || '').trim().charAt(0) || 'ط') + '</div>' +
        '<div class="flex flex-col min-w-0 flex-1 text-right">' +
          '<h3 class="font-extrabold text-sm text-slate-800 truncate">' + esc(row.student.name) + (risk ? ' <span class="text-rose-500">⚠️</span>' : '') + '</h3>' +
          '<span class="text-[9px] font-bold text-slate-400 truncate">' + (gName ? '🗂️ ' + esc(gName) + ' — ' : '') + 'اليوم: ' + statusIcon(row.todayStatus) + ' ' + statusLabel(row.todayStatus) + '</span>' +
        '</div>' +
        '<div class="text-left shrink-0">' +
          '<div class="text-[10px] font-bold ' + rateColor + '">حضور ' + s.rate + '%</div>' +
          '<div class="text-[9px] font-bold text-slate-400">غياب ' + s.absent + ' · أيام ' + s.marked + '</div>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="bg-white/60 rounded-2xl p-8 text-center text-slate-500"><div class="text-3xl mb-2">🔍</div><strong class="block text-sm">لا نتائج</strong><p class="text-xs mt-1">غيّر البحث أو المرشّح.</p></div>';
  }

  /* ---------------- صفحة السجل والإحصائيات ---------------- */
  function renderStats() {
    var students = activeStudents();
    var days = allHighDays();
    var totalAbsent = 0, rateSum = 0, rateDays = 0;
    days.forEach(function (d) {
      var c = dayCounts(d.day);
      totalAbsent += c.absent;
      if (c.marked) { rateSum += Math.round(((c.marked - c.absent) / c.marked) * 100); rateDays++; }
    });
    $('#statTotalStudents').textContent = students.length;
    $('#statTotalDays').textContent = days.length;
    $('#statAvgRate').textContent = (rateDays ? Math.round(rateSum / rateDays) : 0) + '%';
    $('#statTotalAbsent').textContent = totalAbsent;
    $('#statDaysDesc').textContent = days.length + ' يوم';

    $('#highDaysList').innerHTML = days.length ? days.map(function (d) {
      var c = dayCounts(d.day);
      var closed = d.day && d.day.status === 'closed';
      var marked = c.marked;
      var rate = marked ? Math.round(((marked - c.absent) / marked) * 100) : 0;
      return '<div class="bg-white/70 backdrop-blur-md p-3 rounded-xl shadow-sm">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<strong class="text-sm font-black text-slate-800">📅 ' + fmtDateAr(d.date) + '</strong>' +
          '<span class="text-[10px] font-black px-2 py-0.5 rounded-full ' + (closed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700') + '">' + (closed ? '🔒 معتمد' : '🟢 مفتوح') + '</span>' +
        '</div>' +
        '<div class="grid grid-cols-4 gap-1.5 text-center">' +
          '<div class="bg-indigo-50 rounded-lg py-1.5"><span class="block text-[9px] font-bold text-indigo-400">مبكر</span><strong class="text-sm font-black text-indigo-600">' + c.early + '</strong></div>' +
          '<div class="bg-emerald-50 rounded-lg py-1.5"><span class="block text-[9px] font-bold text-emerald-500">حاضر</span><strong class="text-sm font-black text-emerald-600">' + c.present + '</strong></div>' +
          '<div class="bg-rose-50 rounded-lg py-1.5"><span class="block text-[9px] font-bold text-rose-400">غائب</span><strong class="text-sm font-black text-rose-600">' + c.absent + '</strong></div>' +
          '<div class="bg-slate-100 rounded-lg py-1.5"><span class="block text-[9px] font-bold text-slate-400">نسبة</span><strong class="text-sm font-black text-slate-600">' + rate + '%</strong></div>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="bg-white/60 rounded-2xl p-8 text-center text-slate-500"><div class="text-3xl mb-2">📅</div><strong class="block text-sm">لا توجد أيام مرصودة بعد</strong><p class="text-xs mt-1">ستظهر الأيام هنا بعد بدء التحضير.</p></div>';
  }

  /* ---------------- صفحة الطلاب والمجموعات ---------------- */
  function groupOptionsHtml(selectedId) {
    var opts = ['<option value="">بدون مجموعة</option>'];
    Store.getHighGroups().forEach(function (g) {
      opts.push('<option value="' + esc(g.id) + '"' + (g.id === selectedId ? ' selected' : '') + '>' + esc(g.name) + '</option>');
    });
    return opts.join('');
  }

  function renderManageView() {
    var manage = canManage();
    $('#highManageLocked').classList.toggle('hidden', manage);
    ['newHighGroupName', 'addHighGroupButton', 'newHighStudentsNames', 'newHighStudentsGroup', 'addHighStudentsButton'].forEach(function (id) {
      var el = $('#' + id); if (el) el.disabled = !manage;
    });

    // المجموعات
    var groups = Store.getHighGroups();
    $('#highGroupsList').innerHTML = groups.length ? groups.map(function (g) {
      var count = Store.getHighStudents().filter(function (s) { return s.groupId === g.id; }).length;
      return '<div class="flex items-center gap-2">' +
        '<input type="text" value="' + esc(g.name) + '" data-group-name="' + g.id + '" class="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500" ' + (manage ? '' : 'disabled') + ' />' +
        '<span class="text-[10px] font-bold text-slate-400 shrink-0">' + count + ' طالب</span>' +
        (manage ? '<button type="button" data-group-save="' + g.id + '" class="text-[11px] font-bold bg-indigo-600 text-white px-2.5 py-2 rounded-lg active:scale-95">حفظ</button>' +
        '<button type="button" data-group-delete="' + g.id + '" class="text-[11px] font-bold bg-rose-100 text-rose-700 px-2.5 py-2 rounded-lg active:scale-95">حذف</button>' : '') +
      '</div>';
    }).join('') : '<p class="text-[11px] text-slate-400 font-bold">لا توجد مجموعات بعد.</p>';

    $('#newHighStudentsGroup').innerHTML = groupOptionsHtml('');

    // قائمة الطلاب للتعديل (لا نعيد الرسم إن كان المستخدم يكتب داخلها)
    if (document.activeElement && $('#highStudentsManagerList').contains(document.activeElement)) return;
    var q = ($('#highManageSearch').value || '').trim().toLowerCase();
    var students = sortByGroupThenName(Store.getHighStudents()).filter(function (s) {
      return !q || String(s.name || '').toLowerCase().indexOf(q) !== -1;
    });
    $('#highStudentsManagerList').innerHTML = students.length ? students.map(function (s) {
      return '<div class="bg-white/70 border border-slate-200/60 rounded-xl p-2.5 flex flex-wrap items-center gap-2">' +
        '<input type="text" value="' + esc(s.name) + '" data-student-name="' + s.id + '" class="flex-1 min-w-[120px] p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500" ' + (manage ? '' : 'disabled') + ' />' +
        '<select data-student-group="' + s.id + '" class="p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500" ' + (manage ? '' : 'disabled') + '>' + groupOptionsHtml(s.groupId) + '</select>' +
        '<label class="flex items-center gap-1 text-[11px] font-bold text-slate-600"><input type="checkbox" data-student-active="' + s.id + '" class="accent-indigo-600" ' + (s.active !== false ? 'checked' : '') + (manage ? '' : ' disabled') + ' /> نشط</label>' +
        (manage ? '<button type="button" data-student-save="' + s.id + '" class="text-[11px] font-bold bg-emerald-600 text-white px-2.5 py-2 rounded-lg active:scale-95">حفظ</button>' +
        '<button type="button" data-student-del="' + s.id + '" class="text-[11px] font-bold bg-rose-100 text-rose-700 px-2.5 py-2 rounded-lg active:scale-95">حذف</button>' : '') +
      '</div>';
    }).join('') : '<p class="text-[11px] text-slate-400 font-bold">لم تتم إضافة طلاب بعد.</p>';

    if (!manage) return;
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
          try { Store.deleteHighGroup(btn.dataset.groupDelete); showToast('تم حذف المجموعة'); } catch (e) { showToast(e.message, true); }
        });
      });
    });
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
          try { Store.deleteHighStudent(id); showToast('تم حذف الطالب'); } catch (e) { showToast(e.message, true); }
        });
      });
    });
  }

  /* ---------------- إعادة الرسم حسب الصفحة النشطة ---------------- */
  function render() {
    renderDayStatus();
    if (currentTab === 'attendance') renderAttendanceView();
    else if (currentTab === 'tracking') renderTracking();
    else if (currentTab === 'stats') renderStats();
    else if (currentTab === 'students') renderManageView();
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
      render();
      Promise.resolve(operation).then(function () { showToast('تم تحديث التحضير'); })
        .catch(function (error) { showToast(error.message || 'تعذّر مزامنة التحضير', true); });
    } catch (error) {
      showToast(error.message || 'تعذّر تحديث التحضير', true);
    }
  }

  function selectedStudentIds() {
    return Object.keys(selectedIds).filter(function (id) { return selectedIds[id]; });
  }

  /* ---------------- ربط الأحداث ---------------- */
  $$('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  $('#highAttendanceDate').value = today();
  $('#highAttendanceDate').addEventListener('change', function () { selectedIds = {}; render(); });
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
      try { Store.closeHighAttendance(dateValue(), Store.getLoggedInTeacher()); showToast('تم إغلاق واعتماد التحضير'); render(); }
      catch (e) { showToast(e.message, true); }
    });
  });
  $('#reopenHighAttendanceButton').addEventListener('click', function () {
    showConfirm('هل تريد إعادة فتح التحضير للتعديل؟', function (ok) {
      if (!ok) return;
      try { Store.reopenHighAttendance(dateValue()); showToast('تمت إعادة فتح التحضير'); render(); }
      catch (e) { showToast(e.message, true); }
    });
  });

  // صفحة المتابعة
  $('#highTrackSearch').addEventListener('input', renderTracking);
  $$('[data-track-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      $$('[data-track-filter]').forEach(function (item) { item.classList.remove('chip-active'); });
      button.classList.add('chip-active');
      trackFilter = button.dataset.trackFilter;
      renderTracking();
    });
  });

  // صفحة الطلاب
  $('#highManageSearch').addEventListener('input', renderManageView);
  $('#addHighGroupButton').addEventListener('click', function () {
    var name = ($('#newHighGroupName').value || '').trim();
    try { Store.addHighGroup(name); $('#newHighGroupName').value = ''; showToast('تمت إضافة المجموعة'); }
    catch (e) { showToast(e.message, true); }
  });
  $('#addHighStudentsButton').addEventListener('click', function () {
    var names = ($('#newHighStudentsNames').value || '').split(/\r?\n|،|,/).map(function (n) { return n.trim(); }).filter(Boolean);
    var groupId = $('#newHighStudentsGroup').value || null;
    if (!names.length) { showToast('اكتب اسمًا واحدًا على الأقل', true); return; }
    var added = 0;
    names.forEach(function (n) { try { Store.addHighStudent(n, groupId); added++; } catch (e) { /* تجاهل المكرر */ } });
    if (!added) { showToast('لم تتم إضافة أسماء جديدة', true); return; }
    $('#newHighStudentsNames').value = '';
    showToast('تمت إضافة ' + added + ' طالب');
  });

  $('#btnLogout').addEventListener('click', function () {
    showConfirm('هل تريد تسجيل الخروج؟', function (ok) {
      if (!ok) return;
      Store.logout();
      window.location.replace('index.html');
    });
  });

  if (requireAccess()) {
    switchTab('attendance');
    Store.subscribe(render);
  }
})();
