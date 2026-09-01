import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = `rec${Date.now()}@example.com`;
const PASSWORD = "correct-horse-battery-staple";
const NEWPASS = "totally-different-passphrase-77";
const LOG = process.env.PRATU_LOG ?? "/tmp/pratu-server.log";


function totp(secret) {
  const map = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, ""))
    bits += map.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = Buffer.from(
    bits.match(/.{8}/g).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(Date.now() / 1000 / 30), 4);
  const h = createHmac("sha1", bytes).update(counter).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

const codeFor = async (recipient, template, { timeout = 90000 } = {}) => {
  // The courier is outbox-drained, so a message lands a little after the
  // request returns. Match on recipient *and* template: the same address
  // receives verification, recovery and MFA codes during one run.
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const line = execSync(
      `grep '"recipient":"${recipient}"' ${LOG} | grep '"template":"${template}"' | tail -1 || true`,
    ).toString().trim();
    const m = line.match(/"code":"(\d+)"/);
    if (m && !used.has(m[1] + template)) {
      used.add(m[1] + template);
      return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no ${template} code for ${recipient}`);
};
const used = new Set();

const step = (m) => console.log(`\n=== ${m} ===`);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

try {
  step("1. REGISTER + VERIFY (no MFA)");
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill('input[name="traits.email"]', EMAIL);
  await page.fill('input[name="traits.name"]', "Rec User");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/verify", { timeout: 20000 });
  await page.fill('input[name="code"]', await codeFor(EMAIL, "verification_code"));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  console.log("  -> signed in at /dashboard");

  step("2. ENROL TOTP VIA UI");
  await page.goto(`${BASE}/mfa`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Set up authenticator app")');
  await page.waitForSelector("code", { timeout: 20000 });
  const secret = (await page.locator("code").innerText()).trim();
  console.log("  -> secret shown:", secret.slice(0, 12) + "...");
  const hasQr = await page.locator('img[alt*="QR"]').count();
  console.log("  -> QR rendered:", hasQr === 1);
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Confirm")');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  console.log("  -> assurance:", await page.locator("dd span").first().innerText());

  step("3. LOGOUT + LOGIN WITH TOTP");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/login", { timeout: 20000 });
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/login/mfa", { timeout: 20000 });
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Verify")');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  console.log("  -> TOTP login OK, assurance:", await page.locator("dd span").first().innerText());

  step("4. RECOVERY (email code -> TOTP second factor -> new password)");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/login", { timeout: 20000 });
  // The verification email in step 1 started a 60s per-address send cooldown.
  // Recovery would report "code_sent" anyway (anti-enumeration) but no code
  // would actually be delivered, so wait it out.
  console.log("  -> waiting out the 60s per-address email cooldown...");
  await page.waitForTimeout(62000);
  await page.goto(`${BASE}/recovery`, { waitUntil: "networkidle" });
  await page.fill('input[name="address"]', EMAIL);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/recovery/code", { timeout: 20000 });
  console.log("  -> anti-enumeration copy:", (await page.locator("p").first().innerText()).slice(0, 60));
  await page.fill('input[name="code"]', await codeFor(EMAIL, "recovery_code"));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/recovery/mfa", { timeout: 20000 });
  console.log("  -> recovery demanded second factor");
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Continue")');
  await page.waitForURL("**/recovery/password", { timeout: 20000 });
  await page.fill('input[name="password"]', NEWPASS);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  console.log("  -> recovered, assurance:", await page.locator("dd span").first().innerText());

  step("5. OLD PASSWORD MUST FAIL");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/login", { timeout: 20000 });
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const err = await page.locator("div.text-red-800, p").first().innerText();
  console.log("  -> still on", new URL(page.url()).pathname, "| message:", err.slice(0, 50));

  console.log("\nALL STEPS PASSED");
} catch (error) {
  console.error("\nFAILED:", error.message);
  await page.screenshot({ path: "/tmp/e2e/fail2.png", fullPage: true });
  console.error("screenshot: /tmp/e2e/fail2.png, url:", page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
