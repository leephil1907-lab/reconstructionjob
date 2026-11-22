// send-email — relays the admin console's branded email through a mail provider.
// Deployed and callable by the authenticated admin only (verify_jwt = true).
// Dormant until the RESEND_API_KEY secret is set on this function:
//   Supabase → Edge Functions → send-email → Secrets
//     RESEND_API_KEY  (required)  — e.g. Resend API key
//     RC_FROM         (optional)  — verified sender, defaults to Resend's test address
// Without RESEND_API_KEY the function answers 501 provider-not-configured and the
// admin UI falls back to opening the visitor's mail app.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' });

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    return json(501, {
      error: 'provider-not-configured',
      hint: 'Set the RESEND_API_KEY secret on the send-email Edge Function to enable one-click sending.',
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid-json' });
  }

  const to = String(payload.to ?? '').trim();
  const subject = String(payload.subject ?? '').trim();
  const html = String(payload.html ?? '');
  const text = String(payload.text ?? '');
  const replyTo = typeof payload.reply_to === 'string' ? payload.reply_to : 'buildwithbruno@hotmail.com';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return json(400, { error: 'valid-to-required' });
  if (!subject) return json(400, { error: 'subject-required' });
  if (!html || !text) return json(400, { error: 'html-and-text-required' });

  const from = Deno.env.get('RC_FROM') || 'The Reconstruction Company <onboarding@resend.dev>';

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: replyTo }),
  });
  const out = await resp.json().catch(() => ({}));
  if (!resp.ok) return json(resp.status, { error: 'provider-error', detail: out });
  return json(200, { id: (out as Record<string, unknown>)?.id ?? null, status: 'sent' });
});
