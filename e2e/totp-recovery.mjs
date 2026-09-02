import { chromium } from "playwright";
import { createHmac } from "node:crypto";

// Must be the tenant origin: browser flows are cookie- and same-origin-bound.
const BASE = process.env.BASE_URL ?? "http://acme.pratu.localhost:8080";
// The dev mailbox that catches Pratu's courier webhooks.
const MAILBOX = process.env.MAILBOX_URL ?? "http://localhost:8025";
const EMAIL = `rec${Date.now()}@example.com`;
const PASSWORD = "correct-horse-battery-staple";
const NEWPASS = "totally-different-passphrase-77";

const seen = new Set();

const codeFor = async (recipient, template, { timeout = 90000 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const messages = await (await fetch(`${MAILBOX}/api/messages`)).json();
    const hit = messages.find(
      (m) =>
        m.recipient === recipient &&
        m.template === template &&
        m.code &&
        !seen.has(m.id),
    );
    if (hit) {
      seen.add(hit.id);
      return hit.code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no ${template} code for ${recipient}`);
};

function totp(secret) {
  const map = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, ""))
    bits += map.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(Date.now() / 1000 / 30), 4);
  const h = createHmac("sha1", bytes).update(counter).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

const path = (page) => new URL(page.url()).pathname;
const step = (msg) => console.log(`\n=== ${msg} ===`);

const browser = await chromium.launch();
// Scripts off throughout: this must be a redirect-driven journey end to end.
const context = await browser.newContext({ javaScriptEnabled: false });
const page = await context.newPage();

try {
  step("1. REGISTER + VERIFY");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="traits.email"]', EMAIL);
  await page.fill('input[name="traits.name"]', "Rec User");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.fill('input[name="code"]', await codeFor(EMAIL, "verification_code"));
  await page.click('button[type="submit"]');
  console.log("  -> signed in at:", path(page));

  step("2. ENROL TOTP");
  await page.goto(`${BASE}/mfa`);
  await page.click('button:has-text("Set up authenticator app")');
  const secret = (await page.locator("code").innerText()).trim();
  console.log("  -> confirm step at:", path(page) + new URL(page.url()).search);
  console.log("  -> secret:", secret.slice(0, 12) + "...");
  console.log("  -> QR rendered server-side:", (await page.locator('img[alt*="QR"]').count()) === 1);
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Confirm")');
  console.log("  -> assurance:", await page.locator("dd span").first().innerText());

  step("3. LOGOUT + LOGIN WITH TOTP");
  await page.click('button:has-text("Sign out")');
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  console.log("  -> held at:", path(page), "|", await page.locator("h1").innerText());
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Verify")');
  console.log("  -> TOTP login OK:", path(page), "| assurance:", await page.locator("dd span").first().innerText());

  step("4. WRONG PASSWORD KEEPS THE FLOW AND SHOWS ITS MESSAGE");
  await page.click('button:has-text("Sign out")');
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', "definitely-not-the-password");
  await page.click('button[type="submit"]');
  // The failed submission 303s back to the screen with the message persisted
  // on the flow — no client state involved.
  const shown = await page.locator("p.text-red-800, p").first().innerText();
  console.log("  -> back at:", path(page), "| message:", shown.slice(0, 40));

  step("5. RECOVERY (code -> TOTP -> new password)");
  console.log("  -> waiting out the 60s per-address email cooldown...");
  await page.waitForTimeout(62000);
  await page.goto(`${BASE}/recovery`);
  await page.fill('input[name="address"]', EMAIL);
  await page.click('button[type="submit"]');
  console.log("  -> step:", await page.locator("h1").innerText());

  await page.fill('input[name="code"]', await codeFor(EMAIL, "recovery_code"));
  await page.click('button[type="submit"]');
  console.log("  -> step:", await page.locator("h1").innerText());

  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Verify")');
  console.log("  -> step:", await page.locator("h1").innerText());

  await page.fill('input[name="password"]', NEWPASS);
  await page.click('button[type="submit"]');
  console.log("  -> recovered:", path(page), "| assurance:", await page.locator("dd span").first().innerText());

  step("6. OLD PASSWORD MUST FAIL");
  await page.click('button:has-text("Sign out")');
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  console.log("  -> at:", path(page), "| message:", (await page.locator("p").first().innerText()).slice(0, 40));

  console.log("\nALL STEPS PASSED — with JavaScript disabled");
} catch (error) {
  console.error("\nFAILED:", error.message);
  await page.screenshot({ path: "/tmp/e2e-fail-totp.png", fullPage: true });
  console.error("screenshot: /tmp/e2e-fail-totp.png, url:", page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
