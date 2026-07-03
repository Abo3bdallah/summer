/* ============================================================
   display.js — شاشة العرض الصيفية (عدّادات المجموعات الطولية)
   - أربعة عدّادات عمودية تصعد التعبئة فيها نحو نجمة الهدف
   - مقياس موحّد (0 → أعلى هدف) لمقارنة الارتفاع بين المجموعات
   - فقاعة رقم تركب أعلى التعبئة + تحديث لحظي عبر Store
   ============================================================ */
(function () {
  'use strict';

  if (!Store.isLoggedIn()) {
    window.location.replace('index.html?next=display.html');
    return;
  }
  if (!Store.belongsToStage('middle') || !Store.hasPermission('viewDisplays')) {
    window.location.replace('dashboard.html');
    return;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function groupClass(id) {
    return ({ qimma: 'qimma', tumooh: 'tumooh', sumood: 'sumood', ruwwad: 'ruwwad' })[id] || 'qimma';
  }
  var MEDALS = ['🥇', '🥈', '🥉', '4'];

  var stage = document.getElementById('dgrid');
  var lastPoints = {};

  /* ----- فقاعات صيفية ----- */
  (function makeBubbles() {
    var box = document.getElementById('bubbles');
    if (!box) return;
    var html = '';
    for (var i = 0; i < 14; i++) {
      var size = 12 + Math.random() * 34;
      var left = Math.random() * 100;
      var dur = 9 + Math.random() * 12;
      var delay = Math.random() * 12;
      html += '<i style="left:' + left + '%;width:' + size + 'px;height:' + size +
        'px;animation-duration:' + dur + 's;animation-delay:-' + delay + 's"></i>';
    }
    box.innerHTML = html;
  })();

  /* ----- عدّاد أرقام متصاعد ----- */
  function animateNumber(el, from, to) {
    if (el._raf) cancelAnimationFrame(el._raf);
    var start = null, dur = 700;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) { el._raf = requestAnimationFrame(step); }
    }
    el._raf = requestAnimationFrame(step);
  }

  function render() {
    var summaries = Store.getGroupSummaries();
    // ترتيب تنازلي حسب النقاط (المتصدّر أولًا)
    summaries.sort(function (a, b) {
      return b.points - a.points || a.name.localeCompare(b.name, 'ar');
    });

    // المقياس الموحّد = أعلى هدف بين المجموعات (لمقارنة عادلة بالارتفاع)
    var scale = 1;
    summaries.forEach(function (s) { if (s.goal > scale) scale = s.goal; });

    // أنشئ الأعمدة مرة واحدة
    if (stage.children.length !== summaries.length) {
      stage.innerHTML = summaries.map(function (s) {
        var cls = groupClass(s.id);
        var ticks = '';
        for (var t = 1; t < 4; t++) { ticks += '<i style="bottom:' + (t * 25) + '%"></i>'; }
        return '<div class="vcol ' + cls + '" data-id="' + s.id + '">' +
          '<div class="vrank"></div>' +
          '<div class="vstar">☆</div>' +
          '<div class="vtrackwrap">' +
            '<div class="vtrack"><div class="vticks">' + ticks + '</div>' +
              '<div class="vfill"></div></div>' +
            '<div class="vbubble">0</div>' +
          '</div>' +
          '<div class="vname">' + esc(s.name) + '</div>' +
          '<div class="vflag">🎯 تجاوز الهدف</div>' +
        '</div>';
      }).join('');
    }

    summaries.forEach(function (s, i) {
      var col = stage.querySelector('[data-id="' + s.id + '"]');
      if (!col) return;

      // ترتيب بصري حسب التصدّر
      col.style.order = i;
      col.querySelector('.vrank').textContent = MEDALS[i] || (i + 1);

      // ارتفاع التعبئة على المقياس الموحّد (لا يتجاوز 100%)
      var heightPct = Math.min(100, Math.round((s.points / scale) * 100));
      var fill = col.querySelector('.vfill');
      fill.style.height = heightPct + '%';
      // الفقاعة تركب أعلى التعبئة (خارج المسار المقصوص فلا تُقَصّ عند الصفر)
      col.querySelector('.vbubble').style.bottom = heightPct + '%';

      // النجمة تُضيء عند بلوغ هدف المجموعة نفسها
      var reached = s.percent >= 100;
      var star = col.querySelector('.vstar');
      star.textContent = reached ? '⭐' : '☆';
      star.classList.toggle('lit', reached);
      col.classList.toggle('leader', i === 0 && s.points > 0);
      col.querySelector('.vflag').classList.toggle('show', reached);

      // فقاعة الرقم + العدّاد المتصاعد
      var bubble = col.querySelector('.vbubble');
      var prev = lastPoints[s.id];
      if (prev === undefined) {
        bubble.textContent = s.points;
      } else if (prev !== s.points) {
        animateNumber(bubble, prev, s.points);
        col.classList.remove('pulse'); void col.offsetWidth; col.classList.add('pulse');
      }
      lastPoints[s.id] = s.points;
    });
  }

  Store.subscribe(render);
  render();
})();
