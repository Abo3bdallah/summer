/* ============================================================
   individual-display.js — شاشة عرض النقاط الفردية
   بطاقة لكل طالب باسمه ونقاطه، بلون مجموعته. تحديث لحظي.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function groupClass(id) {
    return ({ qimma: 'qimma', tumooh: 'tumooh', sumood: 'sumood', ruwwad: 'ruwwad', nogroup: 'nogroup' })[id] || 'nogroup';
  }

  var grid = document.getElementById('igrid');
  var legend = document.getElementById('legend');
  var empty = document.getElementById('iempty');
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

  function renderLegend() {
    var groups = Store.getGroups().filter(function (g) { return g.id !== 'nogroup'; });
    legend.innerHTML = groups.map(function (g) {
      var cls = groupClass(g.id);
      var count = Store.getStudents().filter(function (s) { return s.groupId === g.id; }).length;
      return '<span class="lg"><span class="sw bg-' + cls + '"></span>' + esc(g.name) +
        ' <span class="ct">(' + count + ')</span></span>';
    }).join('');
  }

  function render() {
    renderLegend();

    // رتّب: حسب النقاط تنازلياً ثم الاسم أبجدياً
    var students = Store.getStudents().slice().sort(function (a, b) {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.name.localeCompare(b.name, 'ar');
    });

    empty.style.display = students.length ? 'none' : 'block';

    // أعد البناء عند تغيّر العدد/الترتيب، وإلا حدّث القيم فقط
    var ids = students.map(function (s) { return s.id; }).join(',');
    if (grid.dataset.ids !== ids) {
      grid.dataset.ids = ids;
      grid.innerHTML = students.map(function (s) {
        var cls = groupClass(s.groupId);
        return '<div class="scard ' + cls + '" data-id="' + s.id + '">' +
          '<span class="pbadge">' + s.points + '</span>' +
          '<span class="pname">' + esc(s.name) + '</span>' +
        '</div>';
      }).join('');
      // البطاقات أُعيد إنشاؤها، فحدّث التتبّع للجميع لتجنّب أي وميض
      students.forEach(function (s) { lastPoints[s.id] = s.points; });
      return;
    }

    students.forEach(function (s) {
      var card = grid.querySelector('[data-id="' + s.id + '"]');
      if (!card) return;
      var badge = card.querySelector('.pbadge');
      var prev = lastPoints[s.id];
      if (prev === undefined) {
        badge.textContent = s.points;
      } else if (prev !== s.points) {
        animateNumber(badge, prev, s.points);
        card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse');
      }
      lastPoints[s.id] = s.points;
    });
  }

  Store.subscribe(render);
  render();
})();
