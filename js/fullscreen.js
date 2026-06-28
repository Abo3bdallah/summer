/* ============================================================
   fullscreen.js — زر ملء الشاشة العائم لشاشات العرض
   ============================================================ */
(function () {
  'use strict';

  var btn = document.createElement('button');
  btn.className = 'fs-btn';
  btn.title = 'ملء الشاشة';
  btn.setAttribute('aria-label', 'تبديل ملء الشاشة');
  btn.textContent = '⛶';
  document.body.appendChild(btn);

  function isFs() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }
  function enter() {
    var el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
  }
  function exit() {
    (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
  }
  function sync() { btn.textContent = isFs() ? '🗗' : '⛶'; }

  btn.addEventListener('click', function () { isFs() ? exit() : enter(); });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
})();
