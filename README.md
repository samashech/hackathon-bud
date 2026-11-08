# Hackathon radar

Finds hackathons on **Unstop, Devpost, Devfolio and MLH**, keeps the ones that fit your rules, and scores each one out of 100 so you can tell at a glance whether it's worth a weekend.

**Location rules**
- In India, in person: **north India** (Delhi NCR, Haryana, Punjab, Chandigarh, UP, Uttarakhand, HP, J&K, Rajasthan) or **Bengaluru**. Turn on "Rest of India too" to see the others.
- Outside India: **online or hybrid only**.
- "Cash prize only" is on by default.

**Worthiness score**

| Part | Weight | What it measures |
|---|---|---|
| Crowd | 34 | Registrations on a log scale (20 people scores 0, 20,000 scores full) |
| Cash | 34 | Prize pool converted to ₹, on a log scale (₹5,000 scores 0, ₹50 lakh scores full) |
| Who runs it | 20 | Big companies, IIT/NIT/IIIT/BITS, MLH, plus featured or verified flags and view counts |
| Time left | 7 | Lower when registration closes within two days |
| Your interests | 5 | Your interests named in the title or themes (editable in Settings) |

Tiers: 70 and above is **Marquee**, 52 to 69 **Strong**, 35 to 51 **Decent**, below 35 **Thin**. Every hackathon's reading also explains its score in one sentence, e.g. *"2,164 people have registered and ₹6 lakh in cash is on the table."*

You can tune the weights and the city lists in `core/score.mjs`.

## The four ways to use it

All four share the same code in `core/`.

### 1. Website
```sh
npm install
npm start                # fetches fresh data, then serves http://localhost:4321
HOST=0.0.0.0 npm start   # also reachable from your phone on the same Wi-Fi
```
Your shortlist, hidden events, interests and theme are saved in your browser. Filters are stored in the URL, so you can bookmark a view.

### 2. Mobile app
The website is an installable app (PWA). Open it on your phone in Chrome, then choose **⋮ → Add to Home screen / Install app**. It opens full screen and keeps working offline with the last list it loaded. Your phone needs to reach a URL, so either use GitHub Pages (see 4) or run `HOST=0.0.0.0 npm start` on the same Wi-Fi.

### 3. Browser extension (Chrome, Brave, Edge)
```sh
npm run sync                     # copies core/ into extension/
```
Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `extension/` folder.
- It checks all four sites every 6 hours.
- The badge shows how many strong hackathons are new.
- You get one notification per check when something new scores 52 or higher.
- The popup lists the top 15 for each location filter.

### 4. Gmail digest
1. Turn on 2-step verification for your Google account. Then create an **app password** at <https://myaccount.google.com/apppasswords>.
2. Run it locally:
   ```sh
   npm run digest:preview   # writes digest-preview.html to look at
   GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD='abcd efgh ijkl mnop' npm run digest
   ```
   The email includes strong hackathons found in the last 26 hours and strong ones that close within 3 days. If there are none, nothing is sent. Options: `--since <hours>`, `--min <score>`, `--no-refresh`.

## Run it on this machine, always on
```sh
deploy/install-linux.sh     # website always at localhost:4321, refresh and digest daily at 8:00
deploy/uninstall-linux.sh   # removes both
```
Put your Gmail app password in `~/.config/hackathon-radar/gmail.env`. Until it's there, the daily run still refreshes the list but skips the email. `Persistent=true` means a run missed while the laptop was off happens at the next boot. Logs: `journalctl --user -u hackathon-radar-daily`.

## Run it daily for free (GitHub Actions + Pages)
`.github/workflows/radar.yml` runs every day at 8:00 IST. It refreshes the list, publishes the website to GitHub Pages and sends the digest.

1. Put this folder in its own GitHub repo and push it.
2. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions**, add `GMAIL_USER` and `GMAIL_APP_PASSWORD`. `DIGEST_TO` is optional and sets a different recipient.
4. Go to **Actions → Radar → Run workflow** once to start it.

The site goes live at `https://<you>.github.io/<repo>/`. Install that URL on your phone, and set it in the extension popup's "Open the full radar" link (`fullUrl` in extension storage).

## What it doesn't do
- **Instagram**: Instagram's terms ban scraping and it blocks bots, so this tool doesn't read it. Nearly every hackathon promoted there is also listed on Unstop or Devfolio, which this tool covers.
- **MLH** doesn't publish registration counts or prizes. Its events get a fixed "vetted" score for crowd, and the cash-only filter hides them. Turn the filter off to see them.
- Prize totals come from what each site lists. For Devfolio, they are parsed from free text and may be approximate.

## Design
The UI follows the [Hallmark](https://github.com/nutlope/hallmark) design skill and uses its **Console** theme: a graphite background, Host Grotesk for text, Atkinson Hyperlegible Mono for measured numbers, and amber for your own actions. `design-skills/` holds clones of `nutlope/hallmark` and `elayadesign/ai-design-skills`. Both are also installed as project skills in `.claude/skills/`.
