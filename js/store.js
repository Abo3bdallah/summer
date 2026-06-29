/* ============================================================
   store.js — طبقة البيانات المشتركة
   - تخزين دائم في localStorage
   - مزامنة لحظية بين كل النوافذ/التبويبات عبر BroadcastChannel
   - حساب نقاط المجموعة تلقائيًا من مجموع نقاط طلابها
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'points_system_v1';
  var CHANNEL_NAME = 'points_system_sync';

  // المجموعات الأربع الثابتة
  var DEFAULT_GROUPS = [
    { id: 'qimma',  name: 'البواسل',  goal: 100 },  // أزرق
    { id: 'tumooh', name: 'الكواسر',  goal: 100 },  // أحمر
    { id: 'sumood', name: 'المعالي',  goal: 100 },  // أخضر
    { id: 'ruwwad', name: 'الشموخ',   goal: 100 }   // أصفر
  ];

  // الأسماء القانونية حسب المعرّف (تُطبَّق على البيانات القديمة عند التحميل)
  var CANON_NAMES = { qimma: 'البواسل', tumooh: 'الكواسر', sumood: 'المعالي', ruwwad: 'الشموخ' };

  var channel = null;
  if ('BroadcastChannel' in global) {
    try { channel = new BroadcastChannel(CHANNEL_NAME); } catch (e) { channel = null; }
  }

  var listeners = [];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function defaultState() {
    return {
      groups: DEFAULT_GROUPS.map(function (g) { return { id: g.id, name: g.name, goal: g.goal }; }),
      students: [],
      log: [],
      supervisor: '',
      // نقاط التحضير لكل حالة (قابلة للضبط من الإعدادات)
      attendancePoints: { early: 10, present: 5, absent: 0 },
      // سجل التحضير: { 'YYYY-MM-DD': { studentId: 'early'|'present'|'absent' } }
      attendance: {}
    };
  }

  // دمج آمن مع الافتراضي لضمان وجود كل الحقول (يُستخدم للتخزين المحلي وللسحابة)
  function normalize(parsed) {
    var s = defaultState();
    if (parsed) {
      if (parsed.groups && parsed.groups.length) s.groups = parsed.groups;
      if (Array.isArray(parsed.students)) s.students = parsed.students;
      if (Array.isArray(parsed.log)) s.log = parsed.log;
      if (typeof parsed.supervisor === 'string') s.supervisor = parsed.supervisor;
      if (parsed.attendancePoints) {
        ['early', 'present', 'absent'].forEach(function (k) {
          var v = parseInt(parsed.attendancePoints[k], 10);
          if (!isNaN(v)) s.attendancePoints[k] = v;
        });
      }
      if (parsed.attendance && typeof parsed.attendance === 'object') s.attendance = parsed.attendance;
    }
    // ترحيل: فرض الأسماء الجديدة حسب المعرّف مع الحفاظ على الأهداف
    s.groups.forEach(function (g) { if (CANON_NAMES[g.id]) g.name = CANON_NAMES[g.id]; });
    return s;
  }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) return defaultState();
    try { return normalize(JSON.parse(raw)); } catch (e) { return defaultState(); }
  }

  var state = load();

  function persist() {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // إشعار المستمعين محليًا + إرسال للنوافذ الأخرى
  function emit(broadcast) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) {}
    }
    if (broadcast !== false && channel) {
      try { channel.postMessage({ type: 'state', ts: Date.now() }); } catch (e) {}
    }
  }

  // عند وصول رسالة من نافذة أخرى: أعد التحميل من التخزين وحدّث
  if (channel) {
    channel.onmessage = function () {
      state = load();
      emit(false);
    };
  }
  // احتياط للمتصفحات بلا BroadcastChannel: حدث storage
  global.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      state = load();
      emit(false);
    }
  });

  /* ---------------- مزامنة Firebase / Firestore (عبر الأجهزة) ---------------- */
  var db = global.db || null;
  var applyingRemote = false;

  if (db) {
    applyingRemote = true;

    // 1. الإعدادات والمجموعات
    db.collection('settings').doc('config').onSnapshot(function (snap) {
      if (snap.exists) {
        applyingRemote = true;
        var data = snap.data();
        if (data.groups) state.groups = data.groups;
        if (data.attendancePoints) state.attendancePoints = data.attendancePoints;
        if (typeof data.supervisor === 'string') state.supervisor = data.supervisor;
        persist();
        emit(false);
        applyingRemote = false;
      } else {
        db.collection('settings').doc('config').set({
          groups: state.groups,
          attendancePoints: state.attendancePoints,
          supervisor: state.supervisor
        }).catch(function () {});
      }
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (الإعدادات):', err && err.message);
    });

    // 2. الطلاب
    db.collection('students').onSnapshot(function (snap) {
      applyingRemote = true;
      var students = [];
      snap.forEach(function (doc) {
        var s = doc.data();
        s.id = doc.id;
        students.push(s);
      });
      state.students = students;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (الطلاب):', err && err.message);
    });

    // 3. سجل العمليات
    db.collection('logs').orderBy('timestamp', 'desc').limit(150).onSnapshot(function (snap) {
      applyingRemote = true;
      var log = [];
      snap.forEach(function (doc) {
        var l = doc.data();
        l.id = doc.id;
        log.push(l);
      });
      state.log = log;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (السجل):', err && err.message);
    });

    // 4. التحضير اليومي
    db.collection('attendance').onSnapshot(function (snap) {
      applyingRemote = true;
      var attendance = {};
      snap.forEach(function (doc) {
        var data = doc.data();
        attendance[doc.id] = {
          records: data.records || {},
          status: data.status || 'active',
          closedAt: data.closedAt || null,
          closedBy: data.closedBy || null
        };
      });
      state.attendance = attendance;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (التحضير):', err && err.message);
    });
  }

  function commit() {
    persist();      // فوري محليًا
    emit(true);     // تحديث لحظي للشاشات على نفس الجهاز
  }

  /* ---------------- واجهة القراءة ---------------- */

  function getState() { return state; }

  function getGroups() { return state.groups.slice(); }

  function getGroup(id) {
    for (var i = 0; i < state.groups.length; i++) {
      if (state.groups[i].id === id) return state.groups[i];
    }
    return null;
  }

  function getStudents() { return state.students.slice(); }

  function getStudent(id) {
    for (var i = 0; i < state.students.length; i++) {
      if (state.students[i].id === id) return state.students[i];
    }
    return null;
  }

  // مجموع نقاط المجموعة = جمع نقاط طلابها (يُحسب لحظيًا)
  function getGroupPoints(groupId) {
    var total = 0;
    for (var i = 0; i < state.students.length; i++) {
      if (state.students[i].groupId === groupId) total += (state.students[i].points || 0);
    }
    return total;
  }

  function getGroupSummaries() {
    return state.groups.map(function (g) {
      var pts = getGroupPoints(g.id);
      var pct = g.goal > 0 ? Math.round((pts / g.goal) * 100) : 0;
      return {
        id: g.id,
        name: g.name,
        goal: g.goal,
        points: pts,
        percent: pct,
        percentCapped: Math.min(100, pct)
      };
    });
  }

  function getLog() { return state.log.slice(); }

  function getSupervisor() { return state.supervisor; }

  /* ---------------- واجهة الكتابة ---------------- */

  function setSupervisor(name) {
    state.supervisor = (name || '').trim();
    if (db) {
      db.collection('settings').doc('config').set({ supervisor: state.supervisor }, { merge: true }).catch(function() {});
    }
    commit();
  }

  function setGroupGoal(groupId, goal) {
    var g = getGroup(groupId);
    if (!g) return;
    goal = parseInt(goal, 10);
    if (isNaN(goal) || goal < 1) goal = 1;
    g.goal = goal;
    if (db) {
      db.collection('settings').doc('config').set({ groups: state.groups }, { merge: true }).catch(function() {});
    }
    commit();
  }

  function addStudent(name, groupId) {
    name = (name || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    if (!getGroup(groupId)) throw new Error('المجموعة غير صحيحة');
    var student = { id: uid(), name: name, groupId: groupId, points: 0 };
    state.students.push(student);
    if (db) {
      db.collection('students').doc(student.id).set(student).catch(function() {});
    }
    commit();
    return student;
  }

  // إضافة عدة طلاب دفعة واحدة (أسماء، اسم بكل سطر) لمجموعة واحدة
  function addStudents(names, groupId) {
    if (!getGroup(groupId)) throw new Error('المجموعة غير صحيحة');
    var added = 0;
    var batch = db ? db.batch() : null;
    var newStudents = [];
    (names || []).forEach(function (n) {
      n = (n || '').trim();
      if (!n) return;
      var student = { id: uid(), name: n, groupId: groupId, points: 0 };
      state.students.push(student);
      newStudents.push(student);
      added++;
      if (batch) {
        batch.set(db.collection('students').doc(student.id), student);
      }
    });
    if (added) {
      if (batch) {
        batch.commit().catch(function() {});
      }
      commit();
    }
    return added;
  }

  function updateStudent(id, fields) {
    var st = getStudent(id);
    if (!st) return;
    var updatedFields = {};
    if (typeof fields.name === 'string') {
      var nm = fields.name.trim();
      if (nm) {
        st.name = nm;
        updatedFields.name = nm;
      }
    }
    if (fields.groupId && getGroup(fields.groupId)) {
      st.groupId = fields.groupId;
      updatedFields.groupId = fields.groupId;
    }
    if (typeof fields.points === 'number') {
      var pts = Math.max(0, Math.round(fields.points));
      st.points = pts;
      updatedFields.points = pts;
    }
    if (db && Object.keys(updatedFields).length > 0) {
      db.collection('students').doc(id).update(updatedFields).catch(function() {});
    }
    commit();
  }

  function deleteStudent(id) {
    state.students = state.students.filter(function (s) { return s.id !== id; });
    if (db) {
      db.collection('students').doc(id).delete().catch(function() {});
    }
    commit();
  }

  // تطبيق عملية نقاط (إضافة/خصم) مع التسجيل في السجل
  // amount: عدد موجب. type: 'add' | 'subtract'
  function applyPoints(studentId, amount, type, reason, supervisor) {
    var st = getStudent(studentId);
    if (!st) throw new Error('الطالب غير موجود');
    amount = parseInt(amount, 10);
    if (isNaN(amount) || amount <= 0) throw new Error('أدخل عددًا صحيحًا أكبر من صفر');

    var before = st.points || 0;
    var after;
    if (type === 'subtract') {
      after = Math.max(0, before - amount); // لا يقل عن صفر
    } else {
      type = 'add';
      after = before + amount;
    }
    var applied = after - before; // التغير الفعلي

    st.points = after;

    var grp = getGroup(st.groupId);
    var entry = {
      id: uid(),
      studentId: st.id,
      studentName: st.name,
      groupId: st.groupId,
      groupName: grp ? grp.name : '',
      amount: Math.abs(applied),
      requested: amount,
      type: type,
      reason: (reason || '').trim(),
      supervisor: (supervisor || state.supervisor || '').trim(),
      timestamp: Date.now()
    };
    state.log.unshift(entry); // الأحدث أولًا

    if (db) {
      var batch = db.batch();
      batch.update(db.collection('students').doc(studentId), { points: after });
      batch.set(db.collection('logs').doc(entry.id), entry);
      batch.commit().catch(function() {});
    }
    commit();
    return { student: st, entry: entry };
  }

  // أحدث عملية يدوية فعّالة (غير متراجَع عنها وليست تحضيرًا) — لزر «تراجع آخر عملية»
  function getLastActiveEntry() {
    for (var i = 0; i < state.log.length; i++) {
      if (!state.log[i].undone && state.log[i].kind !== 'attendance') return state.log[i];
    }
    return null;
  }

  // التراجع عن عملية: يعكس أثرها على نقاط الطالب ويعلّمها كمتراجَع عنها
  function undoEntry(id, supervisor) {
    var entry = null;
    for (var i = 0; i < state.log.length; i++) {
      if (state.log[i].id === id) { entry = state.log[i]; break; }
    }
    if (!entry || entry.undone) return false;

    var st = getStudent(entry.studentId);
    var newPoints = st ? st.points : 0;
    if (st) {
      var before = st.points || 0;
      if (entry.type === 'add') {
        newPoints = Math.max(0, before - entry.amount);
      } else { // كانت خصمًا، نُعيد النقاط
        newPoints = before + entry.amount;
      }
      st.points = newPoints;
    }
    entry.undone = true;
    entry.undoneAt = Date.now();
    entry.undoneBy = (supervisor || state.supervisor || '').trim();

    if (db) {
      var batch = db.batch();
      if (st) {
        batch.update(db.collection('students').doc(entry.studentId), { points: newPoints });
      }
      batch.update(db.collection('logs').doc(id), {
        undone: true,
        undoneAt: entry.undoneAt,
        undoneBy: entry.undoneBy
      });
      batch.commit().catch(function() {});
    }
    commit();
    return true;
  }

  function clearLog() {
    state.log = [];
    if (db) {
      db.collection('logs').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function() {});
      }).catch(function() {});
    }
    commit();
  }

  // بدء جولة/موسم جديد: تصفير نقاط جميع الطلاب (مع خيار مسح السجل)
  function resetPoints(clearLogToo) {
    state.students.forEach(function (s) { s.points = 0; });
    state.attendance = {}; // تصفير التحضير مع الجولة الجديدة
    if (clearLogToo) state.log = [];

    if (db) {
      db.collection('students').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.update(doc.ref, { points: 0 }); });
        batch.commit().catch(function() {});
      }).catch(function() {});

      db.collection('attendance').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function() {});
      }).catch(function() {});

      if (clearLogToo) {
        db.collection('logs').get().then(function (snap) {
          var batch = db.batch();
          snap.forEach(function (doc) { batch.delete(doc.ref); });
          batch.commit().catch(function() {});
        }).catch(function() {});
      }
    }
    commit();
  }

  /* ---------------- التحضير ---------------- */
  var ATT_LABELS = { early: 'حضور مبكر', present: 'حاضر', absent: 'غائب' };

  function getAttendancePoints() {
    return {
      early: state.attendancePoints.early,
      present: state.attendancePoints.present,
      absent: state.attendancePoints.absent
    };
  }
  function setAttendancePoints(obj) {
    ['early', 'present', 'absent'].forEach(function (k) {
      if (obj && obj[k] != null) {
        var v = parseInt(obj[k], 10);
        if (!isNaN(v)) state.attendancePoints[k] = v;
      }
    });
    if (db) {
      db.collection('settings').doc('config').set({ attendancePoints: state.attendancePoints }, { merge: true }).catch(function() {});
    }
    commit();
  }

  function pointsForStatus(status) {
    if (status === 'early') return state.attendancePoints.early;
    if (status === 'present') return state.attendancePoints.present;
    if (status === 'absent') return state.attendancePoints.absent;
    return 0; // غير محدد
  }

  function getAttendance(date) {
    var day = state.attendance[date];
    return (day && day.records) || {};
  }

  function getStudentAttendance(date, studentId) {
    var day = state.attendance[date];
    var rec = day && day.records && day.records[studentId];
    if (rec && typeof rec === 'object') return rec.status;
    return rec || null;
  }

  function getStudentAttendanceDetails(date, studentId) {
    var day = state.attendance[date];
    return (day && day.records && day.records[studentId]) || null;
  }

  function isAttendanceClosed(date) {
    var day = state.attendance[date];
    var dbStatus = day ? day.status : null;
    if (dbStatus === 'closed') return true;
    if (dbStatus === 'active') return false;

    // الإغلاق التلقائي:
    var today = todayStr();
    if (date < today) return true; // الأيام السابقة تغلق تلقائياً
    if (date === today) {
      var hr = new Date().getHours();
      if (hr >= 21) return true; // بعد الـ 9:00 مساءً يغلق تلقائياً
    }
    return false;
  }

  function closeAttendance(date, supervisor) {
    if (!state.attendance[date]) {
      state.attendance[date] = { records: {}, status: 'active' };
    }
    state.attendance[date].status = 'closed';
    state.attendance[date].closedAt = Date.now();
    state.attendance[date].closedBy = (supervisor || state.supervisor || '').trim();

    if (db) {
      db.collection('attendance').doc(date).set({
        status: 'closed',
        closedAt: state.attendance[date].closedAt,
        closedBy: state.attendance[date].closedBy
      }, { merge: true }).catch(function() {});
    }
    commit();
  }

  // إعادة فتح التحضير
  function reopenAttendance(date) {
    if (!state.attendance[date]) {
      state.attendance[date] = { records: {}, status: 'active' };
    }
    state.attendance[date].status = 'active';
    if (db) {
      db.collection('attendance').doc(date).set({
        status: 'active'
      }, { merge: true }).catch(function() {});
    }
    commit();
  }

  // تحديد حالة تحضير لطالب في تاريخ معيّن (يعدّل النقاط دون تكرار)
  // status: 'early' | 'present' | 'absent' | 'none' (لإلغاء التحديد)
  function setAttendance(date, studentId, status, supervisor) {
    if (isAttendanceClosed(date)) {
      throw new Error('التحضير مغلق لهذا اليوم ولا يمكن تعديله');
    }
    var st = getStudent(studentId);
    if (!st) return;
    
    if (!state.attendance[date]) {
      state.attendance[date] = { records: {}, status: 'active' };
    }
    var records = state.attendance[date].records;
    var prevRec = records[studentId] || null;
    var prev = (prevRec && typeof prevRec === 'object') ? prevRec.status : prevRec;
    if (prev === status) return; // لا تغيير

    var oldPts = prev ? pointsForStatus(prev) : 0;
    var newPts = (status && status !== 'none') ? pointsForStatus(status) : 0;
    var delta = newPts - oldPts;

    if (delta !== 0) {
      st.points = Math.max(0, (st.points || 0) + delta);
    }

    if (status === 'none' || !status) {
      delete records[studentId];
    } else {
      records[studentId] = {
        status: status,
        by: (supervisor || state.supervisor || '').trim(),
        at: Date.now()
      };
    }

    var logEntry = null;
    // تسجيل تغيير التحضير في السجل (للمراجعة) إن تغيّرت النقاط
    if (delta !== 0) {
      var grp = getGroup(st.groupId);
      logEntry = {
        id: uid(),
        studentId: st.id,
        studentName: st.name,
        groupId: st.groupId,
        groupName: grp ? grp.name : '',
        amount: Math.abs(delta),
        requested: Math.abs(delta),
        type: delta >= 0 ? 'add' : 'subtract',
        reason: 'تحضير (' + date + '): ' + (ATT_LABELS[status] || 'إلغاء'),
        supervisor: (supervisor || state.supervisor || '').trim(),
        timestamp: Date.now(),
        kind: 'attendance'
      };
      state.log.unshift(logEntry);
    }

    if (db) {
      var batch = db.batch();
      if (delta !== 0) {
        batch.update(db.collection('students').doc(studentId), { points: st.points });
      }
      batch.set(db.collection('attendance').doc(date), { 
        records: records,
        status: state.attendance[date].status || 'active'
      }, { merge: true });
      if (logEntry) {
        batch.set(db.collection('logs').doc(logEntry.id), logEntry);
      }
      batch.commit().catch(function() {});
    }
    commit();
  }

  // ملخّص يوم: أعداد كل حالة + إجمالي نقاط ذلك اليوم
  function getAttendanceSummary(date) {
    var day = state.attendance[date];
    var records = (day && day.records) || {};
    var sum = { early: 0, present: 0, absent: 0, unmarked: 0, points: 0 };
    state.students.forEach(function (s) {
      var rec = records[s.id] || null;
      var status = (rec && typeof rec === 'object') ? rec.status : rec;
      if (status === 'early') { sum.early++; sum.points += pointsForStatus('early'); }
      else if (status === 'present') { sum.present++; sum.points += pointsForStatus('present'); }
      else if (status === 'absent') { sum.absent++; sum.points += pointsForStatus('absent'); }
      else sum.unmarked++;
    });
    return sum;
  }

  function resetAll() {
    state = defaultState();
    if (db) {
      db.collection('settings').doc('config').delete().catch(function() {});
      db.collection('students').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function() {});
      }).catch(function() {});
      db.collection('logs').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function() {});
      }).catch(function() {});
      db.collection('attendance').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function() {});
      }).catch(function() {});
    }
    commit();
  }

  // استيراد/تصدير نسخة احتياطية
  function exportData() { return JSON.stringify(state, null, 2); }

  function importData(json) {
    state = normalize(JSON.parse(json));
    if (db) {
      db.collection('settings').doc('config').set({
        groups: state.groups,
        attendancePoints: state.attendancePoints,
        supervisor: state.supervisor
      }).catch(function() {});

      state.students.forEach(function(s) {
        db.collection('students').doc(s.id).set(s).catch(function() {});
      });

      state.log.forEach(function(l) {
        db.collection('logs').doc(l.id).set(l).catch(function() {});
      });

      Object.keys(state.attendance).forEach(function(date) {
        var day = state.attendance[date];
        var records = (day && day.records) ? day.records : day;
        db.collection('attendance').doc(date).set({
          records: records,
          status: (day && day.status) || 'active'
        }).catch(function() {});
      });
    }
    commit();
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  global.Store = {
    getState: getState,
    getGroups: getGroups,
    getGroup: getGroup,
    getStudents: getStudents,
    getStudent: getStudent,
    getGroupPoints: getGroupPoints,
    getGroupSummaries: getGroupSummaries,
    getLog: getLog,
    getSupervisor: getSupervisor,
    setSupervisor: setSupervisor,
    setGroupGoal: setGroupGoal,
    addStudent: addStudent,
    addStudents: addStudents,
    updateStudent: updateStudent,
    deleteStudent: deleteStudent,
    applyPoints: applyPoints,
    getLastActiveEntry: getLastActiveEntry,
    undoEntry: undoEntry,
    getAttendancePoints: getAttendancePoints,
    setAttendancePoints: setAttendancePoints,
    getAttendance: getAttendance,
    getStudentAttendance: getStudentAttendance,
    getStudentAttendanceDetails: getStudentAttendanceDetails,
    isAttendanceClosed: isAttendanceClosed,
    closeAttendance: closeAttendance,
    reopenAttendance: reopenAttendance,
    setAttendance: setAttendance,
    getAttendanceSummary: getAttendanceSummary,
    clearLog: clearLog,
    resetPoints: resetPoints,
    resetAll: resetAll,
    exportData: exportData,
    importData: importData,
    subscribe: subscribe
  };
})(window);
