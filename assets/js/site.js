/* ============================================================
   THE RECONSTRUCTION COMPANY — Interaction & Motion Layer
   Vanilla JS. No dependencies. Honors prefers-reduced-motion.
   ============================================================ */
(function(){
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- toast ---------- */
  var toastEl = null;
  function toast(msg){
    if(!toastEl){
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role','status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function(){ toastEl.classList.add('show'); });
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function(){ toastEl.classList.remove('show'); }, 3200);
  }

  /* ---------- mobile nav ---------- */
  var burger = document.querySelector('.hamburger');
  var panel = document.querySelector('.mobile-panel');
  if(burger && panel){
    burger.addEventListener('click', function(){
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      panel.classList.toggle('open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });
    panel.addEventListener('click', function(e){ if(e.target.tagName === 'A'){ panel.classList.remove('open'); burger.setAttribute('aria-expanded','false'); document.body.style.overflow=''; } });
  }

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if(reduced){
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }else if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, {threshold: 0.12, rootMargin: '0px 0px -40px 0px'});
    revealEls.forEach(function(el){ io.observe(el); });
  }else{
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- animated counters ---------- */
  var counters = document.querySelectorAll('[data-count]');
  var counted = false;
  function runCounters(){
    if(counted) return; counted = true;
    counters.forEach(function(el){
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1400, start = null;
      if(reduced){ el.textContent = target + suffix; return; }
      function frame(ts){
        if(!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var e = 1 - Math.pow(2, -10 * p); if(p === 1) e = 1;
        el.textContent = Math.round(target * e) + suffix;
        if(p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  var statStrip = document.querySelector('.stats');
  if(statStrip && 'IntersectionObserver' in window){
    var io2 = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting){ runCounters(); io2.disconnect(); } });
    }, {threshold: 0.35});
    io2.observe(statStrip);
  }else{ runCounters(); }

  /* ---------- accordion ---------- */
  document.querySelectorAll('.acc-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var item = btn.closest('.acc-item');
      var open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---------- territory helpers ---------- */
  var DATA = window.RC_DATA || [];
  function byState(){
    var map = {};
    DATA.forEach(function(t){ (map[t.state] = map[t.state] || []).push(t); });
    Object.values(map).forEach(function(list){ list.sort(function(a,b){ return a.city.localeCompare(b.city); }); });
    return map;
  }
  function batchClass(b){ return 'batch batch--' + String(b||'').toLowerCase().replace(/\s+/g,'-'); }

  /* ---------- explore rail (home) ---------- */
  var rail = document.getElementById('explore-rail');
  if(rail){
    var groups = byState();
    var states = Object.keys(groups).sort();
    rail.innerHTML = states.map(function(st){
      var list = groups[st];
      var links = list.map(function(t){
        return '<a href="territory.html?slug=' + encodeURIComponent(t.slug) + '"><span>' + esc(t.city) + '</span><small>' + esc(t.batch === 'Town Page' ? 'Town' : t.batch) + '</small></a>';
      }).join('');
      return '<details class="state-item"><summary>' + esc(st) + '<span style="display:inline-flex;align-items:center;gap:.5rem"><span class="n">' + String(list.length).padStart(2,'0') + '</span><i class="chev">+</i></span></summary><div class="state-item__body">' + links + '</div></details>';
    }).join('');
  }

  /* ---------- first-batch grid (home) ---------- */
  var firstBatch = document.getElementById('first-batch-grid');
  if(firstBatch){
    var fb = DATA.filter(function(t){ return t.batch === 'First Batch'; })
                 .sort(function(a,b){ return a.city.localeCompare(b.city); });
    firstBatch.innerHTML = fb.map(function(t){
      return cardHTML(t);
    }).join('');
  }

  /* ---------- directory (areas page) ---------- */
  var dir = document.getElementById('directory-grid');
  if(dir){
    var search = document.getElementById('dir-search');
    var stateSel = document.getElementById('dir-state');
    var countEl = document.getElementById('dir-count');
    var emptyEl = document.getElementById('dir-empty');
    var chips = Array.prototype.slice.call(document.querySelectorAll('.chip[data-batch]'));
    var activeBatch = 'All';

    // populate state select
    if(stateSel){
      Object.keys(byState()).sort().forEach(function(st){
        var o = document.createElement('option'); o.value = st; o.textContent = st; stateSel.appendChild(o);
      });
    }

    function filtered(){
      var q = (search && search.value || '').trim().toLowerCase();
      var st = stateSel && stateSel.value || '';
      return DATA.filter(function(t){
        if(activeBatch !== 'All'){
          if(activeBatch === 'Town Page' ? t.batch !== 'Town Page' : t.batch !== activeBatch) return false;
        }
        if(st && t.state !== st) return false;
        if(q){
          var hay = (t.city + ' ' + t.state + ' ' + (t.county||'') + ' ' + (t.zip||'') + ' ' + t.slug).toLowerCase();
          if(hay.indexOf(q) === -1) return false;
        }
        return true;
      }).sort(function(a,b){ return a.state.localeCompare(b.state) || a.city.localeCompare(b.city); });
    }
    function render(){
      var list = filtered();
      dir.innerHTML = list.map(cardHTML).join('');
      if(countEl) countEl.textContent = list.length + (list.length === 1 ? ' territory' : ' territories') + ' shown · 50 indexed';
      if(emptyEl) emptyEl.style.display = list.length ? 'none' : 'block';
    }
    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        activeBatch = chip.getAttribute('data-batch');
        chips.forEach(function(c){ c.setAttribute('aria-pressed', String(c === chip)); });
        render();
      });
    });
    // deep-link: #first-batch / #batch-2 / #batch-3 / #town-pages / #featured
    var hashMap = {'#first-batch':'First Batch','#batch-2':'Batch 2','#batch-3':'Batch 3','#town-pages':'Town Page','#featured':'Featured'};
    var fromHash = hashMap[(window.location.hash || '').toLowerCase()];
    if(fromHash){
      activeBatch = fromHash;
      chips.forEach(function(c){ c.setAttribute('aria-pressed', String(c.getAttribute('data-batch') === fromHash)); });
    }
    if(search) search.addEventListener('input', render);
    if(stateSel) stateSel.addEventListener('change', render);
    render();
  }

  function cardHTML(t){
    return '<a class="tcard" href="territory.html?slug=' + encodeURIComponent(t.slug) + '">'
      + '<span class="batch">' + esc(t.batch) + (t.zip ? ' · ZIP ' + esc(t.zip) : '') + '</span>'
      + '<h3>' + esc(t.city) + '</h3>'
      + '<p>' + esc(t.county || t.state) + '</p>'
      + '<span class="foot"><span>' + esc(t.state) + '</span><i>Open <svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg></i></span>'
      + '</a>';
  }

  /* ---------- territory detail (territory.html) ---------- */
  var td = document.getElementById('territory-detail');
  if(td){
    var params = new URLSearchParams(window.location.search);
    var slug = (window.RC_PRERENDER_SLUG || params.get('slug') || window.location.hash.replace('#','') || '').toLowerCase();
    var t = DATA.filter(function(x){ return x.slug === slug; })[0];
    if(!t){
      td.innerHTML = '<div class="wrap" style="padding:4rem 0"><p class="eyebrow">Territory</p><h1 style="font-size:2.5rem;font-weight:400;margin:.75rem 0 1rem">We’re preparing this territory page.</h1><p style="color:var(--ink-70);max-width:36rem;line-height:1.6">This location has not been reviewed and published yet. Request your town and we will let you know when a local page is ready.</p><a class="btn btn--solid btn--lg" style="margin-top:1.5rem" href="my-town.html">Request your town <span class="arr"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg></span></a></div>';
    }else{
      document.title = t.city + ', ' + t.state + ' — The Reconstruction Company';
      var siblings = DATA.filter(function(x){ return x.state === t.state && x.slug !== t.slug; }).slice(0,6);
      var sameBatch = DATA.filter(function(x){ return x.batch === t.batch && x.slug !== t.slug; }).slice(0,6);
      var sibHead, sibItems;
      if(siblings.length){ sibHead = 'More in ' + t.state; sibItems = siblings; }
      else if(sameBatch.length){ sibHead = 'More from ' + (t.batch === 'Town Page' ? 'the town pages' : t.batch); sibItems = sameBatch; }
      var sibList = sibItems ? sibItems.map(function(s){
        return '<a href="territory.html?slug=' + encodeURIComponent(s.slug) + '"><span>' + esc(s.city) + '</span><span aria-hidden="true" class="td-arrow"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg></span></a>';
      }).join('') : '';
      td.innerHTML =
        '<div class="wrap"><div class="td-grid page-anim">'
        + '<article>'
        +   '<nav class="crumbs"><a href="index.html">Home</a><span>/</span><a href="areas.html">Territories</a><span>/</span><span aria-current="page">' + esc(t.city) + '</span></nav>'
        +   '<span class="badge"><i></i>' + esc(t.batch === 'Town Page' ? 'Published town page' : t.batch + ' territory') + '</span>'
        +   '<h1 class="td-title">' + esc(t.city) + '</h1>'
        +   '<p class="lede" style="font-size:1.15rem;color:var(--ink-70);max-width:40rem;line-height:1.6">' + esc(introFor(t)) + '</p>'
        +   '<div class="td-specs">'
        +     spec('State', t.state)
        +     spec('County / area', t.county || '—')
        +     spec('ZIP', t.zip || '—')
        +     spec('Reference point', t.lat.toFixed(3) + '°, ' + t.lng.toFixed(3) + '°')
        +   '</div>'
        +   '<div class="callout"><strong>What this is.</strong> An educational, location-based starting point for the local Opportunity Zone context around ' + esc(t.city) + '. Designations are made census-tract by census-tract — a ZIP code is not an Opportunity Zone, and this page is not an eligibility determination for any property or address.</div>'
        +   '<p style="margin:1.25rem 0;line-height:1.7;color:var(--ink-70)">' + esc(t.label) + '. Reconstruction USA is preparing community-focused agent experiences for local areas; visiting this page does not enroll you in any program, service, or offering.</p>'
        +   (t.resourceUrl ? '<a class="btn btn--ghost" href="' + esc(t.resourceUrl) + '" target="_blank" rel="noopener noreferrer">Official Opportunity Zone resource <span class="arr"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg></span></a>' : '')
        +   '<div class="cta-row" style="margin-top:1.5rem"><a class="btn btn--solid" href="my-town.html">Request your town <span class="arr"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg></span></a><a class="btn btn--ghost" href="join-the-team.html">Join the team <span class="arr"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg></span></a></div>'
        +   '<p class="disclaimer">This page is informational only and is not investment, tax, legal, or financial advice, and not an offering of securities. It is not a property listing, an agent claim, or an Opportunity Zone determination. Opportunity Zone designations shown by public sources reflect original designations (December 2019) unless a state program states otherwise. Always verify a specific address with the official census tract and the relevant state program before acting.</p>'
        + '</article>'
        + '<aside>'
        +   (sibList ? '<div class="side-box"><h3>' + esc(sibHead) + '</h3>' + sibList + '</div>' : '')
        +   '<div class="side-box"><h3>Next steps</h3><a href="my-town.html"><span>Request your town</span><span class="side-arrow"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg></span></a><a href="join-the-team.html"><span>Request guide access</span><span class="side-arrow"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg></span></a><a href="faq.html"><span>Read the FAQ</span><span class="side-arrow"><svg class="ic" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg></span></a></div>'
        +   '<div class="side-box"><h3>Reference point</h3><p class="mono" style="line-height:1.9">LAT ' + t.lat.toFixed(4) + '<br>LNG ' + t.lng.toFixed(4) + '<br>ZOOM ' + (t.zoom || 11) + '</p></div>'
        + '</aside>'
        + '</div></div>';
    }
  }
  function spec(k,v){ return '<div><b>' + esc(String(v)) + '</b><span>' + esc(k) + '</span></div>'; }
  function introFor(t){
    return 'Explore the ' + t.city + ' territory and its local Opportunity Zone context. Reconstruction USA is preparing community-focused agent experiences for local areas.';
  }

  /* ---------- SVG map ---------- */
  var map = document.getElementById('territory-map');
  if(map){
    var W = 1000, H = 600, PAD = 34;
    var LNG0 = -125, LNG1 = -66.5, LAT0 = 24, LAT1 = 50;
    function X(lng){ return PAD + (lng - LNG0) / (LNG1 - LNG0) * (W - 2*PAD); }
    function Y(lat){ return PAD + (LAT1 - lat) / (LAT1 - LAT0) * (H - 2*PAD); }
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','0 0 ' + W + ' ' + H);
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Map of indexed territory reference points across the United States');

    // graticule
    var g = document.createElementNS(NS,'g');
    g.setAttribute('stroke','rgba(20,20,20,.14)'); g.setAttribute('stroke-width','1'); g.setAttribute('stroke-dasharray','2 5');
    for(var lon=-124; lon<=-68; lon+=4){ g.appendChild(line(X(lon),Y(LAT0),X(lon),Y(LAT1))); }
    for(var lat=26; lat<=50; lat+=4){ g.appendChild(line(X(LNG0),Y(lat),X(LNG1),Y(lat))); }
    svg.appendChild(g);

    // frame + corner ticks
    var frame = document.createElementNS(NS,'rect');
    frame.setAttribute('x',PAD-14); frame.setAttribute('y',PAD-14); frame.setAttribute('width',W-2*(PAD-14)); frame.setAttribute('height',H-2*(PAD-14));
    frame.setAttribute('fill','none'); frame.setAttribute('stroke','rgba(20,20,20,.35)'); frame.setAttribute('stroke-width','1.2');
    svg.appendChild(frame);

    // compass + caption
    var cap = document.createElementNS(NS,'text');
    cap.setAttribute('x',PAD-14); cap.setAttribute('y',H-PAD+26);
    cap.setAttribute('font-family','var(--mono)'); cap.setAttribute('font-size','11'); cap.setAttribute('fill','rgba(20,20,20,.55)');
    cap.textContent = 'FIG. 1 — INDEXED TERRITORY REFERENCE POINTS · LOWER 48 + VT';
    svg.appendChild(cap);
    var n = document.createElementNS(NS,'text');
    n.setAttribute('x',W-PAD+8); n.setAttribute('y',PAD-2); n.setAttribute('font-family','Georgia'); n.setAttribute('font-size','15'); n.setAttribute('font-style','italic'); n.setAttribute('fill','rgba(20,20,20,.7)'); n.textContent = 'N ↑';
    svg.appendChild(n);

    // dots
    var featured = {'chattanooga-tn':1,'knoxville-tn':1,'la':1,'long-beach-ca':1,'phoenix':1,'san-diego':1,'lake-forest-park-wa':1};
    DATA.forEach(function(t){
      if(t.lat == null) return;
      var grp = document.createElementNS(NS,'a');
      grp.setAttribute('class','map-dot' + (featured[t.slug] ? ' featured' : ''));
      grp.setAttribute('href','territory.html?slug=' + encodeURIComponent(t.slug));
      grp.setAttribute('aria-label', t.city + ', ' + t.state);
      grp.setAttribute('tabindex','0');
      if(featured[t.slug]){
        var pulse = document.createElementNS(NS,'circle');
        pulse.setAttribute('class','map-pulse'); pulse.setAttribute('cx',X(t.lng)); pulse.setAttribute('cy',Y(t.lat)); pulse.setAttribute('r',6);
        grp.appendChild(pulse);
      }
      var c = document.createElementNS(NS,'circle');
      c.setAttribute('class','core'); c.setAttribute('cx',X(t.lng)); c.setAttribute('cy',Y(t.lat)); c.setAttribute('r', featured[t.slug] ? 6 : 4.4);
      grp.appendChild(c);
      // tooltip
      grp.addEventListener('mousemove', function(e){ showTip(e, t); });
      grp.addEventListener('mouseleave', hideTip);
      grp.addEventListener('focus', function(){ showTip(null, t, grp); });
      grp.addEventListener('blur', hideTip);
      svg.appendChild(grp);
    });
    map.appendChild(svg);

    var tip = document.createElement('div'); tip.className='map-tip'; map.appendChild(tip);
    function showTip(evt, t, anchor){
      tip.textContent = t.city + ', ' + t.state;
      tip.style.opacity = '1';
      var rect = map.getBoundingClientRect();
      if(evt){
        tip.style.left = (evt.clientX - rect.left) + 'px';
        tip.style.top = (evt.clientY - rect.top) + 'px';
      }else if(anchor){
        var x = X(t.lng)/1000*rect.width, y = Y(t.lat)/600*rect.height;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
      }
    }
    function hideTip(){ tip.style.opacity = '0'; }
    function line(x1,y1,x2,y2){ var l=document.createElementNS(NS,'line'); l.setAttribute('x1',x1);l.setAttribute('y1',y1);l.setAttribute('x2',x2);l.setAttribute('y2',y2); return l; }
  }

  /* ---------- ticker duplicate for seamless loop ---------- */
  var tickerInner = document.querySelector('.ticker__inner');
  if(tickerInner && !reduced){ tickerInner.innerHTML += tickerInner.innerHTML; }

  /* ---------- footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function(el){ el.textContent = new Date().getFullYear(); });

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
})();
