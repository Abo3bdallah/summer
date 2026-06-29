/* ============================================================
   attendance.js — منطق التحضير الميداني المدمج (حاضر المطور)
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
  function groupColorHex(id) {
    return ({ qimma: '#2563eb', tumooh: '#dc2626', sumood: '#16a34a', ruwwad: '#ca8a04' })[id] || '#6366f1';
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
  function fmtTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDateAr(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  var toastT;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl text-center z-50 text-sm font-bold opacity-100 transition-opacity ' + 
                  (kind === 'err' ? 'bg-red-500 text-white' : 'bg-green-600 text-white');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = t.className.replace('opacity-100', 'opacity-0'); }, 2200);
  }

  // الحالات الافتراضية
  var currentTab = 'attendance';
  var logsViewMode = 'days'; // 'days' | 'statistics'
  var filterGroup = 'all';
  var selectedDate = todayStr();
  var searchQuery = '';

  var STATUSES = [
    { key: 'early', label: '⏰ مبكر', cls: 'btn-early-active' },
    { key: 'present', label: '✅ حاضر', cls: 'btn-present-active' },
    { key: 'absent', label: '❌ غائب', cls: 'btn-absent-active' },
    { key: 'late', label: '⚠️ متأخر', cls: 'btn-late-active' }
  ];

  // التبديل بين التبويبات
  window.switchTab = function (tabName) {
    currentTab = tabName;
    $$('nav button').forEach(function (btn) {
      if (btn.id === 'tab-' + tabName) {
        btn.className = 'tab-active flex-1 py-3 flex flex-col items-center transition-all';
      } else {
        btn.className = 'tab-inactive flex-1 py-3 flex flex-col items-center transition-all';
      }
    });
    render();
  };

  // المفقودون (الطلاب الغائبون) لتحديث عداد المتابعة
  function updateMissingBadge() {
    var badge = $('#missing-badge');
    var today = selectedDate;
    var records = Store.getAttendance(today);
    var absentCount = 0;
    Store.getStudents().forEach(function (s) {
      var rec = records[s.id];
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      if (status === 'absent') absentCount++;
    });

    if (absentCount > 0) {
      badge.textContent = absentCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // تصفية الطلاب
  function visibleStudents() {
    var q = searchQuery.trim().toLowerCase();
    return Store.getStudents().filter(function (s) {
      if (!s) return false;
      var sName = String(s.name || '').trim().toLowerCase();
      var sGroupId = s.groupId || '';
      if (filterGroup !== 'all' && sGroupId !== filterGroup) return false;
      if (q && sName.indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) {
      var aName = String(a.name || '');
      var bName = String(b.name || '');
      return aName.localeCompare(bName, 'ar');
    });
  }

  // إعدادات الطلاب والمجموعات
  function fillGroupsDropdown(sel) {
    if (!sel) return;
    var cur = sel.value || 'all';
    sel.innerHTML = '<option value="all">جميع المجموعات</option>' + Store.getGroups().map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.name) + '</option>';
    }).join('');
    sel.value = cur;
  }

  function fillGroupsDropdownOnly(sel) {
    if (!sel) return;
    var cur = sel.value;
    var groups = Store.getGroups();
    sel.innerHTML = groups.map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.name) + '</option>';
    }).join('');
    if (cur && groups.some(function (g) { return g.id === cur; })) {
      sel.value = cur;
    } else if (groups.length) {
      sel.value = groups[0].id;
    }
  }

  /* ====================================================
     رسم واجهة التحضير الرئيسية (Tab: attendance)
     ==================================================== */
  function renderAttendanceHTML() {
    var isClosed = Store.isAttendanceClosed(selectedDate);
    var ap = Store.getAttendancePoints();
    var sum = Store.getAttendanceSummary(selectedDate);
    var students = visibleStudents();

    // 1. بناء شريط الفلاتر والمعلومات
    var html = '<div class="space-y-4">' +
      // كرت المشرف والتاريخ
      '<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md space-y-3">' +
        '<div class="flex gap-3">' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-bold text-slate-400 mb-1">📅 تاريخ التحضير:</label>' +
            '<input type="date" id="attDate" class="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-bold outline-none focus:border-indigo-500" value="' + selectedDate + '" />' +
          '</div>' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-bold text-slate-400 mb-1">👤 المشرف (المحضر):</label>' +
            '<input type="text" id="supervisorInput" class="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-bold outline-none focus:border-indigo-500" placeholder="اسم المشرف..." value="' + esc(Store.getSupervisor()) + '" />' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-3">' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-bold text-slate-400 mb-1">🏆 تصفية المجموعات:</label>' +
            '<select id="attGroup" class="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-bold outline-none focus:border-indigo-500 appearance-none"></select>' +
          '</div>' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-bold text-slate-400 mb-1">🔎 بحث سريع:</label>' +
            '<input type="text" id="attSearch" class="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-bold outline-none focus:border-indigo-500" placeholder="ابحث باسم الطالب..." value="' + esc(searchQuery) + '" />' +
          '</div>' +
        '</div>' +
      '</div>' +

      // لافتة قفل التحضير
      (isClosed ? 
        '<div class="p-3.5 rounded-xl text-center text-sm font-bold shadow-md border bg-red-950/40 text-red-300 border-red-900/60 flex flex-col gap-2 justify-center items-center"><div>🔒 التحضير مغلق وموثق لهذا اليوم ولا يمكن تعديله.</div>' +
        '<button onclick="manuallyReopenAttendance()" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 shadow-md">🔓 إعادة فتح التحضير</button></div>'
        :
        '<div class="p-3.5 rounded-xl text-center text-sm font-bold shadow-md border bg-green-950/40 text-green-300 border-green-900/60 flex flex-col gap-2 justify-center items-center"><div>🔓 التحضير مفتوح حالياً لتسجيل حضور الطلاب.</div>' +
        '<button onclick="manuallyCloseAttendance()" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 shadow-md">🔒 إغلاق واعتماد اليوم</button></div>'
      ) +

      // إحصاءات اليوم ونقاطه
      '<div class="grid grid-cols-3 gap-2 text-center text-xs font-bold">' +
        '<div class="bg-blue-900/40 border border-blue-800 p-2 rounded-xl text-blue-300">⏰ مبكر (' + ap.early + 'ن): <b class="block text-base mt-1">' + sum.early + '</b></div>' +
        '<div class="bg-green-900/40 border border-green-800 p-2 rounded-xl text-green-300">✅ حاضر (' + ap.present + 'ن): <b class="block text-base mt-1">' + sum.present + '</b></div>' +
        '<div class="bg-red-900/40 border border-red-800 p-2 rounded-xl text-red-300">❌ غائب (' + ap.absent + 'ن): <b class="block text-base mt-1">' + sum.absent + '</b></div>' +
      '</div>' +

      // أزرار العمليات الجماعية (تظهر فقط إذا كان التحضير مفتوحاً)
      (!isClosed ? 
      '<div id="attActionsRow" class="flex gap-2 flex-wrap justify-between">' +
        '<button onclick="applyAllStatus(\'early\')" class="flex-1 min-w-[70px] bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95">⏰ الكل مبكر</button>' +
        '<button onclick="applyAllStatus(\'present\')" class="flex-1 min-w-[70px] bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95">✅ الكل حاضر</button>' +
        '<button onclick="applyAllStatus(\'absent\')" class="flex-1 min-w-[70px] bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95">❌ الكل غائب</button>' +
        '<button onclick="clearAllAttendance()" class="flex-1 min-w-[70px] bg-slate-800/60 border border-slate-800 hover:bg-slate-800 text-red-400 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95">↩️ تصفير اليوم</button>' +
      '</div>' : '') +

      // قائمة الطلاب للتحضير
      '<div class="space-y-3 pb-24">';

    if (students.length === 0) {
      html += '<div class="text-center text-slate-400 p-8 bg-slate-900/50 rounded-xl border border-slate-800 font-bold">لا يوجد طلاب مطابقون</div>';
    } else {
      students.forEach(function (s) {
        var g = Store.getGroup(s.groupId);
        var cls = groupClass(s.groupId);
        var hexColor = groupColorHex(s.groupId);
        var cur = Store.getStudentAttendance(selectedDate, s.id);
        var details = Store.getStudentAttendanceDetails(selectedDate, s.id);
        
        // معلومات من حضّر ومتى
        var auditTitle = 'لم يُحضّر بعد';
        if (details && details.by) {
          auditTitle = 'حضّره المعلم: ' + details.by + ' في ' + fmtTime(details.at);
        }

        // بناء أزرار التحضير الأربعة
        var btns = STATUSES.map(function (st) {
          var activeClass = cur === st.key ? ' ' + st.cls : ' bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800';
          var disabledAttr = isClosed ? ' disabled style="opacity: 0.5; cursor: not-allowed;" ' : '';
          return '<button onclick="toggleAttendanceStatus(\'' + s.id + '\', \'' + st.key + '\')" ' + disabledAttr + 
                 ' class="flex-1 text-xs font-black py-2 rounded-lg border transition-all active:scale-95' + activeClass + '">' + st.label.split(' ')[1] + '</button>';
        }).join('');

        html += '<div class="bg-slate-800 p-3.5 rounded-xl border border-slate-700 shadow-sm flex flex-col gap-3 transition-all hover:border-slate-600" title="' + esc(auditTitle) + '">' +
          '<div class="flex justify-between items-center">' +
            '<div class="flex items-center gap-2.5">' +
              '<span class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white" style="background-color:' + hexColor + '">' + initials(s.name) + '</span>' +
              '<div>' +
                '<h3 class="font-bold text-sm text-slate-200">' + esc(s.name) + '</h3>' +
                '<span class="text-[10px] font-bold" style="color:' + hexColor + '">' + esc(g ? g.name : '') + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="text-left">' +
              '<span class="text-[10px] font-bold text-slate-400 block">' + auditTitle + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="flex gap-1.5 w-full">' + btns + '</div>' +
        '</div>';
      });
    }

    html += '</div></div>';
    return html;
  }

  // دوال الربط مع الأحداث لصفحة التحضير
  window.toggleAttendanceStatus = function (studentId, statusKey) {
    if (Store.isAttendanceClosed(selectedDate)) return;
    var cur = Store.getStudentAttendance(selectedDate, studentId);
    try {
      Store.setAttendance(selectedDate, studentId, cur === statusKey ? 'none' : statusKey, Store.getSupervisor());
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.applyAllStatus = function (statusKey) {
    if (Store.isAttendanceClosed(selectedDate)) return;
    visibleStudents().forEach(function (s) {
      Store.setAttendance(selectedDate, s.id, statusKey, Store.getSupervisor());
    });
    toast('تم تحضير الطلاب الظاهرين كـ ' + (statusKey === 'early' ? 'مبكر' : statusKey === 'present' ? 'حاضر' : 'غائب'), 'ok');
  };

  window.clearAllAttendance = function () {
    if (Store.isAttendanceClosed(selectedDate)) return;
    if (!confirm('تصفير تحضير اليوم للطلاب الظاهرين؟ ستُسحب أي نقاط تم منحها لهم في تحضير اليوم.')) return;
    visibleStudents().forEach(function (s) {
      Store.setAttendance(selectedDate, s.id, 'none', Store.getSupervisor());
    });
    toast('تم تصفير تحضير اليوم', 'ok');
  };

  window.manuallyCloseAttendance = function () {
    if (confirm('هل أنت متأكد من قفل واعتماد تحضير اليوم؟ لن يتمكن المعلمون من التعديل.')) {
      Store.closeAttendance(selectedDate, Store.getSupervisor());
      toast('تم قفل واعتماد تحضير اليوم بنجاح 🔒', 'ok');
    }
  };

  window.manuallyReopenAttendance = function () {
    Store.reopenAttendance(selectedDate);
    toast('تم إعادة فتح تحضير اليوم 🔓', 'ok');
  };

  /* ====================================================
     رسم واجهة المتابعة والبحث (Tab: tracking)
     ==================================================== */
  function renderTrackingHTML() {
    var isClosed = Store.isAttendanceClosed(selectedDate);
    var records = Store.getAttendance(selectedDate);
    
    // فلترة الغائبين فقط
    var missing = Store.getStudents().filter(function (s) {
      var rec = records[s.id];
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      return status === 'absent';
    }).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ar');
    });

    var html = '<div class="space-y-4">' +
      '<div class="bg-red-950/40 border border-red-900/60 p-4 rounded-xl text-center shadow-md border-r-4 border-r-red-500">' +
        '<h2 class="text-base font-black text-red-300">⚠️ كشف الطلاب الغائبين حالياً</h2>' +
        '<p class="text-xs text-red-400 font-bold mt-1">يوجد (' + missing.length + ') طالب غائب لم يصل بعد. ابحث عنهم وحدث حالتهم فور وصولهم.</p>' +
      '</div>' +
      '<div class="space-y-3 pb-24">';

    if (missing.length === 0) {
      html += '<div class="text-center text-green-400 p-12 bg-green-950/20 border border-green-900/40 rounded-xl font-bold text-base">الجميع حاضرون! العدد مكتمل 🎉</div>';
    } else {
      missing.forEach(function (s) {
        var g = Store.getGroup(s.groupId);
        var cls = groupClass(s.groupId);
        var hexColor = groupColorHex(s.groupId);

        html += '<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm flex items-center justify-between transition-all hover:border-red-900">' +
          '<div class="flex items-center gap-3">' +
            '<span class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white" style="background-color:' + hexColor + '">' + initials(s.name) + '</span>' +
            '<div>' +
              '<h3 class="font-bold text-sm text-slate-200">' + esc(s.name) + '</h3>' +
              '<span class="text-[10px] font-bold" style="color:' + hexColor + '">' + esc(g ? g.name : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<div>' +
            (isClosed 
              ? '<span class="text-xs font-bold text-slate-500 border border-slate-700 px-3 py-1.5 rounded-lg bg-slate-900/50">🔒 مغلق</span>'
              : '<button onclick="markLateFromTracking(\'' + s.id + '\')" class="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all shadow-md">⚠️ حضر متأخراً</button>'
            ) +
          '</div>' +
        '</div>';
      });
    }

    html += '</div></div>';
    return html;
  }

  window.markLateFromTracking = function (studentId) {
    if (Store.isAttendanceClosed(selectedDate)) return;
    try {
      Store.setAttendance(selectedDate, studentId, 'late', Store.getSupervisor());
      toast('تم رصد حضور الطالب كمتأخر وتعديل نقاطه ⚠️', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  /* ====================================================
     رسم واجهة السجل والإحصاءات (Tab: logs)
     ==================================================== */
  function renderLogsHTML() {
    var html = '<div class="space-y-4">' +
      // شريط الاختيار الفرعي
      '<div class="flex bg-slate-800 p-1 rounded-xl shadow-md border border-slate-700">' +
        '<button onclick="setLogsViewMode(\'days\')" class="flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ' + 
          (logsViewMode === 'days' ? 'bg-slate-900 text-indigo-400 shadow-sm border border-slate-700' : 'text-slate-400') + '">📅 سجل الأيام</button>' +
        '<button onclick="setLogsViewMode(\'statistics\')" class="flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ' + 
          (logsViewMode === 'statistics' ? 'bg-slate-900 text-indigo-400 shadow-sm border border-slate-700' : 'text-slate-400') + '">📊 ملخص الخصومات</button>' +
      '</div>';

    if (logsViewMode === 'statistics') {
      // 1. حساب ملخص الخصومات التراكمية
      var stats = {};
      var students = Store.getStudents();
      students.forEach(function (s) {
        stats[s.id] = { name: s.name, group: s.groupId, absent: 0, late: 0 };
      });

      var logs = Store.getLog();
      logs.forEach(function (l) {
        if (l.undone || l.kind !== 'attendance') return; // تجاهل التراجع والعمليات العادية
        var stStat = stats[l.studentId];
        if (stStat) {
          if (l.reason.indexOf('غائب') !== -1) {
            if (l.type === 'add') stStat.absent++;
            else if (l.type === 'subtract') stStat.absent = Math.max(0, stStat.absent - 1);
          }
          if (l.reason.indexOf('متأخر') !== -1) {
            if (l.type === 'add') stStat.late++;
            else if (l.type === 'subtract') stStat.late = Math.max(0, stStat.late - 1);
          }
        }
      });

      // ترتيب الطلاب تنازلياً حسب إجمالي المخالفات (الغياب بوزن 2، والتأخر بوزن 1)
      var statsArr = Object.keys(stats).map(function (id) {
        return { id: id, ...stats[id] };
      }).sort(function (a, b) {
        return (b.absent * 2 + b.late) - (a.absent * 2 + a.late);
      });

      html += '<div class="bg-slate-800 rounded-xl border border-slate-700 shadow-md overflow-hidden pb-12">' +
        '<table class="w-full text-right text-xs">' +
          '<thead class="bg-slate-900 text-slate-300 font-bold border-b border-slate-700">' +
            '<tr>' +
              '<th class="py-3 px-4">الطالب / المجموعة</th>' +
              '<th class="py-3 px-4 text-center text-red-400">الغياب ❌</th>' +
              '<th class="py-3 px-4 text-center text-amber-400">التأخير ⚠️</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-800">';

      statsArr.forEach(function (stat) {
        var cls = groupClass(stat.group);
        var grp = Store.getGroup(stat.group);
        var isViolator = stat.absent > 0 || stat.late > 0;
        
        html += '<tr class="' + (isViolator ? 'bg-red-950/10' : '') + '">' +
          '<td class="py-3.5 px-4">' +
            '<div class="font-bold text-slate-200">' + esc(stat.name) + '</div>' +
            '<div class="text-[10px] font-bold g-' + cls + '">' + esc(grp ? grp.name : '') + '</div>' +
          '</td>' +
          '<td class="py-3.5 px-4 text-center font-bold text-sm">' + 
            (stat.absent > 0 ? '<span class="bg-red-950 text-red-400 border border-red-900 px-2 py-0.5 rounded-full">' + stat.absent + '</span>' : '<span class="text-slate-600">-</span>') + 
          '</td>' +
          '<td class="py-3.5 px-4 text-center font-bold text-sm">' + 
            (stat.late > 0 ? '<span class="bg-amber-950 text-amber-400 border border-amber-900 px-2 py-0.5 rounded-full">' + stat.late + '</span>' : '<span class="text-slate-600">-</span>') + 
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      // 2. كشف الأيام والتوثيق
      var stateData = Store.getState();
      var dates = Object.keys(stateData.attendance || {}).sort(function (a, b) {
        return b.localeCompare(a); // الأحدث أولاً
      });

      html += '<div class="space-y-3 pb-24">';

      if (dates.length === 0) {
        html += '<div class="text-center text-slate-500 py-12 bg-slate-900/50 rounded-xl border border-slate-800 font-bold">لا يوجد سجلات تحضير سابقة</div>';
      } else {
        dates.forEach(function (d) {
          var day = stateData.attendance[d];
          var records = day.records || {};
          var isClosed = day.status === 'closed';
          
          // إحصاء الحالات
          var early = 0, present = 0, absent = 0, late = 0;
          Object.keys(records).forEach(function (sid) {
            var rec = records[sid];
            var status = (rec && typeof rec === 'object') ? rec.status : rec;
            if (status === 'early') early++;
            if (status === 'present') present++;
            if (status === 'absent') absent++;
            if (status === 'late') late++;
          });

          html += '<div class="bg-slate-800 p-4 rounded-xl border ' + (isClosed ? 'border-slate-700' : 'border-green-800/80') + ' shadow-sm space-y-3 transition-all hover:border-slate-600">' +
            '<div class="flex justify-between items-center">' +
              '<div>' +
                '<h3 class="font-black text-slate-100 text-sm">📅 تحضير يوم: ' + fmtDateAr(d) + '</h3>' +
                '<p class="text-[10px] text-slate-400 font-bold mt-1">' + 
                  (isClosed 
                    ? '🔒 مغلق وموثق بواسطة: ' + (day.closedBy || 'النظام') + ' في ' + fmtTime(day.closedAt)
                    : '🔓 مفتوح حالياً ويستقبل رصد المعلمين'
                  ) +
                '</p>' +
              '</div>' +
              '<div>' +
                '<button onclick="viewDayDetails(\'' + d + '\')" class="bg-slate-900 hover:bg-slate-950 border border-slate-700 active:scale-95 text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm">🔍 عرض وتعديل</button>' +
              '</div>' +
            '</div>' +
            '<div class="flex justify-between text-[11px] font-bold text-slate-400 border-t border-slate-700/60 pt-2.5">' +
              '<span>⏰ مبكر: <b class="text-blue-400">' + early + '</b></span>' +
              '<span>✅ حاضر: <b class="text-green-400">' + present + '</b></span>' +
              '<span>❌ غائب: <b class="text-red-400">' + absent + '</b></span>' +
              '<span>⚠️ متأخر: <b class="text-amber-400">' + late + '</b></span>' +
            '</div>' +
          '</div>';
        });
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  window.setLogsViewMode = function (mode) {
    logsViewMode = mode;
    render();
  };

  window.viewDayDetails = function (dateStr) {
    selectedDate = dateStr;
    switchTab('attendance');
  };

  /* ====================================================
     رسم واجهة إدارة الطلاب (Tab: students)
     ==================================================== */
  function renderStudentsHTML() {
    var students = Store.getStudents().sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ar');
    });

    var html = '<div class="space-y-4">' +
      // إضافة طلاب دفعة واحدة
      '<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md space-y-3">' +
        '<h2 class="text-sm font-black text-slate-200">➕ إضافة دفعة طلاب جديدة</h2>' +
        '<div class="space-y-3 text-right">' +
          '<div>' +
            '<label class="block text-xs font-bold text-slate-400 mb-1.5">اختر المجموعة للدفعة:</label>' +
            '<select id="addStGroup" class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 font-bold outline-none focus:border-indigo-500 appearance-none"></select>' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-bold text-slate-400 mb-1.5">الأسماء (اسم بكل سطر أو فاصلة):</label>' +
            '<textarea id="addStNames" rows="3" class="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 font-bold outline-none focus:border-indigo-500" placeholder="أحمد محمد\nيوسف الحربي\nسلمان..."></textarea>' +
          '</div>' +
          '<button onclick="saveBulkStudents()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-98 text-xs">حفظ وإضافة الأسماء</button>' +
        '</div>' +
      '</div>' +

      // كشف أسماء الطلاب
      '<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md space-y-3">' +
        '<h2 class="text-sm font-black text-slate-200">👥 قائمة الطلاب الحالية (' + students.length + ')</h2>' +
        '<div class="divide-y divide-slate-700 max-h-[300px] overflow-y-auto pr-1" id="studentsListGrid">';

    if (students.length === 0) {
      html += '<p class="text-center text-slate-500 py-6 text-xs font-bold">لا يوجد طلاب مضافين بعد</p>';
    } else {
      students.forEach(function (s) {
        var g = Store.getGroup(s.groupId);
        var cls = groupClass(s.groupId);
        var hexColor = groupColorHex(s.groupId);
        html += '<div class="py-3 flex justify-between items-center">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white" style="background-color:' + hexColor + '">' + initials(s.name) + '</span>' +
            '<div>' +
              '<div class="font-bold text-xs text-slate-200">' + esc(s.name) + '</div>' +
              '<span class="text-[9px] font-bold" style="color:' + hexColor + '">' + esc(g ? g.name : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<button onclick="confirmDeleteStudent(\'' + s.id + '\', \'' + esc(s.name) + '\')" class="text-red-400 hover:bg-red-950/40 p-1.5 rounded-lg transition-colors text-xs font-bold">🗑️ حذف</button>' +
        '</div>';
      });
    }

    html += '</div></div></div>';
    return html;
  }

  window.saveBulkStudents = function () {
    var gid = $('#addStGroup').value;
    var raw = $('#addStNames').value || '';
    var names = raw.split(/[\n,，]+/).map(function (n) { return n.trim(); }).filter(Boolean);
    if (!names.length) { toast('أدخل اسماً واحداً على الأقل', 'err'); return; }
    try {
      var n = Store.addStudents(names, gid);
      toast('تمت إضافة ' + n + ' طالباً لمجموعتهم بنجاح 🎉', 'ok');
      $('#addStNames').value = '';
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  window.confirmDeleteStudent = function (studentId, studentName) {
    if (confirm('هل أنت متأكد من حذف الطالب "' + studentName + '"؟ سيتم مسح كامل بياناته ونقاطه وسجله.')) {
      Store.deleteStudent(studentId);
      toast('تم حذف الطالب بنجاح', 'ok');
      render();
    }
  };

  /* ====================================================
     الدالة الأساسية لإعادة رسم محتويات التبويبات النشطة
     ==================================================== */
  function render() {
    var container = $('#main-content');
    if (!container) return;

    updateMissingBadge();

    // 1. تحديد أي واجهة يتم رسمها في التبويب النشط
    if (currentTab === 'attendance') {
      container.innerHTML = renderAttendanceHTML();
      // ملء الفلاتر والارتباط بالأحداث التفاعلية
      fillGroupsDropdown($('#attGroup'));
      
      // ربط حقول التاريخ والمشرف والبحث
      $('#attDate').addEventListener('change', function (e) {
        selectedDate = e.target.value;
        render();
      });
      $('#supervisorInput').addEventListener('input', function (e) {
        Store.setSupervisor(e.target.value);
      });
      $('#attGroup').addEventListener('change', function (e) {
        filterGroup = e.target.value;
        render();
      });
      $('#attSearch').addEventListener('input', function (e) {
        searchQuery = e.target.value;
        render();
      });
    } else if (currentTab === 'tracking') {
      container.innerHTML = renderTrackingHTML();
    } else if (currentTab === 'logs') {
      container.innerHTML = renderLogsHTML();
    } else if (currentTab === 'students') {
      container.innerHTML = renderStudentsHTML();
      fillGroupsDropdownOnly($('#addStGroup'));
    }
  }

  // الاشتراك في تحديثات المتجر
  Store.subscribe(render);
  
  // التشغيل الأول للواجهة
  render();
})();
