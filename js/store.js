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

  var OWNER_NAME = "أحمد الذبياني";
  var DEFAULT_TEACHERS = {
    "حاتم الحارثي": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } },
    "أحمد الذبياني": { password: "1234", role: "owner", stage: "all", active: true, permissions: { adminPanel: true, manageStudents: true, attendance: true, closeAttendance: true, viewDisplays: true, managePlatform: true, viewReports: true } },
    "سليمان جهاد": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } },
    "أمجد العماري": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } },
    "عمار الصبحي": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } },
    "عمر فتني": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } },
    "عبدالعزيز باحيدرة": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } },
    "محمد باغزوزة": { password: "1234", role: "teacher", stage: "middle", active: true, permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true } }
  };

  function copyTeachers() {
    var obj = {};
    for (var k in DEFAULT_TEACHERS) {
      if (DEFAULT_TEACHERS.hasOwnProperty(k)) {
        var t = DEFAULT_TEACHERS[k];
        obj[k] = {
          password: t.password,
          role: t.role,
          stage: t.stage,
          active: t.active,
          permissions: {
            adminPanel: t.permissions.adminPanel,
            manageStudents: t.permissions.manageStudents,
            attendance: t.permissions.attendance,
            closeAttendance: !!t.permissions.closeAttendance,
            viewDisplays: t.permissions.viewDisplays !== false,
            managePlatform: !!t.permissions.managePlatform,
            viewReports: !!t.permissions.viewReports
          }
        };
      }
    }
    return obj;
  }

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
      fastReasons: ['المشاركة', 'التفاعل', 'لغز المبكرين', 'التميز', 'الأذان والإقامة'],
      attendance: {},
      highStudents: [],
      highAttendance: {},
      teachers: copyTeachers()
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
      if (parsed.fastReasons && Array.isArray(parsed.fastReasons)) {
        s.fastReasons = parsed.fastReasons;
      }
      if (parsed.attendance && typeof parsed.attendance === 'object') s.attendance = parsed.attendance;
      if (Array.isArray(parsed.highStudents)) s.highStudents = parsed.highStudents;
      if (parsed.highAttendance && typeof parsed.highAttendance === 'object') s.highAttendance = parsed.highAttendance;
      if (parsed.teachers && typeof parsed.teachers === 'object') {
        for (var k in parsed.teachers) {
          if (parsed.teachers.hasOwnProperty(k)) {
            var rawT = parsed.teachers[k];
            if (typeof rawT === 'string') {
              s.teachers[k] = {
                password: rawT,
                role: k === OWNER_NAME ? 'owner' : 'teacher',
                stage: k === OWNER_NAME ? 'all' : 'middle',
                active: true,
                permissions: {
                  adminPanel: k === OWNER_NAME,
                  manageStudents: k === OWNER_NAME,
                  attendance: true,
                  closeAttendance: k === OWNER_NAME,
                  viewDisplays: true,
                  managePlatform: k === OWNER_NAME,
                  viewReports: k === OWNER_NAME
                }
              };
            } else if (rawT && typeof rawT === 'object') {
              s.teachers[k] = {
                password: typeof rawT.password === 'string' ? rawT.password : '1234',
                role: k === OWNER_NAME ? 'owner' : (rawT.role || 'teacher'),
                stage: k === OWNER_NAME ? 'all' : (rawT.stage || 'middle'),
                active: k === OWNER_NAME ? true : rawT.active !== false,
                permissions: {
                  adminPanel: !!(rawT.permissions && rawT.permissions.adminPanel),
                  manageStudents: !!(rawT.permissions && rawT.permissions.manageStudents),
                  attendance: rawT.permissions ? !!rawT.permissions.attendance : true,
                  closeAttendance: rawT.permissions ? !!rawT.permissions.closeAttendance : (k === OWNER_NAME),
                  viewDisplays: rawT.permissions ? rawT.permissions.viewDisplays !== false : true,
                  managePlatform: k === OWNER_NAME || !!(rawT.permissions && rawT.permissions.managePlatform),
                  viewReports: k === OWNER_NAME || !!(rawT.permissions && rawT.permissions.viewReports)
                }
              };
            }
          }
        }
      }
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
        if (data.fastReasons) state.fastReasons = data.fastReasons;
        if (data.teachers && typeof data.teachers === 'object') state.teachers = data.teachers;
        persist();
        emit(false);
        applyingRemote = false;
      } else {
        db.collection('settings').doc('config').set({
          groups: state.groups,
          attendancePoints: state.attendancePoints,
          fastReasons: state.fastReasons,
          teachers: state.teachers
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

    // 5. طلاب المرحلة الثانوية
    db.collection('stages').doc('high').collection('students').onSnapshot(function (snap) {
      applyingRemote = true;
      var highStudents = [];
      snap.forEach(function (doc) {
        var student = doc.data();
        student.id = doc.id;
        highStudents.push(student);
      });
      state.highStudents = highStudents;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (طلاب الثانوية):', err && err.message);
    });

    // 6. التحضير اليومي للمرحلة الثانوية
    db.collection('stages').doc('high').collection('attendance').onSnapshot(function (snap) {
      applyingRemote = true;
      var highAttendance = {};
      snap.forEach(function (doc) {
        var data = doc.data();
        highAttendance[doc.id] = {
          records: data.records || {},
          summary: data.summary || null,
          status: data.status || 'active',
          closedAt: data.closedAt || null,
          closedBy: data.closedBy || null
        };
      });
      state.highAttendance = highAttendance;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (تحضير الثانوية):', err && err.message);
    });
  }

  function commit() {
    persist();      // فوري محليًا
    emit(true);     // تحديث لحظي للشاشات على نفس الجهاز
  }

  /* ---------------- واجهة القراءة ---------------- */

  function getState() { return state; }

  function getGroups() {
    var list = [{ id: 'nogroup', name: 'بدون مجموعة', goal: 100 }];
    return list.concat(state.groups);
  }

  function getGroup(id) {
    if (id === 'nogroup') return { id: 'nogroup', name: 'بدون مجموعة', goal: 100 };
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

  function getSupervisor() {
    return getLoggedInTeacher() || state.supervisor || '';
  }

  /* ---------------- واجهة الكتابة ---------------- */

  function setSupervisor(name) {
    var cleanName = (name || '').trim();
    state.supervisor = cleanName;
    try {
      if (cleanName) {
        global.localStorage.setItem('logged_in_teacher', cleanName);
      } else {
        global.localStorage.removeItem('logged_in_teacher');
      }
    } catch (e) {}
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
      highStudentsCollection().get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function () {});
      }).catch(function () {});
      highAttendanceCollection().get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function () {});
      }).catch(function () {});

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

    var oldPts = 0;
    if (prev) {
      state.log.forEach(function (l) {
        if (l.studentId === studentId && l.kind === 'attendance' && l.reason.indexOf(date) !== -1) {
          var amt = parseInt(l.amount || 0, 10);
          if (l.type === 'add') oldPts += amt;
          if (l.type === 'subtract') oldPts -= amt;
        }
      });
    }
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
        reason: 'تحضير (' + date + '): ' + (ATT_LABELS[status] || 'إلغاء') + (prev && prev !== 'none' && prev !== status ? ' (تعديل من ' + (ATT_LABELS[prev] || prev) + ')' : ''),
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

  function setBulkAttendance(date, studentIds, status, supervisor) {
    if (isAttendanceClosed(date)) {
      throw new Error('التحضير مغلق لهذا اليوم ولا يمكن تعديله');
    }
    if (!state.attendance[date]) {
      state.attendance[date] = { records: {}, status: 'active' };
    }
    var records = state.attendance[date].records;
    var batch = db ? db.batch() : null;
    var hasChanges = false;

    studentIds.forEach(function (studentId) {
      var st = getStudent(studentId);
      if (!st) return;

      var prevRec = records[studentId] || null;
      var prev = (prevRec && typeof prevRec === 'object') ? prevRec.status : prevRec;
      if (prev === status) return; // لا تغيير

       var oldPts = 0;
       if (prev) {
         state.log.forEach(function (l) {
           if (l.studentId === studentId && l.kind === 'attendance' && l.reason.indexOf(date) !== -1) {
             var amt = parseInt(l.amount || 0, 10);
             if (l.type === 'add') oldPts += amt;
             if (l.type === 'subtract') oldPts -= amt;
           }
         });
       }
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
          reason: 'تحضير جماعي (' + date + '): ' + (ATT_LABELS[status] || 'إلغاء') + (prev && prev !== 'none' && prev !== status ? ' (تعديل من ' + (ATT_LABELS[prev] || prev) + ')' : ''),
          supervisor: (supervisor || state.supervisor || '').trim(),
          timestamp: Date.now(),
          kind: 'attendance'
        };
        state.log.unshift(logEntry);
      }

      hasChanges = true;

      if (batch) {
        if (delta !== 0) {
          batch.update(db.collection('students').doc(studentId), { points: st.points });
        }
        if (logEntry) {
          batch.set(db.collection('logs').doc(logEntry.id), logEntry);
        }
      }
    });

    if (hasChanges) {
      if (batch) {
        batch.set(db.collection('attendance').doc(date), { 
          records: records,
          status: state.attendance[date].status || 'active'
        }, { merge: true });
        batch.commit().catch(function(e) {
          if (window.console) console.error("Bulk commit error: ", e);
        });
      }
      commit();
    }
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

  /* ---------------- المرحلة الثانوية: الطلاب والتحضير بلا نقاط ---------------- */

  function highStudentsCollection() {
    return db ? db.collection('stages').doc('high').collection('students') : null;
  }

  function highAttendanceCollection() {
    return db ? db.collection('stages').doc('high').collection('attendance') : null;
  }

  function getHighStudents() {
    return state.highStudents.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
  }

  function getHighStudent(id) {
    for (var i = 0; i < state.highStudents.length; i++) {
      if (state.highStudents[i].id === id) return state.highStudents[i];
    }
    return null;
  }

  function requireHighStudentManager() {
    if (!hasPermission('manageStudents')) {
      throw new Error('لا تملك صلاحية إدارة طلاب الثانوية');
    }
  }

  function requireHighAttendanceAccess() {
    if (!belongsToStage('high') || !hasPermission('attendance')) {
      throw new Error('لا تملك صلاحية تحضير المرحلة الثانوية');
    }
  }

  function addHighStudent(name) {
    requireHighStudentManager();
    name = String(name || '').trim();
    if (!name) throw new Error('اسم الطالب مطلوب');
    var duplicate = state.highStudents.some(function (student) {
      return String(student.name || '').trim().toLowerCase() === name.toLowerCase();
    });
    if (duplicate) throw new Error('الطالب موجود مسبقًا');

    var student = { id: uid(), name: name, active: true, createdAt: Date.now() };
    state.highStudents.push(student);
    var collection = highStudentsCollection();
    if (collection) collection.doc(student.id).set(student).catch(function () {});
    commit();
    return student.id;
  }

  function addHighStudents(names) {
    requireHighStudentManager();
    if (!Array.isArray(names)) return 0;
    var existing = {};
    state.highStudents.forEach(function (student) {
      existing[String(student.name || '').trim().toLowerCase()] = true;
    });
    var added = [];
    names.forEach(function (rawName) {
      var name = String(rawName || '').trim();
      var key = name.toLowerCase();
      if (!name || existing[key]) return;
      existing[key] = true;
      added.push({ id: uid(), name: name, active: true, createdAt: Date.now() });
    });
    if (!added.length) return 0;

    Array.prototype.push.apply(state.highStudents, added);
    var collection = highStudentsCollection();
    if (collection) {
      var batch = db.batch();
      added.forEach(function (student) { batch.set(collection.doc(student.id), student); });
      batch.commit().catch(function () {});
    }
    commit();
    return added.length;
  }

  function updateHighStudent(id, data) {
    requireHighStudentManager();
    var student = getHighStudent(id);
    if (!student) throw new Error('الطالب غير موجود');
    data = data || {};
    var name = String(data.name || student.name || '').trim();
    if (!name) throw new Error('اسم الطالب مطلوب');
    student.name = name;
    if (typeof data.active === 'boolean') student.active = data.active;
    student.updatedAt = Date.now();
    var collection = highStudentsCollection();
    if (collection) collection.doc(id).set(student, { merge: true }).catch(function () {});
    commit();
  }

  function deleteHighStudent(id) {
    requireHighStudentManager();
    var index = -1;
    for (var i = 0; i < state.highStudents.length; i++) {
      if (state.highStudents[i].id === id) { index = i; break; }
    }
    if (index === -1) throw new Error('الطالب غير موجود');
    state.highStudents.splice(index, 1);
    var collection = highStudentsCollection();
    if (collection) collection.doc(id).delete().catch(function () {});
    commit();
  }

  function getHighAttendance(date) {
    var day = state.highAttendance[date];
    return day || { records: {}, status: 'active', summary: computeHighAttendanceSummary({}) };
  }

  function getHighStudentAttendance(date, studentId) {
    var day = state.highAttendance[date];
    return (day && day.records && day.records[studentId]) || null;
  }

  function computeHighAttendanceSummary(records) {
    records = records || {};
    var summary = {
      total: 0,
      early: 0,
      present: 0,
      absent: 0,
      unmarked: 0
    };
    state.highStudents.forEach(function (student) {
      if (student.active === false) return;
      summary.total++;
      var record = records[student.id];
      var status = record && typeof record === 'object' ? record.status : record;
      if (status === 'early') summary.early++;
      else if (status === 'present') summary.present++;
      else if (status === 'absent') summary.absent++;
      else summary.unmarked++;
    });
    return summary;
  }

  function getHighAttendanceSummary(date) {
    var day = state.highAttendance[date];
    return computeHighAttendanceSummary((day && day.records) || {});
  }

  function isHighAttendanceClosed(date) {
    var day = state.highAttendance[date];
    if (day && day.status === 'closed') return true;
    if (day && day.status === 'active') return false;
    return date < todayStr();
  }

  function writeHighAttendanceTransaction(date, changes, supervisor) {
    var collection = highAttendanceCollection();
    if (!collection) return Promise.resolve();
    var ref = collection.doc(date);
    var localDay = state.highAttendance[date];

    return db.runTransaction(function (transaction) {
      return transaction.get(ref).then(function (snapshot) {
        var remote = snapshot.exists ? snapshot.data() : {};
        if (remote.status === 'closed') throw new Error('التحضير مغلق لهذا اليوم');
        var records = Object.assign({}, remote.records || {});
        Object.keys(changes).forEach(function (studentId) {
          var status = changes[studentId];
          if (!status || status === 'none') delete records[studentId];
          else {
            records[studentId] = {
              status: status,
              by: (supervisor || getSupervisor() || '').trim(),
              at: Date.now()
            };
          }
        });
        transaction.set(ref, {
          records: records,
          summary: computeHighAttendanceSummary(records),
          status: remote.status || 'active',
          updatedAt: Date.now()
        }, { merge: true });
      });
    }).catch(function (error) {
      if (error && /مغلق/.test(error.message || '')) throw error;
      var offlineError = !error || !error.code ||
        error.code === 'unavailable' || error.code === 'deadline-exceeded' || error.code === 'failed-precondition';
      if (!offlineError) throw error;
      // عند انقطاع الاتصال تحفظ نسخة اليوم محليًا وتُرسل ككتابة عادية عند عودة الشبكة.
      if (localDay) {
        return ref.set({
          records: localDay.records,
          summary: localDay.summary,
          status: localDay.status || 'active',
          updatedAt: Date.now()
        }, { merge: true });
      }
      throw error;
    });
  }

  function setHighAttendance(date, studentId, status, supervisor) {
    requireHighAttendanceAccess();
    if (isHighAttendanceClosed(date)) throw new Error('تحضير الثانوية مغلق لهذا اليوم');
    if (!getHighStudent(studentId)) throw new Error('الطالب غير موجود');
    if (!state.highAttendance[date]) state.highAttendance[date] = { records: {}, status: 'active' };
    var records = state.highAttendance[date].records;
    if (!status || status === 'none') delete records[studentId];
    else {
      records[studentId] = {
        status: status,
        by: (supervisor || getSupervisor() || '').trim(),
        at: Date.now()
      };
    }
    state.highAttendance[date].summary = computeHighAttendanceSummary(records);
    commit();
    var changes = {};
    changes[studentId] = status;
    return writeHighAttendanceTransaction(date, changes, supervisor);
  }

  function setBulkHighAttendance(date, studentIds, status, supervisor) {
    requireHighAttendanceAccess();
    if (isHighAttendanceClosed(date)) throw new Error('تحضير الثانوية مغلق لهذا اليوم');
    if (!Array.isArray(studentIds) || !studentIds.length) throw new Error('حدد طالبًا واحدًا على الأقل');
    if (!state.highAttendance[date]) state.highAttendance[date] = { records: {}, status: 'active' };
    var records = state.highAttendance[date].records;
    var changes = {};
    studentIds.forEach(function (studentId) {
      if (!getHighStudent(studentId)) return;
      changes[studentId] = status;
      if (!status || status === 'none') delete records[studentId];
      else {
        records[studentId] = {
          status: status,
          by: (supervisor || getSupervisor() || '').trim(),
          at: Date.now()
        };
      }
    });
    state.highAttendance[date].summary = computeHighAttendanceSummary(records);
    commit();
    return writeHighAttendanceTransaction(date, changes, supervisor);
  }

  function closeHighAttendance(date, supervisor) {
    if (!hasPermission('closeAttendance') || !belongsToStage('high')) {
      throw new Error('لا تملك صلاحية إغلاق تحضير الثانوية');
    }
    if (!state.highAttendance[date]) state.highAttendance[date] = { records: {}, status: 'active' };
    var day = state.highAttendance[date];
    day.status = 'closed';
    day.closedAt = Date.now();
    day.closedBy = (supervisor || getSupervisor() || '').trim();
    day.summary = computeHighAttendanceSummary(day.records);
    var collection = highAttendanceCollection();
    if (collection) {
      collection.doc(date).set({
        status: 'closed',
        closedAt: day.closedAt,
        closedBy: day.closedBy,
        summary: day.summary
      }, { merge: true }).catch(function () {});
    }
    commit();
  }

  function reopenHighAttendance(date) {
    if (!hasPermission('closeAttendance') || !belongsToStage('high')) {
      throw new Error('لا تملك صلاحية إعادة فتح تحضير الثانوية');
    }
    if (!state.highAttendance[date]) state.highAttendance[date] = { records: {}, status: 'active' };
    state.highAttendance[date].status = 'active';
    var collection = highAttendanceCollection();
    if (collection) collection.doc(date).set({ status: 'active' }, { merge: true }).catch(function () {});
    commit();
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
        attendancePoints: state.attendancePoints
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

      state.highStudents.forEach(function (student) {
        highStudentsCollection().doc(student.id).set(student).catch(function () {});
      });

      Object.keys(state.highAttendance).forEach(function (date) {
        var day = state.highAttendance[date];
        highAttendanceCollection().doc(date).set({
          records: day.records || {},
          summary: day.summary || computeHighAttendanceSummary(day.records || {}),
          status: day.status || 'active',
          closedAt: day.closedAt || null,
          closedBy: day.closedBy || null
        }).catch(function () {});
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

  function isLoggedIn() {
    try {
      var name = global.localStorage.getItem('logged_in_teacher');
      if (!name || !state.teachers.hasOwnProperty(name)) return false;
      var teacher = state.teachers[name];
      return name === OWNER_NAME || !teacher || typeof teacher === 'string' || teacher.active !== false;
    } catch (e) {
      return false;
    }
  }

  function getLoggedInTeacher() {
    try {
      return global.localStorage.getItem('logged_in_teacher') || '';
    } catch (e) {
      return '';
    }
  }

  function getTeachers() {
    var obj = {};
    for (var k in state.teachers) {
      if (state.teachers.hasOwnProperty(k)) obj[k] = state.teachers[k];
    }
    return obj;
  }

  function persistTeachers() {
    if (db) {
      db.collection('settings').doc('config').set({ teachers: state.teachers }, { merge: true }).catch(function () {});
    }
    commit();
  }

  function requireOwnerAccess() {
    if (getLoggedInTeacher() !== OWNER_NAME) {
      throw new Error('هذه العملية متاحة لمالك المنصة فقط');
    }
  }

  function defaultPermissions(role, stage) {
    if (role === 'admin') {
      return {
        adminPanel: true,
        manageStudents: true,
        attendance: true,
        closeAttendance: true,
        viewDisplays: true,
        managePlatform: false,
        viewReports: true
      };
    }
    return {
      adminPanel: false,
      manageStudents: false,
      attendance: stage !== 'all',
      closeAttendance: false,
      viewDisplays: stage !== 'high',
      managePlatform: false,
      viewReports: false
    };
  }

  function addTeacherAccount(data) {
    requireOwnerAccess();
    data = data || {};
    var name = String(data.name || '').trim();
    var password = String(data.password || '').trim();
    var role = data.role === 'admin' ? 'admin' : 'teacher';
    var stage = data.stage === 'high' || data.stage === 'all' ? data.stage : 'middle';
    if (!name) throw new Error('اسم الحساب مطلوب');
    if (!password) throw new Error('كلمة المرور مطلوبة');
    if (state.teachers.hasOwnProperty(name)) throw new Error('يوجد حساب بهذا الاسم');

    state.teachers[name] = {
      password: password,
      role: role,
      stage: role === 'admin' && stage === 'middle' ? 'middle' : stage,
      active: data.active !== false,
      permissions: Object.assign(defaultPermissions(role, stage), data.permissions || {})
    };
    persistTeachers();
    return name;
  }

  function updateTeacherAccount(originalName, data) {
    requireOwnerAccess();
    originalName = String(originalName || '').trim();
    data = data || {};
    if (!state.teachers.hasOwnProperty(originalName)) throw new Error('الحساب غير موجود');

    var current = state.teachers[originalName];
    if (typeof current === 'string') {
      current = {
        password: current,
        role: originalName === OWNER_NAME ? 'owner' : 'teacher',
        stage: originalName === OWNER_NAME ? 'all' : 'middle',
        active: true,
        permissions: defaultPermissions(originalName === OWNER_NAME ? 'admin' : 'teacher', originalName === OWNER_NAME ? 'all' : 'middle')
      };
    }

    if (originalName === OWNER_NAME) {
      if (String(data.password || '').trim()) current.password = String(data.password).trim();
      current.role = 'owner';
      current.stage = 'all';
      current.active = true;
      current.permissions = {
        adminPanel: true,
        manageStudents: true,
        attendance: true,
        closeAttendance: true,
        viewDisplays: true,
        managePlatform: true,
        viewReports: true
      };
      state.teachers[OWNER_NAME] = current;
      persistTeachers();
      return OWNER_NAME;
    }

    var newName = String(data.name || originalName).trim();
    if (!newName) throw new Error('اسم الحساب مطلوب');
    if (newName !== originalName && state.teachers.hasOwnProperty(newName)) throw new Error('يوجد حساب بهذا الاسم');

    var role = data.role === 'admin' ? 'admin' : 'teacher';
    var stage = data.stage === 'high' || data.stage === 'all' ? data.stage : 'middle';
    var updated = {
      password: String(data.password || '').trim() || current.password || '1234',
      role: role,
      stage: stage,
      active: data.active !== false,
      permissions: Object.assign(defaultPermissions(role, stage), current.permissions || {}, data.permissions || {})
    };
    updated.permissions.managePlatform = false;

    if (newName !== originalName) delete state.teachers[originalName];
    state.teachers[newName] = updated;
    persistTeachers();
    return newName;
  }

  function deleteTeacherAccount(name) {
    requireOwnerAccess();
    name = String(name || '').trim();
    if (name === OWNER_NAME) throw new Error('لا يمكن حذف حساب مالك المنصة');
    if (!state.teachers.hasOwnProperty(name)) throw new Error('الحساب غير موجود');
    if (name === getLoggedInTeacher()) throw new Error('لا يمكن حذف الحساب المستخدم حاليًا');
    delete state.teachers[name];
    persistTeachers();
  }

  function getCurrentUser() {
    var name = getLoggedInTeacher();
    if (!name || !state.teachers.hasOwnProperty(name)) return null;
    var raw = state.teachers[name];
    if (typeof raw === 'string') {
      return {
        name: name,
        role: name === OWNER_NAME ? 'owner' : 'teacher',
        stage: name === OWNER_NAME ? 'all' : 'middle',
        active: true,
        permissions: {
          adminPanel: name === OWNER_NAME,
          manageStudents: name === OWNER_NAME,
          attendance: true,
          closeAttendance: name === OWNER_NAME,
          viewDisplays: true,
          managePlatform: name === OWNER_NAME,
          viewReports: name === OWNER_NAME
        }
      };
    }
    return {
      name: name,
      role: name === OWNER_NAME ? 'owner' : (raw.role || 'teacher'),
      stage: name === OWNER_NAME ? 'all' : (raw.stage || 'middle'),
      active: name === OWNER_NAME ? true : raw.active !== false,
      permissions: raw.permissions || {}
    };
  }

  function setTeacherPassword(name, password) {
    requireOwnerAccess();
    password = (password || '').trim();
    if (!password) throw new Error('كلمة المرور مطلوبة');
    if (!state.teachers.hasOwnProperty(name)) throw new Error('المعلم غير موجود');
    if (typeof state.teachers[name] === 'string') {
      state.teachers[name] = {
        password: password,
        role: name === OWNER_NAME ? 'owner' : 'teacher',
        stage: name === OWNER_NAME ? 'all' : 'middle',
        active: true,
        permissions: { adminPanel: name === OWNER_NAME, manageStudents: name === OWNER_NAME, attendance: true, closeAttendance: name === OWNER_NAME, viewDisplays: true, managePlatform: name === OWNER_NAME, viewReports: name === OWNER_NAME }
      };
    } else {
      state.teachers[name].password = password;
    }
    if (db) {
      db.collection('settings').doc('config').set({ teachers: state.teachers }, { merge: true }).catch(function() {});
    }
    commit();
  }

  function login(name, password) {
    name = (name || '').trim();
    password = (password || '').trim();
    if (!state.teachers.hasOwnProperty(name)) return false;
    var t = state.teachers[name];
    if (name !== OWNER_NAME && t && typeof t === 'object' && t.active === false) return false;
    var actualPass = typeof t === 'string' ? t : (t.password || '1234');
    if (actualPass === password) {
      try {
        global.localStorage.setItem('logged_in_teacher', name);
      } catch (e) {}
      setSupervisor(name);
      return true;
    }
    return false;
  }

  function logout() {
    try {
      global.localStorage.removeItem('logged_in_teacher');
    } catch (e) {}
    setSupervisor('');
  }

  function isAdmin() {
    var user = getCurrentUser();
    return !!user && (user.role === 'owner' || user.role === 'admin');
  }

  function hasPermission(permissionKey) {
    var user = getCurrentUser();
    if (!user || !user.active) return false;
    if (user.role === 'owner') return true;
    if (user.permissions) return !!user.permissions[permissionKey];
    return permissionKey === 'attendance';
  }

  function hasRole(role) {
    var user = getCurrentUser();
    return !!user && user.active && (user.role === 'owner' || user.role === role);
  }

  function belongsToStage(stage) {
    var user = getCurrentUser();
    return !!user && user.active && (user.stage === 'all' || user.stage === stage);
  }

  function setTeacherPermission(name, permissionKey, value) {
    requireOwnerAccess();
    if (!state.teachers.hasOwnProperty(name)) throw new Error('المعلم غير موجود');
    if (name === OWNER_NAME) return; // تأمين المالك
    var t = state.teachers[name];
    if (typeof t === 'string') {
      state.teachers[name] = {
        password: t,
        role: 'teacher',
        stage: 'middle',
        active: true,
        permissions: { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true }
      };
    }
    if (!state.teachers[name].permissions) {
      state.teachers[name].permissions = { adminPanel: false, manageStudents: false, attendance: true, closeAttendance: false, viewDisplays: true };
    }
    state.teachers[name].permissions[permissionKey] = !!value;
    if (db) {
      db.collection('settings').doc('config').set({ teachers: state.teachers }, { merge: true }).catch(function() {});
    }
    commit();
  }

  function getFastReasons() {
    return state.fastReasons || ['المشاركة', 'التفاعل', 'لغز المبكرين', 'التميز', 'الأذان والإقامة'];
  }

  function setFastReasons(arr) {
    if (Array.isArray(arr)) {
      state.fastReasons = arr.map(function(x) { return x.trim(); }).filter(Boolean);
      if (db) {
        db.collection('settings').doc('config').set({ fastReasons: state.fastReasons }, { merge: true }).catch(function() {});
      }
      commit();
    }
  }

  global.Store = {
    getFastReasons: getFastReasons,
    setFastReasons: setFastReasons,
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
    setBulkAttendance: setBulkAttendance,
    getAttendanceSummary: getAttendanceSummary,
    getHighStudents: getHighStudents,
    getHighStudent: getHighStudent,
    addHighStudent: addHighStudent,
    addHighStudents: addHighStudents,
    updateHighStudent: updateHighStudent,
    deleteHighStudent: deleteHighStudent,
    getHighAttendance: getHighAttendance,
    getHighStudentAttendance: getHighStudentAttendance,
    getHighAttendanceSummary: getHighAttendanceSummary,
    isHighAttendanceClosed: isHighAttendanceClosed,
    setHighAttendance: setHighAttendance,
    setBulkHighAttendance: setBulkHighAttendance,
    closeHighAttendance: closeHighAttendance,
    reopenHighAttendance: reopenHighAttendance,
    clearLog: clearLog,
    resetPoints: resetPoints,
    resetAll: resetAll,
    exportData: exportData,
    importData: importData,
    subscribe: subscribe,
    isLoggedIn: isLoggedIn,
    getLoggedInTeacher: getLoggedInTeacher,
    getCurrentUser: getCurrentUser,
    getTeachers: getTeachers,
    addTeacherAccount: addTeacherAccount,
    updateTeacherAccount: updateTeacherAccount,
    deleteTeacherAccount: deleteTeacherAccount,
    setTeacherPassword: setTeacherPassword,
    login: login,
    logout: logout,
    isAdmin: isAdmin,
    hasRole: hasRole,
    belongsToStage: belongsToStage,
    hasPermission: hasPermission,
    setTeacherPermission: setTeacherPermission
  };
})(window);

// ============================================================
// نظام حوارات التنبيه والتأكيد المخصصة والزجاجية الفاخرة (Alert & Confirm Modals)
// ============================================================
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('custom-modal-styles')) return;
    var style = document.createElement('style');
    style.id = 'custom-modal-styles';
    style.innerHTML = `
      .custom-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        opacity: 0;
        transition: opacity 0.25s ease;
        padding: 20px;
        font-family: 'Tajawal', sans-serif;
      }
      .custom-modal-overlay.active {
        opacity: 1;
      }
      .custom-modal-card {
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.8);
        border-radius: 24px;
        width: 100%;
        max-width: 400px;
        padding: 24px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.12);
        transform: scale(0.9);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        text-align: center;
        direction: rtl;
      }
      .custom-modal-overlay.active .custom-modal-card {
        transform: scale(1);
      }
      .custom-modal-icon {
        font-size: 40px;
        margin-bottom: 14px;
        display: inline-block;
      }
      .custom-modal-msg {
        font-size: 15px;
        font-weight: 700;
        color: #1e293b;
        line-height: 1.6;
        margin-bottom: 20px;
        white-space: pre-line;
      }
      .custom-modal-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .custom-modal-btn {
        flex: 1;
        padding: 10px 18px;
        border-radius: 12px;
        font-weight: 800;
        font-size: 13.5px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .custom-modal-btn-confirm {
        background: linear-gradient(135deg, #f97316, #ea580c);
        color: white;
        box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);
      }
      .custom-modal-btn-confirm:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(234, 88, 12, 0.35);
      }
      .custom-modal-btn-confirm:active {
        transform: translateY(0);
      }
      .custom-modal-btn-cancel {
        background: rgba(0, 0, 0, 0.05);
        color: #475569;
        border: 1px solid rgba(0, 0, 0, 0.05);
      }
      .custom-modal-btn-cancel:hover {
        background: rgba(0, 0, 0, 0.08);
      }
    `;
    document.head.appendChild(style);
  }

  window.showConfirm = function (message, callback) {
    injectStyles();
    var overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal-card">
        <div class="custom-modal-icon">⚠️</div>
        <div class="custom-modal-msg">${message}</div>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn custom-modal-btn-confirm" id="custom-modal-ok">نعم، متأكد</button>
          <button class="custom-modal-btn custom-modal-btn-cancel" id="custom-modal-cancel">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // تفعيل التأثير البصري للدخول
    setTimeout(function () {
      overlay.classList.add('active');
    }, 10);

    function close(confirmed) {
      overlay.classList.remove('active');
      setTimeout(function () {
        overlay.remove();
        if (callback) callback(confirmed);
      }, 250);
    }

    overlay.querySelector('#custom-modal-ok').onclick = function () { close(true); };
    overlay.querySelector('#custom-modal-cancel').onclick = function () { close(false); };
  };

  window.showAlert = function (message, callback) {
    injectStyles();
    var overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal-card">
        <div class="custom-modal-icon">💡</div>
        <div class="custom-modal-msg">${message}</div>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn custom-modal-btn-confirm" id="custom-modal-ok" style="max-width: 140px; margin: 0 auto;">موافق</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // تفعيل التأثير البصري للدخول
    setTimeout(function () {
      overlay.classList.add('active');
    }, 10);

    function close() {
      overlay.classList.remove('active');
      setTimeout(function () {
        overlay.remove();
        if (callback) callback();
      }, 250);
    }

    overlay.querySelector('#custom-modal-ok').onclick = function () { close(); };
  };
})();
