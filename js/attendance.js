/* ============================================================
   attendance.js — صفحة التحضير اليومي
   تحديد حالة كل طالب (مبكر/حاضر/غائب) لتاريخ معيّن،
   فتُمنح النقاط تلقائيًا (مع تعديلها دون تكرار) عبر Store.
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
  function todayStr() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var toastT;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = 'toast'; }, 2000);
  }

  var STATUSES = [
    { key: 'early', label: '⏰ مبكر', cls: 'st-early' },
    { key: 'present', label: '✅ حاضر', cls: 'st-present' },
    { key: 'absent', label: '❌ غائب', cls: 'st-absent' }
  ];

  var filterGroup = 'all';

  /* المشرف */
  var supInput = $('#supervisorInput');
  supInput.value = Store.getSupervisor();
  supInput.addEventListener('change', function () { Store.setSupervisor(supInput.value); });

  /* التاريخ */
  var dateInput = $('#attDate');
  dateInput.value = todayStr();
  dateInput.addEventListener('change', render);

  /* المجموعة + البحث */
  $('#attGroup').addEventListener('change', function () { filterGroup = $('#attGroup').value; render(); });
  $('#attSearch').addEventListener('input', render);

  function fillGroups() {
    var sel = $('#attGroup');
    var cur = sel.value || 'all';
    sel.innerHTML = '<option value="all">جميع المجموعات</option>' + Store.getGroups().map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.name) + '</option>';
    }).join('');
    sel.value = cur;
  }

  /* أزرار "الكل" */
  function applyAll(status) {
    var date = dateInput.value;
    if (Store.isAttendanceClosed(date)) {
      toast('التحضير مغلق لهذا اليوم ولا يمكن تعديله', 'err');
      return;
    }
    visibleStudents().forEach(function (s) {
      Store.setAttendance(date, s.id, status, Store.getSupervisor());
    });
    toast('تم تحديث التحضير', 'ok');
  }
  $('#attAllEarly').addEventListener('click', function () { applyAll('early'); });
  $('#attAllPresent').addEventListener('click', function () { applyAll('present'); });
  $('#attAllAbsent').addEventListener('click', function () { applyAll('absent'); });
  $('#attClearDay').addEventListener('click', function () {
    var date = dateInput.value;
    if (Store.isAttendanceClosed(date)) {
      toast('التحضير مغلق لهذا اليوم ولا يمكن تعديله', 'err');
      return;
    }
    if (!confirm('مسح تحضير اليوم للطلاب الظاهرين؟ ستُسحب النقاط الممنوحة لهم اليوم.')) return;
    visibleStudents().forEach(function (s) {
      Store.setAttendance(date, s.id, 'none', Store.getSupervisor());
    });
    toast('تم مسح تحضير اليوم', 'ok');
  });

  function visibleStudents() {
    var q = ($('#attSearch').value || '').trim().toLowerCase();
    return Store.getStudents().filter(function (s) {
      if (filterGroup !== 'all' && s.groupId !== filterGroup) return false;
      if (q && s.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
  }

  function renderLegend() {
    var ap = Store.getAttendancePoints();
    var sum = Store.getAttendanceSummary(dateInput.value);
    $('#attLegend').innerHTML =
      '<span class="att-stat st-early">⏰ مبكر (' + ap.early + ' نقطة): <b>' + sum.early + '</b></span>' +
      '<span class="att-stat st-present">✅ حاضر (' + ap.present + ' نقطة): <b>' + sum.present + '</b></span>' +
      '<span class="att-stat st-absent">❌ غائب (' + ap.absent + ' نقطة): <b>' + sum.absent + '</b></span>' +
      '<span class="att-stat st-none">— لم يُحضَّر: <b>' + sum.unmarked + '</b></span>' +
      '<span class="att-stat st-total">نقاط اليوم: <b>' + sum.points + '</b></span>';
  }

  function render() {
    fillGroups();
    renderLegend();
    var date = dateInput.value;
    var students = visibleStudents();
    $('#attEmpty').style.display = students.length ? 'none' : 'block';

    // إدارة حالة قفل التحضير
    var isClosed = Store.isAttendanceClosed(date);
    var banner = $('#attLockBanner');
    var actionsRow = $('#attActionsRow');
    
    if (isClosed) {
      banner.style.display = 'block';
      banner.style.backgroundColor = '#fef2f2';
      banner.style.color = '#991b1b';
      banner.style.border = '1px solid #fee2e2';
      banner.innerHTML = '🔒 التحضير مغلق وموثق لهذا اليوم ولا يمكن تعديله. ' +
        '<button class="btn sm ghost" id="btnReopen" style="margin-right:10px; color:#ef4444; border-color:#fee2e2; background:white; font-size:12px; padding:3px 8px; border-radius:6px; cursor:pointer;">🔓 إعادة فتح التحضير</button>';
      
      $('#btnReopen').addEventListener('click', function() {
        Store.reopenAttendance(date);
        toast('تم إعادة فتح التحضير', 'ok');
      });
      
      actionsRow.style.display = 'none';
    } else {
      banner.style.display = 'block';
      banner.style.backgroundColor = '#f0fdf4';
      banner.style.color = '#166534';
      banner.style.border = '1px solid #dcfce7';
      banner.innerHTML = '🔓 التحضير مفتوح حالياً لتسجيل حضور الطلاب. ' +
        '<button id="btnCloseDay" style="margin-right:10px; background:#22c55e; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">🔒 إغلاق واعتماد اليوم</button>';
      
      $('#btnCloseDay').addEventListener('click', function() {
        if (confirm('هل أنت متأكد من إغلاق واعتماد تحضير اليوم؟ لن يتمكن المعلمون من تعديل الحضور بعد ذلك.')) {
          Store.closeAttendance(date, Store.getSupervisor());
          toast('تم إغلاق واعتماد التحضير اليومي', 'ok');
        }
      });
      
      actionsRow.style.display = 'flex';
    }

    var list = $('#attList');
    list.innerHTML = students.map(function (s, i) {
      var g = Store.getGroup(s.groupId);
      var cls = groupClass(s.groupId);
      var cur = Store.getStudentAttendance(date, s.id);
      var details = Store.getStudentAttendanceDetails(date, s.id);
      
      // تفاصيل المحضر والوقت إذا وجدت
      var detailTitle = '';
      if (details && details.by) {
        var timeStr = new Date(details.at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        detailTitle = 'بواسطة: ' + details.by + ' في ' + timeStr;
      }
      
      var btns = STATUSES.map(function (st) {
        var active = cur === st.key ? ' active ' + st.cls : '';
        var disabledAttr = isClosed ? ' disabled style="opacity: 0.6; cursor: not-allowed;" ' : '';
        return '<button class="aseg' + active + '"' + disabledAttr + ' data-id="' + s.id + '" data-st="' + st.key + '" title="' + st.label + '">' + st.label + '</button>';
      }).join('');
      
      return '<div class="att-row' + (cur ? ' done' : '') + '" title="' + esc(detailTitle) + '">' +
        '<span class="att-idx">' + (i + 1) + '</span>' +
        '<div class="att-who">' +
          '<span class="att-avatar bg-' + cls + '">' + esc(initials(s.name)) + '</span>' +
          '<span class="att-info"><span class="an">' + esc(s.name) + '</span>' +
          '<span class="ag g-' + cls + '">' + esc(g ? g.name : '') + '</span></span>' +
        '</div>' +
        '<div class="att-seg">' + btns + '</div>' +
        '<span class="att-pts">' + s.points + '</span>' +
      '</div>';
    }).join('');

    $$('.aseg', list).forEach(function (b) {
      b.addEventListener('click', function () {
        if (Store.isAttendanceClosed(date)) return;
        var id = b.dataset.id, st = b.dataset.st;
        // الضغط على نفس الحالة يلغيها
        var cur = Store.getStudentAttendance(date, id);
        try {
          Store.setAttendance(date, id, cur === st ? 'none' : st, Store.getSupervisor());
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    });
  }

  Store.subscribe(render);
  render();
})();
