/**
 * Morning Quotes — daily newsletter sender.
 *
 * 1. Asks OpenAI for an original morning quote (avoiding recent repeats).
 * 2. Wraps it in an elegant HTML email.
 * 3. Sends it as a Resend Broadcast to the "Morning Quotes" audience
 *    (Resend handles subscriber list + unsubscribe links).
 * 4. Records the quote in data/quotes-history.json so it never repeats.
 *
 * Zero dependencies — needs Node 20+ (native fetch).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_PATH = join(ROOT, "data", "quotes-history.json");

// ---------------------------------------------------------------- env

// Load .env for local runs; in GitHub Actions the vars come from Secrets.
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const {
  OPENAI_API_KEY,
  RESEND_API_KEY,
  RESEND_AUDIENCE_ID,
  FROM_EMAIL = "Morning Quotes <onboarding@resend.dev>",
} = process.env;

for (const [name, value] of Object.entries({ OPENAI_API_KEY, RESEND_API_KEY, RESEND_AUDIENCE_ID })) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- quote

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return [];
  return JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
}

async function generateQuote(history) {
  const recent = history.slice(-40).map((h) => h.quote);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 1.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a thoughtful writer crafting one original morning quote per day for a small newsletter.",
            "The quote must be your own original writing — never attribute it to a real person.",
            "It should feel calm, warm and genuinely wise; no clichés, no hustle-culture tone.",
            "Respond with JSON: {\"quote\": string (under 30 words), \"theme\": string (1-3 words, e.g. \"Patience\"), \"reflection\": string (one gentle sentence expanding on the quote, under 25 words)}.",
          ].join(" "),
        },
        {
          role: "user",
          content:
            "Write today's morning quote. Do NOT repeat or closely resemble any of these previous quotes:\n" +
            (recent.length ? recent.map((q) => `- ${q}`).join("\n") : "(none yet)"),
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ---------------------------------------------------------------- email

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildEmail({ quote, theme, reflection }, dateLabel, unsubscribeHtml) {
  const q = escapeHtml(quote);
  const t = escapeHtml(theme || "Today");
  const r = escapeHtml(reflection || "");

  return `
<div style="margin:0;padding:0;background-color:#f5f1ea;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f1ea;padding:40px 16px;">
    <tr><td align="center">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- header -->
        <tr><td align="center" style="padding-bottom:28px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:4px;text-transform:uppercase;color:#a89a86;">
            ✳ &nbsp;Morning Quotes&nbsp; ✳
          </p>
          <p style="margin:8px 0 0;font-family:Georgia,serif;font-size:13px;color:#b5a894;font-style:italic;">
            ${dateLabel}
          </p>
        </td></tr>

        <!-- card -->
        <tr><td style="background-color:#fffdf9;border:1px solid #e8e0d3;border-radius:14px;padding:56px 44px;box-shadow:0 2px 8px rgba(90,74,50,0.06);">
          <p style="margin:0 0 26px;text-align:center;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#c9a96a;">
            ${t}
          </p>
          <p style="margin:0;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.55;color:#3d3428;">
            &ldquo;${q}&rdquo;
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px auto;">
            <tr><td style="width:48px;border-top:1px solid #dcCfBc;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
          <p style="margin:0;text-align:center;font-family:Georgia,serif;font-size:15px;line-height:1.7;font-style:italic;color:#8a7c68;">
            ${r}
          </p>
        </td></tr>

        <!-- footer -->
        <tr><td align="center" style="padding-top:30px;">
          <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#b5a894;">
            Have a gentle, unhurried morning. ☕
          </p>
          <p style="margin:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#c4b8a6;">
            You receive this because you subscribed to Morning Quotes.<br/>
            ${unsubscribeHtml}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>`;
}

// ---------------------------------------------------------------- send

async function resend(path, body, method = "POST") {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend API error ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

/**
 * Resend Broadcasts (with automatic unsubscribe links) require a verified
 * domain. On the free `resend.dev` sender we fall back to sending each
 * audience contact an individual email instead.
 */
async function sendToSubscribers(quoteData, dateLabel, subject) {
  const usingSharedDomain = /@resend\.dev>?\s*$/i.test(FROM_EMAIL);

  if (!usingSharedDomain) {
    const html = buildEmail(
      quoteData,
      dateLabel,
      `<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#a89a86;">Unsubscribe</a>`
    );
    console.log("Creating broadcast…");
    const broadcast = await resend("/broadcasts", {
      audience_id: RESEND_AUDIENCE_ID,
      from: FROM_EMAIL,
      subject,
      html,
    });
    console.log(`Sending broadcast ${broadcast.id}…`);
    await resend(`/broadcasts/${broadcast.id}/send`, {});
    return;
  }

  console.log("Free resend.dev sender detected — sending individual emails (test mode).");
  console.log("Verify a domain in Resend + set FROM_EMAIL to unlock broadcasts & unsubscribe links.");
  const { data: contacts } = await resend(`/audiences/${RESEND_AUDIENCE_ID}/contacts`, undefined, "GET");
  const active = contacts.filter((c) => !c.unsubscribed);
  if (active.length === 0) throw new Error("No subscribed contacts in the audience.");

  const html = buildEmail(quoteData, dateLabel, `Reply to this email to unsubscribe.`);
  for (const contact of active) {
    console.log(`  → ${contact.email}`);
    await resend("/emails", { from: FROM_EMAIL, to: [contact.email], subject, html });
  }
}

async function main() {
  const history = loadHistory();

  console.log("Generating today's quote…");
  const quote = await generateQuote(history);
  console.log(`  "${quote.quote}" — theme: ${quote.theme}`);

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  await sendToSubscribers(quote, dateLabel, `☀️ ${quote.theme} — your morning quote`);

  history.push({ date: new Date().toISOString().slice(0, 10), ...quote });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");

  console.log("Done — quote sent and saved to history. ✅");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
