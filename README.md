# ☀️ Morning Quotes

A tiny, elegant daily newsletter. Every morning, GitHub Actions wakes up,
asks OpenAI to write an **original** quote (it remembers past quotes so it
never repeats itself), wraps it in a beautiful email, and sends it to all
subscribers through [Resend](https://resend.com).

**Zero dependencies. No server. Runs entirely on GitHub's free tier.**

## How it works

```
GitHub Actions (cron, 7:30 AM IST)
        │
        ▼
scripts/send-quote.mjs
        │  1. OpenAI  → writes today's quote (avoids repeats via data/quotes-history.json)
        │  2. Resend  → sends a Broadcast to the "Morning Quotes" Audience
        ▼
Subscribers' inboxes  (unsubscribe links handled by Resend)
```

## Setup

1. **Push this repo to GitHub.**

2. **Add repository secrets** (Settings → Secrets and variables → Actions → New repository secret):

   | Secret | Value |
   |---|---|
   | `OPENAI_API_KEY` | your OpenAI key |
   | `RESEND_API_KEY` | your Resend key |
   | `RESEND_AUDIENCE_ID` | the Resend audience ID |

3. **Test it**: Actions tab → *Send morning quote* → *Run workflow*.

That's it. It now sends automatically every morning at 7:30 AM IST
(change the `cron` line in `.github/workflows/morning-quote.yml` to adjust —
remember cron is in **UTC**).

## Run locally

```
cp .env.example .env   # fill in your keys
node scripts/send-quote.mjs
```

## Managing subscribers

Subscribers live in your Resend **Audience** (Resend dashboard → Audiences →
Morning Quotes). Add contacts there by hand, or point a signup form
(Tally, Google Forms, your own site) at Resend's
[contacts API](https://resend.com/docs/api-reference/contacts/create-contact).
Unsubscribe links in every email are handled by Resend automatically.

## Important notes

- **Sending domain**: the free `onboarding@resend.dev` sender only delivers
  to *your own* Resend account email. To send to real subscribers, verify a
  domain in Resend (Domains → Add Domain), then set a repository *variable*
  `FROM_EMAIL` like `Morning Quotes <hello@yourdomain.com>`.
- **Schedule drift**: GitHub scheduled workflows can start up to ~15–60 min
  late during busy periods.
- **Auto-disable**: on public repos, GitHub disables scheduled workflows
  after 60 days without repo activity. The workflow's daily history commit
  counts as activity, so this takes care of itself once it's running.
- **Cost**: Actions is free (public repo), Resend free tier is 3,000
  emails/month, and each quote costs a fraction of a cent with `gpt-4o-mini`.
