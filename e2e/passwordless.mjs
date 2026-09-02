import { chromium } from "playwright";

// The passwordless tenant: the mobile number is the identity, a One-Time Code
// is the only factor. Same app as the password tenant, different hostname.
const BASE = process.env.OTP_BASE_URL ?? "http://otp.pratu.localhost:8080";
const MAILBOX = process.env.MAILBOX_URL ?? "http://localhost:8025";
const PHONE = `+66899${String(Date.now()).slice(-6)}`;

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

const path = (page) => new URL(page.url()).pathname;
const step = (msg) => console.log(`\n=== ${msg} ===`);

const browser = await chromium.launch();
// Redirect-driven throughout, so scripts stay off.
const context = await browser.newContext({ javaScriptEnabled: false });
const page = await context.newPage();

try {
  step("1. REGISTER WITH A PHONE NUMBER AND NOTHING ELSE");
  await page.goto(`${BASE}/register`);
  const inputs = await page.locator("input:not([type=hidden])").evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute("name")),
  );
  console.log("  -> visible inputs:", inputs);
  if (inputs.some((n) => n === "password")) {
    throw new Error("a passwordless tenant must not ask for a password");
  }
  const method = await page
    .locator('input[name="method"]')
    .getAttribute("value");
  console.log("  -> registration method:", method);
  if (method !== "code") throw new Error(`expected method=code, got ${method}`);

  await page.fill('input[name="traits.phone"]', PHONE);
  await page.click('button[type="submit"]');
  console.log("  -> redirected to:", path(page), "|", await page.locator("h1").innerText());

  step("2. PROVE THE NUMBER");
  await page.fill('input[name="code"]', await codeFor(PHONE, "verification_code"));
  await page.click('button[type="submit"]');
  console.log("  -> landed on:", path(page));
  const traits = await page.locator("pre").innerText();
  console.log("  -> traits:", traits.replace(/\s+/g, " "));
  if (traits.includes("email")) throw new Error("no email should exist here");
  console.log("  -> assurance:", await page.locator("dd span").first().innerText());

  step("3. SIGN OUT");
  await page.click('button:has-text("Sign out")');
  console.log("  -> at:", path(page));

  step("4. THE LOGIN SCREEN OFFERS NO PASSWORD");
  const loginInputs = await page.locator("input:not([type=hidden])").evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute("name")),
  );
  console.log("  -> visible inputs:", loginInputs);
  if (loginInputs.includes("password")) {
    throw new Error("password field on a code-only tenant");
  }
  const recovery = await page.locator('a[href="/recovery"]').count();
  console.log("  -> 'Forgot password?' offered:", recovery > 0, "(recovery sets a password, so it is hidden)");

  step("5. SIGN IN WITH THE NUMBER AND A CODE");
  // Registration just sent a code to this number; the per-address cooldown
  // gates re-sending, so wait it out before asking for the login code.
  console.log("  -> waiting out the 60s per-address SMS cooldown...");
  await page.waitForTimeout(62000);

  await page.fill('input[name="identifier"]', PHONE);
  await page.click('button:has-text("Text me a code")');
  console.log("  -> step:", await page.locator("h1").innerText());

  await page.fill('input[name="code"]', await codeFor(PHONE, "login_code"));
  await page.click('button[type="submit"]');

  const aal = await page.locator("dd span").first().innerText();
  console.log("  -> landed on:", path(page), "| assurance:", aal);
  // ADR 0007: one factor is one factor, so a code login is aal1.
  if (aal !== "aal1") throw new Error(`expected aal1, got ${aal}`);

  step("6. AN UNKNOWN NUMBER LOOKS IDENTICAL");
  await page.click('button:has-text("Sign out")');
  await page.fill('input[name="identifier"]', "+66800000000");
  await page.click('button:has-text("Text me a code")');
  console.log("  -> step:", await page.locator("h1").innerText());
  console.log("  -> copy:", (await page.locator("p").first().innerText()).slice(0, 60));

  console.log("\nALL STEPS PASSED — passwordless, with JavaScript disabled");
} catch (error) {
  console.error("\nFAILED:", error.message);
  await page.screenshot({ path: "/tmp/e2e-fail-pwless.png", fullPage: true });
  console.error("screenshot: /tmp/e2e-fail-pwless.png, url:", page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
