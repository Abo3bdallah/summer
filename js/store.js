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
  var SCHEMA_VERSION = '2.0';

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
          id: teacherIdFromName(k),
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

  // معرّف ثابت للحساب مشتقّ حتميًا من الاسم — تتفق عليه كل الأجهزة دون كتابة للسحابة.
  // يُستخدم للحسابات الافتراضية والقديمة؛ الحسابات الجديدة تأخذ uid() عشوائيًا محفوظًا.
  function teacherIdFromName(name) {
    var text = String(name || '');
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'u' + (h >>> 0).toString(36);
  }

  // يضمن أن لكل حساب معرّفًا فريدًا. أي حساب بلا معرّف أو بمعرّف مكرّر يأخذ معرّفًا
  // جديدًا فريدًا (uid) — يصلح البيانات التالفة التي فيها حسابات تتشارك نفس المعرّف
  // (وكانت تسبب الدخول بحساب شخص آخر). يضبط ensureTeacherIds.changed عند أي تغيير.
  function ensureTeacherIds(teachers) {
    ensureTeacherIds.changed = false;
    if (!teachers) return teachers;
    var counts = {};
    for (var c in teachers) {
      if (teachers.hasOwnProperty(c) && teachers[c] && typeof teachers[c] === 'object' && teachers[c].id) {
        counts[teachers[c].id] = (counts[teachers[c].id] || 0) + 1;
      }
    }
    var used = {};
    for (var k in teachers) {
      if (!teachers.hasOwnProperty(k)) continue;
      var t = teachers[k];
      if (!t || typeof t !== 'object') continue;
      var id = t.id;
      if (!id || counts[id] > 1 || used[id]) {   // ناقص أو مكرّر → معرّف فريد جديد
        do { id = uid(); } while (used[id]);
        t.id = id;
        ensureTeacherIds.changed = true;
      }
      used[id] = true;
    }
    return teachers;
  }

  // معرّف فريد لا يتعارض مع أي حساب موجود (للحسابات الجديدة)
  function uniqueTeacherId() {
    var used = {};
    for (var k in state.teachers) {
      if (state.teachers.hasOwnProperty(k) && state.teachers[k] && state.teachers[k].id) used[state.teachers[k].id] = true;
    }
    var id = uid();
    while (used[id]) id = uid();
    return id;
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
      // أيام النادي (getDay: الأحد=0 .. السبت=6) — الافتراضي الأحد إلى الأربعاء
      clubDays: [0, 1, 2, 3],
      fastReasons: ['المشاركة', 'التفاعل', 'لغز المبكرين', 'التميز', 'الأذان والإقامة'],
      attendance: {},
      highStudents: [],
      highGroups: [],
      highAttendance: {},
      memos: [],
      auditLogs: [],
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
      if (Array.isArray(parsed.clubDays) && parsed.clubDays.length) {
        s.clubDays = parsed.clubDays.map(Number).filter(function (d) { return d >= 0 && d <= 6; });
        if (!s.clubDays.length) s.clubDays = [0, 1, 2, 3];
      }
      if (parsed.attendance && typeof parsed.attendance === 'object') s.attendance = parsed.attendance;
      if (Array.isArray(parsed.highStudents)) s.highStudents = parsed.highStudents;
      if (Array.isArray(parsed.highGroups)) s.highGroups = parsed.highGroups;
      if (parsed.highAttendance && typeof parsed.highAttendance === 'object') s.highAttendance = parsed.highAttendance;
      if (Array.isArray(parsed.memos)) s.memos = parsed.memos;
      if (Array.isArray(parsed.auditLogs)) s.auditLogs = parsed.auditLogs;
      if (parsed.teachers && typeof parsed.teachers === 'object') {
        // عند وجود قائمة حسابات محفوظة فهي المصدر الكامل للحسابات.
        // لا ندمجها مع DEFAULT_TEACHERS حتى لا تعود الحسابات الافتراضية بعد حذفها.
        s.teachers = {};
        for (var k in parsed.teachers) {
          if (parsed.teachers.hasOwnProperty(k)) {
            var rawT = parsed.teachers[k];
            if (typeof rawT === 'string') {
              s.teachers[k] = {
                id: teacherIdFromName(k),
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
                id: rawT.id || teacherIdFromName(k),
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
        // يبقى حساب المالك متاحًا حتى لو كانت نسخة محلية قديمة أو ناقصة.
        if (!s.teachers.hasOwnProperty(OWNER_NAME)) {
          s.teachers[OWNER_NAME] = copyTeachers()[OWNER_NAME];
        }
      }
    }
    // ترحيل: فرض الأسماء الجديدة حسب المعرّف مع الحفاظ على الأهداف
    s.groups.forEach(function (g) { if (CANON_NAMES[g.id]) g.name = CANON_NAMES[g.id]; });
    ensureTeacherIds(s.teachers);
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
        if (Array.isArray(data.highGroups)) state.highGroups = data.highGroups;
        if (Array.isArray(data.clubDays) && data.clubDays.length) state.clubDays = data.clubDays;
        if (data.teachers && typeof data.teachers === 'object') {
          state.teachers = ensureTeacherIds(data.teachers);
          // إن أصلحنا معرّفات مكرّرة/ناقصة، احفظ الإصلاح على الخادم (مرة واحدة، بلا حلقة)
          if (ensureTeacherIds.changed) {
            db.collection('settings').doc('config').set({ teachers: state.teachers }, { merge: true }).catch(function () {});
          }
        }
        persist();
        emit(false);
        applyingRemote = false;
      } else {
        db.collection('settings').doc('config').set({
          groups: state.groups,
          attendancePoints: state.attendancePoints,
          fastReasons: state.fastReasons,
          teachers: state.teachers,
          highGroups: state.highGroups,
          clubDays: state.clubDays
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
        // تجاهل وثائق ناقصة بلا اسم (قد تنشأ من set+merge لنقاط طالب حُذف بالتزامن)
        if (!s || typeof s.name !== 'string' || !s.name) return;
        s.id = doc.id;
        students.push(s);
      });
      // نعيد تطبيق دلتا النقاط المعلّقة حتى لا «تختفي» النقاط أثناء معاملة جارية
      state.students = applyPointsOverlay(students);
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
      // نعيد تطبيق النيّات المعلّقة حتى لا تختفي علامات لم يؤكدها الخادم بعد
      state.attendance = applyAttendanceOverlay(pendingMiddle, attendance, function () {
        return { records: {}, status: 'active', closedAt: null, closedBy: null };
      });
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
      // نعيد تطبيق النيّات المعلّقة للثانوية فوق لقطة الخادم
      state.highAttendance = applyAttendanceOverlay(pendingHigh, highAttendance, function () {
        return { records: {}, summary: null, status: 'active', closedAt: null, closedBy: null };
      });
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (تحضير الثانوية):', err && err.message);
    });

    // 7. التوجيهات الإدارية
    db.collection('memos').orderBy('createdAt', 'desc').limit(50).onSnapshot(function (snap) {
      applyingRemote = true;
      var memos = [];
      snap.forEach(function (doc) {
        var memo = doc.data();
        memo.id = doc.id;
        memos.push(memo);
      });
      state.memos = memos;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (التوجيهات):', err && err.message);
    });

    // 8. سجل العمليات الإدارية الحساسة
    db.collection('auditLogs').orderBy('at', 'desc').limit(200).onSnapshot(function (snap) {
      applyingRemote = true;
      var auditLogs = [];
      snap.forEach(function (doc) {
        var entry = doc.data();
        entry.id = doc.id;
        auditLogs.push(entry);
      });
      state.auditLogs = auditLogs;
      persist();
      emit(false);
      applyingRemote = false;
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase (سجل الإدارة):', err && err.message);
    });
  }

  // أدوات Firestore الذرّية (تُستدعى فقط داخل if (db)، وdb يعني أن firebase محمّل)
  function fsIncrement(n) { return global.firebase.firestore.FieldValue.increment(n); }
  function fsDelete() { return global.firebase.firestore.FieldValue.delete(); }

  function commit() {
    persist();      // فوري محليًا
    emit(true);     // تحديث لحظي للشاشات على نفس الجهاز
  }

  /* ============================================================
     موثوقية الحفظ — طبقة «الكتابات المعلّقة» + إشعار فشل الحفظ
     - المشكلة الجذرية: لقطات المزامنة تستبدل الحالة كاملةً، بينما كتابات
       المعاملات (runTransaction) لا تظهر محليًا إلا بعد تأكيد الخادم.
       فأي لقطة تصل أثناء معاملة معلّقة كانت «تدهس» العلامة تفاؤليًا،
       فتختفي من الشاشة، وقد كان الاحتياطي القديم يحوّل الدهس إلى حذف حقيقي.
     - الحل: نحفظ «نيّة» كل كتابة معلّقة في خريطة جانبية ونعيد تطبيقها فوق
       كل لقطة حتى تستقر على الخادم، ونكتب الاحتياطي من النيّة نفسها
       (increment للدلتا، لا قيم مطلقة؛ ولا حذف إلا بنيّة إلغاء).
     ============================================================ */
  var pendingMiddle = {};   // { date: { studentId: { rec, prevRec, delta, newPts, target, token } } }
  var pendingHigh = {};     // { date: { studentId: { rec, prevRec, target, token } } }
  var pendingSeq = 0;
  var middleWriteChain = {}; // سَلسَلة كتابات كل تاريخ: تمنع تسابق الضغطات المتتالية من نفس الجهاز
  var highWriteChain = {};
  var saveErrorListeners = [];

  function onSaveError(fn) {
    saveErrorListeners.push(fn);
    return function () { saveErrorListeners = saveErrorListeners.filter(function (f) { return f !== fn; }); };
  }
  function notifySaveError(message) {
    for (var i = 0; i < saveErrorListeners.length; i++) {
      try { saveErrorListeners[i](message); } catch (e) {}
    }
    if (global.console) console.warn('تنبيه حفظ:', message);
  }

  function setPendingIntent(map, date, intent) {
    if (!map[date]) map[date] = {};
    intent.token = ++pendingSeq;
    map[date][intent.studentId] = intent;
  }
  function clearPendingIntent(map, date, intent) {
    var d = map[date];
    if (d && d[intent.studentId] && d[intent.studentId].token === intent.token) {
      delete d[intent.studentId];
      if (!Object.keys(d).length) delete map[date];
    }
  }
  // إعادة تطبيق النيّات المعلّقة فوق خريطة تحضير قادمة من الخادم
  function applyAttendanceOverlay(map, target, makeDay) {
    Object.keys(map).forEach(function (date) {
      if (!target[date]) target[date] = makeDay();
      var recs = target[date].records;
      Object.keys(map[date]).forEach(function (sid) {
        var p = map[date][sid];
        if (p.rec) recs[sid] = p.rec; else delete recs[sid];
      });
    });
    return target;
  }
  // إعادة تطبيق دلتا النقاط المعلّقة فوق قائمة طلاب قادمة من الخادم
  function applyPointsOverlay(students) {
    var deltas = {};
    Object.keys(pendingMiddle).forEach(function (date) {
      Object.keys(pendingMiddle[date]).forEach(function (sid) {
        var dl = pendingMiddle[date][sid].delta || 0;
        if (dl) deltas[sid] = (deltas[sid] || 0) + dl;
      });
    });
    students.forEach(function (s) {
      if (deltas[s.id]) s.points = Math.max(0, (s.points || 0) + deltas[s.id]);
    });
    return students;
  }
  // تنفيذ كتابات نفس اليوم بالتسلسل (حتى عند فشل السابقة لا تنكسر السلسلة)
  function chainWrite(chains, key, task) {
    var prev = chains[key] || Promise.resolve();
    var next = prev.then(task, task);
    chains[key] = next.catch(function () {});
    return next;
  }

  function recordAudit(action, subject, details) {
    var entry = {
      id: uid(),
      action: action,
      subject: subject || '',
      details: details || '',
      actor: getLoggedInTeacher() || state.supervisor || '',
      at: Date.now()
    };
    state.auditLogs.unshift(entry);
    if (state.auditLogs.length > 200) state.auditLogs = state.auditLogs.slice(0, 200);
    if (db) db.collection('auditLogs').doc(entry.id).set(entry).catch(function () {});
    return entry;
  }

  function getAuditLogs() {
    return state.auditLogs.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
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
        global.localStorage.removeItem('logged_in_teacher_id');
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
      // increment ذرّي على الخادم: عمليتان متزامنتان على نفس الطالب تتجمّعان بدل أن تدهس إحداهما الأخرى
      // set+merge بدل update: طالب محذوف بالتزامن لا يُفشل الدفعة كلها بصمت
      batch.set(db.collection('students').doc(studentId), { points: fsIncrement(applied) }, { merge: true });
      batch.set(db.collection('logs').doc(entry.id), entry);
      batch.commit().catch(function () { notifySaveError('تعذّر حفظ النقاط — أعد المحاولة'); });
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
    // عكس أثر العملية كـ delta ذرّي (لا كقيمة مطلقة) حتى لا تُفقد عمليات متزامنة
    var revDelta = entry.type === 'add' ? -entry.amount : entry.amount;
    var newPoints = st ? st.points : 0;
    if (st) {
      newPoints = Math.max(0, (st.points || 0) + revDelta);
      st.points = newPoints;
    }
    entry.undone = true;
    entry.undoneAt = Date.now();
    entry.undoneBy = (supervisor || state.supervisor || '').trim();

    if (db) {
      var batch = db.batch();
      if (st) {
        batch.set(db.collection('students').doc(entry.studentId), { points: fsIncrement(revDelta) }, { merge: true });
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
    recordAudit('reset_points', 'المرحلة المتوسطة', clearLogToo ? 'تصفير النقاط ومسح السجل' : 'تصفير النقاط مع إبقاء السجل');
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

  /* ---------------- أيام النادي (قابلة للتعديل) ---------------- */
  function getClubDays() {
    var d = state.clubDays && state.clubDays.length ? state.clubDays : [0, 1, 2, 3];
    return d.slice();
  }

  function setClubDays(days) {
    requireOwnerAccess();
    if (!Array.isArray(days)) throw new Error('قيمة أيام النادي غير صحيحة');
    var clean = [];
    days.map(Number).forEach(function (d) { if (d >= 0 && d <= 6 && clean.indexOf(d) === -1) clean.push(d); });
    state.clubDays = clean.length ? clean.sort(function (a, b) { return a - b; }) : [0, 1, 2, 3];
    recordAudit('set_club_days', 'أيام النادي', state.clubDays.join(','));
    if (db) db.collection('settings').doc('config').set({ clubDays: state.clubDays }, { merge: true }).catch(function () {});
    commit();
    return state.clubDays.slice();
  }

  function isClubDay(dateStr) {
    var d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    if (isNaN(d.getTime())) return true;
    return getClubDays().indexOf(d.getDay()) !== -1;
  }

  /* ---------------- حذف سجل تحضير يوم كامل (لمالك المنصة فقط) ---------------- */
  function deleteAttendanceDay(stage, date) {
    requireOwnerAccess();
    if (stage !== 'middle' && stage !== 'high') throw new Error('المرحلة غير صحيحة');
    date = String(date || '').trim();
    if (!date) throw new Error('حدد التاريخ');

    var attendanceMap = stage === 'high' ? state.highAttendance : state.attendance;
    var day = attendanceMap[date];
    if (!day) return Promise.resolve({ deleted: false, stage: stage, date: date, records: 0 });

    var recordsCount = Object.keys((day && day.records) || {}).length;
    var label = stage === 'high' ? 'الثانوية' : 'المتوسطة';

    function finishDelete() {
      delete attendanceMap[date];
      recordAudit(
        'delete_attendance',
        label + ' · ' + date,
        'حذف سجل التحضير فقط · ' + recordsCount + ' طالب · دون تغيير النقاط'
      );
      commit();
      return { deleted: true, stage: stage, date: date, records: recordsCount };
    }

    if (!db) return Promise.resolve(finishDelete());
    var collection = stage === 'high' ? highAttendanceCollection() : db.collection('attendance');
    return collection.doc(date).delete().then(finishDelete).catch(function (error) {
      notifySaveError('تعذّر حذف سجل اليوم من الخادم' + (error && error.message ? ' (' + error.message + ')' : ''));
      return { deleted: false, stage: stage, date: date, records: recordsCount };
    });
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

    // الإغلاق التلقائي: عند منتصف الليل فقط (بمجرد أن يصبح التاريخ يومًا ماضيًا).
    // أُزيل بند الساعة 9 مساءً — كان يسبب اختلاف الأجهزة حول حالة اليوم.
    return date < todayStr();
  }

  function closeAttendance(date, supervisor) {
    if (!hasPermission('closeAttendance') || !belongsToStage('middle')) {
      throw new Error('لا تملك صلاحية إغلاق تحضير المرحلة المتوسطة');
    }
    if (!state.attendance[date]) {
      state.attendance[date] = { records: {}, status: 'active' };
    }
    state.attendance[date].status = 'closed';
    state.attendance[date].closedAt = Date.now();
    state.attendance[date].closedBy = (supervisor || state.supervisor || '').trim();
    recordAudit('close_attendance', 'المتوسطة · ' + date, 'إغلاق واعتماد التحضير');

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
    if (!hasPermission('closeAttendance') || !belongsToStage('middle')) {
      throw new Error('لا تملك صلاحية إعادة فتح تحضير المرحلة المتوسطة');
    }
    if (!state.attendance[date]) {
      state.attendance[date] = { records: {}, status: 'active' };
    }
    state.attendance[date].status = 'active';
    recordAudit('reopen_attendance', 'المتوسطة · ' + date, 'إعادة فتح التحضير');
    if (db) {
      db.collection('attendance').doc(date).set({
        status: 'active'
      }, { merge: true }).catch(function() {});
    }
    commit();
  }

  // بناء «نيّة» تحضير لطالب من الحالة الفعلية الظاهرة (خادم + معلّق)
  function buildMiddleIntent(date, studentId, status, sup) {
    var st = getStudent(studentId);
    if (!st) return null;
    var day = state.attendance[date];
    var records = (day && day.records) || {};
    var prevRec = records[studentId] || null;
    var prev = (prevRec && typeof prevRec === 'object') ? prevRec.status : prevRec;
    var target = (status === 'none' || !status) ? null : status;
    if ((prev || null) === target) return null; // لا تغيير
    var oldPts = prev
      ? ((prevRec && typeof prevRec === 'object' && typeof prevRec.points === 'number') ? prevRec.points : pointsForStatus(prev))
      : 0;
    var newPts = target ? pointsForStatus(target) : 0;
    var rec = target ? { status: target, points: newPts, by: sup, at: Date.now() } : null;
    return { studentId: studentId, target: target, rec: rec, prevRec: prevRec, delta: newPts - oldPts, newPts: newPts };
  }

  function applyMiddleIntentLocal(date, intent) {
    if (!state.attendance[date]) state.attendance[date] = { records: {}, status: 'active' };
    var records = state.attendance[date].records;
    if (intent.rec) records[intent.studentId] = intent.rec;
    else delete records[intent.studentId];
    if (intent.delta) {
      var st = getStudent(intent.studentId);
      if (st) st.points = Math.max(0, (st.points || 0) + intent.delta);
    }
  }

  function revertMiddleIntentLocal(date, intent) {
    var day = state.attendance[date];
    if (day) {
      if (intent.prevRec) day.records[intent.studentId] = intent.prevRec;
      else delete day.records[intent.studentId];
    }
    if (intent.delta) {
      var st = getStudent(intent.studentId);
      if (st) st.points = Math.max(0, (st.points || 0) - intent.delta);
    }
  }

  function middleLogEntry(date, intent, delta, prevStatus, sup) {
    var st = getStudent(intent.studentId);
    var grp = st ? getGroup(st.groupId) : null;
    return {
      id: uid(),
      studentId: intent.studentId,
      studentName: st ? st.name : '',
      groupId: st ? st.groupId : '',
      groupName: grp ? grp.name : '',
      amount: Math.abs(delta),
      requested: Math.abs(delta),
      type: delta >= 0 ? 'add' : 'subtract',
      reason: 'تحضير (' + date + '): ' + (ATT_LABELS[intent.target] || 'إلغاء') + (prevStatus && prevStatus !== intent.target ? ' (تعديل من ' + (ATT_LABELS[prevStatus] || prevStatus) + ')' : ''),
      supervisor: sup,
      timestamp: Date.now(),
      kind: 'attendance'
    };
  }

  // معاملة ذرّية: تقرأ حالة اليوم على الخادم فلا تُمنح نقاط الحالة مرتين
  // حتى لو ضغط معلمان معًا. تُعيد حساب الدلتا من سجل الخادم (المرجع النهائي).
  function middleAttendanceTransaction(date, intents, sup) {
    var attRef = db.collection('attendance').doc(date);
    return db.runTransaction(function (tx) {
      return tx.get(attRef).then(function (snap) {
        var data = snap.exists ? snap.data() : {};
        if (data.status === 'closed') throw new Error('التحضير مغلق لهذا اليوم ولا يمكن تعديله');
        var serverRecords = data.records || {};
        var applied = [];
        intents.forEach(function (it) {
          var prevRec = serverRecords[it.studentId] || null;
          var prevStatus = (prevRec && typeof prevRec === 'object') ? prevRec.status : prevRec;
          prevStatus = prevStatus || null;
          if (prevStatus === it.target) return; // مُطبَّق مسبقًا على الخادم — لا تكرار
          var oldPts = prevStatus
            ? ((prevRec && typeof prevRec === 'object' && typeof prevRec.points === 'number') ? prevRec.points : pointsForStatus(prevStatus))
            : 0;
          applied.push({ intent: it, prevStatus: prevStatus, delta: it.newPts - oldPts });
        });
        if (!applied.length) return [];

        var useSet = !snap.exists; // وثيقة جديدة → set كامل بدل update بمسارات
        var recordsObj = useSet ? {} : null;
        var attUpdate = useSet ? null : {};

        applied.forEach(function (a) {
          var it = a.intent;
          if (a.delta !== 0) {
            // set+merge بدل update: طالب محذوف على الخادم لا يُسقط عملية بقية الطلاب
            tx.set(db.collection('students').doc(it.studentId), { points: fsIncrement(a.delta) }, { merge: true });
            var entry = middleLogEntry(date, it, a.delta, a.prevStatus, sup);
            tx.set(db.collection('logs').doc(entry.id), entry);
          }
          if (useSet) { if (it.rec) recordsObj[it.studentId] = it.rec; }
          else attUpdate['records.' + it.studentId] = it.rec ? it.rec : fsDelete();
        });

        if (useSet) tx.set(attRef, { records: recordsObj, status: 'active' });
        else tx.update(attRef, attUpdate);
        return applied;
      });
    });
  }

  // احتياطي عند فشل المعاملة (انقطاع/تزاحم): يكتب «النيّة» نفسها ككتابات عادية
  // تُخزَّن محليًا وتُزامَن عند عودة الشبكة. لا قيم مطلقة تدهس نقاط الآخرين،
  // ولا حذف إلا إذا كانت النيّة إلغاء التحديد.
  function fallbackMiddleAttendance(date, intents, sup) {
    var attRef = db.collection('attendance').doc(date);
    var attUpdate = {};
    var batch = db.batch();
    intents.forEach(function (it) {
      attUpdate['records.' + it.studentId] = it.rec ? it.rec : fsDelete();
      if (it.delta) {
        var entry = middleLogEntry(date, it, it.delta, (it.prevRec && it.prevRec.status) || null, sup);
        batch.set(db.collection('logs').doc(entry.id), entry);
      }
    });
    // لا نكتب status من الذاكرة المحلية أبدًا — نسخة محلية قديمة كانت تعيد
    // فتح يوم معتمد ثم تمسحه. ننشئ الوثيقة (إن لزم) بحقل زمني محايد فقط،
    // وقواعد الخادم ترفض تعديل سجلات يوم مغلق فيصل الإشعار للمعلم.
    batch.set(attRef, { updatedAt: Date.now() }, { merge: true });
    batch.update(attRef, attUpdate);
    var writes = [batch.commit()];
    intents.forEach(function (it) {
      if (!it.delta) return;
      // كتابة مستقلة لكل طالب: طالب مفقود على الخادم لا يُفشل نقاط البقية
      writes.push(
        db.collection('students').doc(it.studentId)
          .update({ points: fsIncrement(it.delta) })
          .catch(function () { notifySaveError('تعذّر تحديث نقاط أحد الطلاب (قد يكون محذوفًا)'); })
      );
    });
    return Promise.all(writes);
  }

  // مسار الكتابة الموحّد: معاملة ← عند الفشل احتياطي من النيّة ← إشعار عند التعذّر.
  // الكتابات لكل يوم تُنفَّذ بالتسلسل حتى لا تتسابق الضغطات المتتالية.
  function writeMiddleAttendance(date, intents, sup) {
    return chainWrite(middleWriteChain, date, function () {
      return middleAttendanceTransaction(date, intents, sup).then(function (result) {
        intents.forEach(function (it) { clearPendingIntent(pendingMiddle, date, it); });
        return result;
      }).catch(function (error) {
        if (error && /مغلق/.test(error.message || '')) {
          // الخادم يعتبر اليوم مغلقًا: نعيد الحالة المحلية كما كانت ونخبر المعلم
          intents.forEach(function (it) {
            revertMiddleIntentLocal(date, it);
            clearPendingIntent(pendingMiddle, date, it);
          });
          commit();
          notifySaveError('لم يُحفظ التحضير: اليوم مغلق ومعتمد');
          return null;
        }
        // انقطاع أو تزاحم شديد: كتابة احتياطية من النيّة (كتابات عادية مغطّاة
        // بتعويض الكمون وتُرسَل تلقائيًا عند عودة الشبكة) ثم إزالة الطبقة المعلّقة
        var fb = fallbackMiddleAttendance(date, intents, sup);
        intents.forEach(function (it) { clearPendingIntent(pendingMiddle, date, it); });
        return fb.catch(function (e2) {
          notifySaveError('تعذّر حفظ التحضير — أعد المحاولة' + (e2 && e2.message ? ' (' + e2.message + ')' : ''));
          return null;
        });
      });
    });
  }

  // تحديد حالة تحضير لطالب في تاريخ معيّن (يعدّل النقاط دون تكرار وبأمان عند التزامن)
  // status: 'early' | 'present' | 'absent' | 'none' (لإلغاء التحديد)
  function setAttendance(date, studentId, status, supervisor) {
    if (!hasPermission('attendance') || !belongsToStage('middle')) {
      throw new Error('لا تملك صلاحية تعديل تحضير المرحلة المتوسطة');
    }
    if (isAttendanceClosed(date)) {
      throw new Error('التحضير مغلق لهذا اليوم ولا يمكن تعديله');
    }
    var sup = (supervisor || state.supervisor || '').trim();
    var intent = buildMiddleIntent(date, studentId, status, sup);
    if (!intent) return; // طالب غير موجود أو لا تغيير

    if (db) setPendingIntent(pendingMiddle, date, intent); // تحمي التفاؤلي من دهس اللقطات
    applyMiddleIntentLocal(date, intent);                  // استجابة فورية على الشاشة
    commit();
    if (!db) return;
    return writeMiddleAttendance(date, [intent], sup);
  }

  function setBulkAttendance(date, studentIds, status, supervisor) {
    if (!hasPermission('attendance') || !belongsToStage('middle')) {
      throw new Error('لا تملك صلاحية تعديل تحضير المرحلة المتوسطة');
    }
    if (isAttendanceClosed(date)) {
      throw new Error('التحضير مغلق لهذا اليوم ولا يمكن تعديله');
    }
    var sup = (supervisor || state.supervisor || '').trim();
    var intents = [];
    (studentIds || []).forEach(function (studentId) {
      var intent = buildMiddleIntent(date, studentId, status, sup);
      if (!intent) return;
      if (db) setPendingIntent(pendingMiddle, date, intent);
      applyMiddleIntentLocal(date, intent);
      intents.push(intent);
    });
    if (!intents.length) return;
    commit();
    if (!db) return;
    return writeMiddleAttendance(date, intents, sup);
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

  // إدارة طلاب/مجموعات الثانوية متاحة للمالك ولمن يملك إدارة الطلاب،
  // وكذلك لمعلمي الثانوية أصحاب صلاحية التحضير (يديرون طلابهم داخل تحضيرهم)
  function requireHighStudentManager() {
    var user = getCurrentUser();
    if (user && user.active && (user.role === 'owner' ||
        hasPermission('manageStudents') ||
        (belongsToStage('high') && hasPermission('attendance')))) return;
    throw new Error('لا تملك صلاحية إدارة طلاب الثانوية');
  }

  /* ---------------- مجموعات الثانوية (تنظيمية بسيطة بلا نقاط) ---------------- */
  function getHighGroups() { return (state.highGroups || []).slice(); }

  function getHighGroup(id) {
    var list = state.highGroups || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  function persistHighGroups() {
    if (db) db.collection('settings').doc('config').set({ highGroups: state.highGroups }, { merge: true }).catch(function () {});
    commit();
  }

  function addHighGroup(name) {
    requireHighStudentManager();
    name = String(name || '').trim();
    if (!name) throw new Error('اسم المجموعة مطلوب');
    if (!state.highGroups) state.highGroups = [];
    if (state.highGroups.some(function (g) { return g.name.toLowerCase() === name.toLowerCase(); })) {
      throw new Error('المجموعة موجودة مسبقًا');
    }
    var group = { id: uid(), name: name };
    state.highGroups.push(group);
    recordAudit('add_high_group', 'الثانوية · ' + name, 'إضافة مجموعة');
    persistHighGroups();
    return group.id;
  }

  function updateHighGroup(id, name) {
    requireHighStudentManager();
    var group = getHighGroup(id);
    if (!group) throw new Error('المجموعة غير موجودة');
    name = String(name || '').trim();
    if (!name) throw new Error('اسم المجموعة مطلوب');
    group.name = name;
    persistHighGroups();
  }

  function deleteHighGroup(id) {
    requireHighStudentManager();
    if (!state.highGroups) state.highGroups = [];
    state.highGroups = state.highGroups.filter(function (g) { return g.id !== id; });
    // فكّ ارتباط الطلاب بهذه المجموعة
    var collection = highStudentsCollection();
    var batch = collection ? db.batch() : null;
    state.highStudents.forEach(function (s) {
      if (s.groupId === id) {
        s.groupId = null;
        if (batch) batch.set(collection.doc(s.id), { groupId: null }, { merge: true });
      }
    });
    if (batch) batch.commit().catch(function () {});
    recordAudit('delete_high_group', 'الثانوية', 'حذف مجموعة');
    persistHighGroups();
  }

  function requireHighAttendanceAccess() {
    if (!belongsToStage('high') || !hasPermission('attendance')) {
      throw new Error('لا تملك صلاحية تحضير المرحلة الثانوية');
    }
  }

  function addHighStudent(name, groupId) {
    requireHighStudentManager();
    name = String(name || '').trim();
    if (!name) throw new Error('اسم الطالب مطلوب');
    var duplicate = state.highStudents.some(function (student) {
      return String(student.name || '').trim().toLowerCase() === name.toLowerCase();
    });
    if (duplicate) throw new Error('الطالب موجود مسبقًا');

    var student = { id: uid(), name: name, active: true, groupId: (groupId && getHighGroup(groupId)) ? groupId : null, createdAt: Date.now() };
    state.highStudents.push(student);
    recordAudit('add_student', 'الثانوية · ' + name, 'إضافة طالب');
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
    recordAudit('add_students', 'المرحلة الثانوية', 'إضافة ' + added.length + ' طالب');
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
    if (data.hasOwnProperty('groupId')) {
      student.groupId = (data.groupId && getHighGroup(data.groupId)) ? data.groupId : null;
    }
    student.updatedAt = Date.now();
    recordAudit('update_student', 'الثانوية · ' + student.name, student.active === false ? 'تعديل وإيقاف الطالب' : 'تعديل بيانات الطالب');
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
    var deletedStudent = state.highStudents[index];
    state.highStudents.splice(index, 1);
    recordAudit('delete_student', 'الثانوية · ' + deletedStudent.name, 'حذف الطالب من القائمة');
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

  // بناء «نيّة» تحضير ثانوية (بلا نقاط) من الحالة الظاهرة
  function buildHighIntent(date, studentId, status, sup) {
    var day = state.highAttendance[date];
    var records = (day && day.records) || {};
    var prevRec = records[studentId] || null;
    var prevStatus = (prevRec && typeof prevRec === 'object') ? prevRec.status : prevRec;
    var target = (!status || status === 'none') ? null : status;
    if ((prevStatus || null) === target) return null; // لا تغيير
    var rec = target ? { status: target, by: sup, at: Date.now() } : null;
    return { studentId: studentId, target: target, rec: rec, prevRec: prevRec };
  }

  function applyHighIntentLocal(date, intent) {
    if (!state.highAttendance[date]) state.highAttendance[date] = { records: {}, status: 'active' };
    var records = state.highAttendance[date].records;
    if (intent.rec) records[intent.studentId] = intent.rec;
    else delete records[intent.studentId];
  }

  function revertHighIntentLocal(date, intent) {
    var day = state.highAttendance[date];
    if (!day) return;
    if (intent.prevRec) day.records[intent.studentId] = intent.prevRec;
    else delete day.records[intent.studentId];
  }

  // مسار كتابة الثانوية: معاملة ← عند الفشل احتياطي بمسارات حقول من النيّة
  // (لا يستبدل خريطة السجلات كاملة فلا يدهس علامات معلم آخر) ← إشعار عند التعذّر.
  function writeHighAttendance(date, intents, sup) {
    var collection = highAttendanceCollection();
    if (!collection) return Promise.resolve();
    var ref = collection.doc(date);
    return chainWrite(highWriteChain, date, function () {
      return db.runTransaction(function (transaction) {
        return transaction.get(ref).then(function (snapshot) {
          var remote = snapshot.exists ? snapshot.data() : {};
          if (remote.status === 'closed') throw new Error('التحضير مغلق لهذا اليوم');
          var records = Object.assign({}, remote.records || {});
          intents.forEach(function (it) {
            if (it.rec) records[it.studentId] = it.rec;
            else delete records[it.studentId];
          });
          transaction.set(ref, {
            records: records,
            summary: computeHighAttendanceSummary(records),
            status: remote.status || 'active',
            updatedAt: Date.now()
          }, { merge: true });
        });
      }).then(function () {
        intents.forEach(function (it) { clearPendingIntent(pendingHigh, date, it); });
      }).catch(function (error) {
        if (error && /مغلق/.test(error.message || '')) {
          intents.forEach(function (it) {
            revertHighIntentLocal(date, it);
            clearPendingIntent(pendingHigh, date, it);
          });
          if (state.highAttendance[date]) {
            state.highAttendance[date].summary = computeHighAttendanceSummary(state.highAttendance[date].records);
          }
          commit();
          notifySaveError('لم يُحفظ تحضير الثانوية: اليوم مغلق ومعتمد');
          return null;
        }
        // انقطاع/تزاحم: كتابة النيّة عبر مسارات الحقول (تُخزَّن محليًا وتُزامَن لاحقًا)
        var day = state.highAttendance[date];
        var upd = { updatedAt: Date.now(), summary: computeHighAttendanceSummary((day && day.records) || {}) };
        intents.forEach(function (it) {
          upd['records.' + it.studentId] = it.rec ? it.rec : fsDelete();
        });
        var batch = db.batch();
        // لا نكتب status من المحلي (كان يعيد فتح يوم معتمد) — حقل زمني محايد فقط
        batch.set(ref, { updatedAt: Date.now() }, { merge: true });
        batch.update(ref, upd);
        var fb = batch.commit();
        intents.forEach(function (it) { clearPendingIntent(pendingHigh, date, it); });
        return fb.catch(function () {
          notifySaveError('تعذّر حفظ تحضير الثانوية — أعد المحاولة');
          return null;
        });
      });
    });
  }

  function setHighAttendance(date, studentId, status, supervisor) {
    requireHighAttendanceAccess();
    if (isHighAttendanceClosed(date)) throw new Error('تحضير الثانوية مغلق لهذا اليوم');
    if (!getHighStudent(studentId)) throw new Error('الطالب غير موجود');
    var sup = (supervisor || getSupervisor() || '').trim();
    var intent = buildHighIntent(date, studentId, status, sup);
    if (!intent) return Promise.resolve();
    if (db) setPendingIntent(pendingHigh, date, intent);
    applyHighIntentLocal(date, intent);
    state.highAttendance[date].summary = computeHighAttendanceSummary(state.highAttendance[date].records);
    commit();
    if (!db) return Promise.resolve();
    return writeHighAttendance(date, [intent], sup);
  }

  function setBulkHighAttendance(date, studentIds, status, supervisor) {
    requireHighAttendanceAccess();
    if (isHighAttendanceClosed(date)) throw new Error('تحضير الثانوية مغلق لهذا اليوم');
    if (!Array.isArray(studentIds) || !studentIds.length) throw new Error('حدد طالبًا واحدًا على الأقل');
    var sup = (supervisor || getSupervisor() || '').trim();
    var intents = [];
    studentIds.forEach(function (studentId) {
      if (!getHighStudent(studentId)) return;
      var intent = buildHighIntent(date, studentId, status, sup);
      if (!intent) return;
      if (db) setPendingIntent(pendingHigh, date, intent);
      applyHighIntentLocal(date, intent);
      intents.push(intent);
    });
    if (!intents.length) return Promise.resolve();
    state.highAttendance[date].summary = computeHighAttendanceSummary(state.highAttendance[date].records);
    commit();
    if (!db) return Promise.resolve();
    return writeHighAttendance(date, intents, sup);
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
    recordAudit('close_attendance', 'الثانوية · ' + date, 'إغلاق واعتماد التحضير');
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
    recordAudit('reopen_attendance', 'الثانوية · ' + date, 'إعادة فتح التحضير');
    var collection = highAttendanceCollection();
    if (collection) collection.doc(date).set({ status: 'active' }, { merge: true }).catch(function () {});
    commit();
  }

  /* ---------------- التوجيهات الإدارية ---------------- */

  function canManageMemos() {
    var user = getCurrentUser();
    return !!user && user.active && user.role === 'owner';
  }

  function getMemos() {
    return state.memos.slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function getActiveMemos(stage) {
    var now = Date.now();
    return getMemos().filter(function (memo) {
      var matchesStage = memo.target === 'all' || memo.target === stage;
      var notExpired = !memo.expiresAt || memo.expiresAt > now;
      return memo.active !== false && matchesStage && notExpired;
    });
  }

  function addMemo(data) {
    if (!canManageMemos()) throw new Error('لا تملك صلاحية إرسال التوجيهات');
    data = data || {};
    var message = String(data.message || '').trim();
    if (!message) throw new Error('نص التوجيه مطلوب');
    var target = data.target === 'middle' || data.target === 'high' ? data.target : 'all';
    var memo = {
      id: uid(),
      message: message,
      target: target,
      level: data.level === 'urgent' ? 'urgent' : 'info',
      active: true,
      createdAt: Date.now(),
      createdBy: getLoggedInTeacher(),
      expiresAt: data.expiresAt ? Number(data.expiresAt) : null
    };
    state.memos.unshift(memo);
    recordAudit('add_memo', 'توجيه إلى ' + target, message);
    if (db) db.collection('memos').doc(memo.id).set(memo).catch(function () {});
    commit();
    return memo.id;
  }

  function setMemoActive(id, active) {
    if (!canManageMemos()) throw new Error('لا تملك صلاحية تعديل التوجيهات');
    var memo = null;
    for (var i = 0; i < state.memos.length; i++) {
      if (state.memos[i].id === id) { memo = state.memos[i]; break; }
    }
    if (!memo) throw new Error('التوجيه غير موجود');
    memo.active = !!active;
    recordAudit('toggle_memo', 'توجيه إداري', memo.active ? 'تفعيل التوجيه' : 'إيقاف التوجيه');
    if (db) db.collection('memos').doc(id).set({ active: memo.active }, { merge: true }).catch(function () {});
    commit();
  }

  function deleteMemo(id) {
    if (!canManageMemos()) throw new Error('لا تملك صلاحية حذف التوجيهات');
    var deletedMemo = state.memos.filter(function (memo) { return memo.id === id; })[0];
    state.memos = state.memos.filter(function (memo) { return memo.id !== id; });
    recordAudit('delete_memo', 'توجيه إداري', deletedMemo ? deletedMemo.message : 'حذف توجيه');
    if (db) db.collection('memos').doc(id).delete().catch(function () {});
    commit();
  }

  /* ---------------- ترحيل بيانات المتوسطة إلى الهيكل الهرمي ---------------- */

  function migrationTargetCollection(name) {
    return db ? db.collection('stages').doc('middle').collection(name) : null;
  }

  function writeMigrationDocuments(collection, documents) {
    var index = 0;
    function next() {
      if (index >= documents.length) return Promise.resolve();
      var batch = db.batch();
      var end = Math.min(index + 400, documents.length);
      for (; index < end; index++) {
        batch.set(collection.doc(documents[index].id), documents[index].data);
      }
      return batch.commit().then(next);
    }
    return next();
  }

  function replaceMigrationDocuments(collection, documents) {
    return collection.get().then(function (snapshot) {
      var refs = [];
      snapshot.forEach(function (doc) { refs.push(doc.ref); });
      var index = 0;
      function deleteNext() {
        if (index >= refs.length) return Promise.resolve();
        var batch = db.batch();
        var end = Math.min(index + 400, refs.length);
        for (; index < end; index++) batch.delete(refs[index]);
        return batch.commit().then(deleteNext);
      }
      return deleteNext();
    }).then(function () {
      return writeMigrationDocuments(collection, documents);
    });
  }

  function migrationStats(studentSnapshot, attendanceSnapshot, logSnapshot) {
    var points = 0;
    studentSnapshot.forEach(function (doc) { points += Number(doc.data().points || 0); });
    return {
      students: studentSnapshot.size,
      attendanceDays: attendanceSnapshot.size,
      logs: logSnapshot.size,
      totalPoints: points,
      signature: [
        migrationSnapshotSignature(studentSnapshot),
        migrationSnapshotSignature(attendanceSnapshot),
        migrationSnapshotSignature(logSnapshot)
      ].join('|')
    };
  }

  function stableMigrationValue(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (Array.isArray(value)) return value.map(stableMigrationValue);
    var normalized = {};
    Object.keys(value).sort().forEach(function (key) {
      normalized[key] = stableMigrationValue(value[key]);
    });
    return normalized;
  }

  function migrationSnapshotSignature(snapshot) {
    var documents = [];
    snapshot.forEach(function (doc) {
      documents.push(doc.id + ':' + JSON.stringify(stableMigrationValue(doc.data())));
    });
    var text = documents.sort().join('||');
    var first = 2166136261;
    var second = 5381;
    for (var i = 0; i < text.length; i++) {
      first ^= text.charCodeAt(i);
      first = Math.imul(first, 16777619);
      second = ((second << 5) + second) ^ text.charCodeAt(i);
    }
    return (first >>> 0).toString(16).padStart(8, '0') +
      (second >>> 0).toString(16).padStart(8, '0');
  }

  function getMiddleMigrationPreview() {
    return {
      students: state.students.length,
      attendanceDays: Object.keys(state.attendance || {}).length,
      logsLoaded: state.log.length,
      totalPoints: state.students.reduce(function (sum, student) { return sum + Number(student.points || 0); }, 0),
      note: 'يُقرأ سجل العمليات كاملًا من Firestore عند التنفيذ، وليس آخر 150 عملية المعروضة فقط.'
    };
  }

  function verifyMiddleMigration() {
    requireOwnerAccess();
    if (!db) return Promise.reject(new Error('الاتصال بـ Firebase غير متاح'));
    return Promise.all([
      db.collection('students').get(),
      db.collection('attendance').get(),
      db.collection('logs').get(),
      migrationTargetCollection('students').get(),
      migrationTargetCollection('attendance').get(),
      migrationTargetCollection('logs').get()
    ]).then(function (snapshots) {
      var source = migrationStats(snapshots[0], snapshots[1], snapshots[2]);
      var target = migrationStats(snapshots[3], snapshots[4], snapshots[5]);
      return {
        ok: source.students === target.students &&
          source.attendanceDays === target.attendanceDays &&
          source.logs === target.logs &&
          source.totalPoints === target.totalPoints &&
          source.signature === target.signature,
        source: source,
        target: target
      };
    });
  }

  function migrateMiddleData() {
    requireOwnerAccess();
    if (!db) return Promise.reject(new Error('الاتصال بـ Firebase غير متاح'));
    recordAudit('start_migration', 'المرحلة المتوسطة', 'بدء نسخ البيانات إلى الهيكل الجديد');
    commit();

    return Promise.all([
      db.collection('students').get(),
      db.collection('attendance').get(),
      db.collection('logs').get()
    ]).then(function (snapshots) {
      var students = [];
      var attendance = [];
      var logs = [];
      snapshots[0].forEach(function (doc) { students.push({ id: doc.id, data: doc.data() }); });
      snapshots[1].forEach(function (doc) { attendance.push({ id: doc.id, data: doc.data() }); });
      snapshots[2].forEach(function (doc) { logs.push({ id: doc.id, data: doc.data() }); });

      return Promise.all([
        replaceMigrationDocuments(migrationTargetCollection('students'), students),
        replaceMigrationDocuments(migrationTargetCollection('attendance'), attendance),
        replaceMigrationDocuments(migrationTargetCollection('logs'), logs)
      ]).then(function () {
        return db.collection('migrations').doc('middle_v2').set({
          status: 'copied',
          copiedAt: Date.now(),
          copiedBy: getLoggedInTeacher(),
          source: {
            students: students.length,
            attendanceDays: attendance.length,
            logs: logs.length
          }
        }, { merge: true });
      });
    }).then(function () {
      return verifyMiddleMigration();
    }).then(function (result) {
      recordAudit(result.ok ? 'complete_migration' : 'migration_mismatch', 'المرحلة المتوسطة',
        result.ok ? 'اكتمل النسخ وتطابقت البيانات' : 'اكتمل النسخ مع وجود اختلاف يحتاج مراجعة');
      commit();
      return db.collection('migrations').doc('middle_v2').set({
        status: result.ok ? 'verified' : 'mismatch',
        verifiedAt: Date.now(),
        verification: result
      }, { merge: true }).then(function () { return result; });
    }).catch(function (error) {
      recordAudit('migration_failed', 'المرحلة المتوسطة', error.message || 'تعذر إكمال الترحيل');
      commit();
      throw error;
    });
  }

  function resetAll() {
    requireOwnerAccess();
    state = defaultState();
    if (db) {
      // نعيد ضبط الإعدادات للقيم الافتراضية بدل حذف الوثيقة (متوافق مع قاعدة منع الحذف،
      // ويضمن ألا يبقى النظام دون حسابات أو مجموعات)
      db.collection('settings').doc('config').set({
        groups: state.groups,
        attendancePoints: state.attendancePoints,
        fastReasons: state.fastReasons,
        teachers: state.teachers,
        highGroups: state.highGroups,
        clubDays: state.clubDays
      }).catch(function() {});
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
      db.collection('memos').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function () {});
      }).catch(function () {});
      db.collection('auditLogs').get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (doc) { batch.delete(doc.ref); });
        batch.commit().catch(function () {});
      }).catch(function () {});
    }
    commit();
  }

  // استيراد/تصدير نسخة احتياطية
  function backupSummary(data) {
    data = data || {};
    return {
      middleStudents: Array.isArray(data.students) ? data.students.length : 0,
      highStudents: Array.isArray(data.highStudents) ? data.highStudents.length : 0,
      middleAttendanceDays: data.attendance && typeof data.attendance === 'object' ? Object.keys(data.attendance).length : 0,
      highAttendanceDays: data.highAttendance && typeof data.highAttendance === 'object' ? Object.keys(data.highAttendance).length : 0,
      logs: Array.isArray(data.log) ? data.log.length : 0,
      accounts: data.teachers && typeof data.teachers === 'object' ? Object.keys(data.teachers).length : 0,
      memos: Array.isArray(data.memos) ? data.memos.length : 0,
      auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs.length : 0
    };
  }

  function createBackupObject() {
    return {
      version: SCHEMA_VERSION,
      app: 'rehal-education-platform',
      createdAt: new Date().toISOString(),
      summary: backupSummary(state),
      data: state
    };
  }

  function exportData() {
    return JSON.stringify(createBackupObject(), null, 2);
  }

  function parseBackup(input) {
    var parsed = typeof input === 'string' ? JSON.parse(input) : input;
    if (!parsed || typeof parsed !== 'object') throw new Error('ملف النسخة الاحتياطية غير صالح');
    var payload = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!Array.isArray(payload.students)) throw new Error('قائمة طلاب المتوسطة مفقودة أو غير صالحة');
    if (!payload.attendance || typeof payload.attendance !== 'object') throw new Error('سجلات تحضير المتوسطة مفقودة');
    if (!payload.teachers || typeof payload.teachers !== 'object') throw new Error('بيانات الحسابات مفقودة');
    if (!payload.teachers.hasOwnProperty(OWNER_NAME)) throw new Error('النسخة لا تحتوي حساب مالك المنصة');
    if (payload.highStudents != null && !Array.isArray(payload.highStudents)) throw new Error('قائمة طلاب الثانوية غير صالحة');
    if (payload.highAttendance != null && typeof payload.highAttendance !== 'object') throw new Error('سجلات تحضير الثانوية غير صالحة');
    return {
      version: parsed.version || '1.0',
      createdAt: parsed.createdAt || null,
      legacy: !parsed.data,
      data: payload,
      summary: backupSummary(payload)
    };
  }

  function inspectBackup(input) {
    var result = parseBackup(input);
    return {
      version: result.version,
      createdAt: result.createdAt,
      legacy: result.legacy,
      summary: result.summary
    };
  }

  function importData(json) {
    requireOwnerAccess();
    var backup = parseBackup(json);
    state = normalize(backup.data);
    recordAudit('restore_backup', 'نسخة احتياطية ' + backup.version, 'استعادة كاملة لبيانات المنصة');
    commit();
    if (!db) return Promise.resolve();

    function commitInChunks(items, applyOperation) {
      var index = 0;
      function next() {
        if (index >= items.length) return Promise.resolve();
        var batch = db.batch();
        var end = Math.min(index + 400, items.length);
        for (; index < end; index++) applyOperation(batch, items[index]);
        return batch.commit().then(next);
      }
      return next();
    }

    function replaceCollection(collection, documents) {
      return collection.get().then(function (snapshot) {
        var existingRefs = [];
        snapshot.forEach(function (doc) { existingRefs.push(doc.ref); });
        return commitInChunks(existingRefs, function (batch, ref) {
          batch.delete(ref);
        }).then(function () {
          return commitInChunks(documents, function (batch, entry) {
            batch.set(collection.doc(entry.id), entry.data);
          });
        });
      });
    }

    var middleStudents = state.students.map(function (student) { return { id: student.id, data: student }; });
    var logs = state.log.map(function (entry) { return { id: entry.id, data: entry }; });
    var middleAttendance = Object.keys(state.attendance).map(function (date) {
      var day = state.attendance[date];
      return {
        id: date,
        data: {
          records: (day && day.records) ? day.records : day,
          status: (day && day.status) || 'active',
          closedAt: day && day.closedAt || null,
          closedBy: day && day.closedBy || null
        }
      };
    });
    var highStudents = state.highStudents.map(function (student) { return { id: student.id, data: student }; });
    var highAttendance = Object.keys(state.highAttendance).map(function (date) {
      var day = state.highAttendance[date];
      return {
        id: date,
        data: {
          records: day.records || {},
          summary: day.summary || computeHighAttendanceSummary(day.records || {}),
          status: day.status || 'active',
          closedAt: day.closedAt || null,
          closedBy: day.closedBy || null
        }
      };
    });
    var memos = state.memos.map(function (memo) { return { id: memo.id, data: memo }; });
    var auditLogs = state.auditLogs.map(function (entry) { return { id: entry.id, data: entry }; });

    return Promise.all([
      db.collection('settings').doc('config').set({
        groups: state.groups,
        attendancePoints: state.attendancePoints,
        fastReasons: state.fastReasons,
        teachers: state.teachers,
        highGroups: state.highGroups,
        clubDays: state.clubDays
      }),
      replaceCollection(db.collection('students'), middleStudents),
      replaceCollection(db.collection('logs'), logs),
      replaceCollection(db.collection('attendance'), middleAttendance),
      replaceCollection(highStudentsCollection(), highStudents),
      replaceCollection(highAttendanceCollection(), highAttendance),
      replaceCollection(db.collection('memos'), memos),
      replaceCollection(db.collection('auditLogs'), auditLogs)
    ]);
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  // ابحث عن اسم الحساب الحالي حسب معرّفه الثابت (يصمد وإن تغيّر الاسم)
  function findTeacherNameById(id) {
    if (!id) return null;
    for (var k in state.teachers) {
      if (state.teachers.hasOwnProperty(k) && state.teachers[k] &&
          typeof state.teachers[k] === 'object' && state.teachers[k].id === id) {
        return k;
      }
    }
    return null;
  }

  // الاسم الحالي للحساب المسجّل دخوله: بالمعرّف أولًا ثم بالاسم (توافق مع الجلسات القديمة)
  function resolveLoggedInName() {
    var id = null, name = null;
    try {
      id = global.localStorage.getItem('logged_in_teacher_id');
      name = global.localStorage.getItem('logged_in_teacher');
    } catch (e) {}

    if (id) {
      var byId = findTeacherNameById(id);
      if (byId) {
        // حدّث الاسم المخزّن إن كان الحساب قد أُعيدت تسميته
        if (byId !== name) { try { global.localStorage.setItem('logged_in_teacher', byId); } catch (e2) {} }
        return byId;
      }
    }

    // جلسة قديمة بالاسم فقط: تبنّى معرّفها الثابت للمرات القادمة
    if (name && state.teachers.hasOwnProperty(name)) {
      var acct = state.teachers[name];
      if (acct && typeof acct === 'object' && acct.id) {
        try { global.localStorage.setItem('logged_in_teacher_id', acct.id); } catch (e3) {}
      }
      return name;
    }
    return name || '';
  }

  function isLoggedIn() {
    try {
      var name = resolveLoggedInName();
      if (!name || !state.teachers.hasOwnProperty(name)) return false;
      var teacher = state.teachers[name];
      return name === OWNER_NAME || !teacher || typeof teacher === 'string' || teacher.active !== false;
    } catch (e) {
      return false;
    }
  }

  function getLoggedInTeacher() {
    try {
      return resolveLoggedInName();
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

  // دمج آمن: يضيف/يعدّل الحسابات دون أن يمسح حسابًا أضافه جهاز آخر (لا يحذف مفاتيح)
  function persistTeachers() {
    if (db) {
      db.collection('settings').doc('config').set({ teachers: state.teachers }, { merge: true }).catch(function () {});
    }
    commit();
  }

  // حذف موجّه لمفتاح حساب واحد من خريطة teachers على الخادم (بدون لمس بقية الحسابات)
  // ضروري لأن set+merge لا يحذف المفاتيح، فالحذف/إعادة التسمية تحتاج FieldValue.delete
  function deleteTeacherKeyRemote(name) {
    if (!db || !name) return;
    var upd = {};
    upd['teachers.' + name] = fsDelete();
    db.collection('settings').doc('config').update(upd).catch(function () {});
  }

  function requireOwnerAccess() {
    if (getLoggedInTeacher() !== OWNER_NAME) {
      throw new Error('هذه العملية متاحة لمالك المنصة فقط');
    }
  }

  function defaultPermissions(role, stage) {
    if (role === 'admin') {
      return {
        adminPanel: false,
        manageStudents: false,
        attendance: false,
        closeAttendance: false,
        viewDisplays: false,
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
      id: uniqueTeacherId(),
      password: password,
      role: role,
      stage: role === 'admin' ? 'all' : stage,
      active: data.active !== false,
      permissions: Object.assign(defaultPermissions(role, stage), data.permissions || {})
    };
    recordAudit('add_account', name, role + ' · ' + stage);
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
        id: teacherIdFromName(originalName),
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
      recordAudit('update_owner_password', OWNER_NAME, 'تحديث بيانات دخول المالك');
      persistTeachers();
      return OWNER_NAME;
    }

    var newName = String(data.name || originalName).trim();
    if (!newName) throw new Error('اسم الحساب مطلوب');
    if (newName !== originalName && state.teachers.hasOwnProperty(newName)) throw new Error('يوجد حساب بهذا الاسم');

    var role = data.role === 'admin' ? 'admin' : 'teacher';
    var stage = data.stage === 'high' || data.stage === 'all' ? data.stage : 'middle';
    if (role === 'admin') stage = 'all';
    var updated = {
      id: current.id || teacherIdFromName(originalName),
      password: String(data.password || '').trim() || current.password || '1234',
      role: role,
      stage: stage,
      active: data.active !== false,
      permissions: Object.assign(defaultPermissions(role, stage), current.permissions || {}, data.permissions || {})
    };
    updated.permissions.managePlatform = false;

    var renamed = newName !== originalName;
    if (renamed) delete state.teachers[originalName];
    state.teachers[newName] = updated;
    recordAudit('update_account', newName, role + ' · ' + stage + ' · ' + (updated.active ? 'نشط' : 'موقوف'));
    persistTeachers();
    if (renamed) deleteTeacherKeyRemote(originalName); // إزالة الاسم القديم من الخادم
    return newName;
  }

  function deleteTeacherAccount(name) {
    requireOwnerAccess();
    name = String(name || '').trim();
    if (name === OWNER_NAME) throw new Error('لا يمكن حذف حساب مالك المنصة');
    if (!state.teachers.hasOwnProperty(name)) throw new Error('الحساب غير موجود');
    if (name === getLoggedInTeacher()) throw new Error('لا يمكن حذف الحساب المستخدم حاليًا');
    delete state.teachers[name];
    recordAudit('delete_account', name, 'حذف حساب مستخدم');
    deleteTeacherKeyRemote(name); // حذف موجّه من الخادم (merge لا يحذف)
    // لا نستخدم persistTeachers هنا لأن الحذف الموجّه أعلاه هو الذي يزيل المفتاح
    // من Firestore، بينما set+merge لا يحذف المفاتيح الغائبة.
    commit();
  }

  // تغيير المستخدم كلمة مروره بنفسه (يتحقق من القديمة) — متاح لأي حساب مسجّل الدخول
  function changeOwnPassword(currentPassword, newPassword) {
    var name = getLoggedInTeacher();
    if (!name || !state.teachers.hasOwnProperty(name)) throw new Error('لست مسجّلًا للدخول');
    var t = state.teachers[name];
    var actual = typeof t === 'string' ? t : ((t && t.password) || '1234');
    currentPassword = String(currentPassword || '').trim();
    newPassword = String(newPassword || '').trim();
    if (actual !== currentPassword) throw new Error('كلمة المرور الحالية غير صحيحة');
    if (!newPassword) throw new Error('أدخل كلمة المرور الجديدة');
    if (newPassword === currentPassword) throw new Error('كلمة المرور الجديدة مطابقة للحالية');

    if (typeof t === 'string') {
      state.teachers[name] = {
        id: teacherIdFromName(name),
        password: newPassword,
        role: name === OWNER_NAME ? 'owner' : 'teacher',
        stage: name === OWNER_NAME ? 'all' : 'middle',
        active: true,
        permissions: {
          adminPanel: name === OWNER_NAME, manageStudents: name === OWNER_NAME, attendance: true,
          closeAttendance: name === OWNER_NAME, viewDisplays: true, managePlatform: name === OWNER_NAME, viewReports: name === OWNER_NAME
        }
      };
    } else {
      t.password = newPassword;
    }
    recordAudit('change_own_password', name, 'غيّر كلمة مروره بنفسه');
    persistTeachers();
    return true;
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
        id: teacherIdFromName(name),
        password: password,
        role: name === OWNER_NAME ? 'owner' : 'teacher',
        stage: name === OWNER_NAME ? 'all' : 'middle',
        active: true,
        permissions: { adminPanel: name === OWNER_NAME, manageStudents: name === OWNER_NAME, attendance: true, closeAttendance: name === OWNER_NAME, viewDisplays: true, managePlatform: name === OWNER_NAME, viewReports: name === OWNER_NAME }
      };
    } else {
      state.teachers[name].password = password;
    }
    recordAudit('change_password', name, 'إعادة تعيين كلمة المرور');
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
        var accountId = (t && typeof t === 'object' && t.id) ? t.id : teacherIdFromName(name);
        global.localStorage.setItem('logged_in_teacher_id', accountId);
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
    if (user.role === 'admin') return permissionKey === 'viewReports';
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
        id: teacherIdFromName(name),
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
    recordAudit('change_permission', name, permissionKey + ': ' + (!!value ? 'مفعلة' : 'موقوفة'));
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
    getClubDays: getClubDays,
    setClubDays: setClubDays,
    isClubDay: isClubDay,
    deleteAttendanceDay: deleteAttendanceDay,
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
    getHighGroups: getHighGroups,
    getHighGroup: getHighGroup,
    addHighGroup: addHighGroup,
    updateHighGroup: updateHighGroup,
    deleteHighGroup: deleteHighGroup,
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
    getMemos: getMemos,
    getActiveMemos: getActiveMemos,
    addMemo: addMemo,
    setMemoActive: setMemoActive,
    deleteMemo: deleteMemo,
    getAuditLogs: getAuditLogs,
    getMiddleMigrationPreview: getMiddleMigrationPreview,
    verifyMiddleMigration: verifyMiddleMigration,
    migrateMiddleData: migrateMiddleData,
    clearLog: clearLog,
    resetPoints: resetPoints,
    resetAll: resetAll,
    exportData: exportData,
    inspectBackup: inspectBackup,
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
    setTeacherPermission: setTeacherPermission,
    changeOwnPassword: changeOwnPassword,
    onSaveError: onSaveError
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
        <div class="custom-modal-msg"></div>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn custom-modal-btn-confirm" id="custom-modal-ok">نعم، متأكد</button>
          <button class="custom-modal-btn custom-modal-btn-cancel" id="custom-modal-cancel">إلغاء</button>
        </div>
      </div>
    `;
    // نص الرسالة عبر textContent حتى لا تُفسَّر أسماء الطلاب/التوجيهات كـHTML
    overlay.querySelector('.custom-modal-msg').textContent = message;
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
        <div class="custom-modal-msg"></div>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn custom-modal-btn-confirm" id="custom-modal-ok" style="max-width: 140px; margin: 0 auto;">موافق</button>
        </div>
      </div>
    `;
    // نص الرسالة عبر textContent حتى لا تُفسَّر أسماء الطلاب/التوجيهات كـHTML
    overlay.querySelector('.custom-modal-msg').textContent = message;
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
