/* ============================================================
   account-widget.js — شاشة حساب المستخدم في زاوية الشاشة
   تعرض اسم المستخدم، وتتيح له تغيير كلمة مروره بنفسه
   (الحالية ثم الجديدة مرتين للتأكيد). يُحمَّل بعد store.js.
   ============================================================ */
(function () {
  'use strict';
  if (!window.Store || typeof Store.getCurrentUser !== 'function') return;

  /* ---------- شريط انقطاع الاتصال (النظام سحابي مباشر) ---------- */
  (function connectivityBanner() {
    if (typeof Store.onConnectivity !== 'function') return;
    var bar = null;
    function ensureBar() {
      if (bar) return bar;
      var s = document.createElement('style');
      s.textContent =
        '#netOfflineBar{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:8px;' +
        'padding:9px 14px;background:linear-gradient(90deg,#e11d48,#b91c1c);color:#fff;font-family:"Tajawal","Segoe UI",sans-serif;' +
        'font-weight:800;font-size:13px;box-shadow:0 4px 16px rgba(190,18,60,.35);direction:rtl;transform:translateY(-100%);transition:transform .25s ease;}' +
        '#netOfflineBar.show{transform:translateY(0);}' +
        '#netOfflineBar .dot{width:9px;height:9px;border-radius:50%;background:#fff;animation:netBlink 1s infinite;}' +
        '@keyframes netBlink{50%{opacity:.25;}}';
      document.head.appendChild(s);
      bar = document.createElement('div');
      bar.id = 'netOfflineBar';
      bar.innerHTML = '<span class="dot"></span><span>لا يوجد اتصال بالإنترنت — الحفظ والتحضير معطّلان حتى عودة الاتصال</span>';
      (document.body || document.documentElement).appendChild(bar);
      return bar;
    }
    Store.onConnectivity(function (online) {
      var b = ensureBar();
      b.classList.toggle('show', !online);
    });
  })();

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function roleLabel(user) {
    if (!user) return '';
    if (user.role === 'owner') return 'مالك المنصة';
    if (user.role === 'admin') return 'الإدارة العامة';
    if (user.stage === 'high') return 'معلم الثانوية';
    if (user.stage === 'all') return 'المرحلتان';
    return 'معلم المتوسطة';
  }

  function injectStyles() {
    if (document.getElementById('account-widget-styles')) return;
    var s = document.createElement('style');
    s.id = 'account-widget-styles';
    s.textContent =
      '.acct-chip{position:fixed;bottom:18px;inset-inline-start:16px;z-index:9990;display:flex;align-items:center;gap:9px;' +
      'padding:8px 12px 8px 8px;border-radius:999px;background:rgba(255,255,255,.82);border:1px solid rgba(255,255,255,.9);' +
      'box-shadow:0 8px 24px rgba(15,23,42,.14);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);cursor:pointer;' +
      'font-family:"Tajawal","Segoe UI",sans-serif;direction:rtl;transition:transform .15s,box-shadow .2s;max-width:70vw;}' +
      '.acct-chip:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(15,23,42,.2);}' +
      '.acct-chip .acct-av{width:34px;height:34px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;' +
      'font-weight:900;font-size:14px;color:#fff;background:linear-gradient(135deg,#818cf8,#4f46e5);}' +
      '.acct-chip .acct-tx{display:flex;flex-direction:column;min-width:0;line-height:1.15;}' +
      '.acct-chip .acct-nm{font-size:12.5px;font-weight:900;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.acct-chip .acct-rl{font-size:9.5px;font-weight:800;color:#4f46e5;}' +
      '.acct-chip .acct-gear{margin-inline-start:2px;font-size:13px;opacity:.5;flex:0 0 auto;}' +
      '.acct-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;' +
      'background:rgba(15,23,42,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transition:opacity .2s;' +
      'font-family:"Tajawal","Segoe UI",sans-serif;direction:rtl;}' +
      '.acct-overlay.show{opacity:1;}' +
      '.acct-card{width:100%;max-width:360px;background:rgba(255,255,255,.96);border:1px solid rgba(255,255,255,.9);border-radius:24px;' +
      'padding:22px;box-shadow:0 30px 70px rgba(15,23,42,.28);transform:scale(.94);transition:transform .2s;text-align:right;}' +
      '.acct-overlay.show .acct-card{transform:scale(1);}' +
      '.acct-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;}' +
      '.acct-head .acct-av{width:44px;height:44px;font-size:18px;}' +
      '.acct-head h3{margin:0;font-size:16px;font-weight:900;color:#1e293b;}' +
      '.acct-head p{margin:2px 0 0;font-size:11px;font-weight:800;color:#4f46e5;}' +
      '.acct-card label{display:block;margin:10px 0 5px;font-size:11.5px;font-weight:900;color:#334155;}' +
      '.acct-card input{width:100%;box-sizing:border-box;min-height:44px;padding:0 13px;border:1px solid rgba(148,163,184,.4);' +
      'border-radius:12px;background:#fff;color:#1e293b;font:inherit;font-size:14px;outline:none;transition:border-color .15s;}' +
      '.acct-card input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(99,102,241,.12);}' +
      '.acct-msg{margin:12px 0 0;padding:9px 12px;border-radius:10px;font-size:12px;font-weight:800;display:none;}' +
      '.acct-msg.err{display:block;background:rgba(244,63,94,.1);color:#be123c;}' +
      '.acct-msg.ok{display:block;background:rgba(16,185,129,.12);color:#047857;}' +
      '.acct-actions{display:flex;gap:9px;margin-top:16px;}' +
      '.acct-actions button{flex:1;min-height:46px;border:0;border-radius:13px;font:inherit;font-weight:900;font-size:13.5px;cursor:pointer;}' +
      '.acct-save{background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;box-shadow:0 10px 22px rgba(79,70,229,.24);}' +
      '.acct-cancel{background:rgba(0,0,0,.05);color:#475569;}' +
      '@media (max-width:600px){.acct-chip .acct-rl{display:none;}}';
    document.head.appendChild(s);
  }

  function firstLetter(name) {
    return String(name || '').trim().charAt(0) || '؟';
  }

  var chip = null;

  function render() {
    if (!Store.isLoggedIn()) { if (chip) { chip.remove(); chip = null; } return; }
    var user = Store.getCurrentUser();
    if (!user) return;
    injectStyles();
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'acct-chip';
      chip.setAttribute('aria-label', 'حسابي وتغيير كلمة المرور');
      // ارفع الودجت فوق شريط التنقّل السفلي إن وُجد (صفحات التحضير)
      if (document.querySelector('nav[class*="bottom-0"], nav.fixed')) chip.style.bottom = '74px';
      chip.addEventListener('click', openModal);
      document.body.appendChild(chip);
    }
    chip.innerHTML =
      '<span class="acct-av">' + esc(firstLetter(user.name)) + '</span>' +
      '<span class="acct-tx"><span class="acct-nm">' + esc(user.name) + '</span><span class="acct-rl">' + esc(roleLabel(user)) + '</span></span>' +
      '<span class="acct-gear">⚙️</span>';
  }

  function openModal() {
    var user = Store.getCurrentUser();
    if (!user) return;
    injectStyles();
    var overlay = document.createElement('div');
    overlay.className = 'acct-overlay';
    overlay.innerHTML =
      '<div class="acct-card" role="dialog" aria-modal="true">' +
        '<div class="acct-head">' +
          '<span class="acct-av">' + esc(firstLetter(user.name)) + '</span>' +
          '<div><h3>' + esc(user.name) + '</h3><p>' + esc(roleLabel(user)) + '</p></div>' +
        '</div>' +
        '<label>كلمة المرور الحالية</label>' +
        '<input type="password" id="acctOld" autocomplete="current-password" placeholder="أدخل كلمة مرورك الحالية" />' +
        '<label>كلمة المرور الجديدة</label>' +
        '<input type="password" id="acctNew" autocomplete="new-password" placeholder="كلمة المرور الجديدة" />' +
        '<label>تأكيد كلمة المرور الجديدة</label>' +
        '<input type="password" id="acctNew2" autocomplete="new-password" placeholder="أعد كتابة كلمة المرور الجديدة" />' +
        '<p class="acct-msg" id="acctMsg"></p>' +
        '<div class="acct-actions">' +
          '<button type="button" class="acct-save" id="acctSave">حفظ كلمة المرور</button>' +
          '<button type="button" class="acct-cancel" id="acctCancel">إلغاء</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    var msg = overlay.querySelector('#acctMsg');
    function showMsg(text, kind) { msg.textContent = text; msg.className = 'acct-msg ' + kind; }
    function close() {
      overlay.classList.remove('show');
      setTimeout(function () { overlay.remove(); }, 200);
    }

    overlay.querySelector('#acctCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    overlay.querySelector('#acctSave').addEventListener('click', function () {
      var oldP = overlay.querySelector('#acctOld').value;
      var newP = overlay.querySelector('#acctNew').value;
      var newP2 = overlay.querySelector('#acctNew2').value;
      if (!oldP || !newP || !newP2) { showMsg('يرجى تعبئة جميع الحقول.', 'err'); return; }
      if (newP !== newP2) { showMsg('كلمتا المرور الجديدتان غير متطابقتين.', 'err'); return; }
      try {
        Store.changeOwnPassword(oldP, newP);
        showMsg('✅ تم تغيير كلمة المرور بنجاح.', 'ok');
        setTimeout(close, 1100);
      } catch (err) {
        showMsg(err && err.message ? err.message : 'تعذّر تغيير كلمة المرور.', 'err');
      }
    });

    setTimeout(function () { var el = overlay.querySelector('#acctOld'); if (el) el.focus(); }, 60);
  }

  function start() {
    render();
    try { Store.subscribe(render); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
