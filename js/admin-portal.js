/* ============================================================
   admin-portal.js — المتابعة والتقارير والتوجيهات للمرحلتين
   ============================================================ */
(function () {
  'use strict';
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var currentRows = [];
  var currentUser = null;

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
      window.location.replace('index.html?next=admin-portal.html');
      return false;
    }
    var user = Store.getCurrentUser();
    if (!user || (user.role !== 'owner' && user.role !== 'admin' && !Store.hasPermission('viewReports'))) {
      window.location.replace('dashboard.html');
      return false;
    }
    $('#portalCurrentUser').textContent = user.name;
    $('#portalCurrentRole').textContent = user.role === 'owner' ? 'مالك المنصة' : 'الإدارة العامة';
    currentUser = user;
    var memoTab = $('[data-portal-tab="memos"]');
    if (memoTab) memoTab.hidden = user.role !== 'owner';

    $$('.monitor-attendance-link').forEach(function (link) {
      link.hidden = user.role !== 'owner';
    });
    return true;
  }

  function dateValue() { return $('#portalDate').value || today(); }

  function renderStage(prefix, summary, total, closed) {
    var marked = Math.max(0, total - summary.unmarked);
    var percent = total ? Math.round((marked / total) * 100) : 0;
    $('#' + prefix + 'Marked').textContent = marked;
    $('#' + prefix + 'Total').textContent = total;
    $('#' + prefix + 'Early').textContent = summary.early;
    $('#' + prefix + 'Present').textContent = summary.present;
    $('#' + prefix + 'Absent').textContent = summary.absent;
    $('#' + prefix + 'Unmarked').textContent = summary.unmarked;
    $('#' + prefix + 'Progress').style.width = percent + '%';
    $('#' + prefix + 'DayState').textContent = closed ? 'مغلق' : 'مفتوح';
    $('#' + prefix + 'DayState').className = closed ? 'closed' : 'open';
  }

  function renderAbsenceWarnings() {
    var stateData = Store.getState();
    var panel = $('#absenceWarningPanel');
    var list = $('#absenceWarningList');
    if (!panel || !list) return;

    var warnings = [];
    var dates = getUniqueDates();

    var evaluateStudent = function (student, stage) {
      var totalDays = 0;
      var attended = 0;
      var consecutiveAbsences = 0;
      var countingConsecutive = true;

      dates.forEach(function (d) {
        var day = (stage === 'middle' ? stateData.attendance[d] : stateData.highAttendance[d]) || {};
        var records = day.records || {};
        var rec = records[student.id];

        if (rec != null) {
          var status = (rec && typeof rec === 'object') ? rec.status : rec;
          if (status === 'early' || status === 'present' || status === 'absent') {
            totalDays++;
            if (status === 'early' || status === 'present') {
              attended++;
              if (countingConsecutive) {
                countingConsecutive = false;
              }
            } else if (status === 'absent') {
              if (countingConsecutive) {
                consecutiveAbsences++;
              }
            }
          }
        }
      });

      var attendanceRate = totalDays ? (attended / totalDays) : 1;

      if (consecutiveAbsences >= 3) {
        warnings.push({
          student: student,
          stage: stage,
          type: 'consecutive',
          value: consecutiveAbsences,
          text: 'غائب منذ ' + consecutiveAbsences + ' أيام متتالية ❌'
        });
      } else if (totalDays >= 3 && attendanceRate < 0.75) {
        warnings.push({
          student: student,
          stage: stage,
          type: 'low_rate',
          value: Math.round(attendanceRate * 100),
          text: 'انضباط متدنٍ: ' + Math.round(attendanceRate * 100) + '% (حضور ' + attended + ' من أصل ' + totalDays + ' أيام) ⚠️'
        });
      }
    };

    Store.getStudents().forEach(function (s) {
      evaluateStudent(s, 'middle');
    });

    Store.getHighStudents().filter(function (s) { return s.active !== false; }).forEach(function (s) {
      evaluateStudent(s, 'high');
    });

    if (!warnings.length) {
      panel.style.display = 'none';
      return;
    }

    list.innerHTML = warnings.map(function (w) {
      var badgeStyle = w.type === 'consecutive' 
        ? 'background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;' 
        : 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;';
      var stageLabel = w.stage === 'middle' ? 'المتوسطة' : 'الثانوية';

      return '<div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 10px 14px; border: 1px solid #fee2e2; border-radius: 12px; font-size: 11px;">' +
        '<div>' +
          '<button type="button" onclick="showStudentProfile(\'' + w.student.id + '\', \'' + w.stage + '\')" style="background:none;border:none;padding:0;color:#4f46e5;font-weight:900;text-decoration:none;cursor:pointer;font-family:inherit;font-size:12px;">' + esc(w.student.name) + '</button>' +
          '<span style="color: #64748b; font-weight: bold; margin-right: 8px; font-size: 10px;">(' + stageLabel + ')</span>' +
        '</div>' +
        '<span style="font-weight: 800; padding: 4px 10px; border-radius: 8px; ' + badgeStyle + '">' + w.text + '</span>' +
      '</div>';
    }).join('');

    panel.style.display = 'block';
  }

  function renderMonitor() {
    var date = dateValue();
    var middleStudents = Store.getStudents();
    var middleSummary = Store.getAttendanceSummary(date);
    renderStage('middle', middleSummary, middleStudents.length, Store.isAttendanceClosed(date));

    var highSummary = Store.getHighAttendanceSummary(date);
    renderStage('high', highSummary, highSummary.total, Store.isHighAttendanceClosed(date));

    renderAbsenceWarnings();
  }

  function statusLabel(status) {
    return ({ early: 'مبكر', present: 'حاضر', absent: 'غائب', unmarked: 'غير محدد' })[status] || 'غير محدد';
  }

  function statusIcon(status) {
    return ({ early: '⏰', present: '✅', absent: '❌', unmarked: '○' })[status] || '○';
  }

  function fmtDateAr(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  var weeklyChart = null;
  var middleDistChart = null;
  var highDistChart = null;

  function renderAnalytics() {
    var date = dateValue();
    
    // 1. الإحصائيات الأسبوعية (آخر 7 أيام)
    var last7Days = [];
    var pad = function (value) { return value < 10 ? '0' + value : String(value); };
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      last7Days.push(dateStr);
    }

    var middleData = [];
    var highData = [];
    var labels = [];

    last7Days.forEach(function (d) {
      var dateObj = new Date(d);
      var dayName = dateObj.toLocaleDateString('ar-SA', { weekday: 'short' });
      var shortDate = dateObj.getDate() + '/' + (dateObj.getMonth() + 1);
      labels.push(dayName + ' ' + shortDate);

      // نسبة انضباط المتوسطة
      var mTotal = Store.getStudents().length;
      var mSummary = Store.getAttendanceSummary(d);
      var mMarked = mTotal - mSummary.unmarked;
      var mPercent = mTotal ? Math.round((mMarked / mTotal) * 100) : 0;
      middleData.push(mPercent);

      // نسبة انضباط الثانوية
      var hSummary = Store.getHighAttendanceSummary(d);
      var hMarked = hSummary.total - hSummary.unmarked;
      var hPercent = hSummary.total ? Math.round((hMarked / hSummary.total) * 100) : 0;
      highData.push(hPercent);
    });

    if (weeklyChart) weeklyChart.destroy();
    var ctxWeekly = $('#weeklyAttendanceChart');
    if (ctxWeekly && typeof Chart !== 'undefined') {
      weeklyChart = new Chart(ctxWeekly, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'المرحلة المتوسطة (%)',
              data: middleData,
              borderColor: '#4f46e5',
              backgroundColor: 'rgba(79, 70, 229, 0.06)',
              borderWidth: 3,
              tension: 0.3,
              fill: true
            },
            {
              label: 'المرحلة الثانوية (%)',
              data: highData,
              borderColor: '#06b6d4',
              backgroundColor: 'rgba(6, 182, 212, 0.06)',
              borderWidth: 3,
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { font: { family: 'Tajawal', weight: 'bold' } }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: { font: { family: 'Tajawal', weight: 'bold' } }
            },
            x: {
              ticks: { font: { family: 'Tajawal', weight: 'bold' } }
            }
          }
        }
      });
    }

    // 2. توزيع الحالات لليوم المحدد
    var mSummary = Store.getAttendanceSummary(date);
    var hSummary = Store.getHighAttendanceSummary(date);

    if (middleDistChart) middleDistChart.destroy();
    var ctxM = $('#middleDistributionChart');
    if (ctxM && typeof Chart !== 'undefined') {
      middleDistChart = new Chart(ctxM, {
        type: 'doughnut',
        data: {
          labels: ['مبكر', 'حاضر', 'غائب', 'غير محدد'],
          datasets: [{
            data: [mSummary.early, mSummary.present, mSummary.absent, mSummary.unmarked],
            backgroundColor: ['#3b82f6', '#10b981', '#ef4444', '#cbd5e1']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Tajawal', weight: 'bold', size: 10 } }
            }
          }
        }
      });
    }

    if (highDistChart) highDistChart.destroy();
    var ctxH = $('#highDistributionChart');
    if (ctxH && typeof Chart !== 'undefined') {
      highDistChart = new Chart(ctxH, {
        type: 'doughnut',
        data: {
          labels: ['مبكر', 'حاضر', 'غائب', 'غير محدد'],
          datasets: [{
            data: [hSummary.early, hSummary.present, hSummary.absent, hSummary.unmarked],
            backgroundColor: ['#3b82f6', '#10b981', '#ef4444', '#cbd5e1']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Tajawal', weight: 'bold', size: 10 } }
            }
          }
        }
      });
    }
  }

  function getUniqueDates() {
    var stateData = Store.getState();
    var dates = {};
    Object.keys(stateData.attendance || {}).forEach(function (d) { dates[d] = true; });
    Object.keys(stateData.highAttendance || {}).forEach(function (d) { dates[d] = true; });
    return Object.keys(dates).sort(function (a, b) { return b.localeCompare(a); });
  }

  function renderDays() {
    var dates = getUniqueDates();
    var stateData = Store.getState();
    var isOwner = (Store.getCurrentUser() || {}).role === 'owner';
    var list = $('#portalDaysList');
    if (!list) return;

    if (!dates.length) {
      list.innerHTML = '<div class="text-center text-slate-500 py-12 bg-white/50 rounded-2xl border border-white/80 font-bold col-span-full">لا يوجد سجلات تحضير سابقة بعد.</div>';
      return;
    }

    list.innerHTML = dates.map(function (d) {
      var middleDay = stateData.attendance[d];
      var middleClosed = Store.isAttendanceClosed(d);
      var highDay = stateData.highAttendance[d];
      var highClosed = Store.isHighAttendanceClosed(d);

      return '<div class="card" style="margin-bottom: 0; display: flex; flex-direction: column; gap: 14px;">' +
        '<div style="border-bottom: 1px solid var(--line); padding-bottom: 8px;">' +
          '<h3 class="font-black text-slate-800 text-sm" style="margin: 0;">📅 تاريخ التحضير: ' + fmtDateAr(d) + '</h3>' +
        '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 12px;">' +
          // Middle School row
          '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">' +
            '<div>' +
              '<span class="portal-kicker" style="color: #4f46e5; margin:0; font-size: 9px; font-weight: 900;">المتوسطة</span>' +
              '<div style="font-weight: bold; color: #475569; margin-top: 2px;">' +
                (middleClosed ? '🔒 مغلق وموثق' : '🟢 مفتوح حالياً') +
              '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 8px;">' +
              (middleDay && Object.keys(middleDay.records || {}).length ?
                '<button onclick="showDayRoster(\'' + d + '\', \'middle\')" class="btn sm ghost">🔍 كشف المتوسطة</button>' +
                '<button onclick="openAdminExportMenu(\'' + d + '\', \'middle\')" class="btn sm green">📤 تصدير</button>' +
                (isOwner ? '<button onclick="deleteDayRecord(\'' + d + '\', \'middle\', this)" class="btn sm red" title="حذف سجل اليوم">🗑️</button>' : '') :
                '<span class="text-slate-400 font-bold" style="font-size: 10px;">لا توجد سجلات</span>') +
            '</div>' +
          '</div>' +
          // High School row
          '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; border-top: 1px dashed var(--line); padding-top: 10px;">' +
            '<div>' +
              '<span class="portal-kicker" style="color: #06b6d4; margin:0; font-size: 9px; font-weight: 900;">الثانوية</span>' +
              '<div style="font-weight: bold; color: #475569; margin-top: 2px;">' +
                (highClosed ? '🔒 مغلق وموثق' : '🟢 مفتوح حالياً') +
              '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 8px;">' +
              (highDay && Object.keys(highDay.records || {}).length ?
                '<button onclick="showDayRoster(\'' + d + '\', \'high\')" class="btn sm ghost">🔍 كشف الثانوية</button>' +
                '<button onclick="openAdminExportMenu(\'' + d + '\', \'high\')" class="btn sm green">📤 تصدير</button>' +
                (isOwner ? '<button onclick="deleteDayRecord(\'' + d + '\', \'high\', this)" class="btn sm red" title="حذف سجل اليوم">🗑️</button>' : '') :
                '<span class="text-slate-400 font-bold" style="font-size: 10px;">لا توجد سجلات</span>') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.showDayRoster = function (date, stage) {
    var stateData = Store.getState();
    var listContainer = $('#rosterModalList');
    
    $('#rosterStageLabel').textContent = stage === 'middle' ? 'المرحلة المتوسطة' : 'المرحلة الثانوية';
    $('#rosterStageLabel').style.color = stage === 'middle' ? '#4f46e5' : '#06b6d4';
    $('#rosterDateLabel').textContent = 'كشف حضور يوم: ' + fmtDateAr(date);
    
    var early = 0, present = 0, absent = 0, unmarked = 0;
    var html = '';

    if (stage === 'middle') {
      var students = Store.getStudents().sort(function (a, b) {
        return a.name.localeCompare(b.name, 'ar');
      });
      var day = stateData.attendance[date] || {};
      var records = day.records || {};
      
      students.forEach(function (student) {
        var rec = records[student.id];
        var status = (rec && typeof rec === 'object') ? rec.status : (rec || 'unmarked');
        var by = (rec && typeof rec === 'object' && rec.by) ? rec.by : '';
        var at = (rec && typeof rec === 'object' && rec.at) ? rec.at : null;

        if (status === 'early') early++;
        else if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else unmarked++;

        var group = Store.getGroup(student.groupId);
        var groupName = group ? group.name : 'بدون مجموعة';
        var timeStr = at ? new Date(at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
        var audit = by ? '👤 ' + by + (timeStr ? ' · ' + timeStr : '') : 'لم يُرصد بعد';

        html += '<div class="high-student-row status-' + status + '" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; margin-bottom: 2px;">' +
          '<div style="font-size: 11px; color: #64748b; font-weight: 800; border-left: 2px solid #e2e8f0; padding-left: 8px; margin-left: 8px;">' + groupName + '</div>' +
          '<div class="high-student-name"><strong>' + esc(student.name) + '</strong><small style="font-size: 9px; font-weight: bold; color: #94a3b8; display: block; margin-top: 2px;">' + esc(audit) + '</small></div>' +
          '<span class="high-status-badge" style="font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 6px;">' + statusIcon(status) + ' ' + statusLabel(status) + '</span>' +
        '</div>';
      });
    } else {
      var students = Store.getHighStudents().filter(function (student) { return student.active !== false; }).sort(function (a, b) {
        return a.name.localeCompare(b.name, 'ar');
      });
      var day = stateData.highAttendance[date] || {};
      var records = day.records || {};

      students.forEach(function (student) {
        var rec = records[student.id];
        var status = (rec && typeof rec === 'object') ? rec.status : (rec || 'unmarked');
        var by = (rec && typeof rec === 'object' && rec.by) ? rec.by : '';
        var at = (rec && typeof rec === 'object' && rec.at) ? rec.at : null;

        if (status === 'early') early++;
        else if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else unmarked++;

        var timeStr = at ? new Date(at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
        var audit = by ? '👤 ' + by + (timeStr ? ' · ' + timeStr : '') : 'لم يُرصد بعد';

        html += '<div class="high-student-row status-' + status + '" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; margin-bottom: 2px;">' +
          '<div class="high-student-name"><strong>' + esc(student.name) + '</strong><small style="font-size: 9px; font-weight: bold; color: #94a3b8; display: block; margin-top: 2px;">' + esc(audit) + '</small></div>' +
          '<span class="high-status-badge" style="font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 6px;">' + statusIcon(status) + ' ' + statusLabel(status) + '</span>' +
        '</div>';
      });
    }

    $('#rosterStatEarly').textContent = early;
    $('#rosterStatPresent').textContent = present;
    $('#rosterStatAbsent').textContent = absent;
    $('#rosterStatUnmarked').textContent = unmarked;
    listContainer.innerHTML = html || '<div class="text-center text-slate-500 py-6 font-bold">لا يوجد طلاب في هذا اليوم</div>';
    
    $('#rosterModal').hidden = false;
  };

  window.deleteDayRecord = function (date, stage, button) {
    var label = stage === 'high' ? 'الثانوية' : 'المتوسطة';
    showConfirm(
      'حذف سجل تحضير ' + label + ' ليوم ' + fmtDateAr(date) +
      '؟ سيُحذف الحضور والغياب من التقارير والإحصائيات، ولن تتغير نقاط الطلاب. لا يمكن التراجع.',
      function (confirmed) {
      if (!confirmed) return;
      var originalText = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = '…'; }
      Promise.resolve().then(function () {
        return Store.deleteAttendanceDay(stage, date);
      }).then(function (result) {
        showToast(result && result.deleted ?
          'تم حذف سجل التحضير دون تغيير نقاط الطلاب' :
          'لا يوجد سجل تحضير لهذا اليوم');
      }).catch(function (error) {
        showToast(error.message || 'تعذر حذف سجل التحضير. لم يتم تغيير البيانات.', true);
      }).finally(function () {
        if (button && button.isConnected) {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
    });
  };

  $('#closeRosterModal').addEventListener('click', function() {
    $('#rosterModal').hidden = true;
  });

  $('#rosterModal').addEventListener('click', function(e) {
    if (e.target === this) $('#rosterModal').hidden = true;
  });

  function rowFromStudent(stage, student, details) {
    var status = typeof details === 'string' ? details : (details && details.status ? details.status : 'unmarked');
    return {
      studentId: student.id,
      name: student.name || '',
      stage: stage,
      stageLabel: stage === 'middle' ? 'المتوسطة' : 'الثانوية',
      status: status,
      statusLabel: statusLabel(status),
      at: details && details.at ? details.at : null,
      by: details && details.by ? details.by : ''
    };
  }

  function buildReportRows() {
    var date = dateValue();
    var rows = [];
    Store.getStudents().forEach(function (student) {
      rows.push(rowFromStudent('middle', student, Store.getStudentAttendanceDetails(date, student.id)));
    });
    Store.getHighStudents().filter(function (student) { return student.active !== false; }).forEach(function (student) {
      rows.push(rowFromStudent('high', student, Store.getHighStudentAttendance(date, student.id)));
    });
    return rows;
  }

  function formatTime(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  function renderReports() {
    var stage = $('#reportStage').value;
    var status = $('#reportStatus').value;
    var query = ($('#reportSearch').value || '').trim().toLowerCase();
    currentRows = buildReportRows().filter(function (row) {
      var stageMatch = stage === 'all' || row.stage === stage;
      var statusMatch = status === 'all' || row.status === status;
      var searchMatch = !query || (row.name + ' ' + row.by).toLowerCase().indexOf(query) !== -1;
      return stageMatch && statusMatch && searchMatch;
    }).sort(function (a, b) {
      if (a.stage !== b.stage) return a.stage.localeCompare(b.stage);
      return a.name.localeCompare(b.name, 'ar');
    });

    $('#reportRowsCount').textContent = currentRows.length;
    $('#reportTableBody').innerHTML = currentRows.length ? currentRows.map(function (row, index) {
      return '<tr><td style="font-weight:bold;color:#64748b;font-size:14px;">' + (index + 1) + '</td><td><button type="button" onclick="showStudentProfile(\'' + row.studentId + '\', \'' + row.stage + '\')" style="background:none;border:none;padding:0;color:#4f46e5;font-weight:900;text-decoration:none;cursor:pointer;font-family:inherit;font-size:15px;">' + esc(row.name) + '</button></td><td style="font-size:14px;">' + row.stageLabel + '</td>' +
        '<td><span class="report-status status-' + row.status + '" style="font-size:12px;font-weight:bold;">' + row.statusLabel + '</span></td>' +
        '<td style="font-size:14px;">' + formatTime(row.at) + '</td><td style="font-size:14px;">' + (esc(row.by) || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="report-empty">لا توجد سجلات مطابقة.</td></tr>';
  }

  function copyReportToWhatsapp() {
    if (!currentRows.length) {
      showToast('⚠️ لا توجد سجلات مطابقة لنسخها', true);
      return;
    }
    var title = '📋 تقرير الحضور المفلتر ليوم: ' + fmtDateAr(dateValue());
    var separator = '----------------------------------';
    var lines = [title, separator];
    
    var count = 0;
    currentRows.forEach(function (row) {
      count++;
      var statusSymbol = '⚪';
      if (row.status === 'early') statusSymbol = '⏰';
      if (row.status === 'present') statusSymbol = '✅';
      if (row.status === 'absent') statusSymbol = '❌';
      
      lines.push(count + '. ' + row.name + ' (' + row.stageLabel + '): ' + statusSymbol + ' ' + row.statusLabel);
    });
    
    lines.push(separator);
    lines.push('🔢 إجمالي الطلاب المعروضين: ' + currentRows.length);
    
    var text = lines.join('\n');
    navigator.clipboard.writeText(text).then(function () {
      showToast('📋 تم نسخ تقرير البحث للحافظة بنجاح!');
    }).catch(function (err) {
      showToast('⚠️ فشل نسخ التقرير', true);
    });
  }

  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    var lines = [['الطالب', 'المرحلة', 'الحالة', 'الوقت', 'المعلم']].concat(currentRows.map(function (row) {
      return [row.name, row.stageLabel, row.statusLabel, formatTime(row.at), row.by || ''];
    }));
    var csv = '\ufeff' + lines.map(function (line) { return line.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'تقرير-الحضور-' + dateValue() + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function targetLabel(target) {
    return target === 'middle' ? 'المتوسطة' : target === 'high' ? 'الثانوية' : 'الجميع';
  }

  function renderMemos() {
    var memos = Store.getMemos();
    $('#memosList').innerHTML = memos.length ? memos.map(function (memo) {
      var expired = memo.expiresAt && memo.expiresAt <= Date.now();
      var active = memo.active !== false && !expired;
      return '<article class="memo-history-item ' + (memo.level === 'urgent' ? 'urgent ' : '') + (active ? '' : 'inactive') + '">' +
        '<div><span>' + targetLabel(memo.target) + (expired ? ' · منتهي' : '') + '</span><p>' + esc(memo.message) + '</p><small>' + esc(memo.createdBy || '') + '</small></div>' +
        '<div><button type="button" data-memo-toggle="' + memo.id + '" data-active="' + (memo.active !== false) + '">' + (memo.active !== false ? 'إيقاف' : 'تفعيل') + '</button>' +
        '<button type="button" data-memo-delete="' + memo.id + '">حذف</button></div></article>';
    }).join('') : '<div class="owner-empty">لا توجد توجيهات سابقة.</div>';

    $$('[data-memo-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        try {
          Store.setMemoActive(button.dataset.memoToggle, button.dataset.active !== 'true');
          showToast('تم تحديث حالة التوجيه');
        } catch (error) { showToast(error.message, true); }
      });
    });
    $$('[data-memo-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        showConfirm('هل تريد حذف هذا التوجيه؟', function (confirmed) {
          if (!confirmed) return;
          try {
            Store.deleteMemo(button.dataset.memoDelete);
            showToast('تم حذف التوجيه');
          } catch (error) { showToast(error.message, true); }
        });
      });
    });
  }

  function showToast(message, isError) {
    var toast = $('#portalToast');
    toast.textContent = message;
    toast.style.background = isError ? '#be123c' : '#0f172a';
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  function renderAll() {
    renderMonitor();
    renderReports();
    renderAnalytics();
    renderDays();
    if (currentUser && currentUser.role === 'owner') renderMemos();
  }

  $('#portalDate').value = today();
  $('#portalDate').addEventListener('change', renderAll);
  ['#reportStage', '#reportStatus'].forEach(function (selector) { $(selector).addEventListener('change', renderReports); });
  $('#reportSearch').addEventListener('input', renderReports);
  $('#exportReportCsv').addEventListener('click', exportCsv);
  $('#copyReportWhatsapp').addEventListener('click', copyReportToWhatsapp);
  $('#printReport').addEventListener('click', function () { window.print(); });

  $$('[data-portal-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      $$('[data-portal-tab]').forEach(function (item) { item.classList.remove('active'); });
      $$('.portal-view').forEach(function (view) { view.classList.remove('active'); });
      button.classList.add('active');
      var tabId = button.dataset.portalTab;
      $('#portalView' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
      if (tabId === 'analytics') {
        renderAnalytics();
      }
    });
  });

  $('#memoForm').addEventListener('submit', function (event) {
    event.preventDefault();
    $('#memoFormError').hidden = true;
    try {
      var expiry = $('#memoExpiry').value ? new Date($('#memoExpiry').value).getTime() : null;
      Store.addMemo({
        message: $('#memoMessage').value,
        target: $('#memoTarget').value,
        level: $('#memoLevel').value,
        expiresAt: expiry
      });
      $('#memoMessage').value = '';
      $('#memoExpiry').value = '';
      showToast('تم إرسال التوجيه للمعلمين');
    } catch (error) {
      $('#memoFormError').textContent = error.message || 'تعذر إرسال التوجيه';
      $('#memoFormError').hidden = false;
    }
  });

  window.openAdminExportMenu = function (dateStr, stage) {
    var old = $('#adminExportModal');
    if (old) old.remove();

    var formattedDate = fmtDateAr(dateStr);
    var stageLabel = stage === 'middle' ? 'المرحلة المتوسطة' : 'المرحلة الثانوية';
    var modal = document.createElement('div');
    modal.id = 'adminExportModal';
    modal.className = 'high-modal';
    modal.innerHTML = 
      '<div class="high-modal-card" style="width: min(400px, 95%); text-align: right; padding: 22px;">' +
        '<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 18px;">' +
          '<h3 class="font-black text-slate-800" style="font-size: 15px; margin:0;">📤 تصدير قائمة التحضير</h3>' +
          '<button onclick="closeAdminExportMenu()" class="owner-danger-button" style="padding: 4px 8px; font-size: 11px; border-radius: 6px;">&times;</button>' +
        '</div>' +
        '<p style="font-size: 11px; color: #64748b; font-weight: 800; margin: 0 0 15px 0;">📅 اليوم: ' + formattedDate + ' (' + stageLabel + ')</p>' +
        '<div style="display: flex; flex-direction: column; gap: 10px;">' +
          '<button onclick="exportAdminToClipboard(\'' + dateStr + '\', \'' + stage + '\')" class="btn" style="background: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; padding: 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: right; font-weight: bold;">' +
            '<span style="font-size: 20px;">📋</span>' +
            '<div>' +
              '<div style="font-size: 12px; font-weight: 800;">نسخ للواتساب والقروبات</div>' +
              '<div style="font-size: 9px; color: #94a3b8; font-weight: bold; margin-top: 2px;">تنسيق جاهز للنصوص والمشاركة</div>' +
            '</div>' +
          '</button>' +
          '<button onclick="exportAdminToExcel(\'' + dateStr + '\', \'' + stage + '\')" class="btn" style="background: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; padding: 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: right; font-weight: bold;">' +
            '<span style="font-size: 20px;">🟢</span>' +
            '<div>' +
              '<div style="font-size: 12px; font-weight: 800;">تصدير كملف Excel CSV</div>' +
              '<div style="font-size: 9px; color: #94a3b8; font-weight: bold; margin-top: 2px;">ملف جداول متكامل للتقارير والطباعة</div>' +
            '</div>' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  };

  window.closeAdminExportMenu = function () {
    var modal = $('#adminExportModal');
    if (modal) modal.remove();
  };

  window.exportAdminToClipboard = function (dateStr, stage) {
    var stateData = Store.getState();
    var stageLabel = stage === 'middle' ? 'المرحلة المتوسطة' : 'المرحلة الثانوية';
    var day = (stage === 'middle' ? stateData.attendance[dateStr] : stateData.highAttendance[dateStr]) || {};
    var records = day.records || {};
    
    var students = (stage === 'middle' 
      ? Store.getStudents() 
      : Store.getHighStudents().filter(function (s) { return s.active !== false; })
    ).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ar');
    });

    var title = '📋 تقرير تحضير يوم: ' + fmtDateAr(dateStr) + ' (' + stageLabel + ')';
    var separator = '----------------------------------';
    var lines = [title, separator];
    
    var count = 0;
    students.forEach(function (s) {
      var rec = records[s.id];
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      var statusText = 'لم يُحضّر ⚪';
      if (status === 'early') statusText = 'مبكر ⏰';
      if (status === 'present') statusText = 'حاضر ✅';
      if (status === 'absent') statusText = 'غائب ❌';
      
      count++;
      lines.push(count + '. ' + s.name + ' - ' + statusText);
    });

    lines.push(separator);
    
    var sum = { early: 0, present: 0, absent: 0, unmarked: 0 };
    students.forEach(function (s) {
      var r = records[s.id];
      var status = (r && typeof r === 'object') ? r.status : r;
      if (status === 'early') sum.early++;
      else if (status === 'present') sum.present++;
      else if (status === 'absent') sum.absent++;
      else sum.unmarked++;
    });
    
    lines.push('⏰ مبكر: ' + sum.early);
    lines.push('✅ حاضر: ' + sum.present);
    lines.push('❌ غائب: ' + sum.absent);
    lines.push('○ غير محدد: ' + sum.unmarked);
    
    var finalBox = lines.join('\n');
    navigator.clipboard.writeText(finalBox).then(function () {
      showToast('📋 تم نسخ التقرير للواتساب!');
      closeAdminExportMenu();
    }).catch(function (err) {
      showToast('⚠️ فشل نسخ التقرير', true);
    });
  };

  window.exportAdminToExcel = function (dateStr, stage) {
    var stateData = Store.getState();
    var day = (stage === 'middle' ? stateData.attendance[dateStr] : stateData.highAttendance[dateStr]) || {};
    var records = day.records || {};
    var students = (stage === 'middle' 
      ? Store.getStudents() 
      : Store.getHighStudents().filter(function (s) { return s.active !== false; })
    ).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ar');
    });

    var headers = stage === 'middle' 
      ? ['الرقم', 'اسم الطالب', 'المجموعة', 'حالة التحضير', 'المعلم الذي حضره', 'وقت التحضير']
      : ['الرقم', 'اسم الطالب', 'حالة التحضير', 'المعلم الذي حضره', 'وقت التحضير'];
    var rows = [headers];
    
    var count = 0;
    students.forEach(function (s) {
      var rec = records[s.id];
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      var statusText = 'لم يُحضّر';
      if (status === 'early') statusText = 'مبكر';
      if (status === 'present') statusText = 'حاضر';
      if (status === 'absent') statusText = 'غائب';
      
      var row = [];
      count++;
      row.push(count);
      row.push(s.name);
      if (stage === 'middle') {
        var groupObj = Store.getGroup(s.groupId);
        row.push(groupObj ? groupObj.name : '');
      }
      row.push(statusText);
      row.push((rec && typeof rec === 'object' && rec.by) ? rec.by : '');
      row.push((rec && typeof rec === 'object' && rec.at) ? formatTime(rec.at) : '');
      rows.push(row);
    });

    var csv = '\ufeff' + rows.map(function (line) { return line.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    var stageLabel = stage === 'middle' ? 'المتوسطة' : 'الثانوية';
    link.download = 'كشف-حضور-' + stageLabel + '-' + dateStr + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    closeAdminExportMenu();
  };

  var studentChart = null;

  window.showStudentProfile = function (studentId, stage) {
    var stateData = Store.getState();
    var student = null;
    var groupName = '';
    
    if (stage === 'middle') {
      student = Store.getStudents().find(function (s) { return s.id === studentId; });
      if (student) {
        var group = Store.getGroup(student.groupId);
        groupName = group ? group.name : 'بدون مجموعة';
      }
    } else {
      student = Store.getHighStudents().find(function (s) { return s.id === studentId; });
    }

    if (!student) {
      showToast('⚠️ لم يتم العثور على بيانات الطالب', true);
      return;
    }

    $('#profileStageLabel').textContent = (stage === 'middle' ? 'المرحلة المتوسطة' : 'المرحلة الثانوية') + (groupName ? ' · ' + groupName : '');
    $('#profileStageLabel').style.color = stage === 'middle' ? '#4f46e5' : '#06b6d4';
    $('#profileStudentName').textContent = student.name;

    var totalDays = 0;
    var early = 0, present = 0, absent = 0, unmarked = 0;
    var timelineHtml = '';

    var dates = getUniqueDates();
    dates.forEach(function (d) {
      var day = (stage === 'middle' ? stateData.attendance[d] : stateData.highAttendance[d]) || {};
      var records = day.records || {};
      var rec = records[studentId];
      if (rec != null) {
        var status = (rec && typeof rec === 'object') ? rec.status : rec;
        var by = (rec && typeof rec === 'object' && rec.by) ? rec.by : '';
        var at = (rec && typeof rec === 'object' && rec.at) ? rec.at : null;

        totalDays++;
        if (status === 'early') early++;
        else if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else unmarked++;

        var timeStr = at ? new Date(at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
        var audit = by ? '👤 رصدها: ' + by + (timeStr ? ' · ' + timeStr : '') : '';

        timelineHtml += '<div class="high-student-row status-' + status + '" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; margin-bottom: 2px;">' +
          '<div style="font-weight: 800; font-size: 11px; color: #475569;">📅 ' + fmtDateAr(d) + '</div>' +
          '<div class="high-student-name"><small style="font-size: 9px; font-weight: bold; color: #94a3b8; display: block; margin-top: 2px;">' + (audit || '—') + '</small></div>' +
          '<span class="high-status-badge" style="font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 6px;">' + statusIcon(status) + ' ' + statusLabel(status) + '</span>' +
        '</div>';
      }
    });

    var presenceCount = early + present;
    var attendanceRate = totalDays ? Math.round((presenceCount / totalDays) * 100) : 0;

    $('#profileTotalDays').textContent = totalDays;
    $('#profileAttendanceRate').textContent = attendanceRate + '%';
    $('#profileAbsentDays').textContent = absent;
    $('#profileTimelineList').innerHTML = timelineHtml || '<div class="text-center text-slate-400 py-6 font-bold">لا يوجد سجل حضور مسجل لهذا الطالب بعد.</div>';

    if (studentChart) studentChart.destroy();
    var ctxS = $('#studentDistributionChart');
    if (ctxS && typeof Chart !== 'undefined') {
      studentChart = new Chart(ctxS, {
        type: 'doughnut',
        data: {
          labels: ['مبكر', 'حاضر', 'غائب', 'غير محدد'],
          datasets: [{
            data: [early, present, absent, unmarked],
            backgroundColor: ['#3b82f6', '#10b981', '#ef4444', '#cbd5e1']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { font: { family: 'Tajawal', weight: 'bold', size: 11 } }
            }
          }
        }
      });
    }

    $('#studentProfileModal').hidden = false;
  };

  $('#closeProfileModal').addEventListener('click', function() {
    $('#studentProfileModal').hidden = true;
  });

  $('#studentProfileModal').addEventListener('click', function(e) {
    if (e.target === this) $('#studentProfileModal').hidden = true;
  });

  if (requireAccess()) {
    renderAll();
    Store.subscribe(renderAll);
  }
})();
