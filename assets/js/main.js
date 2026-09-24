/* ==========================================================================
   LionCarWorks — main.js
   Tüm sayfalarda aynı dosya çalışır; bölümler sayfada yoksa sessizce atlanır.
   Bölümler: kontak ekranı, ses tercihi, navigasyon, scroll efektleri,
   devir saati, sayaçlar, önce/sonra, tilt & magnetic, WhatsApp formları
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var WA = '905451230996';                 // WhatsApp numarası
  var ENTERED_KEY = 'lcw-entered';         // kontak ekranı oturumda bir kez

  var engine = new EngineSound();

  /* sessionStorage bazı tarayıcılarda kapalı olabilir; sessizce yut */
  function session(op, key) {
    try {
      if (op === 'get') return sessionStorage.getItem(key);
      if (op === 'set') return sessionStorage.setItem(key, '1');
    } catch (e) { return null; }
  }

  /* =========================================================
     1) KONTAK EKRANI (yalnızca ana sayfada, oturumda bir kez)
     ========================================================= */
  var ignition = $('#ignition');

  function unlockPage() {
    document.body.classList.remove('is-locked');
    onScroll();
    revealScan();
  }

  function enterSite(withSound) {
    if (!ignition || ignition.classList.contains('is-opening')) return;
    session('set', ENTERED_KEY);

    if (withSound && !reduced) {
      engine.setMuted(false);
      engine.startUp();
      document.body.classList.add('is-shaking');
      setTimeout(function () { document.body.classList.remove('is-shaking'); }, 900);
    } else {
      engine.setMuted(true);
    }

    ignition.classList.add('is-opening');
    setTimeout(function () {
      unlockPage();
      ignition.classList.add('is-done');
    }, withSound && !reduced ? 900 : 350);
  }

  if (ignition) {
    if (session('get', ENTERED_KEY)) {
      /* aynı oturumda daha önce girilmiş: kapıyı hiç göstermeden geç */
      ignition.parentNode.removeChild(ignition);
      document.body.classList.remove('is-locked');
    } else {
      $('#ignitionBtn').addEventListener('click', function () { enterSite(true); });
      $('#ignitionSkip').addEventListener('click', function (e) {
        e.stopPropagation();
        enterSite(false);
      });
      document.addEventListener('keydown', function (e) {
        if (!ignition.parentNode || ignition.classList.contains('is-done')) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterSite(true); }
        if (e.key === 'Escape') enterSite(false);
      });
    }
  } else {
    document.body.classList.remove('is-locked');
  }

  /* Not: Site içinde ses yok. Motor sesi yalnızca açılıştaki kontak
     ekranında, kullanıcı "KONTAĞI ÇEVİR" dediğinde bir kez çalar.
     (EngineSound.blip() kütüphanede duruyor ama hiçbir yerden çağrılmıyor.) */

  /* =========================================================
     2) NAVİGASYON
     ========================================================= */
  var nav = $('#nav');
  var navBurger = $('#navBurger');
  var navProgress = $('#navProgress');

  if (navBurger) {
    navBurger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navBurger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        navBurger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function onScroll() {
    var y = window.pageYOffset;
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var p = docH > 0 ? Math.min(1, y / docH) : 0;

    if (nav) nav.classList.toggle('is-stuck', y > 40);
    if (navProgress) navProgress.style.width = (p * 100).toFixed(2) + '%';
    setTacho(p);
    stepsProgress();
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', onScroll);

  /* =========================================================
     3) DEVİR SAATİ (ana sayfa)
     ========================================================= */
  var needle = $('#tachoNeedle');
  var tachoVal = $('#tachoVal');
  var ticks = $('#tachoTicks');

  if (ticks) {
    var html = '';
    for (var i = 0; i <= 8; i++) {
      var ang = (-125 + (250 / 8) * i) * Math.PI / 180;
      var x1 = 100 + Math.sin(ang) * 70, y1 = 100 - Math.cos(ang) * 70;
      var x2 = 100 + Math.sin(ang) * 78, y2 = 100 - Math.cos(ang) * 78;
      html += '<line class="' + (i >= 6 ? 'hot' : '') + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
              '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"></line>';
    }
    ticks.innerHTML = html;
  }

  function setTacho(p) {
    if (!needle) return;
    needle.style.transform = 'rotate(' + (-125 + p * 250).toFixed(1) + 'deg)';
    if (tachoVal) tachoVal.textContent = (p * 8).toFixed(1);
  }

  /* =========================================================
     4) SCROLL REVEAL
     ========================================================= */
  var revealEls = $$('.reveal');
  var io = null;

  if ('IntersectionObserver' in window && !reduced) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var d = parseInt(el.getAttribute('data-delay') || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, d);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  function revealScan() {
    revealEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.95) {
        var d = parseInt(el.getAttribute('data-delay') || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, d);
        if (io) io.unobserve(el);
      }
    });
  }

  /* =========================================================
     5) SAYAÇLAR
     ========================================================= */
  function runCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1500, t0 = performance.now();
    (function frame(now) {
      var p = Math.min(1, (now - t0) / dur);
      var v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = v.toLocaleString('tr-TR') + suffix;
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  var counterEls = $$('.counter b');
  if (counterEls.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        runCounter(en.target);
        cio.unobserve(en.target);
      });
    }, { threshold: 0.4 });
    counterEls.forEach(function (el) { cio.observe(el); });
  } else {
    counterEls.forEach(function (el) {
      el.textContent = parseFloat(el.getAttribute('data-count')).toLocaleString('tr-TR') +
                       (el.getAttribute('data-suffix') || '');
    });
  }

  /* =========================================================
     6) SÜREÇ ÇİZGİSİ
     ========================================================= */
  var steps = $('#steps');
  var stepsLine = $('#stepsLine i');

  function stepsProgress() {
    if (!steps || !stepsLine) return;
    var r = steps.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = (vh * 0.85 - r.top) / (r.height + vh * 0.2);
    stepsLine.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
  }

  /* =========================================================
     7) ÖNCE / SONRA KAYDIRICI
     ========================================================= */
  var ba = $('#ba'), baBefore = $('#baBefore'), baHandle = $('#baHandle');

  if (ba && baBefore && baHandle) {
    var dragging = false;

    function setBa(pct) {
      pct = Math.max(0, Math.min(100, pct));
      baBefore.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(2) + '% 0 0)';
      baHandle.style.left = pct + '%';
      baHandle.setAttribute('aria-valuenow', Math.round(pct));
    }
    function fromEvent(e) {
      var r = ba.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      setBa((x / r.width) * 100);
    }

    ba.addEventListener('mousedown', function (e) { dragging = true; fromEvent(e); });
    window.addEventListener('mousemove', function (e) { if (dragging) fromEvent(e); });
    window.addEventListener('mouseup', function () { dragging = false; });
    ba.addEventListener('touchstart', function (e) { dragging = true; fromEvent(e); }, { passive: true });
    ba.addEventListener('touchmove', function (e) { if (dragging) fromEvent(e); }, { passive: true });
    window.addEventListener('touchend', function () { dragging = false; });

    baHandle.addEventListener('keydown', function (e) {
      var cur = parseFloat(baHandle.getAttribute('aria-valuenow')) || 50;
      if (e.key === 'ArrowLeft') { setBa(cur - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { setBa(cur + 4); e.preventDefault(); }
    });

    /* görünür olduğunda bir kez kendiliğinden gösteri yapsın */
    if ('IntersectionObserver' in window && !reduced) {
      var bio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          bio.unobserve(en.target);
          var t0 = performance.now();
          (function demo(now) {
            var p = Math.min(1, (now - t0) / 2200);
            setBa(50 + Math.sin((1 - Math.pow(1 - p, 3)) * Math.PI) * 32);
            if (p < 1) requestAnimationFrame(demo);
          })(t0);
        });
      }, { threshold: 0.45 });
      bio.observe(ba);
    }
  }

  /* =========================================================
     8) TILT + MAGNETIC + FARE IŞIĞI + ÖZEL İMLEÇ
     ========================================================= */
  var fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  if (fine && !reduced) {
    $$('[data-tilt]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transform = 'perspective(900px) rotateY(' + ((x - 0.5) * 9).toFixed(2) +
                             'deg) rotateX(' + ((0.5 - y) * 9).toFixed(2) + 'deg) translateY(-6px)';
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });

    $$('.magnetic').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 9).toFixed(1) + 'px,' + (dy * 9).toFixed(1) + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });

    var glow = $('#heroGlow'), hero = $('#hero');
    if (glow && hero) {
      hero.addEventListener('mousemove', function (e) {
        var r = hero.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.12;
        var y = (e.clientY - r.top - r.height / 2) * 0.12;
        glow.style.transform = 'translate(calc(-50% + ' + x.toFixed(0) + 'px), calc(-50% + ' + y.toFixed(0) + 'px))';
      });
    }

    var cursor = $('#cursor');
    if (cursor) {
      var cx = 0, cy = 0, tx = 0, ty = 0;
      window.addEventListener('mousemove', function (e) {
        tx = e.clientX; ty = e.clientY;
        cursor.classList.add('is-on');
      });
      (function loop() {
        cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
        cursor.style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px) translate(-50%,-50%)';
        requestAnimationFrame(loop);
      })();
      $$('a, button, .card, .gal, summary, .ba, .quicklink').forEach(function (el) {
        el.addEventListener('mouseenter', function () { cursor.classList.add('is-hot'); });
        el.addEventListener('mouseleave', function () { cursor.classList.remove('is-hot'); });
      });
    }
  }

  /* =========================================================
     9) KAYAN ŞERİT / DAKTİLO / SSS
     ========================================================= */
  var track = $('#marqueeTrack');
  if (track) track.innerHTML += track.innerHTML;

  var typeEl = $('#heroType');
  if (typeEl && !reduced) {
    var words = ['DAHA İYİ', 'KUSURSUZ', 'SIFIR GİBİ', 'PARLAK'];
    var wi = 0, ci = words[0].length, deleting = true;
    setTimeout(function tick() {
      if (deleting) {
        ci--;
        if (ci <= 0) { deleting = false; wi = (wi + 1) % words.length; }
      } else {
        ci++;
        if (ci >= words[wi].length) deleting = true;
      }
      typeEl.textContent = words[wi].slice(0, ci);
      setTimeout(tick, deleting ? 55 : 95 + (ci >= words[wi].length ? 1600 : 0));
    }, 2600);
  }

  var faqItems = $$('#faq details');
  faqItems.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      faqItems.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  /* =========================================================
     10) FORMLAR -> WHATSAPP
     data-wa-subject taşıyan her form, alan etiketleriyle birlikte
     hazır bir WhatsApp mesajına dönüşür. Sunucuya kayıt atmaz.
     ========================================================= */
  function sendWhatsApp(lines) {
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(lines.join('\n')),
                '_blank', 'noopener');
  }

  $$('form[data-wa-subject]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lines = ['Merhaba LionCarWorks,', form.getAttribute('data-wa-subject'), ''];
      $$('[name]', form).forEach(function (el) {
        var val = (el.value || '').trim();
        if (!val) return;
        var lab = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
        var name = lab ? lab.textContent.replace(/\s+/g, ' ').trim() : el.name;
        lines.push(name + ': ' + val);
      });
      sendWhatsApp(lines);
    });
  });

  /* Hizmet sayfasından gelen ?hizmet=... seçimini formda işaretle */
  (function preselectService() {
    var m = /[?&]hizmet=([^&]+)/.exec(location.search);
    var sel = $('#r-service');
    if (!m || !sel) return;
    var map = {
      'kaporta-boya': 'Kaporta', 'pdr': 'PDR', 'ppf': 'PPF',
      'hasar-sigorta': 'Sigorta', 'seramik': 'Seramik', 'doseme': 'Döşeme'
    };
    var needle2 = map[decodeURIComponent(m[1])];
    if (!needle2) return;
    $$('option', sel).forEach(function (o) {
      if (o.textContent.indexOf(needle2) > -1) sel.value = o.value;
    });
  })();

  /* =========================================================
     11) KÜÇÜK İŞLER
     ========================================================= */
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  var toTop = $('#toTop');
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  onScroll();
  if (!document.body.classList.contains('is-locked')) revealScan();
})();
