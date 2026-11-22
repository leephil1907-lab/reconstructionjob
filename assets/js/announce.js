/* ============================================================
   THE RECONSTRUCTION COMPANY — Announcement bar
   Reads rc_settings.announcement via the anon REST endpoint.
   Renders above the masthead when enabled. Silent fail otherwise.
   ============================================================ */
(function(){
  'use strict';
  var CFG = window.RC_CONFIG || {};
  if(!CFG.supabaseUrl || !CFG.publishableKey) return;
  try { if(sessionStorage.getItem('rc_announce_dismissed') === '1') return; } catch(e){}

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? setTimeout(function(){ controller.abort(); }, 3500) : null;

  fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rc_settings?key=eq.announcement&select=value', {
    headers: {
      'apikey': CFG.publishableKey,
      'Authorization': 'Bearer ' + CFG.publishableKey
    },
    signal: controller ? controller.signal : undefined
  }).then(function(res){
    if(timer) clearTimeout(timer);
    if(!res.ok) return null;
    return res.json();
  }).then(function(rows){
    var v = rows && rows[0] && rows[0].value;
    if(!v || !v.enabled || !String(v.text || '').trim()) return;
    var bar = document.createElement('div');
    bar.className = 'rc-announce';
    bar.setAttribute('role', 'status');
    var text = document.createElement('span');
    text.textContent = String(v.text).trim();
    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'rc-announce__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss announcement');
    dismiss.innerHTML = '&times;';
    dismiss.addEventListener('click', function(){
      bar.remove();
      try { sessionStorage.setItem('rc_announce_dismissed', '1'); } catch(e){}
    });
    bar.appendChild(text);
    bar.appendChild(dismiss);
    var anchor = document.querySelector('.ticker');
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
    else document.body.insertBefore(bar, document.body.firstChild);
  }).catch(function(){ if(timer) clearTimeout(timer); });
})();
