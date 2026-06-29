/* ============================================================
   app.js — منطق لوحة المشرف
   ============================================================ */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function groupClass(id) {
    return ({ qimma: 'qimma', tumooh: 'tumooh', sumood: 'sumood', ruwwad: 'ruwwad', nogroup: 'nogroup' })[id] || 'nogroup';
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    return (p[0] ? p[0][0] : '؟') + (p[1] ? p[1][0] : '');
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' - ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var toastT;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = 'toast'; }, 2200);
  }

  /* ---------------- التبويبات ---------------- */
  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.tab').forEach(function (t) { t.classList.remove('active'); });
      $$('.view').forEach(function (v) { v.classList.remove('active'); });
      tab.classList.add('active');
      $('#view-' + tab.dataset.view).classList.add('active');
    });
  });

  /* ---------------- المشرف والمصادقة ---------------- */
  function checkAuth() {
    var loggedIn = Store.isLoggedIn();
    var overlay = $('#loginOverlay');
    if (!overlay) return;
    
    var tabs = $('.tabs');
    var container = $('.container');
    var denied = $('#accessDeniedOverlay');
    
    if (!loggedIn) {
      overlay.style.display = 'flex';
      if (tabs) tabs.style.display = 'none';
      if (container) container.style.display = 'none';
      if (denied) denied.style.display = 'none';
      
      var select = $('#loginTeacherSelect');
      if (select && select.children.length === 0) {
        var teachers = Store.getTeachers();
        select.innerHTML = Object.keys(teachers).map(function (t) {
          return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
        }).join('');
      }
      $('#loginPasswordInput').value = '';
      $('#loginErrorMsg').style.display = 'none';
      $('#loginPasswordInput').focus();
    } else {
      overlay.style.display = 'none';
      var activeTeacher = $('#activeTeacherName');
      if (activeTeacher) activeTeacher.textContent = Store.getLoggedInTeacher();
      
      if (!Store.hasPermission('adminPanel')) {
        if (tabs) tabs.style.display = 'none';
        if (container) container.style.display = 'none';
        if (denied) denied.style.display = 'flex';
      } else {
        if (tabs) tabs.style.display = 'flex';
        if (container) container.style.display = 'block';
        if (denied) denied.style.display = 'none';
      }
    }
  }

  $('#btnLoginSubmit').addEventListener('click', function () {
    var teacher = $('#loginTeacherSelect').value;
    var password = $('#loginPasswordInput').value;
    if (Store.login(teacher, password)) {
      toast('مرحباً بك، تم تسجيل الدخول بنجاح! 👋', 'ok');
      checkAuth();
      renderAll();
    } else {
      $('#loginErrorMsg').style.display = 'block';
      $('#loginPasswordInput').focus();
    }
  });

  $('#loginPasswordInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btnLoginSubmit').click();
    }
  });

  $('#btnLogout').addEventListener('click', function () {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
      Store.logout();
      toast('تم تسجيل الخروج بنجاح.', 'ok');
      checkAuth();
    }
  });

  checkAuth();

  /* ====================================================
     قسم إضافة النقاط
     ==================================================== */
  var ppType = 'add';
  $$('#ppType button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#ppType button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      ppType = b.dataset.type;
    });
  });

  function renderPointStudentOptions() {
    var sel = $('#ppStudent');
    var cur = sel.value;
    var q = ($('#ppSearch').value || '').trim().toLowerCase();
    var students = Store.getStudents()
      .filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    sel.innerHTML = '<option value="">— اختر طالبًا —</option>' + students.map(function (s) {
      var g = Store.getGroup(s.groupId);
      return '<option value="' + s.id + '">' + esc(s.name) + ' — ' + esc(g ? g.name : '') + '</option>';
    }).join('');
    if (cur && Store.getStudent(cur)) sel.value = cur;
    updatePreview();
  }
  $('#ppSearch').addEventListener('input', renderPointStudentOptions);

  // اختصارات سريعة لعدد النقاط
  $$('#ppQuick .chip').forEach(function (b) {
    b.addEventListener('click', function () { $('#ppAmount').value = b.dataset.amt; });
  });
  // أسباب جاهزة
  $$('#ppReasons .chip').forEach(function (b) {
    b.addEventListener('click', function () { $('#ppReason').value = b.dataset.reason; });
  });
  // حفظ بمفتاح Enter
  ['ppAmount', 'ppReason'].forEach(function (id) {
    $('#' + id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#ppSave').click(); }
    });
  });

  function updatePreview() {
    var id = $('#ppStudent').value;
    var box = $('#ppPreview');
    var st = id ? Store.getStudent(id) : null;
    if (!st) { box.classList.remove('show'); return; }
    var g = Store.getGroup(st.groupId);
    box.classList.add('show');
    var av = $('#ppAvatar');
    av.textContent = initials(st.name);
    av.className = 'avatar bg-' + groupClass(st.groupId);
    $('#ppName').textContent = st.name;
    $('#ppGroup').textContent = g ? g.name : '';
    $('#ppCurrent').textContent = st.points;
  }
  $('#ppStudent').addEventListener('change', updatePreview);

  $('#ppSave').addEventListener('click', function () {
    var id = $('#ppStudent').value;
    if (!id) { toast('اختر طالبًا أولًا', 'err'); return; }
    var amount = parseInt($('#ppAmount').value, 10);
    if (isNaN(amount) || amount <= 0) { toast('أدخل عددًا صحيحًا أكبر من صفر', 'err'); return; }
    try {
      var res = Store.applyPoints(id, amount, ppType, $('#ppReason').value, Store.getSupervisor());
      var e = res.entry;
      if (ppType === 'subtract' && e.amount < e.requested) {
        toast('تم الخصم حتى الصفر (لا يمكن أن تقل النقاط عن صفر)', 'ok');
      } else {
        toast((ppType === 'add' ? 'تمت إضافة ' : 'تم خصم ') + e.amount + ' نقطة لـ ' + e.studentName, 'ok');
      }
      $('#ppAmount').value = '';
      $('#ppReason').value = '';
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // تراجع عن آخر عملية فعّالة
  $('#ppUndoLast').addEventListener('click', function () {
    var last = Store.getLastActiveEntry();
    if (!last) { toast('لا توجد عملية للتراجع عنها', 'err'); return; }
    var label = (last.type === 'add' ? 'إضافة ' : 'خصم ') + last.amount + ' لـ ' + last.studentName;
    if (confirm('التراجع عن آخر عملية؟\n' + label)) {
      Store.undoEntry(last.id, Store.getSupervisor());
      toast('تم التراجع عن العملية', 'ok');
    }
  });

  function renderLastInfo() {
    var last = Store.getLastActiveEntry();
    var el = $('#ppLastInfo');
    var btn = $('#ppUndoLast');
    if (!last) {
      el.textContent = 'لا توجد عمليات بعد';
      btn.disabled = true; btn.style.opacity = '.5';
    } else {
      el.textContent = 'الأخيرة: ' + (last.type === 'add' ? '+' : '−') + last.amount +
        ' — ' + last.studentName + ' (' + last.groupName + ')';
      btn.disabled = false; btn.style.opacity = '';
    }
  }

  function renderBars(container) {
    var summaries = Store.getGroupSummaries();
    container.innerHTML = summaries.map(function (s) {
      var cls = groupClass(s.id);
      return '<div class="bar-card">' +
        '<div class="bar-head"><span class="name g-' + cls + '">' + esc(s.name) + '</span>' +
        '<span class="nums">' + s.points + ' / ' + s.goal + '</span></div>' +
        '<div class="progress"><span class="bg-' + cls + '" style="width:' + s.percentCapped + '%"></span></div>' +
        '<div class="bar-foot"><span>' + s.percent + '%</span>' +
        (s.percent >= 100 ? '<span class="g-' + cls + '">🎯 تجاوز الهدف!</span>' : '<span></span>') +
        '</div></div>';
    }).join('');
  }

  /* ====================================================
     قسم إدارة الطلاب
     ==================================================== */
  function fillGroupSelect(sel) {
    sel.innerHTML = Store.getGroups().map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.name) + '</option>';
    }).join('');
  }

  function resetStudentForm() {
    $('#stEditId').value = '';
    $('#stName').value = '';
    $('#stGroup').selectedIndex = 0;
    $('#stFormTitle').textContent = 'إضافة طالب جديد';
    $('#stSave').textContent = 'إضافة';
    $('#stCancel').style.display = 'none';
  }

  $('#stSave').addEventListener('click', function () {
    var name = $('#stName').value.trim();
    var gid = $('#stGroup').value;
    if (!name) { toast('أدخل اسم الطالب', 'err'); return; }
    var editId = $('#stEditId').value;
    try {
      if (editId) {
        Store.updateStudent(editId, { name: name, groupId: gid });
        toast('تم تحديث بيانات الطالب', 'ok');
      } else {
        Store.addStudent(name, gid);
        toast('تمت إضافة الطالب', 'ok');
      }
      resetStudentForm();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#stCancel').addEventListener('click', resetStudentForm);
  $('#stSearch').addEventListener('input', renderStudents);

  // إضافة دفعة طلاب
  $('#bulkAdd').addEventListener('click', function () {
    var gid = $('#bulkGroup').value;
    var raw = $('#bulkNames').value || '';
    var names = raw.split(/\r?\n/).map(function (n) { return n.trim(); }).filter(Boolean);
    if (!names.length) { toast('أدخل اسمًا واحدًا على الأقل', 'err'); return; }
    try {
      var n = Store.addStudents(names, gid);
      toast('تمت إضافة ' + n + ' طالبًا', 'ok');
      $('#bulkNames').value = '';
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#bulkNames').addEventListener('input', function () {
    var c = ($('#bulkNames').value || '').split(/\r?\n/).map(function (n) { return n.trim(); }).filter(Boolean).length;
    $('#bulkCount').textContent = c ? (c + ' اسمًا جاهزًا') : '';
  });

  function renderStudents() {
    var q = $('#stSearch').value.trim().toLowerCase();
    var students = Store.getStudents().filter(function (s) {
      if (!s) return false;
      var sName = String(s.name || '').trim().toLowerCase();
      return !q || sName.indexOf(q) !== -1;
    }).sort(function (a, b) { 
      var aName = String(a.name || '');
      var bName = String(b.name || '');
      return aName.localeCompare(bName, 'ar'); 
    });

    $('#stCount').textContent = students.length + ' طالب';
    var body = $('#stBody');
    $('#stEmpty').style.display = students.length ? 'none' : 'block';

    body.innerHTML = students.map(function (s) {
      var g = Store.getGroup(s.groupId);
      var cls = groupClass(s.groupId);
      return '<tr>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td><span class="group-tag g-' + cls + '">' + esc(g ? g.name : '—') + '</span></td>' +
        '<td><span class="points-pill">' + s.points + '</span></td>' +
        '<td class="right"><div class="actions" style="justify-content:flex-start">' +
        '<button class="icon-btn" data-edit="' + s.id + '">✏️ تعديل</button>' +
        '<button class="icon-btn danger" data-del="' + s.id + '">🗑️ حذف</button>' +
        '</div></td></tr>';
    }).join('');

    $$('[data-edit]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var st = Store.getStudent(b.dataset.edit);
        if (!st) return;
        $('#stEditId').value = st.id;
        $('#stName').value = st.name;
        $('#stGroup').value = st.groupId;
        $('#stFormTitle').textContent = 'تعديل: ' + st.name;
        $('#stSave').textContent = 'حفظ التعديل';
        $('#stCancel').style.display = '';
        $('#stName').focus();
      });
    });
    $$('[data-del]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var st = Store.getStudent(b.dataset.del);
        if (st && confirm('حذف الطالب «' + st.name + '»؟\nسيؤثر هذا على مجموع نقاط مجموعته.')) {
          Store.deleteStudent(st.id);
          toast('تم حذف الطالب', 'ok');
        }
      });
    });
  }

  /* ====================================================
     قسم النقاط الفردية
     ==================================================== */
  var indFilter = 'all';
  function renderIndFilters() {
    var groups = Store.getGroups();
    var chips = [{ id: 'all', name: 'جميع المجموعات' }].concat(groups);
    $('#indFilters').innerHTML = chips.map(function (c) {
      var cls = c.id === 'all' ? '' : 'g-' + groupClass(c.id);
      return '<button class="chip ' + (indFilter === c.id ? 'active' : '') + '" data-f="' + c.id + '">' +
        '<span class="' + cls + '">' + esc(c.name) + '</span></button>';
    }).join('');
    $$('#indFilters .chip').forEach(function (b) {
      b.addEventListener('click', function () { indFilter = b.dataset.f; renderIndFilters(); renderIndividual(); });
    });
  }

  $('#indSearch').addEventListener('input', renderIndividual);
  $('#indSort').addEventListener('change', renderIndividual);

  function renderIndividual() {
    var q = $('#indSearch').value.trim().toLowerCase();
    var sort = $('#indSort').value;
    var list = Store.getStudents().filter(function (s) {
      if (indFilter !== 'all' && s.groupId !== indFilter) return false;
      if (q && s.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (sort === 'high') return b.points - a.points || a.name.localeCompare(b.name, 'ar');
      if (sort === 'low') return a.points - b.points || a.name.localeCompare(b.name, 'ar');
      return a.name.localeCompare(b.name, 'ar');
    });

    var body = $('#indBody');
    $('#indEmpty').style.display = list.length ? 'none' : 'block';
    body.innerHTML = list.map(function (s, i) {
      var g = Store.getGroup(s.groupId);
      var cls = groupClass(s.groupId);
      return '<tr><td class="muted">' + (i + 1) + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td><span class="group-tag g-' + cls + '">' + esc(g ? g.name : '—') + '</span></td>' +
        '<td><span class="points-pill">' + s.points + '</span></td></tr>';
    }).join('');
  }

  /* ====================================================
     سجل العمليات
     ==================================================== */
  $('#logSearch').addEventListener('input', renderLog);

  function renderLog() {
    var q = ($('#logSearch').value || '').trim().toLowerCase();
    var all = Store.getLog();
    var log = all.filter(function (e) {
      if (!q) return true;
      return (e.studentName + ' ' + (e.supervisor || '') + ' ' + (e.reason || '')).toLowerCase().indexOf(q) !== -1;
    });
    $('#logCount').textContent = log.length + ' عملية';
    $('#logEmpty').style.display = log.length ? 'none' : 'block';
    var body = $('#logBody');
    body.innerHTML = log.map(function (e) {
      var cls = groupClass(e.groupId);
      var isAdd = e.type === 'add';
      var sign = isAdd ? '+' : '−';
      var color = isAdd ? 'var(--green)' : 'var(--red)';
      var undoCell;
      if (e.undone) {
        var byStr = e.undoneBy ? ' (بواسطة ' + e.undoneBy + ')' : '';
        undoCell = '<span class="badge" style="background:rgba(148,163,184,.18);color:var(--muted)">متراجَع عنها' + esc(byStr) + '</span>';
      } else if (e.kind === 'attendance') {
        undoCell = '<span class="muted" style="font-size:12px">من التحضير</span>';
      } else {
        undoCell = '<button class="icon-btn" data-undo="' + e.id + '">↩️ تراجع</button>';
      }
      return '<tr class="' + (e.undone ? 'undone' : '') + '">' +
        '<td class="nowrap muted">' + fmtDate(e.timestamp) + '</td>' +
        '<td>' + esc(e.studentName) + '</td>' +
        '<td><span class="g-' + cls + '">' + esc(e.groupName) + '</span></td>' +
        '<td><span class="badge" style="background:' + (isAdd ? 'rgba(34,197,94,.18)' : 'rgba(239,68,68,.18)') + ';color:' + color + '">' + (isAdd ? 'إضافة' : 'خصم') + '</span></td>' +
        '<td style="color:' + color + ';font-weight:800">' + sign + e.amount + '</td>' +
        '<td class="muted">' + (esc(e.reason) || '—') + '</td>' +
        '<td class="muted">' + (esc(e.supervisor) || '—') + '</td>' +
        '<td class="right">' + undoCell + '</td>' +
        '</tr>';
    }).join('');

    $$('[data-undo]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        if (Store.undoEntry(b.dataset.undo, Store.getSupervisor())) toast('تم التراجع عن العملية', 'ok');
      });
    });
  }

  $('#logClear').addEventListener('click', function () {
    if (confirm('مسح كامل سجل العمليات؟ لا يمكن التراجع.')) { Store.clearLog(); toast('تم مسح السجل', 'ok'); }
  });
  $('#logExport').addEventListener('click', function () {
    var log = Store.getLog();
    if (!log.length) { toast('السجل فارغ', 'err'); return; }
    var rows = [['التاريخ والوقت', 'الطالب', 'المجموعة', 'النوع', 'النقاط', 'السبب', 'المشرف']];
    log.forEach(function (e) {
      rows.push([fmtDate(e.timestamp), e.studentName, e.groupName, e.type === 'add' ? 'إضافة' : 'خصم', e.amount, e.reason, e.supervisor]);
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    downloadFile(csv, 'سجل-النقاط.csv', 'text/csv;charset=utf-8');
    toast('تم تصدير السجل', 'ok');
  });

  function downloadFile(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ====================================================
     الإعدادات
     ==================================================== */
  function renderSettings() {
    var goals = $('#setGoals');
    goals.innerHTML = Store.getGroups().filter(function (g) { return g.id !== 'nogroup'; }).map(function (g) {
      var cls = groupClass(g.id);
      return '<div class="row" style="margin-bottom:10px;align-items:center">' +
        '<div class="field"><label class="g-' + cls + '" style="font-weight:700;font-size:15px">' + esc(g.name) + '</label></div>' +
        '<div class="field"><label>الهدف النهائي</label>' +
        '<input type="number" min="1" step="1" data-goal="' + g.id + '" value="' + g.goal + '" /></div>' +
        '<div class="field muted" style="flex:0;min-width:130px"><label>&nbsp;</label>النقاط الحالية: <b>' + Store.getGroupPoints(g.id) + '</b></div>' +
        '</div>';
    }).join('');
    $$('[data-goal]', goals).forEach(function (inp) {
      inp.addEventListener('change', function () {
        Store.setGroupGoal(inp.dataset.goal, inp.value);
        toast('تم تحديث الهدف', 'ok');
      });
    });
    renderTeachersPasswords();
  }

  function renderTeachersPasswords() {
    var teachers = Store.getTeachers();
    var tbody = $('#teachersPasswordsTable');
    if (!tbody) return;
    tbody.innerHTML = Object.keys(teachers).map(function (t) {
      var teacherObj = teachers[t];
      var pass = typeof teacherObj === 'string' ? teacherObj : (teacherObj.password || '1234');
      var perms = (teacherObj && teacherObj.permissions) || { adminPanel: t === "أحمد الذبياني", manageStudents: t === "أحمد الذبياني", attendance: true, closeAttendance: t === "أحمد الذبياني" };
      
      var isOwner = t === "أحمد الذبياني";
      var disabledAttr = isOwner ? ' disabled style="opacity:0.6; cursor:not-allowed;" ' : '';
      
      return '<tr style="border-bottom:1px solid #334155;">' +
        '<td style="padding:10px; font-weight:bold; color:#cbd5e1;">👤 ' + esc(t) + (isOwner ? ' <span style="font-size:10px; background:#4f46e5; color:white; padding:2px 6px; border-radius:4px; margin-right:4px;">المالك 👑</span>' : '') + '</td>' +
        '<td style="padding:10px;"><input type="text" data-teacher-name="' + esc(t) + '" value="' + esc(pass) + '" style="padding:6px 10px; background:#0f172a; border:1px solid #475569; border-radius:6px; color:#f1f5f9; font-weight:bold; font-size:12px; width:100%; outline:none;" /></td>' +
        '<td style="padding:10px; font-size:11px; color:#94a3b8; text-align:right; direction:rtl;" class="space-y-1">' +
          '<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">' +
            '<input type="checkbox" id="p-admin-' + esc(t) + '" ' + (perms.adminPanel ? 'checked' : '') + disabledAttr + ' onchange="togglePermission(\'' + esc(t) + '\', \'adminPanel\', this.checked)" style="width:14px; height:14px; cursor:pointer;" />' +
            '<label for="p-admin-' + esc(t) + '" style="cursor:pointer;">لوحة التحكم ⚙️</label>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">' +
            '<input type="checkbox" id="p-students-' + esc(t) + '" ' + (perms.manageStudents ? 'checked' : '') + disabledAttr + ' onchange="togglePermission(\'' + esc(t) + '\', \'manageStudents\', this.checked)" style="width:14px; height:14px; cursor:pointer;" />' +
            '<label for="p-students-' + esc(t) + '" style="cursor:pointer;">إدارة الطلاب 👥</label>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">' +
            '<input type="checkbox" id="p-attendance-' + esc(t) + '" ' + (perms.attendance ? 'checked' : '') + disabledAttr + ' onchange="togglePermission(\'' + esc(t) + '\', \'attendance\', this.checked)" style="width:14px; height:14px; cursor:pointer;" />' +
            '<label for="p-attendance-' + esc(t) + '" style="cursor:pointer;">التحضير والمتابعة ✅</label>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:6px;">' +
            '<input type="checkbox" id="p-close-attendance-' + esc(t) + '" ' + (perms.closeAttendance ? 'checked' : '') + disabledAttr + ' onchange="togglePermission(\'' + esc(t) + '\', \'closeAttendance\', this.checked)" style="width:14px; height:14px; cursor:pointer;" />' +
            '<label for="p-close-attendance-' + esc(t) + '" style="cursor:pointer;">إغلاق واعتماد التحضير 🔒</label>' +
          '</div>' +
        '</td>' +
        '<td style="padding:10px; text-align:center;"><button onclick="saveTeacherPassword(\'' + esc(t) + '\')" class="btn sm" style="background:#4f46e5; border:none; color:white; border-radius:6px; padding:6px 12px; font-weight:bold; font-size:11px; cursor:pointer;">💾 حفظ كلمة المرور</button></td>' +
        '</tr>';
    }).join('');
  }

  window.togglePermission = function (name, permissionKey, checked) {
    try {
      Store.setTeacherPermission(name, permissionKey, checked);
      toast('تم تحديث صلاحية ' + name + ' بنجاح ✅', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.saveTeacherPassword = function (name) {
    var inp = $('input[data-teacher-name="' + name + '"]');
    if (!inp) return;
    try {
      Store.setTeacherPassword(name, inp.value);
      toast('تم تحديث كلمة مرور المعلم: ' + name, 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  // نقاط التحضير
  function renderAttendancePoints() {
    if (document.activeElement && /^ap(Early|Present|Absent)$/.test(document.activeElement.id)) return;
    var ap = Store.getAttendancePoints();
    $('#apEarly').value = ap.early;
    $('#apPresent').value = ap.present;
    $('#apAbsent').value = ap.absent;
  }
  $('#apSave').addEventListener('click', function () {
    Store.setAttendancePoints({
      early: $('#apEarly').value,
      present: $('#apPresent').value,
      absent: $('#apAbsent').value
    });
    toast('تم حفظ نقاط التحضير', 'ok');
  });

  $('#setExport').addEventListener('click', function () {
    downloadFile(Store.exportData(), 'نسخة-النقاط.json', 'application/json');
    toast('تم تصدير النسخة', 'ok');
  });
  $('#setImportBtn').addEventListener('click', function () { $('#setImportFile').click(); });
  $('#setImportFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { Store.importData(reader.result); toast('تم استيراد النسخة', 'ok'); }
      catch (err) { toast('ملف غير صالح', 'err'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  $('#setReset').addEventListener('click', function () {
    if (confirm('حذف جميع الطلاب والنقاط والسجل وإعادة الضبط؟ لا يمكن التراجع.')) {
      Store.resetAll(); toast('تمت إعادة التهيئة', 'ok');
    }
  });
  $('#setAllGoalBtn').addEventListener('click', function () {
    var v = parseInt($('#setAllGoal').value, 10);
    if (isNaN(v) || v < 1) { toast('أدخل هدفًا صحيحًا', 'err'); return; }
    Store.getGroups().forEach(function (g) { Store.setGroupGoal(g.id, v); });
    $('#setAllGoal').value = '';
    toast('تم تطبيق الهدف على جميع المجموعات', 'ok');
  });
  $('#setResetPoints').addEventListener('click', function () {
    if (confirm('تصفير نقاط جميع الطلاب؟ (يبقى الطلاب والسجل)')) {
      Store.resetPoints(false); toast('تم تصفير النقاط', 'ok');
    }
  });
  $('#setResetPointsLog').addEventListener('click', function () {
    if (confirm('تصفير نقاط جميع الطلاب ومسح السجل؟ لا يمكن التراجع.')) {
      Store.resetPoints(true); toast('تم بدء جولة جديدة', 'ok');
    }
  });

  /* ====================================================
     التقارير والإحصائيات
     ==================================================== */
  function renderReports() {
    var students = Store.getStudents();
    var summaries = Store.getGroupSummaries();
    var log = Store.getLog();

    var totalPoints = 0;
    students.forEach(function (s) { totalPoints += (s.points || 0); });
    var activeOps = log.filter(function (e) { return !e.undone; });
    var adds = activeOps.filter(function (e) { return e.type === 'add'; }).length;
    var subs = activeOps.filter(function (e) { return e.type === 'subtract'; }).length;

    // بطاقات ملخّص
    var stats = [
      { l: 'إجمالي الطلاب', v: students.length, c: 'qimma' },
      { l: 'إجمالي النقاط', v: totalPoints, c: 'sumood' },
      { l: 'عمليات الإضافة', v: adds, c: 'tumooh' },
      { l: 'عمليات الخصم', v: subs, c: 'ruwwad' }
    ];
    $('#repStats').innerHTML = stats.map(function (x) {
      return '<div class="stat-card b-' + x.c + '"><div class="sv">' + x.v + '</div><div class="sl">' + x.l + '</div></div>';
    }).join('');

    // مخطط مقارنة المجموعات (نسبة لأعلى نقاط)
    var maxPts = 1;
    summaries.forEach(function (s) { if (s.points > maxPts) maxPts = s.points; });
    var ranked = summaries.slice().sort(function (a, b) { return b.points - a.points; });
    $('#repChart').innerHTML = ranked.map(function (s) {
      var cls = groupClass(s.id);
      var w = Math.round((s.points / maxPts) * 100);
      return '<div class="hbar"><div class="hbar-label g-' + cls + '">' + esc(s.name) + '</div>' +
        '<div class="hbar-track"><span class="bg-' + cls + '" style="width:' + w + '%"></span></div>' +
        '<div class="hbar-val">' + s.points + '</div></div>';
    }).join('');

    // أعلى الطلاب (أفضل 10)
    var top = students.slice().sort(function (a, b) {
      return b.points - a.points || a.name.localeCompare(b.name, 'ar');
    }).slice(0, 10);
    $('#repTopEmpty').style.display = top.length ? 'none' : 'block';
    var medals = ['🥇', '🥈', '🥉'];
    $('#repTop').innerHTML = top.map(function (s, i) {
      var g = Store.getGroup(s.groupId);
      var cls = groupClass(s.groupId);
      return '<tr><td>' + (medals[i] || (i + 1)) + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td><span class="g-' + cls + '">' + esc(g ? g.name : '—') + '</span></td>' +
        '<td><span class="points-pill">' + s.points + '</span></td></tr>';
    }).join('');

    // متصدّر كل مجموعة + المتوسط
    $('#repPerGroup').innerHTML = summaries.map(function (s) {
      var cls = groupClass(s.id);
      var members = students.filter(function (st) { return st.groupId === s.id; });
      var leader = members.slice().sort(function (a, b) { return b.points - a.points; })[0];
      var avg = members.length ? Math.round(s.points / members.length) : 0;
      return '<tr><td><span class="g-' + cls + '">' + esc(s.name) + '</span></td>' +
        '<td>' + (leader ? esc(leader.name) : '—') + '</td>' +
        '<td>' + (leader ? leader.points : 0) + '</td>' +
        '<td>' + members.length + '</td>' +
        '<td>' + avg + '</td></tr>';
    }).join('');
  }

  /* ====================================================
     إعادة الرسم الكامل عند أي تغيير
     ==================================================== */
  function renderAll() {
    renderPointStudentOptions();
    renderBars($('#ppBars'));
    renderLastInfo();
    fillGroupSelect($('#stGroup'));
    fillGroupSelect($('#bulkGroup'));
    renderStudents();
    renderIndFilters();
    renderIndividual();
    renderBars($('#grBars'));
    renderReports();
    renderLog();
    renderSettings();
    renderAttendancePoints();
    checkAuth();
  }

  Store.subscribe(renderAll);
  renderAll();
})();
