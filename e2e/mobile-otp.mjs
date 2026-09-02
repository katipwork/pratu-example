import { chromium } from "playwright";

// Must be the tenant origin: browser flows are cookie- and same-origin-bound.
const BASE = process.env.BASE_URL ?? "http://acme.pratu.localhost:8080";
// The dev mailbox that catches Pratu's courier webhooks.
const MAILBOX = process.env.MAILBOX_URL ?? "http://localhost:8025";
const EMAIL = `e2e${Date.now()}@example.com`;
const PASSWORD = "correct-horse-battery-staple";

const seen = new Set();

const codeFor = async (recipient, template, { timeout = 90000 } = {}) => {
  // The courier is an outbox drained on a ticker, so a message lands a moment
  // after the request returns. Match on recipient *and* template: one address
  // receives verification, recovery and MFA codes during a single run.
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

const path = (page) => new URL(page.url()).pathname;
const step = (msg) => console.log(`\n=== ${msg} ===`);

const browser = await chromium.launch();
// The point of the exercise: every screen and every submission must work with
// scripts off. If anything here needs JavaScript, this run fails.
const context = await browser.newContext({ javaScriptEnabled: false });
const page = await context.newPage();

try {
  step("0. THE SCREEN IS REACHED BY REDIRECT, NOT BY SCRIPT");
  // /login carries no flow, so the server sends the browser to Pratu, which
  // creates one and 303s back with ?flow=. With scripts off, only redirects
  // could have done this.
  await page.goto(`${BASE}/login`);
  const landed = new URL(page.url());
  console.log("  -> landed on:", landed.pathname, "| ?flow= present:", landed.searchParams.has("flow"));
  if (!landed.searchParams.has("flow")) throw new Error("expected a ?flow= landing");

  step("1. REGISTER");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="traits.email"]', EMAIL);
  await page.fill('input[name="traits.name"]', "E2E User");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  console.log("  -> redirected to:", path(page));
  console.log("  -> heading:", await page.locator("h1").innerText());

  step("2. VERIFY EMAIL");
  await page.fill('input[name="code"]', await codeFor(EMAIL, "verification_code"));
  await page.click('button[type="submit"]');
  console.log("  -> landed on:", path(page));
  console.log("  -> assurance:", await page.locator("dd span").first().innerText());

  step("3. SESSION IS A PRATU COOKIE");
  const cookies = await context.cookies();
  const sess = cookies.find((c) => c.name === "pratu_session");
  if (!sess) throw new Error("expected a pratu_session cookie");
  console.log("  -> cookies:", cookies.map((c) => c.name).sort().join(", "));
  console.log("  -> httpOnly:", sess.httpOnly, "| domain:", sess.domain);

  step("4. ENROL SMS SECOND FACTOR");
  await page.goto(`${BASE}/mfa`);
  const PHONE = `+6681${Date.now() % 10000000}`;
  await page.fill('input[name="phone"]', PHONE);
  await page.click('button:has-text("Send code")');
  console.log("  -> confirm step at:", path(page) + new URL(page.url()).search);
  await page.fill('input[name="code"]', await codeFor(PHONE, "mfa_enroll_code"));
  await page.click('button:has-text("Confirm")');
  console.log("  -> landed on:", path(page), "| assurance:", await page.locator("dd span").first().innerText());

  step("5. LOGOUT");
  await page.click('button:has-text("Sign out")');
  console.log("  -> at:", path(page));

  step("6. MOBILE OTP LOGIN (password -> held -> SMS)");
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Pratu 303s back to the login screen; the flow now says mfa_required.
  console.log("  -> back at:", path(page), "| heading:", await page.locator("h1").innerText());

  console.log("  -> waiting out the 60s per-address SMS cooldown...");
  await page.waitForTimeout(62000);
  await page.click('button:has-text("Text me a code")');
  console.log("  -> after send, still at:", path(page));
  await page.fill('input[name="code"]', await codeFor(PHONE, "mfa_code"));
  await page.click('button:has-text("Verify")');

  const aal = await page.locator("dd span").first().innerText();
  console.log("  -> landed on:", path(page), "| assurance:", aal);
  if (aal !== "aal2") throw new Error(`expected aal2, got ${aal}`);

  console.log("\nALL STEPS PASSED — with JavaScript disabled");
} catch (error) {
  console.error("\nFAILED:", error.message);
  await page.screenshot({ path: "/tmp/e2e-fail-otp.png", fullPage: true });
  console.error("screenshot: /tmp/e2e-fail-otp.png, url:", page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
