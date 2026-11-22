<p align="center"><img src="assets/img/logo.svg" alt="The Reconstruction Company" width="430"></p>

# The Reconstruction Company

Public multi-page website and private admin console for The Reconstruction Company — a public-benefit approach to real assets and open source capital formation.

**Live:** https://reconstructionjob-earl-lee-s-projects.vercel.app

## Stack
- Static HTML / CSS / vanilla JS — no build step
- Inline-SVG icon system (no icon fonts, no external requests)
- Supabase (Postgres + Auth + REST/RPC) for forms, live chat, invoices, email log
- Forms are protected by a Bybit-style jigsaw puzzle captcha (self-contained canvas artwork, no third-party widget); submissions also pass a honeypot
- Vercel (static; production deployment is created from `main` — project has Git auto-deploys disabled)

## Layout
```
index.html …            12 public pages (Territories, Approach, Library, FAQ, …)
territory.html          Town page renderer (?slug=…)
assets/css/site.css     Design system (editorial broadsheet: paper, ink, ochre)
assets/js/*.js          site · data · forms · config · announce · chat
assets/img/og.jpg       Social card
admin/                  Private console (noindex, not linked from the public site)
sitemap.xml robots.txt  Discovery (admin/ is disallowed)
```

## Develop locally
Any static server, e.g. `python3 -m http.server 8090` (or `npx serve .`).

## Deploy
Push to `main`. The repo root is served as static output — keep `vercel.json` (clean URLs). No build error is possible from stray files; keep `territory/` and `build.js` out of the repo (see `.gitignore`).

> **Git → Vercel auto-deploy is disabled on this project** (Vercel → Project → Settings → Git → enable “Automatically deploy on push”, or leave it off and create a production deployment from `main` after each push — that is the current manual flow). If you enable it, pushes ship by themselves.

## Admin console
`/admin` — email + password (Supabase Auth, single account, public signup disabled).
Features: dashboard · live chat (reply as the Company, close/reopen/delete) · submissions inbox (filter, CSV export, mark handled) · branded invoice creator (line items, tax, discount, print/PDF, email to client) · branded email composer (templates, logo/footer branding, logs every send) · announcement bar editor (live on the public site) · JSON data export.

`assets/js/config.js` holds only browser-safe values (the Supabase **anon** key + project URL). All privileged reads/writes require the admin session; public data is limited to insert-only form leads and security-definer chat RPCs.

## Email delivery (admin → Email Reply)
The Email tab composes the branded letter, **opens your mail app via `mailto:` (send happens there, with your signature)**, copies the branded HTML/text, and logs to `rc_email_log`. That is the supported flow. A `send-email` Edge Function also exists (`supabase/functions/send-email`) as an optional upgrade — wire a mail provider (e.g. Resend: set `RESEND_API_KEY` and a verified `RC_FROM` sender as function secrets) and “Send now” delivers directly; without secrets it just falls back to the mail app.

## Correspondence
buildwithbruno@hotmail.com
