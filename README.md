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

## Admin console
`/admin` — email + password (Supabase Auth, single account, public signup disabled).
Features: dashboard · live chat (reply as the Company, close/reopen/delete) · submissions inbox (filter, CSV export, mark handled) · branded invoice creator (line items, tax, discount, print/PDF, email to client) · branded email composer (templates, logo/footer branding, logs every send) · announcement bar editor (live on the public site) · JSON data export.

`assets/js/config.js` holds only browser-safe values (the Supabase **anon** key + project URL). All privileged reads/writes require the admin session; public data is limited to insert-only form leads and security-definer chat RPCs.

## Correspondence
buildwithbruno@hotmail.com
