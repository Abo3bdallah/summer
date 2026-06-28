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

  function defaultState() {
    return {
      groups: DEFAULT_GROUPS.map(function (g) { return { id: g.id, name: g.name, goal: g.goal }; }),
      students: [],
      log: [],
      supervisor: ''
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
  var docRef = db ? db.collection('app').doc('state') : null;
  var applyingRemote = false; // لمنع إعادة الإرسال عند استقبال لقطة

  if (docRef) {
    docRef.onSnapshot(function (snap) {
      if (snap.exists) {
        applyingRemote = true;
        state = normalize(snap.data());
        persist();          // نسخة محلية للعمل دون اتصال
        emit(false);        // حدّث الشاشات دون إعادة إرسال
        applyingRemote = false;
      } else {
        // أول تشغيل: ارفع الحالة المحلية الحالية إلى السحابة
        docRef.set(state).catch(function () {});
      }
    }, function (err) {
      if (global.console) console.warn('تعذّر الاتصال بـ Firebase:', err && err.message);
    });
  }

  function pushRemote() {
    if (!docRef || applyingRemote) return;
    docRef.set(state).catch(function () { /* غير متصل: محفوظ محليًا وسيُزامَن لاحقًا */ });
  }

  function commit() {
    persist();      // فوري محليًا
    pushRemote();   // مزامنة سحابية لبقية الأجهزة
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
    commit();
  }

  function setGroupGoal(groupId, goal) {
    var g = getGroup(groupId);
    if (!g) return;
    goal = parseInt(goal, 10);
    if (isNaN(goal) || goal < 1) goal = 1;
    g.goal = goal;
    commit();
  }

  function addStudent(name, groupId) {
    name = (name || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    if (!getGroup(groupId)) throw new Error('المجموعة غير صحيحة');
    var student = { id: uid(), name: name, groupId: groupId, points: 0 };
    state.students.push(student);
    commit();
    return student;
  }

  function updateStudent(id, fields) {
    var st = getStudent(id);
    if (!st) return;
    if (typeof fields.name === 'string') {
      var nm = fields.name.trim();
      if (nm) st.name = nm;
    }
    if (fields.groupId && getGroup(fields.groupId)) st.groupId = fields.groupId;
    if (typeof fields.points === 'number') st.points = Math.max(0, Math.round(fields.points));
    commit();
  }

  function deleteStudent(id) {
    state.students = state.students.filter(function (s) { return s.id !== id; });
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
    commit();
    return { student: st, entry: entry };
  }

  function clearLog() {
    state.log = [];
    commit();
  }

  function resetAll() {
    state = defaultState();
    commit();
  }

  // استيراد/تصدير نسخة احتياطية
  function exportData() { return JSON.stringify(state, null, 2); }

  function importData(json) {
    var parsed = JSON.parse(json);
    state = (function () {
      var s = defaultState();
      if (parsed.groups && parsed.groups.length) s.groups = parsed.groups;
      if (Array.isArray(parsed.students)) s.students = parsed.students;
      if (Array.isArray(parsed.log)) s.log = parsed.log;
      if (typeof parsed.supervisor === 'string') s.supervisor = parsed.supervisor;
      return s;
    })();
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
    updateStudent: updateStudent,
    deleteStudent: deleteStudent,
    applyPoints: applyPoints,
    clearLog: clearLog,
    resetAll: resetAll,
    exportData: exportData,
    importData: importData,
    subscribe: subscribe
  };
})(window);
