import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";

// Must be the tenant origin: browser flows are cookie- and same-origin-bound.
const BASE = process.env.BASE_URL ?? "http://acme.pratu.localhost:8080";
const EMAIL = `rec${Date.now()}@example.com`;
const PASSWORD = "correct-horse-battery-staple";
const NEWPASS = "totally-different-passphrase-77";
const LOG = process.env.PRATU_LOG ?? "/tmp/pratu-server.log";

const used = new Set();

const codeFor = async (recipient, template, { timeout = 90000 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const line = execSync(
      `grep '"recipient":"${recipient}"' ${LOG} | grep '"template":"${template}"' | tail -1 || true`,
    )
      .toString()
      .trim();
    const m = line.match(/"code":"(\d+)"/);
    if (m && !used.has(m[1] + template)) {
      used.add(m[1] + template);
      return m[1];
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

const at = (path) => (url) => new URL(url).pathname === path;
const step = (msg) => console.log(`\n=== ${msg} ===`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

try {
  step("1. REGISTER + VERIFY");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="name"]', "Rec User");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(at("/verify"), { timeout: 20000 });
  await page.fill('input[name="code"]', await codeFor(EMAIL, "verification_code"));
  await page.click('button[type="submit"]');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  console.log("  -> signed in at /dashboard");

  step("2. ENROL TOTP");
  await page.goto(`${BASE}/mfa`);
  await page.click('button:has-text("Set up authenticator app")');
  await page.waitForSelector("code", { timeout: 20000 });
  const secret = (await page.locator("code").innerText()).trim();
  console.log("  -> secret:", secret.slice(0, 12) + "...");
  console.log("  -> QR rendered:", (await page.locator('img[alt*="QR"]').count()) === 1);
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Confirm")');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  console.log("  -> assurance:", await page.locator("dd span").first().innerText());

  step("3. LOGOUT + LOGIN WITH TOTP");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(at("/login"), { timeout: 20000 });
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Two-factor authentication")', {
    timeout: 20000,
  });
  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Verify")');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  console.log("  -> TOTP login OK, assurance:", await page.locator("dd span").first().innerText());

  step("4. RECOVERY (code -> TOTP -> new password)");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(at("/login"), { timeout: 20000 });
  // The verification email started a 60s per-address cooldown. Recovery would
  // still answer "code_sent" (anti-enumeration) but deliver nothing.
  console.log("  -> waiting out the 60s per-address email cooldown...");
  await page.waitForTimeout(62000);

  await page.goto(`${BASE}/recovery`);
  await page.fill('input[name="address"]', EMAIL);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Enter your code")', { timeout: 20000 });
  console.log("  -> anti-enumeration copy:", (await page.locator("p").first().innerText()).slice(0, 55));

  await page.fill('input[name="code"]', await codeFor(EMAIL, "recovery_code"));
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Two-factor authentication")', {
    timeout: 20000,
  });
  console.log("  -> recovery demanded a second factor");

  await page.fill('input[name="code"]', totp(secret));
  await page.click('button:has-text("Verify")');
  await page.waitForSelector('h1:has-text("Choose a new password")', {
    timeout: 20000,
  });
  await page.fill('input[name="password"]', NEWPASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  console.log("  -> recovered, assurance:", await page.locator("dd span").first().innerText());

  step("5. OLD PASSWORD MUST FAIL");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(at("/login"), { timeout: 20000 });
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".text-red-800", { timeout: 20000 });
  console.log(
    "  -> still at",
    new URL(page.url()).pathname,
    "| message:",
    (await page.locator(".text-red-800").first().innerText()).slice(0, 40),
  );

  console.log("\nALL STEPS PASSED");
} catch (error) {
  console.error("\nFAILED:", error.message);
  await page.screenshot({ path: "/tmp/e2e-fail-totp.png", fullPage: true });
  console.error("screenshot: /tmp/e2e-fail-totp.png, url:", page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
