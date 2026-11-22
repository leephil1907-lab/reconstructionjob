/* ============================================================
   THE RECONSTRUCTION COMPANY — Forms
   Validates, then submits to Supabase REST when RC_CONFIG is set.
   Otherwise stores an outbox record locally and shows the same
   success receipt. Never loses a lead silently.
   ============================================================ */
(function(){
  'use strict';
  var CFG = window.RC_CONFIG || {};

  function refId(){
    var d = new Date();
    var rand = Math.random().toString(36).slice(2,8).toUpperCase();
    return 'RC-' + d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + rand;
  }

  function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function validPhone(v){ return (v.replace(/[^0-9+]/g,'').length >= 7); }

  function mark(field, ok){
    var wrap = field.closest('.field');
    if(wrap) wrap.classList.toggle('invalid', !ok);
    return ok;
  }

  function storeLocal(kind, payload, ref){
    try{
      var outbox = JSON.parse(localStorage.getItem('rc_outbox') || '[]');
      outbox.push({kind: kind, ref: ref, at: new Date().toISOString(), payload: payload});
      localStorage.setItem('rc_outbox', JSON.stringify(outbox));
    }catch(e){ /* private mode */ }
  }

  function submitToSupabase(table, payload){
    if(!CFG.supabaseUrl || !CFG.publishableKey) return Promise.reject(new Error('not-configured'));
    return fetch(CFG.supabaseUrl.replace(/\/$/,'') + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'apikey': CFG.publishableKey,
        'Authorization': 'Bearer ' + CFG.publishableKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).then(function(res){
      if(!res.ok) throw new Error('supabase-' + res.status);
      return true;
    });
  }

  /* All public forms funnel into one admin inbox table. */
  function submitLead(kind, ref, fields){
    return submitToSupabase('rc_submissions', {
      kind: kind,
      reference: ref,
      payload: fields,
      status: 'new'
    });
  }

  function wireForm(formId, kind, table, buildPayload){
    var form = document.getElementById(formId);
    if(!form) return;
    var success = document.getElementById(formId.replace(/-form$/, '') + '-success') || form.parentElement.querySelector('.form-success');
    var hp = form.querySelector('input[name="company_website"]'); // honeypot

    form.addEventListener('submit', function(e){
      e.preventDefault();

      // honeypot — silently accept and drop
      if(hp && hp.value){
        showSuccess(form, success, refId());
        return;
      }

      // puzzle captcha — must be verified before anything else
      if(form.hasAttribute('data-captcha') && form.dataset.captchaVerified !== '1'){
        var widget = form.querySelector('[data-captcha-widget]');
        if(widget){
          var msgEl = widget.querySelector('.captcha__msg');
          if(msgEl){
            msgEl.textContent = 'Please complete the puzzle above before submitting.';
            msgEl.classList.add('is-error');
          }
          widget.classList.add('is-fail');
          window.setTimeout(function(){ widget.classList.remove('is-fail'); }, 650);
          var trackEl = widget.querySelector('.captcha__track');
          if(trackEl) trackEl.focus({preventScroll:false});
        }
        return;
      }

      var ok = true;
      form.querySelectorAll('[required]').forEach(function(field){
        var v = (field.value || '').trim();
        var valid = v.length > 0;
        if(field.type === 'email') valid = valid && validEmail(v);
        if(field.type === 'tel') valid = valid && validPhone(v);
        if(field.type === 'checkbox') valid = field.checked;
        if(!mark(field, valid)) ok = false;
      });
      var consent = form.querySelectorAll('input[type="checkbox"][required]');
      consent.forEach(function(c){ if(!c.checked){ c.closest('.check').style.color = '#8a2f1d'; ok = false; } else { c.closest('.check').style.color = ''; } });

      if(!ok){
        var firstInvalid = form.querySelector('.invalid input, .invalid select, .invalid textarea');
        if(firstInvalid) firstInvalid.focus();
        return;
      }

      var btn = form.querySelector('.submit-btn');
      btn.disabled = true;
      var label = btn.querySelector('.btn-label');
      var original = label ? label.textContent : '';
      if(label) label.textContent = 'Submitting…';

      var ref = refId();
      var payload = buildPayload(form);

      submitLead(kind, ref, payload)
        .then(function(){ showSuccess(form, success, ref); })
        .catch(function(err){
          // offline, unconfigured, or rejected — keep the lead locally + offer email fallback
          storeLocal(kind, payload, ref);
          showSuccess(form, success, ref, err && err.message === 'not-configured' ? null : 'saved-locally');
        })
        .finally(function(){
          btn.disabled = false;
          if(label) label.textContent = original;
        });
    });

    // live re-validate on input
    form.querySelectorAll('[required]').forEach(function(field){
      field.addEventListener('input', function(){ mark(field, field.value.trim().length > 0); });
    });
  }

  function showSuccess(form, success, ref, mode){
    form.style.display = 'none';
    if(success){
      var refOut = success.querySelector('[data-ref]');
      if(refOut) refOut.textContent = ref;
      var note = success.querySelector('[data-success-note]');
      if(note && mode === 'saved-locally'){
        note.textContent = 'Your request was recorded on this device. If connectivity was the issue, please also email us — we do not want to lose it.';
      }
      success.classList.add('show');
      success.setAttribute('tabindex','-1');
      success.focus({preventScroll:false});
      success.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'});
    }
  }

  /* ---------- My Town ---------- */
  wireForm('my-town-form', 'my-town', null, function(form){
    return {
      full_name: form.elements['full_name'].value.trim(),
      phone: form.elements['phone'].value.trim(),
      town_or_zip: form.elements['town_or_zip'].value.trim(),
      email: form.elements['email'].value.trim()
    };
  });

  /* ---------- Join the Team — Bruno Agent invoice ---------- */
  wireForm('invoice-form', 'invoice', null, function(form){
    return {
      full_name: form.elements['full_name'].value.trim(),
      invoice_email: form.elements['invoice_email'].value.trim(),
      chosen_area: form.elements['chosen_area'].value.trim(),
      company_billing: form.elements['company_billing'].value.trim() || null,
      confirmed_age: form.elements['confirmed_age'].checked,
      confirmed_terms: form.elements['confirmed_terms'].checked
    };
  });
})();
