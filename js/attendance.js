/* ============================================================
   attendance.js — منطق التحضير الميداني المطور (تجنب حلقات التكرار وفقد التركيز)
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
  function groupColorHex(id) {
    return ({ qimma: '#2563eb', tumooh: '#dc2626', sumood: '#16a34a', ruwwad: '#ca8a04', nogroup: '#64748b' })[id] || '#64748b';
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

  // مراجع العناصر الثابتة في الصفحة لمنع التكرار وفقدان الفوكس
  var attDate = $('#attDate');
  var supervisorInput = $('#supervisorInput');
  var attGroup = $('#attGroup');
  var attSearch = $('#attSearch');
  var filtersCard = $('#filters-card');
  var tabContent = $('#tab-content');

  // الحالات الافتراضية
  var currentTab = 'attendance';
  var logsViewMode = 'days'; // 'days' | 'statistics'
  var filterGroup = 'all';
  var selectedDate = todayStr();
  var searchQuery = '';
  var filtersExpanded = false; // كرت الخيارات مطوي افتراضياً لحفظ مساحة الشاشة في الهواتف

  var STATUSES = [
    { key: 'early', label: '⏰ مبكر', cls: 'btn-early-active' },
    { key: 'present', label: '✅ حاضر', cls: 'btn-present-active' },
    { key: 'absent', label: '❌ غائب', cls: 'btn-absent-active' }
  ];

  // إعداد حقول الفلاتر الدائمة لأول مرة
  attDate.value = selectedDate;
  supervisorInput.value = Store.getSupervisor();

  function fillGroupsDropdown(sel) {
    if (!sel) return;
    var cur = sel.value || 'all';
    sel.innerHTML = '<option value="all">جميع المجموعات</option>' + Store.getGroups().map(function (g) {
      return '<option value="' + g.id + '">' + esc(g.name) + '</option>';
    }).join('');
    sel.value = cur;
  }
  fillGroupsDropdown(attGroup);

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

  // الاستماع للأحداث الدائمة مرة واحدة فقط (يمنع حدوث Loops)
  attDate.addEventListener('change', function (e) {
    if (selectedDate !== e.target.value) {
      selectedDate = e.target.value;
      render();
    }
  });
  supervisorInput.addEventListener('input', function (e) {
    Store.setSupervisor(e.target.value);
  });
  attGroup.addEventListener('change', function (e) {
    if (filterGroup !== e.target.value) {
      filterGroup = e.target.value;
      render();
    }
  });
  attSearch.addEventListener('input', function (e) {
    if (searchQuery !== e.target.value) {
      searchQuery = e.target.value;
      render();
    }
  });

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

    // إظهار/إخفاء شريط البحث الفوري فوق بطاقات الطلاب
    var searchContainer = $('#attSearchContainer');
    if (searchContainer) {
      searchContainer.style.display = (tabName === 'attendance' || tabName === 'tracking') ? 'block' : 'none';
    }

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

  /* ====================================================
     رسم واجهة التحضير الرئيسية (Tab: attendance)
     ==================================================== */
  function renderAttendanceHTML() {
    var isClosed = Store.isAttendanceClosed(selectedDate);
    var ap = Store.getAttendancePoints();
    var sum = Store.getAttendanceSummary(selectedDate);
    var students = visibleStudents();

    // بناء اللافتة وهيكل الشبكة
    var html = '<div class="space-y-4">' +
      // لافتة قفل التحضير
      (isClosed ? 
        '<div class="p-3.5 rounded-xl text-center text-sm font-bold shadow-md border bg-red-950/40 text-rose-700 border-red-900/60 flex flex-col gap-2 justify-center items-center"><div>🔒 التحضير مغلق وموثق لهذا اليوم ولا يمكن تعديله.</div>' +
        (Store.hasPermission('closeAttendance') ? '<button onclick="manuallyReopenAttendance()" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 shadow-md">🔓 إعادة فتح التحضير</button>' : '') + '</div>'
        :
        '<div class="p-3.5 rounded-xl text-center text-sm font-bold shadow-md border bg-green-950/40 text-green-300 border-green-900/60 flex flex-col gap-2 justify-center items-center"><div>🔓 التحضير مفتوح حالياً لتسجيل حضور الطلاب.</div>' +
        (Store.hasPermission('closeAttendance') ? '<button onclick="manuallyCloseAttendance()" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 shadow-md">🔒 إغلاق واعتماد اليوم</button>' : '') + '</div>'
      ) +

      // إحصاءات اليوم ونقاطه
      '<div class="grid grid-cols-3 gap-2 text-center text-xs font-bold">' +
        '<div class="bg-blue-900/40 border border-blue-800 p-2 rounded-xl text-blue-300">⏰ مبكر (' + ap.early + 'ن): <b class="block text-base mt-1">' + sum.early + '</b></div>' +
        '<div class="bg-green-900/40 border border-green-800 p-2 rounded-xl text-green-300">✅ حاضر (' + ap.present + 'ن): <b class="block text-base mt-1">' + sum.present + '</b></div>' +
        '<div class="bg-red-900/40 border border-red-800 p-2 rounded-xl text-rose-700">❌ غائب (' + ap.absent + 'ن): <b class="block text-base mt-1">' + sum.absent + '</b></div>' +
      '</div>' +

      // أزرار العمليات الجماعية الثلاثة (تظهر فقط إذا كان التحضير مفتوحاً)
      (!isClosed ? 
      '<div id="attActionsRow" class="flex gap-2 flex-wrap justify-between">' +
        '<button onclick="applyAllStatus(\'early\')" class="flex-1 min-w-[70px] bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-600 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95 shadow-sm">⏰ الكل مبكر</button>' +
        '<button onclick="applyAllStatus(\'present\')" class="flex-1 min-w-[70px] bg-green-50 border border-green-100 hover:bg-green-100 text-green-600 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95 shadow-sm">✅ الكل حاضر</button>' +
        '<button onclick="clearAllAttendance()" class="flex-1 min-w-[70px] bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95 shadow-sm">↩️ تصفير اليوم</button>' +
      '</div>' : '') +

      // قائمة الطلاب للتحضير
      '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-24 md:pb-6">';

    if (students.length === 0) {
      html += '<div class="text-center text-slate-500 p-8 bg-white/50 rounded-2xl border border-white/80 font-bold">لا يوجد طلاب مطابقون</div>';
    } else {
      students.forEach(function (s) {
        var g = Store.getGroup(s.groupId);
        var cls = groupClass(s.groupId);
        var hexColor = groupColorHex(s.groupId);
        var cur = Store.getStudentAttendance(selectedDate, s.id);
        var details = Store.getStudentAttendanceDetails(selectedDate, s.id);
        
        var auditTitle = 'لم يُحضّر بعد';
        if (details && details.by) {
          auditTitle = '👤 ' + details.by + ' · ' + fmtTime(details.at);
        }

        var btns = STATUSES.map(function (st) {
          var activeClass = cur === st.key ? ' ' + st.cls : ' bg-white/50 text-slate-400 border-slate-200/60 hover:bg-white/80';
          var disabledAttr = isClosed ? ' disabled style="opacity: 0.5; cursor: not-allowed;" ' : '';
          return '<button onclick="toggleAttendanceStatus(\'' + s.id + '\', \'' + st.key + '\')" ' + disabledAttr + 
                 ' class="text-[10px] font-black px-2.5 py-1 rounded-md border transition-all active:scale-95' + activeClass + '">' + st.label.split(' ')[1] + '</button>';
        }).join('');

        html += '<div class="bg-white/70 backdrop-blur-md p-3 px-4 rounded-xl shadow-sm flex items-center justify-between gap-3 transition-all hover:shadow-md hover:bg-white" style="border: 1px solid rgba(0,0,0,0.05); border-right: 4px solid ' + hexColor + ';">' +
          '<div class="flex flex-col min-w-0 text-right">' +
            '<h3 class="font-extrabold text-sm sm:text-base text-slate-800 truncate" style="font-family:\'Tajawal\', sans-serif;">' + esc(s.name) + '</h3>' +
            '<span class="text-[9px] font-bold text-slate-400/80 block mt-0.5" style="font-family:\'Tajawal\', sans-serif;">' + auditTitle + '</span>' +
          '</div>' +
          '<div class="flex gap-1 shrink-0">' +
            btns +
          '</div>' +
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
    showConfirm('تصفير تحضير اليوم للطلاب الظاهرين؟ ستُسحب أي نقاط تم منحها لهم في تحضير اليوم.', function (confirmed) {
      if (!confirmed) return;
      visibleStudents().forEach(function (s) {
        Store.setAttendance(selectedDate, s.id, 'none', Store.getSupervisor());
      });
      toast('تم تصفير تحضير اليوم', 'ok');
    });
  };

  window.manuallyCloseAttendance = function () {
    if (!Store.hasPermission('closeAttendance')) {
      toast('عذراً، ليس لديك صلاحية قفل واعتماد التحضير ⚠️', 'err');
      return;
    }
    showConfirm('هل أنت متأكد من قفل واعتماد تحضير اليوم؟ لن يتمكن المعلمون من التعديل.', function (confirmed) {
      if (!confirmed) return;
      Store.closeAttendance(selectedDate, Store.getSupervisor());
      toast('تم قفل واعتماد تحضير اليوم بنجاح 🔒', 'ok');
    });
  };

  window.manuallyReopenAttendance = function () {
    if (!Store.hasPermission('closeAttendance')) {
      toast('عذراً، ليس لديك صلاحية إعادة فتح التحضير ⚠️', 'err');
      return;
    }
    Store.reopenAttendance(selectedDate);
    toast('تم إعادة فتح تحضير اليوم 🔓', 'ok');
  };

  /* ====================================================
     رسم واجهة المتابعة والبحث (Tab: tracking)
     ==================================================== */
  function renderTrackingHTML() {
    var isClosed = Store.isAttendanceClosed(selectedDate);
    var records = Store.getAttendance(selectedDate);
    
    var missing = Store.getStudents().filter(function (s) {
      if (!s) return false;
      var rec = records[s.id];
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      // تطبيق فلاتر المجموعات والبحث في كشف الغياب أيضاً
      var sName = String(s.name || '').trim().toLowerCase();
      var sGroupId = s.groupId || '';
      var q = searchQuery.trim().toLowerCase();
      if (filterGroup !== 'all' && sGroupId !== filterGroup) return false;
      if (q && sName.indexOf(q) === -1) return false;
      return status === 'absent';
    }).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ar');
    });

    var html = '<div class="space-y-4">' +
      '<div class="bg-rose-50/70 backdrop-blur-md border border-rose-100 p-4 rounded-2xl text-center shadow-sm border-r-4 border-r-rose-500 space-y-2">' +
        '<h2 class="text-base font-black text-rose-700">⚠️ كشف الطلاب الغائبين حالياً</h2>' +
        '<p class="text-xs text-rose-600 font-bold mt-1">يوجد (' + missing.length + ') طالب غائب لم يصل بعد.</p>' +
        (missing.length > 0 ? '<button onclick="copyAbsentNames()" class="w-full bg-white hover:bg-slate-50 border border-rose-200/60 text-rose-700 text-xs font-bold py-2 rounded-lg transition-transform active:scale-95 shadow-sm flex justify-center items-center gap-1.5 mt-2">📋 نسخ أسماء الغائبين</button>' : '') +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-24 md:pb-6">';

    if (missing.length === 0) {
      html += '<div class="text-center text-emerald-600 p-12 bg-white/50 border border-white/80 rounded-2xl font-bold text-base">الجميع حاضرون! العدد مكتمل 🎉</div>';
    } else {
      missing.forEach(function (s) {
        var g = Store.getGroup(s.groupId);
        var hexColor = groupColorHex(s.groupId);

        html += '<div class="bg-white/70 backdrop-blur-md p-3.5 rounded-2xl border border-white/80 shadow-sm flex items-center justify-between transition-all hover:shadow-md hover:border-rose-400">' +
          '<div class="flex items-center gap-3">' +
            '<span class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white" style="background-color:' + hexColor + '">' + initials(s.name) + '</span>' +
            '<div>' +
              '<h3 class="font-bold text-sm text-slate-800">' + esc(s.name) + '</h3>' +
              '<span class="text-[10px] font-bold" style="color:' + hexColor + '">' + esc(g ? g.name : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<div>' +
            (isClosed 
              ? '<span class="text-xs font-bold text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg bg-white/40">🔒 مغلق</span>'
              : '<button onclick="markPresentFromTracking(\'' + s.id + '\')" class="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95 shadow-md">✅ حضر الطالب</button>'
            ) +
          '</div>' +
        '</div>';
      });
    }

    html += '</div></div>';
    return html;
  }

  window.markPresentFromTracking = function (studentId) {
    if (Store.isAttendanceClosed(selectedDate)) return;
    try {
      Store.setAttendance(selectedDate, studentId, 'present', Store.getSupervisor());
      toast('تم تسجيل حضور الطالب بنجاح وتعديل نقاطه ✅', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  function fallbackCopyText(text) {
    var textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      toast('تم نسخ الأسماء إلى الحافظة 📋', 'ok');
    } catch (err) {
      toast('تعذر نسخ الأسماء تلقائياً', 'err');
    }
    document.body.removeChild(textArea);
  }

  window.copyAbsentNames = function () {
    var today = selectedDate;
    var records = Store.getAttendance(today);
    var missingNames = Store.getStudents().filter(function (s) {
      if (!s) return false;
      var rec = records[s.id];
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      return status === 'absent';
    }).map(function (s) { return s.name; });

    if (missingNames.length === 0) {
      toast('لا يوجد غائبين لنسخهم', 'err');
      return;
    }

    var textToCopy = missingNames.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(function () {
        toast('تم نسخ ' + missingNames.length + ' اسماً إلى الحافظة 📋', 'ok');
      }).catch(function () {
        fallbackCopyText(textToCopy);
      });
    } else {
      fallbackCopyText(textToCopy);
    }
  };

  /* ====================================================
     رسم واجهة السجل والإحصاءات (Tab: logs)
     ==================================================== */
  function renderLogsHTML() {
    var html = '<div class="space-y-4">' +
      '<div class="flex bg-white/50 p-1 rounded-2xl shadow-sm border border-slate-200/60">' +
        '<button onclick="setLogsViewMode(\'days\')" class="flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ' + 
          (logsViewMode === 'days' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500') + '">📅 سجل الأيام</button>' +
        '<button onclick="setLogsViewMode(\'statistics\')" class="flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ' + 
          (logsViewMode === 'statistics' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500') + '">📊 ملخص الخصومات</button>' +
      '</div>';

    if (logsViewMode === 'statistics') {
      var stats = {};
      var students = Store.getStudents();
      students.forEach(function (s) {
        stats[s.id] = { name: s.name, group: s.groupId, absent: 0 };
      });

      var logs = Store.getLog();
      logs.forEach(function (l) {
        if (l.undone || l.kind !== 'attendance') return;
        var stStat = stats[l.studentId];
        if (stStat) {
          if (l.reason.indexOf('غائب') !== -1) {
            if (l.type === 'add') stStat.absent++;
            else if (l.type === 'subtract') stStat.absent = Math.max(0, stStat.absent - 1);
          }
        }
      });

      var statsArr = Object.keys(stats).map(function (id) {
        var item = stats[id];
        return { id: id, name: item.name, group: item.group, absent: item.absent };
      }).sort(function (a, b) {
        return b.absent - a.absent;
      });

      html += '<div class="bg-white/70 backdrop-blur-md rounded-2xl border border-white/80 shadow-md overflow-hidden pb-12">' +
        '<table class="w-full text-right text-xs">' +
          '<thead class="bg-slate-50/50 text-slate-700 font-bold border-b border-slate-200/60">' +
            '<tr>' +
              '<th class="py-3 px-4">الطالب / المجموعة</th>' +
              '<th class="py-3 px-4 text-center text-rose-600">إجمالي الغياب ❌</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-100">';

      statsArr.forEach(function (stat) {
        var cls = groupClass(stat.group);
        var grp = Store.getGroup(stat.group);
        var isViolator = stat.absent > 0;
        
        html += '<tr class="' + (isViolator ? 'bg-red-50/40' : '') + '">' +
          '<td class="py-3.5 px-4">' +
            '<div class="font-bold text-slate-800">' + esc(stat.name) + '</div>' +
            '<div class="text-[10px] font-bold g-' + cls + '">' + esc(grp ? grp.name : '') + '</div>' +
          '</td>' +
          '<td class="py-3.5 px-4 text-center font-bold text-sm">' + 
            (stat.absent > 0 ? '<span class="bg-red-50 text-red-600 border border-red-100 px-2.5 py-0.5 rounded-full">' + stat.absent + '</span>' : '<span class="text-slate-400">-</span>') + 
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      var stateData = Store.getState();
      var dates = Object.keys(stateData.attendance || {}).sort(function (a, b) {
        return b.localeCompare(a);
      });

      html += '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pb-24 md:pb-6">';

      if (dates.length === 0) {
        html += '<div class="text-center text-slate-500 py-12 bg-white/50 rounded-2xl border border-white/80 font-bold">لا يوجد سجلات تحضير سابقة</div>';
      } else {
        dates.forEach(function (d) {
          var day = stateData.attendance[d];
          var records = day.records || {};
          var isClosed = day.status === 'closed';
          
          var early = 0, present = 0, absent = 0, late = 0;
          Object.keys(records).forEach(function (sid) {
            var rec = records[sid];
            var status = (rec && typeof rec === 'object') ? rec.status : rec;
            if (status === 'early') early++;
            if (status === 'present') present++;
            if (status === 'absent') absent++;
            if (status === 'late') late++;
          });

          html += '<div class="bg-white/70 backdrop-blur-md p-4 rounded-2xl border ' + (isClosed ? 'border-white/80' : 'border-emerald-300') + ' shadow-sm space-y-3 transition-all hover:shadow-md hover:border-indigo-400">' +
            '<div class="flex justify-between items-center">' +
              '<div>' +
                '<h3 class="font-black text-slate-800 text-sm">📅 تحضير يوم: ' + fmtDateAr(d) + '</h3>' +
                '<p class="text-[10px] text-slate-500 font-bold mt-1">' + 
                  (isClosed 
                    ? '🔒 مغلق وموثق بواسطة: ' + (day.closedBy || 'النظام') + ' في ' + fmtTime(day.closedAt)
                    : '🔓 مفتوح حالياً ويستقبل رصد المعلمين'
                  ) +
                '</p>' +
              '</div>' +
              '<div>' +
                '<button onclick="viewDayDetails(\'' + d + '\')" class="bg-white hover:bg-slate-50 border border-slate-200/60 active:scale-95 text-indigo-600 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm">🔍 عرض وتعديل</button>' +
              '</div>' +
            '</div>' +
            '<div class="flex justify-between text-[11px] font-bold text-slate-500 border-t border-slate-700/60 pt-2.5">' +
              '<span>⏰ مبكر: <b class="text-blue-600">' + early + '</b></span>' +
              '<span>✅ حاضر: <b class="text-emerald-600">' + present + '</b></span>' +
              '<span>❌ غائب: <b class="text-rose-600">' + absent + '</b></span>' +
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

    var html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-24 md:pb-6">' +
      '<div class="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-white/80 shadow-md space-y-3">' +
        '<h2 class="text-sm font-black text-slate-800">➕ إضافة دفعة طلاب جديدة</h2>' +
        '<div class="space-y-3 text-right">' +
          '<div>' +
            '<label class="block text-xs font-bold text-slate-500 mb-1.5">اختر المجموعة للدفعة:</label>' +
            '<select id="addStGroup" class="w-full p-3 bg-white/90 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold outline-none focus:border-indigo-500 appearance-none"></select>' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-bold text-slate-500 mb-1.5">الأسماء (اسم بكل سطر أو فاصلة):</label>' +
            '<textarea id="addStNames" rows="3" class="w-full p-3 bg-white/90 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold outline-none focus:border-indigo-500" placeholder="أحمد محمد\nيوسف الحربي\nسلمان..."></textarea>' +
          '</div>' +
          '<button onclick="saveBulkStudents()" class="w-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-transform active:scale-98 text-xs">حفظ وإضافة الأسماء</button>' +
        '</div>' +
      '</div>' +

      '<div class="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-white/80 shadow-md space-y-3">' +
        '<h2 class="text-sm font-black text-slate-800">👥 قائمة الطلاب الحالية (' + students.length + ')</h2>' +
        '<div class="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1" id="studentsListGrid">';

    if (students.length === 0) {
      html += '<p class="text-center text-slate-500 py-6 text-xs font-bold">لا يوجد طلاب مضافين بعد</p>';
    } else {
      students.forEach(function (s) {
        var g = Store.getGroup(s.groupId);
        var hexColor = groupColorHex(s.groupId);
        html += '<div class="py-3 flex justify-between items-center">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white" style="background-color:' + hexColor + '">' + initials(s.name) + '</span>' +
            '<div>' +
              '<div class="font-bold text-xs text-slate-800">' + esc(s.name) + '</div>' +
              '<span class="text-[9px] font-bold" style="color:' + hexColor + '">' + esc(g ? g.name : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<button onclick="confirmDeleteStudent(\'' + s.id + '\', \'' + esc(s.name) + '\')" class="text-rose-600 hover:bg-red-950/40 p-1.5 rounded-lg transition-colors text-xs font-bold">🗑️ حذف</button>' +
        '</div>';
      });
    }

    html += '</div></div></div>';
    return html;
  }

  window.saveBulkStudents = function () {
    var gid = $('#addStGroup').value;
    var raw = $('#addStNames').value || '';
    var names = raw.split(/[\n,痕]+/).map(function (n) { return n.trim(); }).filter(Boolean);
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

  /* ---------------- المشرف والمصادقة ---------------- */
  function checkAuth() {
    var loggedIn = Store.isLoggedIn();
    var overlay = $('#loginOverlay');
    if (!overlay) return;
    
    var tabSt = $('#tab-students');
    var mainContent = $('#main-content');
    var bottomNav = $('nav');
    var denied = $('#accessDeniedOverlay');
    
    if (!loggedIn) {
      overlay.style.display = 'flex';
      if (tabSt) tabSt.style.display = 'none';
      if (mainContent) mainContent.style.display = 'none';
      if (bottomNav) bottomNav.style.display = 'none';
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
      var activeTeacher = $('#supervisorInput');
      if (activeTeacher) activeTeacher.value = Store.getLoggedInTeacher();
      
      var navAdmin = $('#nav-admin-link');
      if (navAdmin) {
        if (Store.hasPermission('adminPanel')) navAdmin.classList.remove('hidden');
        else navAdmin.classList.add('hidden');
      }
      
      if (!Store.hasPermission('attendance')) {
        if (mainContent) mainContent.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (denied) denied.style.display = 'flex';
      } else {
        if (mainContent) mainContent.style.display = 'block';
        if (bottomNav) bottomNav.style.display = 'flex';
        if (denied) denied.style.display = 'none';
        
        if (!Store.hasPermission('manageStudents')) {
          if (tabSt) tabSt.style.display = 'none';
          if (currentTab === 'students') {
            switchTab('attendance');
          }
        } else {
          if (tabSt) tabSt.style.display = 'flex';
        }
      }
    }
  }

  $('#btnLoginSubmit').addEventListener('click', function () {
    var teacher = $('#loginTeacherSelect').value;
    var password = $('#loginPasswordInput').value;
    if (Store.login(teacher, password)) {
      toast('مرحباً بك، تم تسجيل الدخول بنجاح! 👋', 'ok');
      checkAuth();
      render();
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

  /* ====================================================
     الدالة الأساسية لإعادة رسم محتويات التبويبات النشطة
     ==================================================== */
  function render() {
    try {
      checkAuth();
      if (!tabContent) return;

      updateMissingBadge();

      // تحديث قيم الفلاتر الدائمة فقط إذا لم يكن المستخدم يكتب بداخلها (يمنع Loops والـ focus loss)
      if (document.activeElement !== attDate && attDate.value !== selectedDate) {
        attDate.value = selectedDate;
      }
      if (document.activeElement !== supervisorInput) {
        var storeSup = Store.getSupervisor();
        if (supervisorInput.value !== storeSup) supervisorInput.value = storeSup;
      }

      // إظهار وإخفاء شريط الفلاتر الدائم حسب التبويب النشط وحالة التوسيع
      if ((currentTab === 'attendance' || currentTab === 'tracking') && filtersExpanded) {
        filtersCard.classList.remove('hidden');
      } else {
        filtersCard.classList.add('hidden');
      }

      // رسم واجهة التبويب النشط
      if (currentTab === 'attendance') {
        tabContent.innerHTML = renderAttendanceHTML();
      } else if (currentTab === 'tracking') {
        tabContent.innerHTML = renderTrackingHTML();
      } else if (currentTab === 'logs') {
        tabContent.innerHTML = renderLogsHTML();
      } else if (currentTab === 'students') {
        tabContent.innerHTML = renderStudentsHTML();
        fillGroupsDropdownOnly($('#addStGroup'));
      }
    } catch (err) {
      if (window.console) console.error("Render Error: ", err);
      tabContent.innerHTML = '<div class="p-6 bg-red-950/40 border border-red-900/60 text-rose-700 rounded-xl text-center font-bold text-xs space-y-2">' +
        '<div>⚠️ حدث خطأ في معالجة واجهة التحضير:</div>' +
        '<div class="bg-slate-900 p-3 rounded-lg border border-slate-800 text-left font-mono overflow-x-auto text-[11px] text-rose-600">' + esc(err.stack || err.message) + '</div>' +
        '<div class="text-[10px] text-slate-500">يرجى تصوير هذه الشاشة للمطور لحل المشكلة.</div>' +
        '</div>';
    }
  }

  window.toggleFilters = function () {
    filtersExpanded = !filtersExpanded;
    render();
  };

  // الاشتراك في تحديثات المتجر
  Store.subscribe(render);
  
  // التشغيل الأول للواجهة
  render();
})();
