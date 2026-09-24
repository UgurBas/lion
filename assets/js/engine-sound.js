/* ==========================================================================
   engine-sound.js  (v3 — W16 quad-turbo karakteri)
   Motor sesi örnek tabanlı sentezle üretilir: her silindir ateşlemesi için
   sönümlü bir egzoz darbesi hesaplanır; üstüne emme gürültüsü, turbo ıslığı,
   gaz kesmede blow-off ve marş sesi eklenir. Sonuç bir AudioBuffer'a yazılıp
   çalınır — harici ses dosyası yoktur.

   16 silindir + 4 zamanlı motorda devir başına 8 ateşleme olur; darbeler
   üst üste bindiği için tek tek "pat pat" yerine yoğun, tiz bir uğultu çıkar.
   Turbo ıslığı devir ve gaz ile birlikte yükselip gaz kesildiğinde yavaşça
   düşer (spool-down), ardından blow-off "pss" sesi gelir.

   Kullanım:
     var eng = new EngineSound();
     eng.unlock();     // kullanıcı etkileşimi içinde
     eng.startUp();    // marş -> gaz -> rölanti
     eng.blip();       // kısa gaz vuruşu
     eng.setMuted(true);

   Sesi kendi kaydınızla değiştirmek isterseniz dosyanın sonundaki NOT'a bakın.
   ========================================================================== */

