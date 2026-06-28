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
    return ({ qimma: 'qimma', tumooh: 'tumooh', sumood: 'sumood', ruwwad: 'ruwwad' })[id] || 'qimma';
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

  /* ---------------- المشرف ---------------- */
  var supInput = $('#supervisorInput');
  supInput.value = Store.getSupervisor();
  supInput.addEventListener('change', function () { Store.setSupervisor(supInput.value); });

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
    var students = Store.getStudents().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    sel.innerHTML = '<option value="">— اختر طالبًا —</option>' + students.map(function (s) {
      var g = Store.getGroup(s.groupId);
      return '<option value="' + s.id + '">' + esc(s.name) + ' — ' + esc(g ? g.name : '') + '</option>';
    }).join('');
    if (cur && Store.getStudent(cur)) sel.value = cur;
    updatePreview();
  }

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

  function renderStudents() {
    var q = $('#stSearch').value.trim().toLowerCase();
    var students = Store.getStudents().filter(function (s) {
      return !q || s.name.toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });

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
  function renderLog() {
    var log = Store.getLog();
    $('#logCount').textContent = log.length + ' عملية';
    $('#logEmpty').style.display = log.length ? 'none' : 'block';
    var body = $('#logBody');
    body.innerHTML = log.map(function (e) {
      var cls = groupClass(e.groupId);
      var isAdd = e.type === 'add';
      var sign = isAdd ? '+' : '−';
      var color = isAdd ? 'var(--green)' : 'var(--red)';
      return '<tr>' +
        '<td class="nowrap muted">' + fmtDate(e.timestamp) + '</td>' +
        '<td>' + esc(e.studentName) + '</td>' +
        '<td><span class="g-' + cls + '">' + esc(e.groupName) + '</span></td>' +
        '<td><span class="badge" style="background:' + (isAdd ? 'rgba(34,197,94,.18)' : 'rgba(239,68,68,.18)') + ';color:' + color + '">' + (isAdd ? 'إضافة' : 'خصم') + '</span></td>' +
        '<td style="color:' + color + ';font-weight:800">' + sign + e.amount + '</td>' +
        '<td class="muted">' + (esc(e.reason) || '—') + '</td>' +
        '<td class="muted">' + (esc(e.supervisor) || '—') + '</td>' +
        '</tr>';
    }).join('');
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
    goals.innerHTML = Store.getGroups().map(function (g) {
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
  }

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

  /* ====================================================
     إعادة الرسم الكامل عند أي تغيير
     ==================================================== */
  function renderAll() {
    renderPointStudentOptions();
    renderBars($('#ppBars'));
    fillGroupSelect($('#stGroup'));
    renderStudents();
    renderIndFilters();
    renderIndividual();
    renderBars($('#grBars'));
    renderLog();
    renderSettings();
    if (document.activeElement !== supInput) supInput.value = Store.getSupervisor();
  }

  Store.subscribe(renderAll);
  renderAll();
})();
