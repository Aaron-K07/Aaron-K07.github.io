(function () {
  'use strict';
  var html = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger && window.SplitText);
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Navigation ---------- */
  var nav = $('#nav');
  var links = $$('.nav__links a');
  var targets = links.map(function (a) { return $(a.getAttribute('href')); });
  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle('is-solid', y > 24);
    var line = y + window.innerHeight * 0.4, current = -1;
    targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top + y <= line) current = i; });
    links.forEach(function (a, i) { a.classList.toggle('is-active', i === current); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  var menu = $('#menu'), menuBtn = $('.nav__menu');
  function setMenu(open) {
    menu.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.textContent = open ? 'Close' : 'Menu';
    if (open) nav.classList.add('is-solid'); else onScroll();
  }
  menuBtn.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });

  /* ---------- Canvas scenes: a rocket engine drawn as a point cloud ---------- */
  var Y_EXIT = 1.42;
  function profile(y) {
    var Rc = 0.4, Rt = 0.165, Re = 0.66, yDome = -1.44, yCh0 = -1.26, yCh1 = -0.46, yTh = -0.06, u;
    if (y < yCh0) { u = (y - yDome) / (yCh0 - yDome); return Rc * Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))); }
    if (y < yCh1) return Rc;
    if (y < yTh) { u = (y - yCh1) / (yTh - yCh1); return Rt + (Rc - Rt) * (0.5 + 0.5 * Math.cos(Math.PI * u)); }
    u = (y - yTh) / (Y_EXIT - yTh);
    return Rt + (Re - Rt) * (1.5 * u - 0.5 * u * u);
  }
  function buildEngine(step) {
    var p = [], i, k, n, r, y, th, row = 0;
    function ring(yy, rr, w, offset) {
      n = Math.max(8, Math.round(2 * Math.PI * rr / step));
      for (k = 0; k < n; k++) { th = (k + offset) / n * Math.PI * 2; p.push(rr * Math.cos(th), yy, rr * Math.sin(th), w); }
    }
    for (y = -1.44; y <= Y_EXIT + 0.0001; y += step * 0.9) { r = profile(y); if (r > 0.02) ring(y, r, 0.72, (row++ % 2) * 0.5); }
    [-1.26, -0.46, Y_EXIT].forEach(function (fy) {              // flanges
      r = profile(fy);
      for (i = 1; i <= 3; i++) { ring(fy, r + i * 0.018, 1, i * 0.5); ring(fy + 0.02, r + i * 0.018, 1, i * 0.5 + 0.25); }
    });
    var my = 0.62, mR = profile(my) + 0.075, mr = 0.05;         // coolant manifold (torus)
    for (i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; ring(my + mr * Math.sin(a), mR + mr * Math.cos(a), 0.9, i * 0.5); }
    for (y = -1.86; y < -1.44; y += step * 0.9) ring(y, 0.075, 0.8, (row++ % 2) * 0.5);   // feed line
    ring(-1.86, 0.1, 1, 0); ring(-1.86, 0.125, 1, 0.5);
    return new Float32Array(p);
  }
  function buildMeridians(count, samples) {
    var m = [], i, j, y;
    for (i = 0; i < count; i++) {
      var th = i / count * Math.PI * 2, line = new Float32Array(samples * 3);
      for (j = 0; j < samples; j++) { y = -1.26 + (Y_EXIT + 1.26) * j / (samples - 1); var r = profile(y) * 1.004; line[j * 3] = r * Math.cos(th); line[j * 3 + 1] = y; line[j * 3 + 2] = r * Math.sin(th); }
      m.push(line);
    }
    return m;
  }

  function Scene(canvas) {
    var mode = canvas.getAttribute('data-scene');
    var ctx = canvas.getContext('2d');
    var small = window.matchMedia('(max-width: 860px)');
    var dpr = 1, W = 0, H = 0, running = false, visible = false, raf = 0, t0 = performance.now(), last = t0;
    var pts = mode === 'stars' ? null : buildEngine(small.matches ? 0.05 : 0.038);
    var lines = mode === 'stars' ? [] : buildMeridians(mode === 'bore' ? 36 : 24, 46);
    var stars = [], sparks = [], i;
    var starCount = mode === 'stars' ? 260 : 150;
    for (i = 0; i < starCount; i++) stars.push({ x: Math.random(), y: Math.random(), a: 0.12 + Math.random() * 0.6, s: Math.random() < 0.12 ? 1.6 : 1, f: 0.3 + Math.random() * 1.2, p: Math.random() * 6.28 });
    if (mode === 'engine') for (i = 0; i < 300; i++) sparks.push(newSpark(true));
    function newSpark(seed) {
      var life = 1.3 + Math.random() * 1.6;
      return { r: Math.sqrt(Math.random()) * 0.6, th: Math.random() * 6.28, v: 0.7 + Math.random() * 1.3, life: life, age: seed ? Math.random() * life : 0 };
    }
    var buckets = [[], [], [], [], [], []];
    var px = 0, py = 0, tpx = 0, tpy = 0;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, small.matches ? 1.5 : 2);
      W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      draw(performance.now());
    }

    function draw(now) {
      var t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, W, H);
      var s, k, b;
      for (k = 0; k < stars.length; k++) {
        s = stars[k];
        var tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t * s.f + s.p);
        ctx.fillStyle = 'rgba(255,255,255,' + (s.a * tw).toFixed(3) + ')';
        ctx.fillRect(s.x * W, s.y * H, s.s * dpr, s.s * dpr);
      }
      if (!pts) return;

      px += (tpx - px) * 0.05; py += (tpy - py) * 0.05;
      var m = small.matches, cx, cy, scale, tiltX, rollZ, spin;
      if (mode === 'engine') {
        cx = W * (m ? 0.5 : 0.3); cy = H * (m ? 0.33 : 0.44); scale = H * (m ? 0.19 : 0.262);
        tiltX = -0.42 + py * 0.07; rollZ = 0.2 + px * 0.05; spin = t * 0.16;
      } else {
        cx = W * (m ? 0.5 : 0.26); cy = H * (m ? 0.27 : 0.4); scale = H * (m ? 0.24 : 0.34);
        tiltX = -1.08; rollZ = 0; spin = t * 0.1;
      }
      var cs = Math.cos(spin), sn = Math.sin(spin), cX = Math.cos(tiltX), sX = Math.sin(tiltX), cZ = Math.cos(rollZ), sZ = Math.sin(rollZ);
      var D = 6.5, x, y, z, x1, z1, y2, z2, x3, y3, f, front, sz = Math.max(1.1 * dpr, scale * 0.0056);
      function project(ix, iy, iz) {
        x1 = ix * cs + iz * sn; z1 = -ix * sn + iz * cs;
        y2 = iy * cX - z1 * sX; z2 = iy * sX + z1 * cX;
        x3 = x1 * cZ - y2 * sZ; y3 = x1 * sZ + y2 * cZ;
        f = D / (D + z2);
        x = cx + x3 * f * scale; y = cy + y3 * f * scale; z = z2;
      }
      /* cooling channels */
      ctx.lineWidth = Math.max(1, dpr * 0.8);
      for (k = 0; k < lines.length; k++) {
        var ln = lines[k], zsum = 0, j;
        ctx.beginPath();
        for (j = 0; j < ln.length; j += 3) { project(ln[j], ln[j + 1], ln[j + 2]); zsum += z; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        front = 0.5 - (zsum / (ln.length / 3)) / 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0.025, Math.min(0.26, 0.03 + front * 0.2)).toFixed(3) + ')';
        ctx.stroke();
      }
      /* surface points, bucketed by depth */
      for (b = 0; b < buckets.length; b++) buckets[b].length = 0;
      for (k = 0; k < pts.length; k += 4) {
        project(pts[k], pts[k + 1], pts[k + 2]);
        front = Math.max(0, Math.min(1, 0.5 - z / 2.2)) * pts[k + 3];
        b = Math.min(5, (front * 6) | 0);
        buckets[b].push(x, y, f);
      }
      for (b = 0; b < buckets.length; b++) {
        var arr = buckets[b];
        ctx.fillStyle = 'rgba(255,255,255,' + (0.1 + Math.pow((b + 0.5) / 6, 1.35) * 0.9).toFixed(3) + ')';
        for (k = 0; k < arr.length; k += 3) { var q = sz * arr[k + 2] * (0.75 + b * 0.09); ctx.fillRect(arr[k] - q / 2, arr[k + 1] - q / 2, q, q); }
      }
      /* exhaust */
      for (k = 0; k < sparks.length; k++) {
        s = sparks[k];
        if (!reduce) { s.age += dt; if (s.age > s.life) sparks[k] = s = newSpark(false); }
        var dist = s.age * s.v, rr = s.r * (1 + dist * 0.42), life = 1 - s.age / s.life;
        project(rr * Math.cos(s.th), Y_EXIT + 0.02 + dist, rr * Math.sin(s.th));
        ctx.fillStyle = 'rgba(255,255,255,' + (life * life * 0.9).toFixed(3) + ')';
        var qs = sz * f * (0.7 + life * 0.9);
        ctx.fillRect(x - qs / 2, y - qs / 2, qs, qs);
      }
    }
    function loop(now) { draw(now); raf = running ? requestAnimationFrame(loop) : 0; }
    function update() {
      var should = visible && !reduce && !document.hidden;
      if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
      else if (!should && running) { running = false; cancelAnimationFrame(raf); }
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }, { rootMargin: '80px' }).observe(canvas);
    else { visible = true; update(); }
    document.addEventListener('visibilitychange', update);
    if (mode === 'engine' && window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('pointermove', function (e) { tpx = e.clientX / window.innerWidth - 0.5; tpy = e.clientY / window.innerHeight - 0.5; }, { passive: true });
    }
    resize();
  }
  $$('canvas[data-scene]').forEach(function (c) { new Scene(c); });

  /* ---------- Project panel ---------- */
  var panel = $('#panel'), cases = $$('.case', panel), closing = false;
  function openCase(id) {
    var found = false;
    cases.forEach(function (c) { var on = c.id === 'case-' + id; c.hidden = !on; if (on) found = true; });
    if (!found || !panel.showModal) return;
    panel.showModal();
    $('.panel__scroll', panel).scrollTop = 0;
    if (hasGsap && !reduce) {
      gsap.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.8, ease: 'expo.out' });
      gsap.from($$('.case:not([hidden]) > *', panel), { y: 28, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: 0.18 });
    }
  }
  function closeCase() {
    if (closing || !panel.open) return;
    if (hasGsap && !reduce) {
      closing = true; panel.classList.add('is-closing');
      gsap.to(panel, { xPercent: 100, duration: 0.42, ease: 'power3.in', onComplete: function () { panel.close(); panel.classList.remove('is-closing'); gsap.set(panel, { clearProps: 'transform' }); closing = false; } });
    } else panel.close();
  }
  $$('[data-case]').forEach(function (b) { b.addEventListener('click', function () { openCase(b.getAttribute('data-case')); }); });
  $('[data-close]', panel).addEventListener('click', closeCase);
  panel.addEventListener('cancel', function (e) { e.preventDefault(); closeCase(); });
  panel.addEventListener('click', function (e) {
    if (e.target !== panel) return;
    var r = panel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeCase();
  });

  /* ---------- Contact form ---------- */
  var form = $('#contact-form');
  if (form) {
    var btn = $('#submit-btn'), errAll = $('#form-error'), errEmail = $('#email-error'), errMsg = $('#message-error');
    var show = function (el, text) { el.textContent = text; el.hidden = false; };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      [errAll, errEmail, errMsg].forEach(function (x) { x.hidden = true; });
      btn.disabled = true; btn.textContent = 'Sending…';
      var fail = function (text) { show(errAll, text); btn.disabled = false; btn.textContent = 'Send message'; };
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (r) {
          if (r.ok) {
            $('#form-container').innerHTML = '<div class="form form__ok"><p class="title">Message sent.</p><p class="lead dim" style="margin-top:8px">Thanks for reaching out. I\'ll reply by email soon.</p></div>';
            return;
          }
          if (r.data && r.data.errors) {
            r.data.errors.forEach(function (er) {
              if (er.field === 'email') show(errEmail, er.message);
              else if (er.field === 'message') show(errMsg, er.message);
              else show(errAll, er.message);
            });
            btn.disabled = false; btn.textContent = 'Send message';
          } else fail('The message didn\'t send. Try again, or email aaron05k55@gmail.com directly.');
        })
        .catch(function () { fail('The message didn\'t send because of a network error. Try again, or email aaron05k55@gmail.com directly.'); });
    });
  }

  /* ---------- Motion ---------- */
  function ready() { html.classList.add('is-ready'); }
  if (!hasGsap || reduce) { ready(); return; }
  gsap.registerPlugin(ScrollTrigger, SplitText);

  function init() {
    ready();
    /* one page-load sequence */
    var intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
    intro.from('.hero__canvas', { autoAlpha: 0, duration: 1.8, ease: 'power1.out' }, 0)
      .from('.nav', { autoAlpha: 0, y: -18, duration: 1 }, 0.35)
      .from('.hero__eyebrow span', { autoAlpha: 0, y: 12, duration: 0.9, stagger: 0.08 }, 0.55)
      .from('.hero__discover', { autoAlpha: 0, duration: 1 }, 0.95);
    SplitText.create('.hero__title', {
      type: 'lines', mask: 'lines', autoSplit: true,
      onSplit: function (self) { return gsap.from(self.lines, { yPercent: 115, duration: 1.2, ease: 'expo.out', stagger: 0.1, delay: 0.2 }); }
    });
    gsap.to('.hero__grid', { yPercent: -14, autoAlpha: 0.15, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__canvas', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

    /* headings rise line by line */
    $$('[data-lines], .footer__tag').forEach(function (el) {
      SplitText.create(el, {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: function (self) { return gsap.from(self.lines, { yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }); }
      });
    });

    /* statements fill in word by word as you scroll */
    $$('[data-scrub]').forEach(function (el) {
      var split = SplitText.create(el, { type: 'words' });
      gsap.fromTo(split.words, { opacity: 0.14 }, { opacity: 1, ease: 'none', stagger: 0.5, scrollTrigger: { trigger: el, start: 'top 84%', end: 'bottom 55%', scrub: 0.4 } });
    });

    /* blocks rise in once */
    $$('[data-rise]').forEach(function (el) {
      gsap.from(el, { y: 40, autoAlpha: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    gsap.set('.row', { autoAlpha: 0, y: 30 });
    ScrollTrigger.batch('.row', { start: 'top 92%', once: true, onEnter: function (els) { gsap.to(els, { autoAlpha: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.09, clearProps: 'transform' }); } });
    $$('[data-tiles]').forEach(function (list) {
      gsap.from(list.children, { y: 18, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.04, scrollTrigger: { trigger: list, start: 'top 92%', once: true } });
    });

    /* stacked cards: the card being covered leans back and fades */
    var cards = $$('.card');
    cards.forEach(function (card, i) {
      var body = $$('.card__body > *', card);
      gsap.from(body, { y: 26, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: card, start: 'top 62%', once: true } });
      if (i === cards.length - 1) return;
      var top = function () { return parseFloat(getComputedStyle(card).top) || 0; };
      gsap.timeline({ scrollTrigger: { trigger: cards[i + 1], start: 'top 86%', end: function () { return 'top ' + top() + 'px'; }, scrub: true, invalidateOnRefresh: true } })
        .to($('.card__inner', card), { scale: 0.9, rotationX: 5, ease: 'none' }, 0)
        .to($('.card__dim', card), { opacity: 0.5, ease: 'none' }, 0);
    });
    var steel = $('.card__media img');
    if (steel) gsap.fromTo(steel, { scale: 1.14 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: steel, start: 'top bottom', end: 'bottom top', scrub: true } });
    var toolImg = $('.tools__img img');
    if (toolImg) gsap.fromTo(toolImg, { scale: 1.2 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.tools__img', start: 'top bottom', end: 'bottom top', scrub: true } });

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init); else init();
})();