(function (global) {
  'use strict';

  var AudioCtx = global.AudioContext || global.webkitAudioContext;

  /* ==========================================================================
     AYARLAR — sesi buradan biçimlendirin
     ========================================================================== */
  var TUNE = {
    cylinders: 16,       // 4 = ince, 8 = kalın V8, 12/16 = pürüzsüz ve tiz
    volume: 0.65,        // 0 - 1 arası genel ses düzeyi
    idleRpm: 850,        // rölanti devri
    revPeakRpm: 6500,    // açılışta çıkılan tepe devir
    blipPeakRpm: 4200,   // buton üzerine gelince yapılan gaz vuruşu
    turbo: 0.9,          // turbo ıslığı miktarı (0 = atmosferik motor)
    blowoff: 0.9,        // gaz kesmede blow-off "pss" miktarı
    crackle: 0.5,        // egzoz çıtırtısı (0 - 1; turbo motorlarda az olur)
    reverb: 0.26,        // atölye yankısı miktarı (0 = kapalı)
    idleSeconds: 3.4,    // açılıştan sonra rölanti kaç saniye duyulsun

    /* Kendi kaydınızı kullanmak için: dosyayı assets/sound/ altına koyup
       yolunu buraya yazın; o zaman sentez yerine kayıt çalınır. Dosya
       açılamazsa otomatik olarak sentezlenen sese düşülür.
       Örn: sampleUrl: 'assets/sound/exhaust.mp3'
       Yalnızca hakkına sahip olduğunuz / lisanslı kayıtları kullanın. */
    sampleUrl: 'assets/sound/car-engine.mp3',       // açılıştaki marş + gaz sesi (boş = sentez)
    blipUrl: ''          // (opsiyonel) kısa gaz vuruşu dosyası
  };

  /* ---------- yardımcılar ---------- */

  /* Tekrarlanabilir rastgelelik (her yüklemede aynı motor karakteri) */
  function rng(seed) {
    var s = seed || 1;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ==========================================================================
     ÇEKİRDEK: örnekleri hesaplayan saf fonksiyonlar (Node'da da test edilebilir)
     ========================================================================== */

  /* Tek bir egzoz darbesi: derin vuruş + gövde rezonansı + orta bant "brap" +
     tiz atak. Gürültü patlaması, rastgelelik gerektirdiği için çağıran
     döngüde eklenir. */
  function pulse(u, p) {
    if (u < 0 || u > p.len) return 0;
    var thud = Math.sin(2 * Math.PI * p.f0 * u) * Math.exp(-u / p.t0) * 0.40;
    var body = Math.sin(2 * Math.PI * p.f1 * u) * Math.exp(-u / p.t1) * 0.85;
    var mid = Math.sin(2 * Math.PI * p.f2 * u) * Math.exp(-u / p.t2) * 1.0;
    var bite = Math.sin(2 * Math.PI * p.f3 * u) * Math.exp(-u / p.t3) * 0.6;
    return (thud + body + mid + bite) * p.gain;
  }

  /* Devir -> darbe parametreleri. Devir yükseldikçe darbeler kısalır ve
     sertleşir. Silindir sayısı arttıkça darbeler kısalır (üst üste binmenin
     sesi çamurlaştırmaması için) ve seviye düşürülür. */
  function pulseParams(rpm, throttle, cylGain, cylinders) {
    var k = clamp(rpm / 7000, 0.05, 1);
    var thr = clamp(throttle, 0, 1);
    var dense = clamp(8 / cylinders, 0.4, 2);        // 16 silindirde 0.5
    return {
      f0: 58 + 26 * k,                               // derin gövde vuruşu
      f1: 112 + 150 * k,                             // egzoz gövdesi
      f2: 460 + 700 * k,                             // orta bant "brap"
      f3: 1700 + 1700 * k,                           // tiz atak
      t0: 0.048 * (1 - 0.55 * k) * (0.55 + 0.45 * dense),
      t1: 0.026 * (1 - 0.55 * k) * (0.55 + 0.45 * dense),
      t2: 0.0080 * (1 - 0.35 * k),
      t3: 0.0030 * (1 - 0.3 * k),
      burst: 0.62 + 0.5 * thr,
      burstT: 0.0022 + 0.0018 * (1 - k),
      len: 0.12,
      gain: cylGain * (0.55 + 0.45 * thr) * (0.85 + 0.3 * k) * Math.sqrt(dense)
    };
  }

  /* Motor sesini örnek örnek üretir.
     opts: { sampleRate, duration, rpmAt(t), throttleAt(t), cylinders,
             crackle, crank, seed, loop } */
  function renderEngine(opts) {
    var sr = opts.sampleRate || 44100;
    var n = Math.max(1, Math.floor(sr * opts.duration));
    /* Döngü tamponlarında sonu başına dikmek için fazladan kuyruk üretilir */
    var xf = opts.loop ? Math.floor(sr * 0.03) : 0;
    var nTotal = n + xf;
    var out = new Float32Array(nTotal);
    var cylinders = opts.cylinders || TUNE.cylinders;
    var rand = rng(opts.seed || 7);
    var rpmAt = opts.rpmAt, thrAt = opts.throttleAt;
    var genDur = opts.duration + xf / sr;
    var crackleAmt = opts.crackle == null ? 0 : opts.crackle;

    /* silindirden silindire küçük farklar: motora karakter verir */
    var cylGains = [];
    for (var c = 0; c < cylinders; c++) cylGains.push(0.92 + rand() * 0.18);

    /* 1) ateşleme olaylarını topla (zaman, parametre) */
    var fires = [];
    var t = 0, cyl = 0;
    while (t < genDur) {
      var rpm = rpmAt(t), thr = thrAt(t);
      var firesPerSec = (rpm / 60) * (cylinders / 2);      // 4 zamanlı
      if (firesPerSec < 1) break;
      var p = pulseParams(rpm, thr, cylGains[cyl % cylinders], cylinders);

      /* gaz kesmede egzoz çıtırtısı (turbo motorlarda seyrek) */
      p.crackle = 0;
      if (crackleAmt && thr < 0.12 && rpm > 2500 && rand() < 0.1 * crackleAmt) {
        p.crackle = (0.4 + rand() * 0.5) * crackleAmt;
        p.gain *= 1.4;
      }
      /* marş: ateşleme yok, sadece sıkıştırma tıkırtısı */
      if (opts.crank && t < opts.crank) {
        p.gain *= 0.42;
        p.f2 *= 1.7;
        p.t1 *= 0.5;
      }
      fires.push({ at: t, p: p });
      t += 1 / firesPerSec * (0.99 + rand() * 0.02);       // hafif düzensizlik
      cyl++;
    }

    /* 2) darbeleri tamponun üzerine topla */
    for (var i = 0; i < fires.length; i++) {
      var f = fires[i], pp = f.p;
      var start = Math.floor(f.at * sr);
      var plen = Math.floor(pp.len * sr);
      var noiseAmp = pp.crackle;
      for (var s = 0; s < plen; s++) {
        var idx = start + s;
        if (idx >= nTotal) break;
        var u = s / sr;
        var v = pulse(u, pp);
        /* her ateşlemede kısa gürültü patlaması: sesin "havası" buradan gelir */
        v += (rand() * 2 - 1) * pp.burst * pp.gain * Math.exp(-u / pp.burstT);
        if (noiseAmp) v += (rand() * 2 - 1) * noiseAmp * Math.exp(-u / 0.004);
        out[idx] += v;
      }
    }

    /* 3) emme gürültüsü + turbo ıslığı + blow-off + marş motoru */
    var lp = 0, hp = 0;
    var spool = 0, phase = 0, prevThr = thrAt(0), bovAt = -1;
    var turboAmt = opts.turbo == null ? 0 : opts.turbo;
    var bovAmt = opts.blowoff == null ? 0 : opts.blowoff;
    var nlp = 0;

    for (var j = 0; j < nTotal; j++) {
      var tt = j / sr;
      var rpmj = rpmAt(tt), thrj = thrAt(tt);
      var kj = clamp(rpmj / 7000, 0, 1);

      /* geniş bantlı emme gürültüsü */
      var white = rand() * 2 - 1;
      lp += (white - lp) * (0.18 + 0.36 * kj);
      hp = lp - hp * 0.2;
      var air = hp * (0.24 + 0.6 * kj * (0.3 + 0.7 * thrj));

      /* turbo: yükü yavaş takip eder (spool-up / spool-down) */
      var target = kj * (0.22 + 0.78 * thrj);
      spool += (target - spool) * (target > spool ? 0.00035 : 0.00016);
      var fTurbo = 1150 + 7000 * Math.pow(clamp(spool, 0, 1), 1.15);
      phase += 2 * Math.PI * fTurbo / sr;
      if (phase > 1e6) phase -= 1e6;
      var whine = (Math.sin(phase) * 0.6 + Math.sin(phase * 2) * 0.18 +
                   Math.sin(phase * 0.5) * 0.12);
      var turbo = whine * Math.pow(spool, 1.6) * turboAmt * 0.16;

      /* blow-off: gaz hızla kesildiğinde basınç tahliyesi */
      if (prevThr - thrj > 0.2 && rpmj > 2200 && bovAt < 0) bovAt = tt;
      prevThr = thrj;
      var bov = 0;
      if (bovAmt && bovAt >= 0 && tt - bovAt < 0.5) {
        var e = 1 - (tt - bovAt) / 0.5;
        nlp += (white - nlp) * 0.55;                       // parlak hışırtı
        bov = (white - nlp) * bovAmt * 0.42 * Math.pow(e, 1.8);
      }

      /* marş motoru vınlaması */
      var starter = 0;
      if (opts.crank && tt < opts.crank) {
        var w = 1 - tt / opts.crank;
        starter = Math.sin(2 * Math.PI * (1250 + 90 * Math.sin(tt * 40)) * tt) * 0.05 * w
                + Math.sin(2 * Math.PI * 2500 * tt) * 0.018 * w;
      }

      out[j] = out[j] * 0.46 + air * 0.42 + turbo + bov + starter;
    }

    /* 4) yumuşak doyum (tanh) + kenar yumuşatma */
    var fade = Math.floor(sr * 0.006);
    for (var q = 0; q < nTotal; q++) {
      var x = out[q] * 1.5;
      var y = x / (1 + Math.abs(x));                       // tanh benzeri
      if (!opts.loop) {
        if (q < fade) y *= q / fade;
        if (q > n - fade) y *= (n - q) / fade;
      }
      out[q] = y * 0.9;
    }

    if (!opts.loop) return out;

    /* 5) döngü dikişi: fazladan üretilen kuyruk, tamponun başına
       eşit güçlü çapraz geçişle karıştırılır -> tık sesi kalmaz */
    var head = out.subarray(0, n);
    for (var x2 = 0; x2 < xf; x2++) {
      var w2 = x2 / xf;
      head[x2] = head[x2] * Math.sin(w2 * Math.PI / 2) +
                 out[n + x2] * Math.cos(w2 * Math.PI / 2);
    }
    return head;
  }

  /* Rölanti için kusursuz döngü: uzunluk tam sayıda ateşleme periyodu olsun */
  function idleLoopOptions(sr, rpm, cylinders) {
    rpm = rpm || TUNE.idleRpm;
    cylinders = cylinders || TUNE.cylinders;
    var firesPerSec = (rpm / 60) * (cylinders / 2);
    var cycles = Math.round(firesPerSec * 0.5);            // ~0.5 sn'lik döngü
    return {
      sampleRate: sr,
      duration: cycles / firesPerSec,
      cylinders: cylinders,
      rpmAt: function () { return rpm; },
      throttleAt: function () { return 0.1; },
      turbo: TUNE.turbo * 0.25,                            // rölantide turbo uykuda
      blowoff: 0,
      crackle: 0,
      loop: true,
      seed: 21
    };
  }

  /* Marş -> gaz -> rölantiye dönüş eğrisi */
  function revOptions(sr, cylinders) {
    cylinders = cylinders || TUNE.cylinders;
    var crank = 0.62, idle = TUNE.idleRpm, peak = TUNE.revPeakRpm;
    var dur = 4.6;
    function rpmAt(t) {
      if (t < crank) return 240 + 60 * Math.sin(t * 26);            // marş
      if (t < crank + 0.18) return 240 + (idle - 240) * ((t - crank) / 0.18);
      var t2 = t - (crank + 0.18);
      if (t2 < 1.15) {                                             // gaz
        var k = t2 / 1.15;
        return idle + (peak - idle) * (1 - Math.pow(1 - k, 1.9));
      }
      var t3 = t2 - 1.15;
      if (t3 < 0.25) return peak;                                  // tepede tutuş
      var t4 = t3 - 0.25;
      if (t4 < 1.5) {                                              // gaz kesildi
        var k4 = t4 / 1.5;
        return peak + (1150 - peak) * (1 - Math.pow(1 - k4, 2.2));
      }
      return idle + (1150 - idle) * Math.exp(-(t4 - 1.5) * 2.2);    // rölanti
    }
    function thrAt(t) {
      if (t < crank + 0.18) return 0.15;
      var t2 = t - (crank + 0.18);
      if (t2 < 1.15) return 0.4 + 0.6 * (t2 / 1.15);
      if (t2 < 1.4) return 1;
      return 0.04;
    }
    return {
      sampleRate: sr, duration: dur, cylinders: cylinders,
      rpmAt: rpmAt, throttleAt: thrAt, crank: crank,
      crackle: TUNE.crackle, turbo: TUNE.turbo, blowoff: TUNE.blowoff, seed: 7
    };
  }

  /* Kısa gaz vuruşu */
  function blipOptions(sr, cylinders) {
    cylinders = cylinders || TUNE.cylinders;
    var idle = TUNE.idleRpm, peak = TUNE.blipPeakRpm;
    function rpmAt(t) {
      if (t < 0.3) return idle + (peak - idle) * (1 - Math.pow(1 - t / 0.3, 1.6));
      var t2 = t - 0.3;
      return peak + (idle - peak) * (1 - Math.pow(1 - clamp(t2 / 0.6, 0, 1), 2));
    }
    function thrAt(t) { return t < 0.32 ? 0.95 : 0.03; }
    return {
      sampleRate: sr, duration: 1.05, cylinders: cylinders,
      rpmAt: rpmAt, throttleAt: thrAt,
      crackle: TUNE.crackle, turbo: TUNE.turbo * 0.7, blowoff: TUNE.blowoff * 0.8,
      seed: 13
    };
  }

  /* Atölye yankısı için kısa darbe yanıtı */
  function renderIR(sr) {
    var n = Math.floor(sr * 0.42), out = new Float32Array(n), rand = rng(99);
    for (var i = 0; i < n; i++) {
      out[i] = (rand() * 2 - 1) * Math.exp(-(i / sr) * 11) * 0.5;
    }
    /* iki erken yansıma: beton duvar hissi */
    out[Math.floor(sr * 0.011)] += 0.5;
    out[Math.floor(sr * 0.027)] += 0.32;
    return out;
  }

  /* ==========================================================================
     SES MOTORU (Web Audio bağlantıları)
     ========================================================================== */

  function EngineSound(opts) {
    opts = opts || {};
    this.cylinders = opts.cylinders || TUNE.cylinders;
    this.volume = opts.volume == null ? TUNE.volume : opts.volume;
    this.supported = !!AudioCtx;
    this.muted = false;
    this.ctx = null;
    this.cache = {};
    this._files = [];          // dosyadan çalan <audio> öğeleri
    this._lastBlip = 0;
    this._idleSrc = null;
  }

  EngineSound.prototype.unlock = function () {
    if (!this.supported) return false;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this._buildGraph();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  };

  EngineSound.prototype._buildGraph = function () {
    var ctx = this.ctx;

    this.out = ctx.createGain();
    this.out.gain.value = this.volume;

    /* küçük hoparlörlerde 60-120 Hz duyulmaz; gövdeyi 180 Hz'den kabartıyoruz */
    var low = ctx.createBiquadFilter();
    low.type = 'peaking'; low.frequency.value = 180; low.Q.value = 0.8; low.gain.value = 3;

    /* turbo ıslığı 8 kHz'e kadar çıkabildiği için tavan yüksek tutuldu */
    var hi = ctx.createBiquadFilter();
    hi.type = 'lowpass'; hi.frequency.value = 9500; hi.Q.value = 0.7;

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004;

    this.input = low;
    low.connect(hi);

    /* kuru + ıslak (atölye yankısı) */
    this.dry = ctx.createGain(); this.dry.gain.value = 0.82;
    this.wet = ctx.createGain(); this.wet.gain.value = TUNE.reverb;

    var irData = renderIR(ctx.sampleRate);
    var ir = ctx.createBuffer(1, irData.length, ctx.sampleRate);
    ir.getChannelData(0).set(irData);
    var conv = ctx.createConvolver();
    conv.buffer = ir;

    hi.connect(this.dry);
    hi.connect(conv);
    conv.connect(this.wet);
    this.dry.connect(comp);
    this.wet.connect(comp);
    comp.connect(this.out);
    this.out.connect(ctx.destination);
  };

  EngineSound.prototype._buffer = function (key, optsFn) {
    if (this.cache[key]) return this.cache[key];
    var sr = this.ctx.sampleRate;
    var data = renderEngine(optsFn(sr, this.cylinders));
    var buf = this.ctx.createBuffer(1, data.length, sr);
    buf.getChannelData(0).set(data);
    this.cache[key] = buf;
    return buf;
  };

  EngineSound.prototype._play = function (buf, gain, loop) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!loop;
    var g = ctx.createGain();
    g.gain.value = gain == null ? 1 : gain;
    src.connect(g);
    g.connect(this.input);
    src.start();
    return { src: src, gain: g };
  };

  /* Hazır bir ses dosyasını çalmayı dener.
     Dosya yoksa / açılamazsa false döner ve sentezlenen sese düşülür. */
  EngineSound.prototype._playFile = function (url, vol) {
    var self = this;
    if (!url) return Promise.resolve(false);
    return new Promise(function (res) {
      var a;
      try { a = new Audio(url); } catch (e) { return res(false); }
      a.volume = clamp((vol == null ? 1 : vol) * self.volume, 0, 1);
      a.preload = 'auto';
      var done = false;
      function ok() { if (!done) { done = true; self._files.push(a); res(true); } }
      function fail() { if (!done) { done = true; res(false); } }
      a.addEventListener('playing', ok);
      a.addEventListener('error', fail);
      a.addEventListener('ended', function () {
        var i = self._files.indexOf(a);
        if (i > -1) self._files.splice(i, 1);
      });
      var p = a.play();
      if (p && p.then) p.then(ok, fail);
      /* yüklenemediyse sentezle devam; geç gelen kaydı da durdur ki
         iki ses üst üste binmesin */
      setTimeout(function () {
        if (done) return;
        try { a.pause(); a.src = ''; } catch (e) {}
        fail();
      }, 1500);
    });
  };

  /* Marş + gaz + rölanti.
     TUNE.sampleUrl'deki dosya varsa o çalınır, yoksa ses sentezlenir. */
  EngineSound.prototype.startUp = function () {
    var self = this;
    if (this.muted) return Promise.resolve(false);
    if (!TUNE.sampleUrl) return this._synthStartUp();
    return this._playFile(TUNE.sampleUrl, 1).then(function (played) {
      return played ? true : self._synthStartUp();
    });
  };

  EngineSound.prototype._synthStartUp = function () {
    var self = this;
    if (!this.unlock() || this.muted) return Promise.resolve(false);

    var rev = this._buffer('rev', revOptions);
    this._play(rev, 1);

    var idle = this._buffer('idle', function (sr, cyl) {
      return idleLoopOptions(sr, TUNE.idleRpm, cyl);
    });

    /* gaz sesi bitmeye yakın rölantiyi döngüye al, birkaç saniye sonra kıs */
    setTimeout(function () {
      if (self.muted) return;
      var node = self._play(idle, 0.0001, true);
      node.gain.gain.setTargetAtTime(0.62, self.ctx.currentTime, 0.4);
      node.gain.gain.setTargetAtTime(0.0001, self.ctx.currentTime + TUNE.idleSeconds, 0.9);
      self._idleSrc = node;
      setTimeout(function () {
        try { node.src.stop(); } catch (e) {}
        if (self._idleSrc === node) self._idleSrc = null;
      }, 7000);
    }, (rev.duration - 0.35) * 1000);

    return new Promise(function (res) {
      setTimeout(function () { res(true); }, 2000);
    });
  };

  /* Kısa gaz vuruşu (buton hover / ses açma) */
  EngineSound.prototype.blip = function () {
    var self = this;
    if (this.muted) return;
    var now = Date.now();
    if (now - this._lastBlip < 900) return;
    this._lastBlip = now;

    if (TUNE.blipUrl) {
      this._playFile(TUNE.blipUrl, 0.7).then(function (played) {
        if (!played) self._synthBlip();
      });
      return;
    }
    this._synthBlip();
  };

  EngineSound.prototype._synthBlip = function () {
    if (!this.supported || this.muted || !this.unlock()) return;
    this._play(this._buffer('blip', blipOptions), 0.7);
  };

  EngineSound.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.muted && this._files.length) {          // dosyadan çalanları durdur
      this._files.forEach(function (a) {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
      });
      this._files.length = 0;
    }
    if (!this.ctx || !this.out) return;
    var t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.muted ? 0.0001 : this.volume, t, 0.08);
    if (this.muted && this._idleSrc) {
      try { this._idleSrc.src.stop(); } catch (e) {}
      this._idleSrc = null;
    }
  };

  /* Node.js testleri için çekirdeği de dışa ver */
  EngineSound.render = renderEngine;
  EngineSound.presets = { rev: revOptions, blip: blipOptions, idle: idleLoopOptions };
  EngineSound.TUNE = TUNE;

  global.EngineSound = EngineSound;
  if (typeof module !== 'undefined' && module.exports) module.exports = EngineSound;
})(typeof window !== 'undefined' ? window : globalThis);

/* --------------------------------------------------------------------------
   NOT — kendi egzoz kaydınızı kullanmak isterseniz:
   1) Telifi size ait / lisanslı bir dosyayı assets/sound/exhaust.mp3 olarak koyun.
      (İnternette bulduğunuz bir videonun sesini izinsiz kullanmayın.)
   2) main.js içindeki engine.startUp() satırını şununla değiştirin:
        var a = new Audio('assets/sound/exhaust.mp3'); a.volume = .7; a.play();
   Tarayıcılar sesi ancak kullanıcı tıklamasından sonra oynatır; sitede
   "KONTAĞI ÇEVİR" ekranı bu yüzden var.
   -------------------------------------------------------------------------- */
