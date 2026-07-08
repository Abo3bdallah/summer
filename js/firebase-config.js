/* ============================================================
   firebase-config.js — تهيئة Firebase + Firestore
   يُحمَّل بعد سكربتات firebase compat من gstatic وقبل store.js
   ============================================================ */
(function (global) {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyAcRdCDM-mff2fhGFeNpozQzSauGQmbnsE",
    authDomain: "rhhal-6de3d.firebaseapp.com",
    projectId: "rhhal-6de3d",
    storageBucket: "rhhal-6de3d.firebasestorage.app",
    messagingSenderId: "500913337277",
    appId: "1:500913337277:web:d4cf537dcd2820869f58d4"
  };

  // لا تُعطّل النظام إن لم تُحمّل مكتبة Firebase (يعمل محليًا فقط حينها)
  if (!global.firebase || !global.firebase.initializeApp) {
    if (global.console) console.warn('لم تُحمّل مكتبة Firebase — سيعمل النظام محليًا فقط.');
    global.db = null;
    return;
  }

  try {
    global.firebase.initializeApp(firebaseConfig);
    global.db = global.firebase.firestore();
    // ملاحظة: أُلغي enablePersistence عمدًا. النظام أصبح «سحابيًا مباشرًا» —
    // لا طابور كتابات محلي يُنفَّذ لاحقًا (كان مصدر اختفاء التحضير والنقاط)،
    // والحفظ يتطلب اتصالًا مؤكَّدًا بالخادم وإلا يُرفض فورًا.
  } catch (e) {
    if (global.console) console.warn('تعذّرت تهيئة Firebase:', e && e.message);
    global.db = null;
  }
})(window);
