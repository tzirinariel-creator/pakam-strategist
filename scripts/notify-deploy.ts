/**
 * Deploy-notification email — sends a "what changed / what to test" email to the
 * owner after each upgrade, so they can re-register and review the change live.
 *
 * Uses Resend (https://resend.com) via plain fetch — no SDK dependency.
 *
 * One-time setup:
 *   1. Create a free Resend account, get an API key.
 *   2. Add to .env.local:  RESEND_API_KEY=re_xxx   NOTIFY_TO=tzirin.ariel@gmail.com
 *      (optional NOTIFY_FROM — defaults to Resend's shared onboarding sender,
 *       which can deliver to your own account email on the free tier.)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/notify-deploy.ts "Subject line" "Body text"
 *   # or pipe a body:  echo "..." | npx tsx ... scripts/notify-deploy.ts "Subject"
 */

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO || "tzirin.ariel@gmail.com";
  const from = process.env.NOTIFY_FROM || "Pakamon <onboarding@resend.dev>";

  if (!apiKey) {
    console.error(
      "✗ RESEND_API_KEY is not set. Add it to .env.local (free key from https://resend.com).",
    );
    process.exit(1);
  }

  const subject = process.argv[2] || "פכמון — עדכון שדרוג";
  let body = process.argv[3];
  if (!body) {
    // Read from stdin if no body arg was given.
    body = await new Promise<string>((resolve) => {
      let data = "";
      if (process.stdin.isTTY) return resolve("");
      process.stdin.on("data", (c) => (data += c));
      process.stdin.on("end", () => resolve(data));
    });
  }
  body = (body || "").trim() || "השדרוג עלה לאוויר: https://pakam-strategist.vercel.app";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });

  if (!res.ok) {
    console.error(`✗ Resend returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const json = (await res.json()) as { id?: string };
  console.log(`✅ Sent deploy notification to ${to} (id: ${json.id ?? "?"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
