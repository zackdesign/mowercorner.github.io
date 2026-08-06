/* Mower Corner — no dependencies, no build step. */
(function () {
  'use strict';

  // Arm the reveal-on-scroll styles from here, not the document head: if this
  // file never loads, nothing is ever hidden.
  document.documentElement.classList.add('js');

  /* ------------------------------------------------------------------------
     Live open/closed readout.
     Computed in the shop's timezone, not the visitor's, so someone checking
     from interstate still sees whether Colac is open right now.
     ------------------------------------------------------------------------ */

  var SCHEDULE = window.MC_HOURS || [];
  var TZ = window.MC_TZ || 'Australia/Melbourne';

  function shopNow() {
    var parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());

    var get = function (type) {
      var p = parts.find(function (x) { return x.type === type; });
      return p ? p.value : '';
    };

    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    // en-AU can render hour 24 for midnight; normalise to 0.
    var hour = parseInt(get('hour'), 10) % 24;

    return {
      day: days[get('weekday').replace(/[^A-Za-z]/g, '').slice(0, 3)],
      minutes: hour * 60 + parseInt(get('minute'), 10)
    };
  }

  function toMinutes(hhmm) {
    var bits = hhmm.split(':');
    return parseInt(bits[0], 10) * 60 + parseInt(bits[1], 10);
  }

  function label(hhmm) {
    var bits = hhmm.split(':');
    var h = parseInt(bits[0], 10);
    var suffix = h < 12 ? 'am' : 'pm';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (bits[1] === '00' ? '' : ':' + bits[1]) + suffix;
  }

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function blockFor(day) {
    for (var i = 0; i < SCHEDULE.length; i++) {
      if (SCHEDULE[i].days.indexOf(day) !== -1 && !SCHEDULE[i].closed) return SCHEDULE[i];
    }
    return null;
  }

  /** Next opening as { day, block }, searching today onwards. */
  function nextOpening(now) {
    for (var ahead = 0; ahead < 8; ahead++) {
      var day = (now.day + ahead) % 7;
      var block = blockFor(day);
      if (!block) continue;
      if (ahead === 0 && now.minutes >= toMinutes(block.open)) continue;
      return { day: day, block: block, ahead: ahead };
    }
    return null;
  }

  function statusText() {
    if (!SCHEDULE.length) return null;
    var now = shopNow();
    var today = blockFor(now.day);

    if (today) {
      var opens = toMinutes(today.open);
      var closes = toMinutes(today.close);
      if (now.minutes >= opens && now.minutes < closes) {
        return { state: 'open', text: 'Open now · until ' + label(today.close) };
      }
    }

    var next = nextOpening(now);
    if (!next) return { state: 'closed', text: 'Closed' };

    var when;
    if (next.ahead === 0) when = 'opens ' + label(next.block.open);
    else if (next.ahead === 1) when = 'opens tomorrow ' + label(next.block.open);
    else when = 'opens ' + DAY_NAMES[next.day] + ' ' + label(next.block.open);

    return { state: 'closed', text: 'Closed · ' + when };
  }

  function renderStatus() {
    var el = document.querySelector('[data-status]');
    if (!el) return;
    var result = statusText();
    if (!result) return;

    el.querySelector('[data-status-text]').textContent = result.text;
    el.setAttribute('data-state', result.state);
    el.hidden = false;
  }

  /** Mark today's row in the opening-hours plate. */
  function markToday() {
    var day = shopNow().day;
    document.querySelectorAll('[data-weekdays]').forEach(function (row) {
      var days = row.getAttribute('data-weekdays').split(',').map(Number);
      if (days.indexOf(day) !== -1) row.setAttribute('data-today', 'true');
      else row.removeAttribute('data-today');
    });
  }

  /* ------------------------------------------------------------------------
     Reveal on scroll — replaces AOS.
     ------------------------------------------------------------------------ */

  function reveals() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    items.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 70 + 'ms';
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------------
     Mobile menu niceties. The <details> disclosure already opens and closes
     on its own; this only adds Escape, outside-click and same-page-anchor
     dismissal, so a JS failure still leaves a working menu.
     ------------------------------------------------------------------------ */

  function mobileMenu() {
    var nav = document.querySelector('.mobnav');
    if (!nav) return;

    var close = function () { nav.removeAttribute('open'); };

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.hasAttribute('open')) {
        close();
        var t = nav.querySelector('summary');
        if (t) t.focus();
      }
    });

    document.addEventListener('click', function (e) {
      if (nav.hasAttribute('open') && !nav.contains(e.target)) close();
    });

    // Same-page anchors don't navigate, so the panel would stay over the content.
    nav.querySelectorAll('a[href*="#"]').forEach(function (a) {
      a.addEventListener('click', close);
    });

    // Never leave it open when the desktop nav takes over.
    var wide = window.matchMedia('(min-width: 62rem)');
    var sync = function () { if (wide.matches) close(); };
    wide.addEventListener ? wide.addEventListener('change', sync) : wide.addListener(sync);
  }

  try {
    mobileMenu();
  } catch (e) { /* the disclosure still works unaided */ }

  try {
    reveals();
  } catch (e) {
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  function refreshStatus() {
    // Intl.formatToParts with an explicit timeZone can throw on old engines;
    // a stale-free status is never worth a blank page.
    try {
      renderStatus();
      markToday();
    } catch (e) { /* leave the noscript/plate fallbacks in place */ }
  }

  refreshStatus();
  setInterval(refreshStatus, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshStatus();
  });
})();
