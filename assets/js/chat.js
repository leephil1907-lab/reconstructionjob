/* ============================================================
   THE RECONSTRUCTION COMPANY — Live Chat Widget
   Vanilla JS. Works against Supabase via the anon key +
   security-definer RPCs (rc_visitor_*). Silent fail without config.
   ============================================================ */
(function(){
  'use strict';
  var CFG = window.RC_CONFIG || {};
  if(!CFG.supabaseUrl || !CFG.publishableKey) return; // not configured — stay silent

  var API = CFG.supabaseUrl.replace(/\/$/, '');
  var KEY = CFG.publishableKey;
  var STORE = 'rc_chat_v1';
  var POLL_MS = 4000;

  function rpc(name, args){
    return fetch(API + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args || {})
    }).then(function(res){
      if(!res.ok) return res.text().then(function(t){ throw new Error('rpc-' + res.status + ':' + t); });
      return res.status === 204 ? null : res.json();
    });
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function loadState(){
    try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch(e){ return null; }
  }
  function saveState(s){
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch(e){}
  }
  function randomKey(){
    try {
      var arr = new Uint8Array(24);
      (window.crypto || window.msCrypto).getRandomValues(arr);
      return Array.prototype.map.call(arr, function(b){ return ('00' + b.toString(16)).slice(-2); }).join('');
    } catch(e){
      return 'k' + Date.now() + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
  }

  /* ---------- markup ---------- */
  var fab = document.createElement('button');
  fab.className = 'rc-chat__fab';
  fab.setAttribute('aria-label', 'Open live chat');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML =
    '<svg class="rc-chat__fab-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">' +
      '<path d="M21 11.5c0 4.1-4.03 7.5-9 7.5-1.06 0-2.08-.17-3.02-.48L4 20.5l1.72-4.3C4.63 14.53 4 13.08 4 11.5 4 7.4 8.03 4 13 4s9 3.4 9 7.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="rgba(245,242,234,.08)"/>' +
    '</svg>' +
    '<span class="rc-chat__badge" hidden></span>';

  var panel = document.createElement('div');
  panel.className = 'rc-chat__panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Live chat with The Reconstruction Company');
  panel.hidden = true;
  panel.innerHTML =
    '<div class="rc-chat__head">' +
      '<div class="rc-chat__sigil">' + '<svg class="rc-chat__sigil-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="10" fill="#f5f2ea"/><text x="32" y="30" text-anchor="middle" dominant-baseline="central" font-family="Georgia,Times New Roman,serif" font-size="25" letter-spacing="1.5" fill="#141414">RC</text><rect x="13" y="43" width="38" height="3.4" fill="#b98d2e"/></svg>' + '</div>' +
      '<div class="rc-chat__head-text"><b>Talk with the Company</b><span>Usually replies within a day</span></div>' +
      '<button class="rc-chat__close" type="button" aria-label="Close chat">&times;</button>' +
    '</div>' +
    '<div class="rc-chat__body" data-body></div>' +
    '<form class="rc-chat__identity" data-identity hidden>' +
      '<p>Tell us who is writing — that is all we need to reach you back.</p>' +
      '<input type="text" name="name" required maxlength="120" placeholder="Your name" aria-label="Your name">' +
      '<input type="email" name="email" maxlength="160" placeholder="Email (optional)" aria-label="Your email (optional)">' +
    '</form>' +
    '<form class="rc-chat__composer" data-composer>' +
      '<input type="text" name="message" required maxlength="2000" placeholder="Write a message…" aria-label="Message" autocomplete="off">' +
      '<button type="submit" aria-label="Send message">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M3.5 11.5L21 3l-4.5 17.5-3.4-7.1-9.6-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="currentColor" fill-opacity=".18"/></svg>' +
      '</button>' +
    '</form>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var body = panel.querySelector('[data-body]');
  var identityForm = panel.querySelector('[data-identity]');
  var identityName = identityForm.querySelector('input[name="name"]');
  var identityEmail = identityForm.querySelector('input[name="email"]');
  var composer = panel.querySelector('[data-composer]');
  var msgInput = composer.querySelector('input[name="message"]');
  var badge = fab.querySelector('.rc-chat__badge');
  var closeBtn = panel.querySelector('.rc-chat__close');

  /* ---------- rendering ---------- */
  function bubble(sender, bodyText, at){
    var mine = sender === 'visitor';
    var time = '';
    try { time = new Date(at).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}); } catch(e){}
    return '<div class="rc-msg ' + (mine ? 'rc-msg--visitor' : 'rc-msg--admin') + '">' +
             '<p>' + esc(bodyText) + '</p>' +
             '<time>' + esc(time) + '</time>' +
           '</div>';
  }

  function renderEmpty(state){
    if(!state){
      body.innerHTML = '<div class="rc-chat__empty"><p><b>Hello.</b> Ask about territories, the My Town process, or guide access. A real person reads these — usually within a day.</p></div>';
      return;
    }
    if(state.status === 'closed'){
      body.innerHTML = '<div class="rc-chat__empty"><p>This conversation was closed by the Company. Send a new message to reopen it.</p></div>';
    } else {
      body.innerHTML = '';
    }
  }

  var lastRendered = null; // JSON of thread state for cheap diffing
  function render(thread){
    if(!thread){ renderEmpty(null); return 0; }
    var msgs = thread.messages || [];
    var adminReplies = msgs.filter(function(m){ return m.sender === 'admin'; });
    var sig = JSON.stringify([thread.id, thread.status, msgs.map(function(m){ return m.id; })]);
    if(sig !== lastRendered){
      var html = msgs.map(function(m){ return bubble(m.sender, m.body, m.created_at); }).join('');
      if(thread.status === 'closed'){
        html += '<div class="rc-chat__empty rc-chat__empty--closed"><p>This conversation was closed by the Company. Send a new message to reopen it.</p></div>';
      }
      body.innerHTML = html || '';
      lastRendered = sig;
      body.scrollTop = body.scrollHeight;
    }
    return adminReplies.length;
  }

  function setBadge(n, seen){
    var unseen = Math.max(0, n - (seen || 0));
    if(unseen > 0){
      badge.hidden = false;
      badge.textContent = String(unseen);
      badge.classList.remove('rc-chat__badge--pop');
      void badge.offsetWidth;
      badge.classList.add('rc-chat__badge--pop');
    }
    else { badge.hidden = true; }
  }

  /* ---------- state ---------- */
  var state = loadState() || null; // {key, name, email, threadId, seenAdmin}
  if(state && state.key){
    identityForm.hidden = true;
    composer.classList.add('ready');
  } else {
    identityForm.hidden = false;
  }

  var pollTimer = null;
  function refresh(){
    var s = loadState();
    if(!s || !s.key){ renderEmpty(null); return; }
    rpc('rc_visitor_fetch', { p_visitor_key: s.key }).then(function(threads){
      threads = Array.isArray(threads) ? threads : [];
      var thread = threads.filter(function(t){ return t.id === s.threadId; })[0] || threads[0] || null;
      if(thread && !s.threadId){ s.threadId = thread.id; saveState(s); }
      var adminCount = render(thread);
      if(thread) setBadge(adminCount, panel.hidden ? (s.seenAdmin || 0) : (s.seenAdmin = adminCount, saveState(s), adminCount));
      else setBadge(0, 0);
    }).catch(function(){
      // transient network/RLS failure — keep the UI calm, retry on next poll
    });
  }
  function startPolling(){
    stopPolling();
    pollTimer = setInterval(refresh, POLL_MS);
    refresh();
  }
  function stopPolling(){ if(pollTimer){ clearInterval(pollTimer); pollTimer = null; } }

  function openPanel(){
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    var s = loadState() || {};
    s.seenAdmin = (function(){
      var m = (body.innerHTML.match(/rc-msg--admin/g) || []).length;
      return Math.max(s.seenAdmin || 0, m);
    })();
    saveState(s);
    refresh();
    setTimeout(function(){ (identityForm.hidden ? msgInput : identityName).focus(); }, 60);
    startPolling();
  }
  function closePanel(){
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    stopPolling();
    var s = loadState();
    if(s){ // count admin messages currently rendered as seen
      var m = (body.innerHTML.match(/rc-msg--admin/g) || []).length;
      if(m > (s.seenAdmin || 0)){ s.seenAdmin = m; saveState(s); }
      setBadge(m, s.seenAdmin);
    }
    fab.focus();
  }

  fab.addEventListener('click', function(){ panel.hidden ? openPanel() : closePanel(); });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !panel.hidden) closePanel(); });

  composer.addEventListener('submit', function(e){
    e.preventDefault();
    var text = (msgInput.value || '').trim();
    if(!text) return;
    var s = loadState() || {};

    // first message needs an identity
    if(!s.key){
      var name = (identityName.value || '').trim();
      var email = (identityEmail.value || '').trim();
      if(name.length < 2){ identityName.focus(); identityName.setAttribute('aria-invalid','true'); return; }
      s = { key: randomKey(), name: name, email: email || null, threadId: null, seenAdmin: 0 };
      identityForm.hidden = true;
      msgInput.disabled = true;
      rpc('rc_visitor_create_thread', { p_visitor_key: s.key, p_name: s.name, p_email: s.email, p_body: text })
        .then(function(threadId){
          s.threadId = threadId; saveState(s);
          msgInput.value = '';
          msgInput.disabled = false;
          refresh();
          msgInput.focus();
        })
        .catch(function(){ s = null; msgInput.disabled = false; identityForm.hidden = false; showError(); });
      return;
    }

    msgInput.disabled = true;
    var request = s.threadId
      ? rpc('rc_visitor_send', { p_visitor_key: s.key, p_thread_id: s.threadId, p_body: text })
      : rpc('rc_visitor_create_thread', { p_visitor_key: s.key, p_name: s.name, p_email: s.email, p_body: text }).then(function(tid){ s.threadId = tid; saveState(s); });
    request.then(function(){
      msgInput.value = '';
      msgInput.disabled = false;
      refresh();
      msgInput.focus();
    }).catch(function(){
      msgInput.disabled = false;
      showError();
    });
  });

  function showError(){
    var note = document.createElement('p');
    note.className = 'rc-chat__error';
    note.textContent = "Couldn't reach us just now. Try again, or email buildwithbruno@hotmail.com.";
    var composerEl = composer;
    composerEl.parentElement.insertBefore(note, composerEl);
    setTimeout(function(){ if(note.parentElement) note.parentElement.removeChild(note); }, 5000);
  }

  /* gentle arrival: poll once on load to light the badge if the company replied */
  setTimeout(function(){ var s = loadState(); if(s && s.key) rpc('rc_visitor_fetch', { p_visitor_key: s.key }).then(function(threads){
    threads = Array.isArray(threads) ? threads : [];
    var thread = threads.filter(function(t){ return t.id === s.threadId; })[0] || threads[0];
    if(!thread) return;
    var adminCount = (thread.messages || []).filter(function(m){ return m.sender === 'admin'; }).length;
    setBadge(adminCount, s.seenAdmin || 0);
  }).catch(function(){}); }, 1200);
})();
