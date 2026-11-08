# Hackathon-bud

Finds open hackathons on **Unstop, Devpost, Devfolio and MLH**, scores each out of 100 on how worth it it is, and lets anyone get a daily email with just their address, no account.

- **`/`** is the landing page: signup form, today's eight strongest, and how it picks.
- **`/explore`** is every open hackathon, filterable by region, type, cash prize and search.
- **The email** goes out at 8:00 IST, only when something new and strong opens or a strong one is about to close.
- **The browser extension** shows a badge when a strong new hackathon appears.

## How it picks

These are Sameer's rules; friends get the same list filtered by where they can go.

- **Kept:** registration still open and a cash prize named on the listing. In-person events only inside India; outside India, only events you can join online.
- **Kept apart:** ideathons (pitch an idea, no build) and promptathons (prompt contests). The sites file them under hackathons; here they get their own filter on `/explore` and are left out of the email unless a subscriber ticks the box. Detection is by keywords in the title, then the description (`classifyKind` in `core/score.mjs`).
- **Score out of 100:** registrations 34 and prize pool 34 (both on a log scale), who runs it 20 (big companies, IIT/NIT/IIIT/BITS, MLH, featured or verified flags), time to register 7, interests 5.
- **Tiers:** Marquee 70+, Strong 52+, Decent 35+, Thin below. The email carries Strong and Marquee only.
- **Regions:** North, South, West, East and Central India, from the state or city (`REGIONS` in `core/score.mjs`).

## Run it locally

```sh
npm install
cp .env.example .env     # add GMAIL_USER and GMAIL_APP_PASSWORD
npm start                # http://localhost:4321
```

Without `DATABASE_URL`, subscribers and the latest list are kept in `.data/store.json`.

To keep it running on this Linux machine after reboots, run `deploy/install-linux.sh` (settings in `~/.config/hackathon-bud/gmail.env`). `deploy/uninstall-linux.sh` removes it. The installer also replaces the older `hackathon-radar` units if they are installed.

Handy commands:

| Command | What it does |
|---|---|
| `npm run refresh` | Fetch every source now |
| `npm run digest` | Send today's digest to every confirmed subscriber now |
| `npm run digest -- --dry-run` | Show who would get what, send nothing |
| `npm run digest:preview` | Write `digest-preview.html` to look at |
| `MAIL_DRY_RUN=1 npm start` | Print emails to the console instead of sending |

## Deploy on Render (free)

A free Render service sleeps after 15 minutes without visitors, and its disk is wiped when it sleeps or redeploys. Two free pieces cover that:

- **Neon Postgres** keeps subscribers and the list. Its free database doesn't expire, unlike Render's free Postgres, which expires after 30 days.
- **A GitHub Action** (`.github/workflows/wake.yml`) calls `/api/cron` at 8:00 IST and three more times a day. Each call wakes the service, refreshes the list, and sends the digest if it hasn't gone out today.

Steps:
1. **Database:** sign up at [neon.tech](https://neon.tech), create a project in the Singapore region, and copy its connection string (`postgresql://...`).
2. **Secret:** make up a long random string for `CRON_SECRET`, e.g. the output of `openssl rand -hex 24`.
3. **Repo:** put this folder in its own GitHub repo and push it.
4. **Render:** **New → Blueprint**, pick the repo. Fill in `DATABASE_URL` (from Neon), `CRON_SECRET`, and the mail settings (see below).
5. **GitHub:** in the repo, **Settings → Secrets and variables → Actions**, add `SITE_URL` (your `https://<app>.onrender.com`) and `CRON_SECRET` (the same value). Then **Actions → Wake Hackathon-bud → Run workflow** once to check that it works.

Notes:
- GitHub can start scheduled runs 10 to 30 minutes late, so the digest may land around 8:15. For exact timing, ping the same URL from [cron-job.org](https://cron-job.org) instead.
- The first visit after the service has slept takes up to a minute while it wakes up.
- Free Render hours (750 a month) cover one always-on service, so a few wake-ups a day are well within it.

## Who the email comes from

| Setup | Friends see | Effort |
|---|---|---|
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | that Gmail address | none, but it is your address |
| A new Gmail just for this, e.g. `hackathonbud.alerts@gmail.com`, same two settings | the new address | 5 minutes, free |
| Your own domain with [Brevo](https://www.brevo.com) or [Resend](https://resend.com): set `SMTP_URL` and `MAIL_FROM` | `hello@yourdomain` | a domain (from about ₹100 a year) plus DNS records |

Examples:
```
SMTP_URL=smtps://resend:re_xxxxxxxx@smtp.resend.com:465
MAIL_FROM=Hackathon-bud <hello@hackathonbud.in>
```
```
SMTP_URL=smtps://you%40mail.com:xsmtpsib-xxxxxxxx@smtp-relay.brevo.com:465
MAIL_FROM=Hackathon-bud <hello@hackathonbud.in>
```
`SMTP_URL` wins over the Gmail settings when both are set. `MAIL_REPLY_TO` is optional. A personal Gmail sends about 500 emails a day; Brevo's free plan 300 a day; Resend's free plan 100 a day.

## Browser extension (Chrome, Brave, Edge)

```sh
npm run sync
```

Then `chrome://extensions` (or `brave://extensions`) → **Developer mode** → **Load unpacked** → pick `extension/`.

It checks the four sites itself every six hours, shows a badge for strong new hackathons and sends one notification per check. After deploying, set your site's address in `extension/config.js` so "See every hackathon" opens it.

## Files

- `core/`: fetching (`sources.mjs`), location, type and score rules (`score.mjs`), and ranking (`index.mjs`). Shared by everything; `npm run sync` copies it into `web/` and `extension/`.
- `server.mjs`: the website, signup, confirm and unsubscribe pages, and the schedule.
- `server/`: storage (`store.mjs`), emails (`email.mjs`), refresh and digest jobs (`jobs.mjs`), server-rendered HTML (`pages.mjs`).
- `web/`: `landing.html`, `explore.html` with `app.js`, and the stylesheets.
- `extension/`: the browser extension.

## What it doesn't do

- **Instagram**: Instagram's terms ban scraping and it blocks bots. Almost everything promoted there is also on Unstop or Devfolio.
- **MLH** doesn't publish registration counts or prizes, so the cash-only filter hides its events. Untick "Cash prize only" on `/explore` to see them.
- Devfolio prize totals are read from free text and may be approximate. Prizes in other currencies are converted to rupees at fixed approximate rates.

## Design

The UI follows the [Hallmark](https://github.com/nutlope/hallmark) design skill with its **Console** theme: a graphite background, Host Grotesk for text, Atkinson Hyperlegible Mono for measured numbers, and amber for actions. The wordmark is Archivo Expanded 800, with a slashed O and an amber hyphen. `design-skills/` holds clones of `nutlope/hallmark` and `elayadesign/ai-design-skills`, which are also installed in `.claude/skills/`.
