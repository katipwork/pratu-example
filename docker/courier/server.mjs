// A dev mailbox for Pratu's courier.
//
// Pratu has no mail or SMS sender of its own: the `webhook` driver POSTs each
// message as JSON to a URL and leaves delivery to you. This catches those
// POSTs and shows them on a page, so one-time codes are readable without
// grepping the server log — and without any real address receiving anything.
//
// Zero dependencies, in-memory only. Dev use exclusively: it displays live
// one-time codes to anyone who can reach it.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8025);
const LIMIT = Number(process.env.LIMIT ?? 200);

/** @type {{id:string, at:string, channel:string, recipient:string, template:string, code:string|null, payload:object}[]} */
let messages = [];

function store(body) {
  const entry = {
    id: body.id ?? crypto.randomUUID(),
    at: new Date().toISOString(),
    channel: body.channel ?? "",
    recipient: body.recipient ?? "",
    template: body.template ?? "",
    // Every Pratu template that matters carries the one-time code here.
    code: body.payload?.code ?? null,
    payload: body.payload ?? {},
  };
  // The outbox retries on failure, so the same id can arrive twice.
  messages = [entry, ...messages.filter((m) => m.id !== entry.id)].slice(0, LIMIT);
  return entry;
}

const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/courier") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        const entry = store(JSON.parse(raw));
        console.log(
          `[courier] ${entry.channel} → ${entry.recipient} ${entry.template}` +
            (entry.code ? ` code=${entry.code}` : ""),
        );
        // Anything outside 2xx makes Pratu retry the message.
        json(res, 200, { ok: true });
      } catch (error) {
        console.error("[courier] bad payload:", error.message);
        json(res, 400, { ok: false });
      }
    });
    return;
  }

  if (url.pathname === "/api/messages") {
    if (req.method === "DELETE") {
      messages = [];
      return json(res, 200, { ok: true });
    }
    return json(res, 200, messages);
  }

  if (url.pathname === "/health") return json(res, 200, { status: "ok" });

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`[courier] mailbox listening on :${PORT}`),
);

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Courier mailbox</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fafafa; color: #171717;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #f5f5f5; }
    .card { background: #171717 !important; border-color: #ffffff26 !important; }
    .code { background: #ffffff14 !important; }
    .muted { color: #a3a3a3 !important; }
    .tag { background: #ffffff14 !important; }
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: .35rem; }
  h1 { font-size: 1.5rem; letter-spacing: -.02em; margin: 0; }
  .muted { color: #737373; font-size: .875rem; }
  button {
    font: inherit; font-size: .8125rem; padding: .4rem .75rem; cursor: pointer;
    border-radius: .5rem; border: 1px solid #00000026; background: transparent; color: inherit;
  }
  button:hover { background: #00000008; }
  ul { list-style: none; padding: 0; margin: 1.5rem 0 0; display: flex; flex-direction: column; gap: .75rem; }
  .card {
    background: #fff; border: 1px solid #0000001a; border-radius: .875rem; padding: 1rem 1.15rem;
    display: flex; align-items: center; gap: 1.15rem;
  }
  .meta { min-width: 0; flex: 1; }
  .to { font-weight: 500; overflow-wrap: anywhere; }
  .row { display: flex; align-items: center; gap: .5rem; margin-top: .3rem; flex-wrap: wrap; }
  .tag {
    font-size: .7rem; letter-spacing: .02em; padding: .12rem .45rem; border-radius: .3rem;
    background: #0000000d; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.6rem; letter-spacing: .18em;
    padding: .5rem .8rem; border-radius: .6rem; background: #0000000d; cursor: pointer; user-select: all;
    border: 1px solid transparent; transition: border-color .15s;
  }
  .code:hover { border-color: #00000033; }
  .code.copied { border-color: #16a34a; color: #16a34a; }
  .empty { text-align: center; padding: 4rem 1rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Courier mailbox</h1>
    <button id="clear">Clear</button>
  </header>
  <p class="muted">
    Messages Pratu tried to deliver. Nothing reaches a real inbox — click a code to copy it.
  </p>
  <ul id="list"></ul>
  <div class="empty muted" id="empty">Waiting for the first message…</div>
</div>
<script>
const list = document.getElementById("list");
const empty = document.getElementById("empty");
let signature = "";

function ago(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  return Math.floor(seconds / 3600) + "h ago";
}

function render(messages) {
  empty.style.display = messages.length ? "none" : "";
  list.replaceChildren(...messages.map((message) => {
    const li = document.createElement("li");
    li.className = "card";

    const meta = document.createElement("div");
    meta.className = "meta";
    const to = document.createElement("div");
    to.className = "to";
    to.textContent = message.recipient;          // textContent: never trust input
    const row = document.createElement("div");
    row.className = "row";
    for (const text of [message.template, message.channel]) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = text;
      row.append(tag);
    }
    const when = document.createElement("span");
    when.className = "muted";
    when.textContent = ago(message.at);
    row.append(when);
    meta.append(to, row);
    li.append(meta);

    if (message.code) {
      const code = document.createElement("div");
      code.className = "code";
      code.textContent = message.code;
      code.title = "Click to copy";
      code.onclick = async () => {
        try { await navigator.clipboard.writeText(message.code); } catch {}
        code.classList.add("copied");
        setTimeout(() => code.classList.remove("copied"), 1200);
      };
      li.append(code);
    }
    return li;
  }));
}

async function poll() {
  try {
    const messages = await (await fetch("/api/messages")).json();
    // Re-render only on change, so a copy click is never interrupted.
    const next = JSON.stringify(messages.map((m) => m.id));
    if (next !== signature) { signature = next; render(messages); }
  } catch {}
}

document.getElementById("clear").onclick = async () => {
  await fetch("/api/messages", { method: "DELETE" });
  signature = ""; poll();
};

poll();
setInterval(poll, 2000);
</script>
</body>
</html>`;
