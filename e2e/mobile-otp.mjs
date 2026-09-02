import { chromium } from "playwright";
import { execSync } from "node:child_process";

// Must be the tenant origin: browser flows are cookie- and same-origin-bound.
const BASE = process.env.BASE_URL ?? "http://acme.pratu.localhost:8080";
const EMAIL = `e2e${Date.now()}@example.com`;
const PASSWORD = "correct-horse-battery-staple";
const LOG = process.env.PRATU_LOG ?? "/tmp/pratu-server.log";

const used = new Set();

const codeFor = async (recipient, template, { timeout = 90000 } = {}) => {
  // The courier is outbox-drained, so a message lands a little after the
  // request returns. Match on recipient *and* template: the same address
  // receives verification, recovery and MFA codes during one run.
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

const at = (path) => (url) => new URL(url).pathname === path;
const step = (msg) => console.log(`\n=== ${msg} ===`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

try {
  step("1. REGISTER");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="name"]', "E2E User");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(at("/verify"), { timeout: 20000 });
  console.log("  -> at /verify:", await page.locator("h1").innerText());

  step("2. VERIFY EMAIL");
  await page.fill('input[name="code"]', await codeFor(EMAIL, "verification_code"));
  await page.click('button[type="submit"]');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  console.log("  -> assurance:", await page.locator("dd span").first().innerText());

  step("3. VERIFY THE SESSION IS COOKIE-BASED");
  const cookies = await page.context().cookies();
  const names = cookies.map((c) => c.name).sort();
  console.log("  -> cookies:", names.join(", "));
  const sess = cookies.find((c) => c.name === "pratu_session");
  if (!sess) throw new Error("expected a pratu_session cookie");
  if (!sess.httpOnly) throw new Error("pratu_session should be HttpOnly");
  console.log("  -> pratu_session httpOnly:", sess.httpOnly, "| domain:", sess.domain);

  step("4. ENROL SMS SECOND FACTOR");
  await page.goto(`${BASE}/mfa`);
  await page.click('button:has-text("SMS")');
  const PHONE = `+6681${Date.now() % 10000000}`;
  await page.fill('input[name="phone"]', PHONE);
  await page.click('button:has-text("Send code")');
  await page.waitForSelector('input[name="code"]', { timeout: 20000 });
  await page.fill('input[name="code"]', await codeFor(PHONE, "mfa_enroll_code"));
  await page.click('button:has-text("Confirm")');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  console.log("  -> enrolled, assurance:", await page.locator("dd span").first().innerText());

  step("5. LOGOUT");
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(at("/login"), { timeout: 20000 });
  console.log("  -> back at /login");

  step("6. MOBILE OTP LOGIN (password -> held -> SMS)");
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // The second factor renders in place: the login flow is still the same flow.
  await page.waitForSelector('h1:has-text("Two-factor authentication")', {
    timeout: 20000,
  });
  console.log("  -> held for a second factor, still at", new URL(page.url()).pathname);

  console.log("  -> waiting out the 60s per-address SMS cooldown...");
  await page.waitForTimeout(62000);
  await page.click('button:has-text("Text me a code")');
  await page.fill('input[name="code"]', await codeFor(PHONE, "mfa_code"));
  await page.click('button:has-text("Verify")');
  await page.waitForURL(at("/dashboard"), { timeout: 20000 });
  const aal = await page.locator("dd span").first().innerText();
  console.log("  -> signed in, assurance:", aal);
  if (aal !== "aal2") throw new Error(`expected aal2, got ${aal}`);

  console.log("\nALL STEPS PASSED");
} catch (error) {
  console.error("\nFAILED:", error.message);
  await page.screenshot({ path: "/tmp/e2e-fail-otp.png", fullPage: true });
  console.error("screenshot: /tmp/e2e-fail-otp.png, url:", page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
