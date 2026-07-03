/* ============================================================
   memos-banner.js — عرض أحدث توجيه إداري في صفحات التحضير
   ============================================================ */
(function () {
  'use strict';
  var stage = document.body.classList.contains('high-attendance-page') ? 'high' : 'middle';
  var banner = document.createElement('section');
  banner.className = 'rehal-memo-banner';
  banner.hidden = true;
  banner.innerHTML = '<span class="rehal-memo-icon">📣</span><div><strong></strong><p></p></div><button type="button" aria-label="إخفاء التوجيه">×</button>';

  var style = document.createElement('style');
  style.textContent = [
    '.rehal-memo-banner{margin:12px auto 0;width:min(1120px,calc(100% - 28px));padding:12px 14px;display:flex;align-items:center;gap:11px;border:1px solid rgba(99,102,241,.22);border-radius:14px;background:rgba(238,242,255,.94);color:#3730a3;box-shadow:0 8px 22px rgba(79,70,229,.08);font-family:Tajawal,sans-serif;position:relative;z-index:35}',
    '.rehal-memo-banner[hidden]{display:none}.rehal-memo-banner.urgent{color:#9f1239;background:rgba(255,228,230,.96);border-color:rgba(244,63,94,.25)}',
    '.rehal-memo-icon{font-size:22px}.rehal-memo-banner div{flex:1}.rehal-memo-banner strong{font-size:11px;font-weight:900}.rehal-memo-banner p{margin:2px 0 0;font-size:12px;font-weight:700;line-height:1.55}',
    '.rehal-memo-banner button{width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.65);color:inherit;font-size:18px;cursor:pointer}'
  ].join('');
  document.head.appendChild(style);

  var header = document.querySelector('header');
  if (header && header.parentNode) header.parentNode.insertBefore(banner, header.nextSibling);
  else document.body.insertBefore(banner, document.body.firstChild);

  function render() {
    var memos = Store.getActiveMemos(stage);
    if (!memos.length) {
      banner.hidden = true;
      return;
    }
    var memo = memos[0];
    if (banner.dataset.dismissed === memo.id) return;
    banner.classList.toggle('urgent', memo.level === 'urgent');
    banner.querySelector('strong').textContent = memo.level === 'urgent' ? 'تنبيه إداري عاجل' : 'توجيه الإدارة';
    banner.querySelector('p').textContent = memo.message;
    banner.dataset.memoId = memo.id;
    banner.hidden = false;
  }

  banner.querySelector('button').addEventListener('click', function () {
    banner.dataset.dismissed = banner.dataset.memoId || '';
    banner.hidden = true;
  });

  render();
  Store.subscribe(render);
})();
