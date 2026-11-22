/* ============================================================
   THE RECONSTRUCTION COMPANY — Puzzle captcha (jigsaw slider)
   Bybit-style: the visitor drags one missing piece of the image
   into its home. No network calls; the artwork is generated
   procedurally on a canvas, so it works offline and never
   fingerprints the visitor.
   ============================================================ */
(function () {
  'use strict';

  var IMG_W = 264, IMG_H = 150, S = 46;      // logical art units
  var KR = S * 0.21;                          // knob radius
  var PAD_TOP = KR + 2;                       // headroom for knob in piece canvas
  var HY = 50;                                // hole body top (art coords)
  var TOL = 5;                                // snap tolerance, art units

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }

  var ICON_PIECE = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4.5a1.5 1.5 0 0 1 3 0V6h4.5a1 1 0 0 1 1 1V11h1.5a1.5 1.5 0 0 1 0 3H17.5v4.5a1 1 0 0 1-1 1H13v-1.5a1.5 1.5 0 0 0-3 0V20H5.5a1 1 0 0 1-1-1V14.5H5a1.5 1.5 0 0 0 0-3H4.5V7a1 1 0 0 1 1-1H9V4.5Z" transform="translate(0.5 0.5) scale(0.96)"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.6 9.6 17.6 19.5 6.6"/></svg>';
  var ICON_CHECK_SM = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.6 9.6 17.6 19.5 6.6"/></svg>';
  var ICON_REFRESH = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v6h-6"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  var ICON_SHIELD = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z"/><path d="m9.5 12 2 2 3.5-4"/></svg>';
  var MARK_RC = '<svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true"><rect width="64" height="64" rx="9" fill="#141414"/><text x="32" y="30" text-anchor="middle" dominant-baseline="central" font-family="Georgia,Times New Roman,serif" font-size="26" letter-spacing="1.5" fill="#f5f2ea">RC</text><rect x="13" y="44.5" width="38" height="3.2" fill="#b98d2e"/></svg>';

  /* ---------- procedural artwork: ochre nocturne with monogram ---------- */
  function drawArt(ctx, rand) {
    // sky — deeper ink, warmer horizon band
    var sky = ctx.createLinearGradient(0, 0, 0, IMG_H);
    sky.addColorStop(0, '#0c0a08');
    sky.addColorStop(0.42, '#17120d');
    sky.addColorStop(0.72, '#2a2016');
    sky.addColorStop(1, '#3a2b1d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, IMG_W, IMG_H);
    // warm horizon bloom
    var band = ctx.createLinearGradient(0, IMG_H * 0.55, 0, IMG_H * 0.82);
    band.addColorStop(0, 'rgba(217,164,65,0)');
    band.addColorStop(0.55, 'rgba(217,164,65,0.30)');
    band.addColorStop(1, 'rgba(217,164,65,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, IMG_H * 0.55, IMG_W, IMG_H * 0.3);
    // topographic contour ellipses, faint
    ctx.strokeStyle = 'rgba(217,198,132,0.07)';
    ctx.lineWidth = 1;
    for (var c = 1; c <= 5; c++) {
      ctx.beginPath();
      ctx.ellipse(IMG_W * 0.68, IMG_H * 0.52, c * 26, c * 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // starfield — two sizes plus rare cross-flares
    for (var i = 0; i < 64; i++) {
      var sy = rand() * IMG_H * 0.52;
      var a = 0.3 + rand() * 0.62;
      var big = rand() < 0.16;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f5f2ea';
      ctx.fillRect(rand() * IMG_W, sy, big ? 2 : 1, big ? 2 : 1);
      if (rand() < 0.09) {
        var fx = rand() * IMG_W, fy = rand() * IMG_H * 0.4;
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#f5f2ea';
        ctx.beginPath(); ctx.moveTo(fx - 3, fy); ctx.lineTo(fx + 3, fy);
        ctx.moveTo(fx, fy - 3); ctx.lineTo(fx, fy + 3); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // ghost monogram — barely-there brand watermark
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#d9c684';
    ctx.font = '700 96px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RC', IMG_W * 0.5, IMG_H * 0.34);
    ctx.restore();
    // moon — radial glow, two-tone disc, craters, cool rim
    var sunX = IMG_W * (0.24 + rand() * 0.5), sunY = IMG_H * (0.36 + rand() * 0.1), sunR = 21 + rand() * 8;
    var glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunR * 2.6);
    glow.addColorStop(0, 'rgba(243,217,139,0.9)');
    glow.addColorStop(0.3, 'rgba(217,164,65,0.45)');
    glow.addColorStop(1, 'rgba(185,141,46,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, IMG_W, IMG_H);
    var disc = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
    disc.addColorStop(0, '#f3d98b');
    disc.addColorStop(0.55, '#e0b45a');
    disc.addColorStop(1, '#8f6b1e');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(74,52,13,0.35)';
    var craters = [[-0.35, -0.15, 0.16], [0.28, 0.22, 0.12], [0.05, -0.42, 0.1], [-0.1, 0.3, 0.08]];
    for (var q = 0; q < craters.length; q++) {
      ctx.beginPath();
      ctx.arc(sunX + craters[q][0] * sunR, sunY + craters[q][1] * sunR, craters[q][2] * sunR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(245,242,234,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, -2.4, -0.7); ctx.stroke();
    // far ridge (silhouette + town lights)
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.moveTo(0, IMG_H * 0.66);
    var x = 0, pts = [[0, 0.66]];
    while (x < IMG_W) {
      x += 14 + rand() * 26;
      var y = 0.66 + (rand() - 0.5) * 0.05;
      pts.push([Math.min(x, IMG_W), y]);
      ctx.lineTo(Math.min(x, IMG_W), IMG_H * y);
    }
    ctx.lineTo(IMG_W, IMG_H); ctx.lineTo(0, IMG_H); ctx.closePath(); ctx.fill();
    for (var t = 0; t < 14; t++) {  // scattered town lights along the far ridge
      var tx = rand() * IMG_W, ty = IMG_H * 0.655 + rand() * IMG_H * 0.035;
      ctx.globalAlpha = 0.35 + rand() * 0.5;
      ctx.fillStyle = '#f0c95c';
      ctx.fillRect(tx, ty, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
    // ochre horizon rule
    var hr = ctx.createLinearGradient(0, 0, IMG_W, 0);
    hr.addColorStop(0, 'rgba(185,141,46,0)');
    hr.addColorStop(0.18, 'rgba(217,198,132,0.75)');
    hr.addColorStop(0.5, 'rgba(217,164,65,0.9)');
    hr.addColorStop(0.82, 'rgba(217,198,132,0.75)');
    hr.addColorStop(1, 'rgba(185,141,46,0)');
    ctx.strokeStyle = hr;
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(0, IMG_H * 0.685); ctx.lineTo(IMG_W, IMG_H * 0.685); ctx.stroke();
    // mid + near ridges with rim light
    var ridges = ['#211a12', '#171009'];
    var rims   = ['rgba(217,198,132,0.30)', 'rgba(217,164,65,0.18)'];
    for (var r = 0; r < 2; r++) {
      var base = IMG_H * (0.76 + r * 0.13), amp = 16 + r * 9;
      ctx.fillStyle = ridges[r];
      ctx.beginPath();
      ctx.moveTo(0, IMG_H);
      ctx.lineTo(0, base);
      var rx = 0, path = [[0, base]];
      while (rx < IMG_W) {
        rx += 16 + rand() * 26;
        var ry = base + (rand() - 0.5) * amp;
        path.push([Math.min(rx, IMG_W), ry]);
        ctx.lineTo(Math.min(rx, IMG_W), ry);
      }
      ctx.lineTo(IMG_W, IMG_H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rims[r];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (var p = 1; p < path.length; p++) ctx.lineTo(path[p][0], path[p][1]);
      ctx.stroke();
    }
    // grain
    for (var g = 0; g < 850; g++) {
      ctx.fillStyle = 'rgba(245,242,234,' + (rand() * 0.055) + ')';
      ctx.fillRect(rand() * IMG_W, rand() * IMG_H, 1, 1);
    }
    // vignette
    var vig = ctx.createRadialGradient(IMG_W / 2, IMG_H / 2, IMG_H * 0.32, IMG_W / 2, IMG_H / 2, IMG_W * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.46)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, IMG_W, IMG_H);
  }

  /* ---------- jigsaw path: body + one top knob ---------- */
  function tracePath(c, px, py, s, kr) {
    c.beginPath();
    c.moveTo(px + 6, py);
    c.lineTo(px + s / 2 - kr, py);
    c.arc(px + s / 2, py, kr, Math.PI, 0, false);
    c.lineTo(px + s - 6, py);
    c.quadraticCurveTo(px + s, py, px + s, py + 6);
    c.lineTo(px + s, py + s - 6);
    c.quadraticCurveTo(px + s, py + s, px + s - 6, py + s);
    c.lineTo(px + 6, py + s);
    c.quadraticCurveTo(px, py + s, px, py + s - 6);
    c.lineTo(px, py + 6);
    c.quadraticCurveTo(px, py, px + 6, py);
    c.closePath();
  }

  function buildWidget(form) {
    var widget = el('figure', 'captcha captcha--premium', null);
    widget.setAttribute('data-captcha-widget', '');

    // ── head: brand + purpose ─────────────────────────────
    var head = el('div', 'captcha__head', widget);
    head.innerHTML =
      '<span class="captcha__brand">' + MARK_RC +
        '<span class="captcha__brand-txt"><b>Security check</b><small>The Reconstruction Company · Human verification</small></span>' +
      '</span>' +
      '<span class="captcha__secure">' + ICON_LOCK + '<span>Secured</span></span>';

    // ── stage: artwork, hole, piece, overlays ──────────────
    var stage = el('div', 'captcha__stage', widget);
    var bg = el('canvas', 'captcha__bg', stage);
    var holeGlow = el('div', 'captcha__holeglow', stage);   // subtle inner target ring
    var piece = el('canvas', 'captcha__piece', stage);
    var ring = el('div', 'captcha__ring', stage);           // success shockwave
    var okBadge = el('div', 'captcha__ok', stage, ICON_CHECK);
    okBadge.setAttribute('aria-hidden', 'true');

    // ── control bar: refresh + slider track ────────────────
    var bar = el('div', 'captcha__bar', widget);
    var refresh = el('button', 'captcha__refresh', bar, ICON_REFRESH);
    refresh.type = 'button';
    refresh.setAttribute('aria-label', 'Load a new puzzle');
    refresh.title = 'New puzzle';

    var track = el('div', 'captcha__track', bar);
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Slider puzzle verification');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    track.tabIndex = 0;
    var trackSheen = el('span', 'captcha__sheen', track);
    trackSheen.setAttribute('aria-hidden', 'true');
    var trackFill = el('span', 'captcha__fill', track);
    trackFill.setAttribute('aria-hidden', 'true');
    var trackLabel = el('span', 'captcha__track-label', track, 'Slide to verify');
    var thumb = el('span', 'captcha__thumb', track, ICON_PIECE);
    thumb.setAttribute('aria-hidden', 'true');

    // ── foot: assurance line + ephemeral reference ──────────
    var foot = el('div', 'captcha__foot', widget);
    var footL = el('span', 'captcha__foot-l', foot, ICON_SHIELD + '<span>Solved on this device — nothing is tracked</span>');
    footL.setAttribute('aria-hidden', 'true');
    var seedRef = el('span', 'captcha__seed', foot, '');

    // ── status line ─────────────────────────────────────────
    var msg = el('figcaption', 'captcha__msg', widget, 'Drag the piece into its place to verify you are human.');
    msg.setAttribute('role', 'status');

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    bg.width = IMG_W * dpr; bg.height = IMG_H * dpr;
    piece.width = S * dpr; piece.height = (PAD_TOP + S) * dpr;
    var bctx = bg.getContext('2d'); bctx.scale(dpr, dpr);
    var pctx = piece.getContext('2d'); pctx.scale(dpr, dpr);

    var art = document.createElement('canvas');
    art.width = IMG_W; art.height = IMG_H;
    var actx = art.getContext('2d');

    var state = { x: 0, target: 0, ok: false, dragging: false, grab: 0, scale: 1 };

    function render() {
      piece.style.transform = 'translate3d(' + (state.x * state.scale) + 'px,0,0)';
      holeGlow.style.transform = 'translate3d(' + (state.target * state.scale) + 'px,0,0)';
      var travel = track.clientWidth - thumb.offsetWidth;
      var frac = (IMG_W - S) > 0 ? state.x / (IMG_W - S) : 0;
      thumb.style.transform = 'translate3d(' + (frac * travel) + 'px,0,0)';
      trackFill.style.width = (frac * 100) + '%';
      track.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    }

    function layout() {
      var rect = bg.getBoundingClientRect();
      state.scale = rect.width / IMG_W || 1;
      piece.style.width = (S * state.scale) + 'px';
      piece.style.height = ((PAD_TOP + S) * state.scale) + 'px';
      piece.style.top = ((HY - PAD_TOP) * state.scale) + 'px';
      piece.style.left = '0px';
      holeGlow.style.width = (S * state.scale) + 'px';
      holeGlow.style.height = (S * state.scale) + 'px';
      holeGlow.style.top = (HY * state.scale) + 'px';
      holeGlow.style.left = '0px';
      render();
    }

    function drawHole() {
      bctx.clearRect(0, 0, IMG_W, IMG_H);
      bctx.drawImage(art, 0, 0, IMG_W, IMG_H);
      bctx.save();
      tracePath(bctx, state.target, HY, S, KR);
      bctx.clip();
      bctx.fillStyle = 'rgba(8,8,8,0.66)';
      bctx.fillRect(state.target - KR - 4, HY - KR - 4, S + 2 * KR + 8, S + KR + 8);
      bctx.restore();
      bctx.save();
      tracePath(bctx, state.target, HY, S, KR);
      bctx.setLineDash([4, 3]);
      bctx.strokeStyle = 'rgba(243,217,139,0.95)';
      bctx.lineWidth = 1.3;
      bctx.stroke();
      bctx.setLineDash([2, 2]);
      bctx.strokeStyle = 'rgba(185,141,46,0.75)';
      bctx.lineWidth = 0.7;
      tracePath(bctx, state.target + 1.3, HY + 1.3, S - 2.6, Math.max(1, KR - 1.3));
      bctx.stroke();
      bctx.setLineDash([]);
      bctx.restore();
    }

    function drawPiece() {
      pctx.clearRect(0, 0, S, PAD_TOP + S);
      pctx.save();
      tracePath(pctx, 0, PAD_TOP, S, KR);
      pctx.clip();
      pctx.drawImage(art, -state.target, PAD_TOP - HY);
      pctx.restore();
      pctx.save();
      tracePath(pctx, 0, PAD_TOP, S, KR);
      pctx.strokeStyle = 'rgba(245,242,234,0.95)';
      pctx.lineWidth = 1.4;
      pctx.stroke();
      pctx.strokeStyle = 'rgba(185,141,46,0.85)';
      pctx.lineWidth = 0.7;
      tracePath(pctx, 0.7, PAD_TOP + 0.7, S - 1.4, Math.max(1, KR - 0.7));
      pctx.stroke();
      pctx.restore();
    }

    function setMsg(text, isError) {
      msg.textContent = text;
      msg.classList.toggle('is-error', !!isError);
      msg.classList.toggle('is-ok', !isError && state.ok);
    }

    function regenerate() {
      state.ok = false; state.x = 0;
      delete form.dataset.captchaVerified;
      widget.classList.remove('is-ok', 'is-fail');
      track.classList.remove('is-ok');
      trackFill.style.width = '0%';
      thumb.innerHTML = ICON_PIECE;
      trackLabel.textContent = 'Slide to verify';
      var seed = (Math.random() * 0xffffffff) >>> 0;
      seedRef.textContent = 'RF-' + (seed % 46656).toString(36).toUpperCase().padStart(3, '0');
      var rand = mulberry32(seed);
      actx.clearRect(0, 0, IMG_W, IMG_H);
      drawArt(actx, rand);
      state.target = Math.floor(70 + rand() * (IMG_W - S - 78));
      drawHole(); drawPiece(); layout();
      setMsg('Drag the piece into its place to verify you are human.', false);
      msg.classList.remove('is-ok');
    }

    function succeed() {
      state.ok = true;
      form.dataset.captchaVerified = '1';
      widget.classList.add('is-ok');
      track.classList.add('is-ok');
      thumb.innerHTML = ICON_CHECK_SM;
      trackLabel.textContent = 'Verified — welcome';
      setMsg('Verified — thank you. You may submit the form now.', false);
      msg.classList.add('is-ok');
    }

    function fail() {
      widget.classList.add('is-fail');
      setMsg('Not quite — adjust the piece into the gap and try again.', true);
      window.setTimeout(function () { widget.classList.remove('is-fail'); }, 650);
    }

    function check() {
      if (state.ok) return;
      if (Math.abs(state.x - state.target) <= TOL) {
        state.x = state.target;
        bctx.clearRect(0, 0, IMG_W, IMG_H);
        bctx.drawImage(art, 0, 0, IMG_W, IMG_H); // fill the hole with the artwork
        succeed();
      } else {
        fail();
      }
      render();
    }

    /* pointer: drag the thumb along the track */
    function pointUpdate(clientX) {
      var rect = track.getBoundingClientRect();
      var maxT = rect.width - thumb.offsetWidth;
      if (maxT <= 0) return;
      var left = clamp(clientX - rect.left - state.grab, 0, maxT);
      state.x = (left / maxT) * (IMG_W - S);
      render();
    }
    track.addEventListener('pointerdown', function (e) {
      if (state.ok) return;
      e.preventDefault();
      var rect = track.getBoundingClientRect();
      var thumbLeft = (state.x / (IMG_W - S)) * (rect.width - thumb.offsetWidth);
      state.grab = clamp(e.clientX - rect.left - thumbLeft, 0, thumb.offsetWidth);
      state.dragging = true;
      track.setPointerCapture(e.pointerId);
      pointUpdate(e.clientX);
    });
    track.addEventListener('pointermove', function (e) {
      if (!state.dragging || state.ok) return;
      pointUpdate(e.clientX);
    });
    function endDrag(e) {
      if (!state.dragging) return;
      state.dragging = false;
      if (track.hasPointerCapture && track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
      check();
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    /* keyboard: arrows move the piece, Enter/Space checks */
    track.addEventListener('keydown', function (e) {
      if (state.ok) return;
      var step = e.shiftKey ? 10 : 2;
      var used = true;
      switch (e.key) {
        case 'ArrowLeft': state.x = clamp(state.x - step, 0, IMG_W - S); break;
        case 'ArrowRight': state.x = clamp(state.x + step, 0, IMG_W - S); break;
        case 'Home': state.x = 0; break;
        case 'End': state.x = IMG_W - S; break;
        case 'Enter': case ' ': check(); break;
        default: used = false;
      }
      if (used) { e.preventDefault(); render(); }
    });

    /* small delight: the refresh arrow spins once on click */
    refresh.addEventListener('click', function () {
      refresh.classList.remove('is-spin');
      void refresh.offsetWidth;
      refresh.classList.add('is-spin');
      regenerate();
    });
    window.addEventListener('resize', layout);

    /* insert before the submit button (or at end of form) */
    var submitBtn = form.querySelector('.submit-btn');
    if (submitBtn) form.insertBefore(widget, submitBtn); else form.appendChild(widget);

    regenerate();

    /* test hook: local development hosts only, never on the public site */
    var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    if (isLocalHost && /[?&]rcdebug=1\b/.test(window.location.search)) {
      window.__rcCaptcha = window.__rcCaptcha || {};
      window.__rcCaptcha[form.id] = {
        solve: function () { state.x = state.target; render(); check(); },
        state: function () { return { x: state.x, target: state.target, ok: state.ok }; }
      };
    }
  }

  function init() {
    document.querySelectorAll('form[data-captcha]').forEach(buildWidget);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
