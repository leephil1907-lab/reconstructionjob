/* ============================================================
   THE RECONSTRUCTION COMPANY — Admin Console
   Auth (Supabase email), inbox, live chat, invoices, branded
   email, settings. No dependencies — plain REST + fetch.
   ============================================================ */
(function(){
  'use strict';

  var CFG = window.RC_CONFIG || {};
  var API = (CFG.supabaseUrl || '').replace(/\/$/, '');
  var ANON = CFG.publishableKey || '';
  var CONTACT = CFG.contactEmail || 'buildwithbruno@hotmail.com';
  var SESSION_KEY = 'rc_admin_session';

  /* ---------- helpers ---------- */
  function $(sel, root){ return (root || document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function money(n){
    var v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
  function fmtDate(d){
    if(!d) return '—';
    try { return new Date(d).toLocaleString([], {month:'short', day:'numeric', year:'numeric'}); } catch(e){ return String(d); }
  }
  /* invoice totals are derived from items (jsonb) — no stored total column */
  function invoiceTotals(inv){
    var items = Array.isArray(inv.items) ? inv.items : [];
    var subtotal = 0;
    items.forEach(function(it){ subtotal += (Number(it.qty) || 0) * (Number(it.rate) || 0); });
    var taxRate = Number(inv.tax_rate) || 0;
    var discount = Number(inv.discount) || 0;
    var tax = subtotal * (taxRate / 100);
    var total = Math.max(0, subtotal + tax - discount);
    return {subtotal: subtotal, tax: tax, discount: discount, total: total};
  }
  function fmtDateTime(d){
    if(!d) return '—';
    try { return new Date(d).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}); } catch(e){ return String(d); }
  }
  function isoToday(){ return new Date().toISOString().slice(0, 10); }
  function addDaysISO(base, days){
    var d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function toast(msg){
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('show'); }, 3400);
  }

  /* ---------- session ---------- */
  function loadSession(){
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch(e){ return null; }
  }
  function saveSession(s){
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch(e){}
  }
  function clearSession(){
    try { sessionStorage.removeItem(SESSION_KEY); } catch(e){}
  }
  function sessionValid(s){ return s && s.access_token && s.expires_at && Date.now() < s.expires_at - 30000; }

  function authFetch(path, opts){
    opts = opts || {};
    var headers = opts.headers || {};
    headers['apikey'] = ANON;
    if(opts.bearer) headers['Authorization'] = 'Bearer ' + opts.bearer;
    else if(sessionValid(loadSession())) headers['Authorization'] = 'Bearer ' + loadSession().access_token;
    else headers['Authorization'] = 'Bearer ' + ANON;
    opts.headers = headers;
    return fetch(API + path, opts);
  }

  function tryRefresh(){
    var s = loadSession();
    if(!s || !s.refresh_token) return Promise.resolve(null);
    return fetch(API + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {'apikey': ANON, 'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: s.refresh_token})
    }).then(function(res){
      if(!res.ok) return null;
      return res.json().then(function(tok){
        var ns = {
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || s.refresh_token,
          expires_at: Date.now() + (Number(tok.expires_in || 3600) * 1000),
          email: s.email
        };
        saveSession(ns);
        return ns;
      });
    }).catch(function(){ return null; });
  }

  /* REST helper with one automatic refresh-and-retry on 401 */
  function rest(path, opts, _retried){
    opts = opts || {};
    var s = loadSession();
    var headers = opts.headers || {};
    headers['apikey'] = ANON;
    if(s && s.access_token) headers['Authorization'] = 'Bearer ' + s.access_token;
    opts.headers = headers;
    return fetch(API + path, opts).then(function(res){
      if(res.status === 401 && !_retried){
        return tryRefresh().then(function(ns){
          if(!ns){ forceLogout(); throw new Error('session-expired'); }
          return rest(path, opts, true);
        });
      }
      return res;
    });
  }
  function restJson(path, opts){
    return rest(path, opts).then(function(res){
      if(!res.ok) return res.text().then(function(t){ throw new Error('rest-' + res.status + ':' + t); });
      if(res.status === 204) return null;
      return res.text().then(function(t){ return t ? JSON.parse(t) : null; });
    });
  }

  /* ---------- view switching ---------- */
  var currentTab = 'dashboard';
  var chatPollTimer = null;

  function showView(isApp){
    $('#loginView').hidden = isApp;
    $('#appView').hidden = !isApp;
  }
  function switchTab(name){
    currentTab = name;
    $all('.side__link[data-tab]').forEach(function(b){ b.classList.toggle('is-active', b.dataset.tab === name); });
    $all('.tab').forEach(function(sec){
      var match = sec.id === 'tab-' + name;
      sec.hidden = !match;
      sec.classList.toggle('is-active', match);
    });
    if(chatPollTimer){ clearInterval(chatPollTimer); chatPollTimer = null; }
    if(name === 'chat'){
      loadThreads();
      chatPollTimer = setInterval(function(){ loadThreads(true); }, 5000);
    }
    if(name === 'dashboard') loadDashboard();
    if(name === 'submissions') loadSubmissions();
    if(name === 'invoices') loadInvoices();
    if(name === 'email') loadEmailLog();
    if(name === 'settings') loadSettings();
    window.scrollTo(0, 0);
  }

  function forceLogout(){
    clearSession();
    if(chatPollTimer){ clearInterval(chatPollTimer); chatPollTimer = null; }
    showView(false);
  }

  /* ---------- login / logout ---------- */
  $('#loginForm').addEventListener('submit', function(e){
    e.preventDefault();
    var err = $('#loginError');
    var btn = $('#loginBtn');
    err.hidden = true;
    btn.disabled = true;
    $('.login__btn-label', btn).textContent = 'Signing in…';
    var email = $('#loginEmail').value.trim();
    var password = $('#loginPassword').value;
    fetch(API + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {'apikey': ANON, 'Content-Type': 'application/json'},
      body: JSON.stringify({email: email, password: password})
    }).then(function(res){ return res.json().then(function(body){ return {ok: res.ok, body: body}; }); })
      .then(function(r){
        if(!r.ok) throw new Error((r.body && (r.body.msg || r.body.error_description || r.body.message)) || 'Sign-in failed');
        saveSession({
          access_token: r.body.access_token,
          refresh_token: r.body.refresh_token,
          expires_at: Date.now() + (Number(r.body.expires_in || 3600) * 1000),
          email: email
        });
        $('#accountEmail').textContent = email;
        $('#loginPassword').value = '';
        showView(true);
        switchTab('dashboard');
        toast('Signed in');
      })
      .catch(function(ex){
        err.textContent = ex.message === 'Failed to fetch' ? 'Network error — check your connection.' : 'Could not sign in. Check your email and password.';
        err.hidden = false;
      })
      .finally(function(){
        btn.disabled = false;
        $('.login__btn-label', btn).textContent = 'Sign in';
      });
  });
  $('#signOutBtn').addEventListener('click', function(){ forceLogout(); toast('Signed out'); });

  /* ============================================================
     TAB: DASHBOARD
     ============================================================ */
  function loadDashboard(){
    var s = loadSession(); if(!s) return;
    Promise.all([
      restJson('/rest/v1/rc_submissions?select=id,kind,reference,status,payload,created_at&order=created_at.desc', {headers:{}}).catch(function(){ return []; }),
      restJson('/rest/v1/rc_chat_threads?select=id,visitor_name,visitor_email,status,updated_at,rc_chat_messages(sender,created_at)&order=updated_at.desc&limit=25', {headers:{}}).catch(function(){ return []; }),
      restJson('/rest/v1/rc_invoices?select=items,tax_rate,discount,status', {headers:{}}).catch(function(){ return []; })
    ]).then(function(results){
      var subs = results[0] || [], threads = results[1] || [], invoices = results[2] || [];

      var newCount = subs.filter(function(x){ return x.status === 'new'; }).length;
      var waiting = threads.filter(function(t){
        var msgs = (t.rc_chat_messages || []).slice().sort(function(a,b){ return new Date(a.created_at) - new Date(b.created_at); });
        return msgs.length && msgs[msgs.length - 1].sender === 'visitor' && t.status !== 'closed';
      }).length;

      var outstanding = 0, paid = 0;
      invoices.forEach(function(inv){
        var total = invoiceTotals(inv).total;
        if(inv.status === 'sent' || inv.status === 'draft') outstanding += total;
        if(inv.status === 'paid') paid += total;
      });

      $('#statNewSubs').textContent = newCount;
      $('#statOpenChats').textContent = waiting;
      $('#statOutstanding').textContent = money(outstanding);
      $('#statPaid').textContent = money(paid);

      var leadList = $('#dashLeads');
      var fresh = subs.filter(function(x){ return x.status === 'new'; }).slice(0, 5);
      leadList.innerHTML = fresh.length
        ? fresh.map(function(x){
            var p = x.payload || {};
            var name = p.full_name || p.name || 'Unknown';
            var what = x.kind === 'my-town' ? ('My Town — ' + esc(p.town_or_zip || 'n/a')) : 'Guide-access application';
            return '<li><span class="dot"></span><span><b>' + esc(name) + '</b> · ' + what + '</span><time>' + fmtDateTime(x.created_at) + '</time></li>';
          }).join('')
        : '<li class="dash-list__empty">Nothing waiting — inbox zero.</li>';

      var chatList = $('#dashChats');
      chatList.innerHTML = threads.length
        ? threads.slice(0, 5).map(function(t){
            return '<li><span class="dot' + (t.status === 'closed' ? ' dot--ok' : '') + '"></span><span><b>' + esc(t.visitor_name) + '</b> · ' + esc(t.visitor_email || 'no email') + '</span><time>' + fmtDateTime(t.updated_at) + '</time></li>';
          }).join('')
        : '<li class="dash-list__empty">No conversations yet.</li>';

      updateBadges(newCount, waiting);
    });
  }

  function updateBadges(newCount, waiting){
    var bs = $('#badgeSubs');
    if(typeof newCount === 'number'){ bs.hidden = newCount === 0; bs.textContent = String(newCount); }
    var bc = $('#badgeChat');
    if(typeof waiting === 'number'){ bc.hidden = waiting === 0; bc.textContent = String(waiting); }
  }

  document.addEventListener('click', function(e){
    var go = e.target.closest('[data-goto]');
    if(go && go.dataset.goto) switchTab(go.dataset.goto);
    var tab = e.target.closest('.side__link[data-tab]');
    if(tab) switchTab(tab.dataset.tab);
  });

  /* ============================================================
     TAB: LIVE CHAT
     ============================================================ */
  var activeThreadId = null;
  var threadsCache = [];

  function loadThreads(soft){
    restJson('/rest/v1/rc_chat_threads?select=id,visitor_name,visitor_email,status,updated_at,rc_chat_messages(id,sender,body,created_at)&order=updated_at.desc&limit=50')
      .then(function(threads){
        threadsCache = threads || [];
        renderThreadList();
        if(activeThreadId){
          var current = threadsCache.filter(function(t){ return t.id === activeThreadId; })[0];
          if(current) renderThreadMessages(current);
        }
        var waiting = threadsCache.filter(function(t){
          var msgs = (t.rc_chat_messages || []).slice().sort(function(a,b){ return new Date(a.created_at) - new Date(b.created_at); });
          return msgs.length && msgs[msgs.length - 1].sender === 'visitor' && t.status !== 'closed';
        }).length;
        updateBadges(undefined, waiting);
      })
      .catch(function(){ if(!soft) toast('Could not load conversations'); });
  }

  function renderThreadList(){
    var list = $('#chatThreadList');
    if(!threadsCache.length){
      list.innerHTML = '<li class="dash-list__empty">No conversations yet.<br>Visitors reach you via the chat button on the public site.</li>';
      return;
    }
    list.innerHTML = threadsCache.map(function(t){
      var msgs = (t.rc_chat_messages || []).slice().sort(function(a,b){ return new Date(a.created_at) - new Date(b.created_at); });
      var last = msgs[msgs.length - 1];
      var waiting = last && last.sender === 'visitor' && t.status !== 'closed';
      var snippet = last ? (last.sender === 'admin' ? 'You: ' : '') + last.body : '';
      return '<li><button type="button" class="thread' + (t.id === activeThreadId ? ' is-active' : '') + '" data-thread="' + esc(t.id) + '">' +
        '<span class="thread__top"><span class="thread__name">' + esc(t.visitor_name) + '</span><span class="thread__time">' + fmtDateTime(t.updated_at) + '</span></span>' +
        '<span class="thread__snippet">' + esc(snippet) + '</span>' +
        '<span class="thread__flags">' + (waiting ? '<span class="thread__waiting">Waiting</span>' : '') + (t.status === 'closed' ? '<span class="status status--archived">closed</span>' : '') + '</span>' +
      '</button></li>';
    }).join('');
    $all('[data-thread]', list).forEach(function(btn){
      btn.addEventListener('click', function(){ selectThread(btn.getAttribute('data-thread')); });
    });
  }

  function selectThread(id){
    activeThreadId = id;
    var t = threadsCache.filter(function(x){ return x.id === id; })[0];
    if(!t) return;
    $('#chatDetailEmpty').hidden = true;
    $('#chatDetail').hidden = false;
    $('#chatVisitorName').textContent = t.visitor_name;
    $('#chatVisitorEmail').textContent = t.visitor_email || 'no email provided';
    renderThreadMessages(t);
    renderThreadList();
  }

  function renderThreadMessages(t){
    var box = $('#chatMessages');
    var msgs = (t.rc_chat_messages || []).slice().sort(function(a,b){ return new Date(a.created_at) - new Date(b.created_at); });
    box.innerHTML = msgs.map(function(m){
      return '<div class="cmsg cmsg--' + (m.sender === 'admin' ? 'admin' : 'visitor') + '"><p>' + esc(m.body) + '</p><time>' + fmtDateTime(m.created_at) + '</time></div>';
    }).join('') || '<p class="muted" style="text-align:center;padding:1rem">No messages yet.</p>';
    box.scrollTop = box.scrollHeight;

    var pill = $('#chatThreadStatus');
    pill.textContent = t.status;
    pill.className = 'pill ' + (t.status === 'closed' ? 'pill--closed' : 'pill--open');
    $('#chatToggleStatusBtn').textContent = t.status === 'closed' ? 'Reopen' : 'Close';
  }

  $('#chatRefreshBtn').addEventListener('click', function(){ loadThreads(); });

  $('#chatReplyForm').addEventListener('submit', function(e){
    e.preventDefault();
    var textarea = $('#chatReplyBody');
    var body = textarea.value.trim();
    if(!body || !activeThreadId) return;
    var btn = $('#chatReplySend');
    btn.disabled = true;
    restJson('/rest/v1/rc_chat_messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
      body: JSON.stringify({thread_id: activeThreadId, sender: 'admin', body: body})
    }).then(function(){
      return rest('/rest/v1/rc_chat_threads?id=eq.' + encodeURIComponent(activeThreadId), {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
        body: JSON.stringify({updated_at: new Date().toISOString()})
      });
    }).then(function(){
      textarea.value = '';
      loadThreads(true);
    }).catch(function(){ toast('Reply failed — try again'); })
      .finally(function(){ btn.disabled = false; });
  });

  $('#chatToggleStatusBtn').addEventListener('click', function(){
    if(!activeThreadId) return;
    var t = threadsCache.filter(function(x){ return x.id === activeThreadId; })[0];
    if(!t) return;
    var next = t.status === 'closed' ? 'open' : 'closed';
    rest('/rest/v1/rc_chat_threads?id=eq.' + encodeURIComponent(activeThreadId), {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
      body: JSON.stringify({status: next, updated_at: new Date().toISOString()})
    }).then(function(){ loadThreads(true); toast(next === 'closed' ? 'Conversation closed' : 'Conversation reopened'); })
      .catch(function(){ toast('Could not update status'); });
  });

  $('#chatDeleteBtn').addEventListener('click', function(){
    if(!activeThreadId) return;
    if(!window.confirm('Delete this conversation and all its messages? This cannot be undone.')) return;
    rest('/rest/v1/rc_chat_threads?id=eq.' + encodeURIComponent(activeThreadId), {method: 'DELETE', headers: {'Prefer': 'return=minimal'}})
      .then(function(res){
        if(!res.ok) throw new Error('delete-failed');
        activeThreadId = null;
        $('#chatDetail').hidden = true;
        $('#chatDetailEmpty').hidden = false;
        loadThreads();
        toast('Conversation deleted');
      })
      .catch(function(){ toast('Delete failed'); });
  });

  /* ============================================================
     TAB: SUBMISSIONS
     ============================================================ */
  var subsCache = [];
  var subsKind = 'all';
  var subsStatus = 'all';
  var activeSubmission = null;

  function loadSubmissions(){
    restJson('/rest/v1/rc_submissions?select=id,kind,reference,status,payload,created_at&order=created_at.desc&limit=500')
      .then(function(rows){ subsCache = rows || []; renderSubmissions(); refreshNewBadge(); })
      .catch(function(){ $('#subsTbody').innerHTML = '<tr><td colspan="7" class="table__empty">Could not load submissions.</td></tr>'; });
  }

  function refreshNewBadge(){
    var n = subsCache.filter(function(x){ return x.status === 'new'; }).length;
    updateBadges(n, undefined);
  }

  function visibleSubmissions(){
    return subsCache.filter(function(x){
      if(subsKind !== 'all' && x.kind !== subsKind) return false;
      if(subsStatus !== 'all' && x.status !== subsStatus) return false;
      return true;
    });
  }

  function renderSubmissions(){
    var tbody = $('#subsTbody');
    var rows = visibleSubmissions();
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="7" class="table__empty">No submissions match this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(x){
      var p = x.payload || {};
      var name = p.full_name || p.name || '—';
      var detail = x.kind === 'my-town'
        ? (p.town_or_zip || '—') + (p.phone ? ' · ' + p.phone : '')
        : (p.chosen_area || p.invoice_email || '—');
      var type = x.kind === 'my-town' ? 'My Town' : 'Guide-access';
      return '<tr>' +
        '<td>' + fmtDateTime(x.created_at) + '</td>' +
        '<td>' + esc(type) + '</td>' +
        '<td><b>' + esc(name) + '</b></td>' +
        '<td>' + esc(detail) + '</td>' +
        '<td><span class="mono" style="font-family:var(--mono);font-size:.72rem">' + esc(x.reference) + '</span></td>' +
        '<td><span class="status status--' + esc(x.status) + '">' + esc(x.status) + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" data-view="' + esc(x.id) + '" title="View" aria-label="View submission"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg></button>' +
          '<button class="icon-btn" data-mail="' + esc(x.id) + '" title="Reply by email" aria-label="Reply by email"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
          '<button class="icon-btn icon-btn--danger" data-del="' + esc(x.id) + '" title="Delete" aria-label="Delete submission"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    $all('[data-view]', tbody).forEach(function(b){ b.addEventListener('click', function(){ openSubmission(b.getAttribute('data-view')); }); });
    $all('[data-mail]', tbody).forEach(function(b){ b.addEventListener('click', function(){ replyToSubmission(b.getAttribute('data-mail')); }); });
    $all('[data-del]', tbody).forEach(function(b){ b.addEventListener('click', function(){ deleteSubmission(b.getAttribute('data-del')); }); });
  }

  function segInit(id, key){
    var seg = $(id);
    $all('.seg__btn', seg).forEach(function(btn){
      btn.addEventListener('click', function(){
        $all('.seg__btn', seg).forEach(function(b){ b.classList.toggle('is-active', b === btn); });
        if(key === 'kind') subsKind = btn.dataset.kind; else subsStatus = btn.dataset.status;
        renderSubmissions();
      });
    });
  }
  segInit('#subsKindSeg', 'kind');
  segInit('#subsStatusSeg', 'status');
  $('#subsRefreshBtn').addEventListener('click', loadSubmissions);

  function openSubmission(id){
    var x = subsCache.filter(function(s){ return s.id === id; })[0];
    if(!x) return;
    activeSubmission = x;
    var p = x.payload || {};
    var type = x.kind === 'my-town' ? 'My Town request' : 'Guide-access application';
    $('#drawerTitle').textContent = type;
    var meta = [];
    meta.push(['Reference', x.reference]);
    meta.push(['Received', fmtDate(x.created_at) + ' · ' + fmtDateTime(x.created_at)]);
    meta.push(['Status', x.status]);
    Object.keys(p).forEach(function(k){
      var v = p[k];
      if(v === null || v === undefined || v === '') return;
      if(typeof v === 'boolean') v = v ? 'Yes' : 'No';
      meta.push([k.replace(/_/g, ' '), String(v)]);
    });
    $('#drawerMeta').innerHTML = meta.map(function(pair){
      return '<dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1]) + '</dd>';
    }).join('');
    $('#drawerHandleBtn').textContent = x.status === 'handled' ? 'Mark as new' : 'Mark handled';
    $('#subsDrawer').hidden = false;
    $('#subsDrawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer(){
    $('#subsDrawer').hidden = true;
    $('#subsDrawer').setAttribute('aria-hidden', 'true');
    activeSubmission = null;
  }
  function replyToSubmission(id){
    var x = subsCache.filter(function(s){ return s.id === id; })[0];
    if(!x) return;
    var p = x.payload || {};
    var name = p.full_name || p.name || '';
    var email = p.email || p.invoice_email || '';
    closeDrawer();
    switchTab('email');
    $('#emToName').value = name;
    $('#emToEmail').value = email;
    $('#emSubject').value = 'The Reconstruction Company — your ' + (x.kind === 'my-town' ? 'My Town request' : 'guide-access inquiry');
    $('#emBody').value = 'Dear ' + (name.split(' ')[0] || 'there') + ',\n\n';
    updateEmailPreview();
    $('#emToEmail').focus();
  }
  function patchSubmission(id, patch){
    return rest('/rest/v1/rc_submissions?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
      body: JSON.stringify(patch)
    }).then(function(res){ if(!res.ok) throw new Error('patch-failed'); });
  }
  function deleteSubmission(id){
    if(!window.confirm('Delete this submission permanently?')) return;
    rest('/rest/v1/rc_submissions?id=eq.' + encodeURIComponent(id), {method: 'DELETE', headers: {'Prefer': 'return=minimal'}})
      .then(function(res){
        if(!res.ok) throw new Error('delete-failed');
        closeDrawer(); loadSubmissions(); toast('Submission deleted');
      })
      .catch(function(){ toast('Delete failed'); });
  }
  $('#drawerCloseBtn').addEventListener('click', closeDrawer);
  $('#drawerScrim').addEventListener('click', closeDrawer);
  $('#drawerMailBtn').addEventListener('click', function(){ if(activeSubmission) replyToSubmission(activeSubmission.id); });
  $('#drawerHandleBtn').addEventListener('click', function(){
    if(!activeSubmission) return;
    var next = activeSubmission.status === 'handled' ? 'new' : 'handled';
    patchSubmission(activeSubmission.id, {status: next}).then(function(){
      closeDrawer(); loadSubmissions(); toast(next === 'handled' ? 'Marked handled' : 'Marked as new');
    }).catch(function(){ toast('Update failed'); });
  });
  $('#drawerArchiveBtn').addEventListener('click', function(){
    if(!activeSubmission) return;
    patchSubmission(activeSubmission.id, {status: 'archived'}).then(function(){
      closeDrawer(); loadSubmissions(); toast('Archived');
    }).catch(function(){ toast('Update failed'); });
  });
  $('#drawerDeleteBtn').addEventListener('click', function(){ if(activeSubmission) deleteSubmission(activeSubmission.id); });

  $('#subsExportBtn').addEventListener('click', function(){
    var rows = visibleSubmissions();
    var header = ['reference','kind','status','created_at','payload_json'];
    var lines = [header.join(',')];
    rows.forEach(function(x){
      var cells = [x.reference, x.kind, x.status, x.created_at, JSON.stringify(x.payload || {})];
      lines.push(cells.map(function(c){ return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','));
    });
    var blob = new Blob([lines.join('\r\n')], {type: 'text/csv;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reconstruction-submissions.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast(rows.length + ' submissions exported');
  });

  /* ============================================================
     TAB: INVOICES
     ============================================================ */
  var invoicesCache = [];
  var editingInvoiceId = null;

  function invNumberSuggest(){
    var d = new Date();
    var ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'RC-' + ymd + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function itemRow(desc, qty, rate){
    var row = document.createElement('div');
    row.className = 'inv-item';
    row.innerHTML =
      '<input type="text" class="inv-item__desc" placeholder="Guide-access — research pack" maxlength="240" aria-label="Description" value="' + esc(desc == null ? '' : desc) + '">' +
      '<input type="number" class="inv-item__qty" min="0" step="0.01" aria-label="Quantity" value="' + esc(qty == null ? 1 : qty) + '">' +
      '<input type="number" class="inv-item__rate" min="0" step="0.01" aria-label="Rate" value="' + esc(rate == null ? 1000 : rate) + '">' +
      '<span class="line-amount">$0.00</span>' +
      '<button type="button" class="inv-item__remove" aria-label="Remove line">&times;</button>';
    row.querySelector('.inv-item__remove').addEventListener('click', function(){ row.remove(); refreshInvoicePreview(); });
    row.querySelectorAll('input').forEach(function(inp){ inp.addEventListener('input', refreshInvoicePreview); });
    return row;
  }

  function readInvoiceForm(){
    var items = [];
    $all('.inv-item', $('#invItems')).forEach(function(row){
      var desc = row.querySelector('.inv-item__desc').value.trim();
      var qty = parseFloat(row.querySelector('.inv-item__qty').value);
      var rate = parseFloat(row.querySelector('.inv-item__rate').value);
      if(!desc && !qty && !rate) return;
      items.push({description: desc || 'Line item', qty: isNaN(qty) ? 0 : qty, rate: isNaN(rate) ? 0 : rate});
    });
    return {
      id: $('#invId').value || null,
      number: $('#invNumber').value.trim(),
      status: $('#invStatus').value,
      client_name: $('#invClientName').value.trim(),
      client_email: $('#invClientEmail').value.trim() || null,
      client_address: $('#invClientAddress').value.trim() || null,
      issue_date: $('#invIssueDate').value || isoToday(),
      due_date: $('#invDueDate').value || null,
      items: items,
      tax_rate: parseFloat($('#invTaxRate').value) || 0,
      discount: parseFloat($('#invDiscount').value) || 0,
      notes: $('#invNotes').value.trim() || null
    };
  }

  function buildInvoiceHtml(inv){
    var t = invoiceTotals(inv);
    var rows = (inv.items || []).map(function(it){
      var amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
      return '<tr><td>' + esc(it.description) + '</td><td class="r">' + esc(it.qty) + '</td><td class="r">' + money(it.rate) + '</td><td class="r">' + money(amount) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" style="color:#888">No line items yet</td></tr>';
    return '<div class="inv-doc">' +
      '<div class="inv-doc__head"><div><div class="inv-doc__sigil">RC</div><div class="inv-doc__company">The Reconstruction Company</div><div class="inv-doc__tag">Public Benefit · Real Assets</div></div>' +
        '<div class="inv-doc__title"><h1>Invoice</h1><div class="num">' + esc(inv.number || '—') + '</div></div></div>' +
      '<div class="inv-doc__meta"><div><b>Bill to</b>' + esc(inv.client_name || '—') + (inv.client_email ? '<br>' + esc(inv.client_email) : '') + (inv.client_address ? '<br>' + esc(inv.client_address) : '') + '</div>' +
        '<div><b>Issued</b>' + esc(inv.issue_date || '—') + '</div>' +
        '<div><b>Due</b>' + esc(inv.due_date || 'Due on receipt') + '</div>' +
        '<div><b>Terms</b>Guide access · one-time</div></div>' +
      '<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<table class="inv-doc__totals"><tbody>' +
        '<tr><td>Subtotal</td><td class="r">' + money(t.subtotal) + '</td></tr>' +
        (t.tax ? '<tr><td>Tax (' + esc(inv.tax_rate) + '%)</td><td class="r">' + money(t.tax) + '</td></tr>' : '') +
        (t.discount ? '<tr><td>Discount</td><td class="r">−' + money(t.discount) + '</td></tr>' : '') +
        '<tr class="grand"><td>Total due</td><td class="r">' + money(t.total) + '</td></tr>' +
      '</tbody></table>' +
      (inv.notes ? '<div class="inv-doc__notes">' + esc(inv.notes) + '</div>' : '') +
      '<div class="inv-doc__foot"><span><b>The Reconstruction Company</b><br>' + esc(CONTACT) + '</span>' +
        '<span style="text-align:right">A service invoice — never an investment or offering.<br>Reference <b>' + esc(inv.number || '—') + '</b> with any payment.</span></div>' +
    '</div>';
  }

  function refreshInvoicePreview(){
    var inv = readInvoiceForm();
    $all('.inv-item', $('#invItems')).forEach(function(row){
      var qty = parseFloat(row.querySelector('.inv-item__qty').value) || 0;
      var rate = parseFloat(row.querySelector('.inv-item__rate').value) || 0;
      row.querySelector('.line-amount').textContent = money(qty * rate);
    });
    $('#invoicePreview').innerHTML = buildInvoiceHtml(inv);
  }

  function resetInvoiceForm(keepNumber){
    editingInvoiceId = null;
    $('#invId').value = '';
    $('#invNumber').value = keepNumber || invNumberSuggest();
    $('#invStatus').value = 'draft';
    $('#invClientName').value = '';
    $('#invClientEmail').value = '';
    $('#invClientAddress').value = '';
    $('#invIssueDate').value = isoToday();
    $('#invDueDate').value = addDaysISO(isoToday(), 14);
    $('#invTaxRate').value = '0';
    $('#invDiscount').value = '0';
    $('#invNotes').value = 'One-time US$1,000 guide-access invoice. A service, never an offering. Due on receipt — please reference the invoice number with payment.';
    var box = $('#invItems');
    box.innerHTML = '';
    box.appendChild(itemRow('Guide access — research & materials', 1, 1000));
    refreshInvoicePreview();
  }

  function loadInvoiceIntoForm(inv){
    editingInvoiceId = inv.id;
    $('#invId').value = inv.id;
    $('#invNumber').value = inv.number || '';
    $('#invStatus').value = inv.status || 'draft';
    $('#invClientName').value = inv.client_name || '';
    $('#invClientEmail').value = inv.client_email || '';
    $('#invClientAddress').value = inv.client_address || '';
    $('#invIssueDate').value = (inv.issue_date || isoToday()).slice(0, 10);
    $('#invDueDate').value = inv.due_date ? String(inv.due_date).slice(0, 10) : '';
    $('#invTaxRate').value = inv.tax_rate == null ? '0' : inv.tax_rate;
    $('#invDiscount').value = inv.discount == null ? '0' : inv.discount;
    $('#invNotes').value = inv.notes || '';
    var box = $('#invItems');
    box.innerHTML = '';
    var items = Array.isArray(inv.items) && inv.items.length ? inv.items : [{description: 'Guide access — research & materials', qty: 1, rate: 1000}];
    items.forEach(function(it){ box.appendChild(itemRow(it.description, it.qty, it.rate)); });
    refreshInvoicePreview();
    window.scrollTo(0, 0);
  }

  function loadInvoices(){
    restJson('/rest/v1/rc_invoices?select=*&order=created_at.desc&limit=200')
      .then(function(rows){
        invoicesCache = rows || [];
        renderInvoiceList();
        if(!$('#invNumber').value) resetInvoiceForm(null);
      })
      .catch(function(){
        $('#invTbody').innerHTML = '<tr><td colspan="6" class="table__empty">Could not load invoices.</td></tr>';
        if(!$('#invNumber').value) resetInvoiceForm(null);
      });
  }

  function renderInvoiceList(){
    $('#invListCount').textContent = invoicesCache.length + ' total';
    var tbody = $('#invTbody');
    if(!invoicesCache.length){
      tbody.innerHTML = '<tr><td colspan="6" class="table__empty">No invoices yet — the form above creates your first.</td></tr>';
      return;
    }
    tbody.innerHTML = invoicesCache.map(function(inv){
      var t = invoiceTotals(inv);
      return '<tr data-inv-row="' + esc(inv.id) + '">' +
        '<td><span style="font-family:var(--mono);font-size:.74rem">' + esc(inv.number) + '</span></td>' +
        '<td>' + esc(inv.client_name) + (inv.client_email ? '<br><span class="muted" style="font-size:.72rem">' + esc(inv.client_email) + '</span>' : '') + '</td>' +
        '<td>' + fmtDate(inv.issue_date) + '</td>' +
        '<td>' + money(t.total) + '</td>' +
        '<td><span class="status status--' + esc(inv.status) + '">' + esc(inv.status) + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" data-edit="' + esc(inv.id) + '" title="Edit" aria-label="Edit invoice"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
          '<button class="icon-btn" data-print="' + esc(inv.id) + '" title="Print / PDF" aria-label="Print invoice"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M7 8V3h10v5M7 17H4v-6a3 3 0 013-3h10a3 3 0 013 3v6h-3M7 14h10v7H7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>' +
          '<button class="icon-btn" data-mail="' + esc(inv.id) + '" title="Email to client" aria-label="Email invoice to client"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
          '<button class="icon-btn" data-paid="' + esc(inv.id) + '" title="Mark paid" aria-label="Mark paid"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
          '<button class="icon-btn icon-btn--danger" data-del="' + esc(inv.id) + '" title="Delete" aria-label="Delete invoice"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    $all('[data-edit]', tbody).forEach(function(b){ b.addEventListener('click', function(){ var inv = invoicesCache.filter(function(i){ return i.id === b.getAttribute('data-edit'); })[0]; if(inv) loadInvoiceIntoForm(inv); }); });
    $all('[data-print]', tbody).forEach(function(b){ b.addEventListener('click', function(){ var inv = invoicesCache.filter(function(i){ return i.id === b.getAttribute('data-print'); })[0]; if(inv) printInvoice(inv); }); });
    $all('[data-mail]', tbody).forEach(function(b){ b.addEventListener('click', function(){ var inv = invoicesCache.filter(function(i){ return i.id === b.getAttribute('data-mail'); })[0]; if(inv) emailInvoice(inv); }); });
    $all('[data-paid]', tbody).forEach(function(b){ b.addEventListener('click', function(){ patchInvoice(b.getAttribute('data-paid'), {status: 'paid', updated_at: new Date().toISOString()}); }); });
    $all('[data-del]', tbody).forEach(function(b){ b.addEventListener('click', function(){
      if(!window.confirm('Delete this invoice permanently?')) return;
      var id = b.getAttribute('data-del');
      rest('/rest/v1/rc_invoices?id=eq.' + encodeURIComponent(id), {method: 'DELETE', headers: {'Prefer': 'return=minimal'}})
        .then(function(res){ if(!res.ok) throw new Error('delete-failed'); loadInvoices(); toast('Invoice deleted'); })
        .catch(function(){ toast('Delete failed'); });
    }); });
  }

  function patchInvoice(id, patch){
    rest('/rest/v1/rc_invoices?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
      body: JSON.stringify(patch)
    }).then(function(res){ if(!res.ok) throw new Error('patch-failed'); loadInvoices(); })
      .catch(function(){ toast('Update failed'); });
  }

  function printInvoice(inv){
    var t = invoiceTotals(inv);
    $('#invoice-print').innerHTML = buildInvoiceHtml(inv);
    window.print();
  }

  function emailInvoice(inv){
    var t = invoiceTotals(inv);
    switchTab('email');
    $('#emToName').value = inv.client_name || '';
    $('#emToEmail').value = inv.client_email || '';
    $('#emSubject').value = 'The Reconstruction Company — invoice ' + inv.number;
    $('#emTemplate').value = 'invoice';
    $('#emBody').value =
      'Dear ' + ((inv.client_name || '').split(' ')[0] || 'there') + ',\n\n' +
      'Your guide-access invoice ' + inv.number + ' is ready.\n\n' +
      'Amount due: ' + money(t.total) + '\n' +
      'Issued: ' + (inv.issue_date || isoToday()) + '\n' +
      'Due: ' + (inv.due_date || 'Due on receipt') + '\n\n' +
      'This is a service invoice — never an investment or an offering. Please reference ' + inv.number + ' with any payment.\n\n' +
      '— The Reconstruction Company\n' + CONTACT;
    updateEmailPreview();
    $('#emToEmail').focus();
  }

  $('#invAddItemBtn').addEventListener('click', function(){
    $('#invItems').appendChild(itemRow('', 1, 0));
    refreshInvoicePreview();
  });
  $('#invNewBtn').addEventListener('click', function(){ resetInvoiceForm(null); toast('New invoice ready'); });
  $('#invPrintBtn').addEventListener('click', function(){ printInvoice(readInvoiceForm()); });
  $('#invEmailBtn').addEventListener('click', function(){ emailInvoice(readInvoiceForm()); });
  ['#invNumber','#invStatus','#invClientName','#invClientEmail','#invClientAddress','#invIssueDate','#invDueDate','#invTaxRate','#invDiscount'].forEach(function(id){
    $(id).addEventListener('input', refreshInvoicePreview);
    $(id).addEventListener('change', refreshInvoicePreview);
  });
  $('#invNotes').addEventListener('input', refreshInvoicePreview);

  $('#invoiceForm').addEventListener('submit', function(e){
    e.preventDefault();
    var err = $('#invError');
    err.hidden = true;
    var inv = readInvoiceForm();
    if(!inv.number || !inv.client_name){
      err.textContent = 'Invoice number and client name are required.';
      err.hidden = false; return;
    }
    if(!inv.items.length){
      err.textContent = 'Add at least one line item.';
      err.hidden = false; return;
    }
    var btn = $('#invSaveBtn');
    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = 'Saving…';

    var isUpdate = Boolean(inv.id);
    var path = isUpdate
      ? '/rest/v1/rc_invoices?id=eq.' + encodeURIComponent(inv.id)
      : '/rest/v1/rc_invoices';
    var payload = Object.assign({}, inv, {updated_at: new Date().toISOString()});
    delete payload.id;

    rest(path, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
      body: JSON.stringify(payload)
    }).then(function(res){
      if(!res.ok) return res.text().then(function(t){ throw new Error(t); });
      toast(isUpdate ? 'Invoice updated' : 'Invoice saved');
      editingInvoiceId = null;
      $('#invId').value = '';
      loadInvoices();
    }).catch(function(ex){
      err.textContent = /duplicate|unique/i.test(String(ex.message))
        ? 'That invoice number already exists — pick another.'
        : 'Could not save the invoice. Try again.';
      err.hidden = false;
    }).finally(function(){
      btn.disabled = false;
      btn.textContent = original;
    });
  });

  /* ============================================================
     TAB: EMAIL REPLY (branded)
     ============================================================ */
  var EMAIL_TEMPLATES = {
    blank: {subject: 'The Reconstruction Company', body: ''},
    received: {
      subject: 'The Reconstruction Company — we received your request',
      body: 'Dear {name},\n\nThank you for reaching out to The Reconstruction Company. We have received your request and it is in review.\n\nA member of the team will come back to you within a few business days with next steps — or with a question if we need more detail.\n\n— The Reconstruction Company\n' + CONTACT
    },
    invoice: {
      subject: 'The Reconstruction Company — your guide-access invoice',
      body: 'Dear {name},\n\nThank you for your application. Your guide-access invoice is on its way / ready as discussed.\n\nA one-time US$1,000 guide-access fee is a service for research and materials — never an investment and never an offering.\n\nPlease reference your invoice number with payment. If you need anything adjusted, reply to this email.\n\n— The Reconstruction Company\n' + CONTACT
    },
    thanks: {
      subject: 'The Reconstruction Company — thank you',
      body: 'Dear {name},\n\nThank you. Your payment / application has been received and recorded.\n\nKeep this email as your receipt reference. If anything looks wrong, reply and we will fix it.\n\n— The Reconstruction Company\n' + CONTACT
    },
    schedule: {
      subject: 'The Reconstruction Company — let’s talk',
      body: 'Dear {name},\n\nThank you for your interest in The Reconstruction Company.\n\nWe would like to schedule a brief conversation. Tell us two or three times that suit you in the next two weeks and we will confirm by return email.\n\n— The Reconstruction Company\n' + CONTACT
    },
    'town-ready': {
      subject: 'The Reconstruction Company — your town page',
      body: 'Dear {name},\n\nYour town page is ready and live on our site under Territories.\n\nIf anything looks wrong — census tract, program notes, contact details — reply to this email and we will correct it.\n\n— The Reconstruction Company\n' + CONTACT
    }
  };

  function firstName(){
    var n = ($('#emToName').value || '').trim();
    return n ? n.split(/\s+/)[0] : 'there';
  }

  function buildEmailHtml(opts){
    var paragraphs = String(opts.body || '').split(/\n{2,}/).map(function(block){
      return '<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#262626">' +
        esc(block).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="x-apple-disable-message-reformatting"></head>' +
    '<body style="margin:0;padding:0;background:#efece1">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece1;padding:24px 12px"><tr><td align="center">' +
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf6;border:1px solid #e2ded0;border-radius:12px;overflow:hidden">' +
          '<tr><td style="background:#141414;padding:20px 28px">' +
            '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
              '<td style="width:52px;height:52px;background:#f5f2ea;border-radius:9px;text-align:center;vertical-align:middle;border-bottom:3px solid #b98d2e">' +
                '<span style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#141414;letter-spacing:1px">RC</span>' +
              '</td>' +
              '<td style="padding-left:14px">' +
                '<div style="font-family:Georgia,serif;font-size:17px;letter-spacing:3px;text-transform:uppercase;color:#f5f2ea">The Reconstruction Company</div>' +
                '<div style="font-family:Georgia,serif;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:#b98d2e;margin-top:3px">Public Benefit · Real Assets</div>' +
              '</td>' +
            '</tr></table>' +
          '</td></tr>' +
          '<tr><td style="padding:28px">' +
            '<div style="font-family:Georgia,serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a6d1f;border-bottom:1px solid #e2ded0;padding-bottom:10px;margin-bottom:16px">' + esc(opts.subject || '') + '</div>' +
            paragraphs +
          '</td></tr>' +
          '<tr><td style="padding:18px 28px;background:#141414">' +
            '<div style="font-family:Georgia,serif;font-size:12px;color:#f5f2ea;letter-spacing:.5px">The Reconstruction Company</div>' +
            '<div style="font-family:Georgia,serif;font-size:11px;color:#b98d2e;margin-top:4px">' + esc(CONTACT) + '</div>' +
            '<div style="font-family:Georgia,serif;font-size:10px;color:#8d8a80;margin-top:8px;line-height:1.5">You are receiving this because you contacted The Reconstruction Company. Not investment advice. Nothing here is an offer to sell securities.</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr></table>' +
    '</body></html>';
  }

  function updateEmailPreview(){
    var html = buildEmailHtml({subject: $('#emSubject').value.trim(), body: ($('#emBody').value || '').replace(/\{name\}/g, firstName())});
    var frame = $('#emailPreview');
    frame.innerHTML = '<iframe title="Email preview" sandbox="" style="width:100%;height:560px;border:0;background:#efece1" srcdoc="' + esc(html) + '"></iframe>';
  }

  function maybeLogEmail(){
    if(!$('#emLog').checked) return;
    restJson('/rest/v1/rc_email_log', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
      body: JSON.stringify({
        to_name: $('#emToName').value.trim() || null,
        to_email: $('#emToEmail').value.trim(),
        subject: $('#emSubject').value.trim(),
        body_text: $('#emBody').value,
        template: $('#emTemplate').value
      })
    }).then(loadEmailLog).catch(function(){ toast('Sent, but the log could not be saved'); });
  }

  function loadEmailLog(){
    restJson('/rest/v1/rc_email_log?select=id,to_name,to_email,subject,template,created_at&order=created_at.desc&limit=50')
      .then(function(rows){
        var tbody = $('#emLogTbody');
        rows = rows || [];
        if(!rows.length){
          tbody.innerHTML = '<tr><td colspan="5" class="table__empty">No emails logged yet — everything you send from here appears below.</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(function(r){
          return '<tr><td>' + fmtDateTime(r.created_at) + '</td>' +
            '<td>' + esc(r.to_name || '') + (r.to_name ? '<br>' : '') + '<span class="muted" style="font-size:.72rem">' + esc(r.to_email) + '</span></td>' +
            '<td>' + esc(r.subject) + '</td>' +
            '<td>' + esc(r.template || 'blank') + '</td>' +
            '<td><div class="row-actions">' +
              '<button class="icon-btn" data-em-view="' + esc(r.id) + '" title="Load into composer" aria-label="Load into composer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
              '<button class="icon-btn icon-btn--danger" data-em-del="' + esc(r.id) + '" title="Delete log entry" aria-label="Delete log entry"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>' +
            '</div></td></tr>';
        }).join('');
        $all('[data-em-view]', tbody).forEach(function(b){ b.addEventListener('click', function(){
          restJson('/rest/v1/rc_email_log?id=eq.' + encodeURIComponent(b.getAttribute('data-em-view')) + '&select=*')
            .then(function(rows){
              var r = rows && rows[0]; if(!r) return;
              $('#emToName').value = r.to_name || '';
              $('#emToEmail').value = r.to_email || '';
              $('#emSubject').value = r.subject || '';
              $('#emBody').value = r.body_text || '';
              $('#emTemplate').value = r.template || 'blank';
              updateEmailPreview();
              toast('Loaded into composer');
            });
        }); });
        $all('[data-em-del]', tbody).forEach(function(b){ b.addEventListener('click', function(){
          if(!window.confirm('Delete this log entry?')) return;
          rest('/rest/v1/rc_email_log?id=eq.' + encodeURIComponent(b.getAttribute('data-em-del')), {method: 'DELETE', headers: {'Prefer': 'return=minimal'}})
            .then(function(res){ if(!res.ok) throw new Error('del'); loadEmailLog(); toast('Entry deleted'); })
            .catch(function(){ toast('Delete failed'); });
        }); });
      })
      .catch(function(){ $('#emLogTbody').innerHTML = '<tr><td colspan="5" class="table__empty">Could not load the sent log.</td></tr>'; });
  }

  $('#emTemplate').addEventListener('change', function(){
    var tpl = EMAIL_TEMPLATES[$('#emTemplate').value] || EMAIL_TEMPLATES.blank;
    if($('#emSubject').value.trim() === '' || Object.keys(EMAIL_TEMPLATES).some(function(k){ return $('#emSubject').value === EMAIL_TEMPLATES[k].subject; })){
      $('#emSubject').value = tpl.subject;
    }
    var body = tpl.body.replace(/\{name\}/g, firstName());
    if(tpl.body || $('#emBody').value.trim() === '') $('#emBody').value = body;
    updateEmailPreview();
  });
  ['#emToName','#emToEmail','#emSubject','#emBody'].forEach(function(id){
    $(id).addEventListener('input', updateEmailPreview);
  });

  function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  $('#emMailtoBtn').addEventListener('click', function(){
    var to = $('#emToEmail').value.trim(), subject = $('#emSubject').value.trim();
    if(!validEmail(to)){ toast('Enter a valid recipient email'); $('#emToEmail').focus(); return; }
    if(!subject){ toast('Add a subject'); $('#emSubject').focus(); return; }
    var body = ($('#emBody').value || '').replace(/\{name\}/g, firstName());
    window.location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    maybeLogEmail();
    toast('Opening your mail app…');
  });

  /* one-click send via the send-email Edge Function (needs RESEND_API_KEY secret) */
  $('#emSendBtn').addEventListener('click', function(){
    var to = $('#emToEmail').value.trim(), subject = $('#emSubject').value.trim();
    if(!validEmail(to)){ toast('Enter a valid recipient email'); $('#emToEmail').focus(); return; }
    if(!subject){ toast('Add a subject'); $('#emSubject').focus(); return; }
    var bodyText = ($('#emBody').value || '').replace(/\{name\}/g, firstName());
    var html = buildEmailHtml({subject: subject, body: bodyText});
    var btn = $('#emSendBtn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    function fallbackToMailApp(reason){
      window.location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyText);
      maybeLogEmail();
      toast(reason + ' — opened your mail app instead');
    }
    rest('/functions/v1/send-email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({to: to, to_name: $('#emToName').value.trim() || null, subject: subject, html: html, text: bodyText, reply_to: CONTACT})
    }).then(function(res){
      if(res.ok){
        toast('Email sent — logged below');
        maybeLogEmail();
        return null;
      }
      return res.json().catch(function(){ return {}; }).then(function(out){
        if(res.status === 501){
          fallbackToMailApp('No mail provider connected yet');
        } else {
          fallbackToMailApp('Send failed (' + res.status + (out && out.error ? ': ' + out.error : '') + ')');
        }
      });
    }).catch(function(){
      fallbackToMailApp('Network error');
    }).finally(function(){
      btn.disabled = false;
      btn.textContent = 'Send now';
    });
  });

  function copyText(text, okMsg){
    function done(){ toast(okMsg); }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(function(){ fallback(); });
    } else fallback();
    function fallback(){
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch(e){ toast('Copy failed — select the preview and copy manually'); }
      ta.remove();
    }
  }

  $('#emCopyHtmlBtn').addEventListener('click', function(){
    var to = $('#emToEmail').value.trim(), subject = $('#emSubject').value.trim();
    if(!validEmail(to)){ toast('Enter a valid recipient email'); return; }
    if(!subject){ toast('Add a subject'); return; }
    copyText(buildEmailHtml({subject: subject, body: ($('#emBody').value || '').replace(/\{name\}/g, firstName())}), 'Branded HTML copied — paste into Gmail/Outlook compose');
    maybeLogEmail();
  });
  $('#emCopyTextBtn').addEventListener('click', function(){
    if(!$('#emSubject').value.trim()){ toast('Add a subject'); return; }
    copyText($('#emBody').value.replace(/\{name\}/g, firstName()), 'Plain text copied');
    maybeLogEmail();
  });
  $('#emLogRefreshBtn').addEventListener('click', loadEmailLog);

  /* ============================================================
     TAB: SETTINGS
     ============================================================ */
  function loadSettings(){
    var s = loadSession();
    $('#setAccountEmail').textContent = s && s.email ? s.email : '—';
    $('#accountEmail').textContent = s && s.email ? s.email : '—';
    restJson('/rest/v1/rc_settings?key=eq.announcement&select=value')
      .then(function(rows){
        var v = rows && rows[0] && rows[0].value;
        $('#setAnnounceEnabled').checked = Boolean(v && v.enabled);
        $('#setAnnounceText').value = v && v.text ? v.text : '';
      })
      .catch(function(){ /* defaults already shown */ });
  }

  $('#setAnnounceSaveBtn').addEventListener('click', function(){
    var btn = $('#setAnnounceSaveBtn');
    btn.disabled = true;
    var value = {enabled: $('#setAnnounceEnabled').checked, text: $('#setAnnounceText').value.trim()};
    rest('/rest/v1/rc_settings?on_conflict=key', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify({key: 'announcement', value: value, updated_at: new Date().toISOString()})
    }).then(function(res){
      if(!res.ok) throw new Error('save-failed');
      toast(value.enabled ? 'Announcement is live on the public site' : 'Announcement hidden');
    }).catch(function(){ toast('Could not save announcement'); })
      .finally(function(){ btn.disabled = false; });
  });

  $('#setPasswordSaveBtn').addEventListener('click', function(){
    var p1 = $('#setNewPassword').value, p2 = $('#setConfirmPassword').value;
    if(p1.length < 8){ toast('Password must be at least 8 characters'); return; }
    if(p1 !== p2){ toast('Passwords do not match'); return; }
    var btn = $('#setPasswordSaveBtn');
    btn.disabled = true;
    rest('/auth/v1/user', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: p1})
    }).then(function(res){
      if(!res.ok) throw new Error('password-failed');
      $('#setNewPassword').value = ''; $('#setConfirmPassword').value = '';
      toast('Password updated');
    }).catch(function(){ toast('Could not update password'); })
      .finally(function(){ btn.disabled = false; });
  });

  $('#setExportBtn').addEventListener('click', function(){
    var tables = ['rc_submissions','rc_chat_threads','rc_chat_messages','rc_invoices','rc_email_log','rc_settings'];
    Promise.all(tables.map(function(t){
      return restJson('/rest/v1/' + t + '?select=*&limit=1000').catch(function(){ return {error: 'unavailable'}; });
    })).then(function(results){
      var out = {};
      tables.forEach(function(t, i){ out[t] = results[i]; });
      out.exported_at = new Date().toISOString();
      var blob = new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reconstruction-backup.json';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Backup downloaded');
    });
  });

  function deleteAllRows(table, btnId, confirmText, doneMsg){
    var btn = $(btnId);
    if(!window.confirm(confirmText)) return;
    btn.disabled = true;
    rest('/rest/v1/' + table + '?created_at=gte.1970-01-01T00:00:00Z', {method: 'DELETE', headers: {'Prefer': 'return=minimal'}})
      .then(function(res){
        if(!res.ok) throw new Error('clear-failed');
        toast(doneMsg);
        loadDashboard();
      })
      .catch(function(){ toast('Could not clear — try again'); })
      .finally(function(){ btn.disabled = false; });
  }
  $('#setClearSubsBtn').addEventListener('click', function(){ deleteAllRows('rc_submissions', '#setClearSubsBtn', 'Delete ALL submissions permanently? Export a CSV first if unsure.', 'All submissions deleted'); });
  $('#setClearEmailLogBtn').addEventListener('click', function(){ deleteAllRows('rc_email_log', '#setClearEmailLogBtn', 'Clear the ENTIRE sent-email log? This cannot be undone.', 'Email log cleared'); });

  /* ============================================================
     BOOT
     ============================================================ */
  function boot(){
    var s = loadSession();
    if(sessionValid(s)){
      $('#accountEmail').textContent = s.email || '—';
      showView(true);
      switchTab('dashboard');
      return;
    }
    tryRefresh().then(function(ns){
      if(ns){
        $('#accountEmail').textContent = ns.email || '—';
        showView(true);
        switchTab('dashboard');
      } else {
        clearSession();
        showView(false);
      }
    });
  }

  updateEmailPreview();
  boot();
})();
