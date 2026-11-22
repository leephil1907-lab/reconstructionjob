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

  var ICON_PIECE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4.5a1.5 1.5 0 0 1 3 0V6h4.5a1 1 0 0 1 1 1V11h1.5a1.5 1.5 0 0 1 0 3H17.5v4.5a1 1 0 0 1-1 1H13v-1.5a1.5 1.5 0 0 0-3 0V20H5.5a1 1 0 0 1-1-1V14.5H5a1.5 1.5 0 0 0 0-3H4.5V7a1 1 0 0 1 1-1H9V4.5Z" transform="translate(0.5 0.5) scale(0.96)"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5 9.5 17.5 19.5 6.5"/></svg>';
  var ICON_REFRESH = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v6h-6"/></svg>';

  /* ---------- procedural artwork: ink-and-ochre nocturne ---------- */
  function drawArt(ctx, rand) {
    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, IMG_H);
    sky.addColorStop(0, '#171310');
    sky.addColorStop(0.55, '#221a13');
    sky.addColorStop(1, '#2c221a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, IMG_W, IMG_H);
    // stars
    ctx.fillStyle = 'rgba(245,242,234,0.85)';
    for (var i = 0; i < 46; i++) {
      var sy = rand() * IMG_H * 0.5;
      ctx.globalAlpha = 0.25 + rand() * 0.6;
      ctx.fillRect(rand() * IMG_W, sy, rand() < 0.2 ? 2 : 1, rand() < 0.2 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    // sun / moon disc
    var sunX = IMG_W * (0.3 + rand() * 0.4), sunY = IMG_H * (0.52 + rand() * 0.12), sunR = 26 + rand() * 10;
    var glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunR * 2.1);
    glow.addColorStop(0, 'rgba(217,164,65,0.95)');
    glow.addColorStop(0.35, 'rgba(185,141,46,0.55)');
    glow.addColorStop(1, 'rgba(185,141,46,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, IMG_W, IMG_H);
    ctx.fillStyle = '#e7c267';
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 0.62, 0, Math.PI * 2); ctx.fill();
    // ridge lines
    var ridges = ['#241c14', '#1d1610', '#151009'];
    for (var r = 0; r < 3; r++) {
      var base = IMG_H * (0.66 + r * 0.13);
      var amp = 14 + r * 7;
      ctx.fillStyle = ridges[r];
      ctx.beginPath();
      ctx.moveTo(0, IMG_H);
      ctx.lineTo(0, base);
      var x = 0;
      while (x < IMG_W) {
        x += 18 + rand() * 30;
        ctx.lineTo(Math.min(x, IMG_W), base + (rand() - 0.5) * amp);
      }
      ctx.lineTo(IMG_W, IMG_H);
      ctx.closePath();
      ctx.fill();
    }
    // horizon rule in ochre
    ctx.strokeStyle = 'rgba(185,141,46,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, IMG_H * 0.7); ctx.lineTo(IMG_W, IMG_H * 0.7); ctx.stroke();
    // grain
    for (var g = 0; g < 700; g++) {
      ctx.fillStyle = 'rgba(245,242,234,' + (rand() * 0.05) + ')';
      ctx.fillRect(rand() * IMG_W, rand() * IMG_H, 1, 1);
    }
    // vignette
    var vig = ctx.createRadialGradient(IMG_W / 2, IMG_H / 2, IMG_H * 0.35, IMG_W / 2, IMG_H / 2, IMG_W * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.38)');
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
    var widget = el('figure', 'captcha', null);
    widget.setAttribute('data-captcha-widget', '');

    var stage = el('div', 'captcha__stage', widget);
    var bg = el('canvas', 'captcha__bg', stage);
    var piece = el('canvas', 'captcha__piece', stage);
    var okBadge = el('div', 'captcha__ok', stage, ICON_CHECK);
    okBadge.setAttribute('aria-hidden', 'true');

    var bar = el('div', 'captcha__bar', widget);
    var refresh = el('button', 'captcha__refresh', bar, ICON_REFRESH);
    refresh.type = 'button';
    refresh.setAttribute('aria-label', 'Load a new puzzle');

    var track = el('div', 'captcha__track', bar);
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Slider puzzle verification');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    track.tabIndex = 0;
    var trackLabel = el('span', 'captcha__track-label', track, 'Slide to verify');
    var thumb = el('span', 'captcha__thumb', track, ICON_PIECE);
    thumb.setAttribute('aria-hidden', 'true');

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
      var travel = track.clientWidth - thumb.offsetWidth;
      var frac = (IMG_W - S) > 0 ? state.x / (IMG_W - S) : 0;
      thumb.style.transform = 'translate3d(' + (frac * travel) + 'px,0,0)';
      track.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    }

    function layout() {
      var rect = bg.getBoundingClientRect();
      state.scale = rect.width / IMG_W || 1;
      piece.style.width = (S * state.scale) + 'px';
      piece.style.height = ((PAD_TOP + S) * state.scale) + 'px';
      piece.style.top = ((HY - PAD_TOP) * state.scale) + 'px';
      piece.style.left = '0px';
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
      bctx.strokeStyle = 'rgba(245,242,234,0.85)';
      bctx.lineWidth = 1.4;
      bctx.stroke();
      bctx.strokeStyle = 'rgba(185,141,46,0.9)';
      bctx.lineWidth = 0.7;
      tracePath(bctx, state.target + 1.4, HY + 1.4, S - 2.8, Math.max(1, KR - 1.4));
      bctx.stroke();
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
      pctx.lineWidth = 1.5;
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
      thumb.innerHTML = ICON_PIECE;
      trackLabel.textContent = 'Slide to verify';
      var seed = (Math.random() * 0xffffffff) >>> 0;
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
      thumb.innerHTML = ICON_CHECK;
      trackLabel.textContent = 'Verified';
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

    refresh.addEventListener('click', regenerate);
    window.addEventListener('resize', layout);

    /* insert before the submit button (or at end of form) */
    var submitBtn = form.querySelector('.submit-btn');
    if (submitBtn) form.insertBefore(widget, submitBtn); else form.appendChild(widget);

    regenerate();

    /* test hook: only with ?rcdebug=1 in the URL */
    if (/[?&]rcdebug=1\b/.test(window.location.search)) {
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
