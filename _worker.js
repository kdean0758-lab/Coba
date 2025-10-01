export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      return new Response(renderHome(env), { headers: htmlHeaders() });
    }

    // Reverse proxy (opsional)
    if (path.startsWith("/rp/")) {
      const target = env.REVERSE_PROXY_TARGET;
      if (!target) return json({ error: "REVERSE_PROXY_TARGET not set" }, 400);
      const original = new URL(request.url);
      const t = new URL(target);
      original.protocol = t.protocol;
      original.hostname = t.hostname;
      return fetch(original.toString(), request);
    }

    // Subscription API
    if (path.startsWith("/api/v1/sub")) {
      const q = parseQuery(url.searchParams, env);
      const list = await loadProxyList(env);
      const filtered = applyFilters(list, q);
      const out = formatSubscription(filtered, q.format || "raw");
      return new Response(out, {
        headers: {
          "content-type": q.format === "clash" ? "text/plain" : "application/octet-stream",
        },
      });
    }

    // Daftar dengan pagination
    if (path.startsWith("/sub")) {
      const page = Number(path.replace("/sub/", "")) || 1;
      const q = parseQuery(url.searchParams, env);
      const list = await loadProxyList(env);
      const filtered = applyFilters(list, q);
      const paged = paginate(filtered, page, q.limit || Number(env.DEFAULT_LIMIT || 50));
      return new Response(renderList(paged, page), { headers: htmlHeaders() });
    }

    // Cron handler (Cloudflare Triggers)
    if (path === "/_cron") {
      const updated = await syncKvFromSource(env);
      return json({ ok: true, updated });
    }

    return json({ error: "Not found" }, 404);
  },
};

/* ------------------ Helpers ------------------ */

function htmlHeaders() {
  return { "content-type": "text/html; charset=utf-8" };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderHome(env) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Coba</title>
<style>body{font-family:system-ui;background:#0b0f14;color:#e6edf3;margin:2rem}
a{color:#58a6ff} .card{padding:1rem;border:1px solid #1f2328;border-radius:8px}</style></head>
<body>
<h1>Coba — Serverless Tunnel</h1>
<div class="card">
<p>Endpoint:</p>
<ul>
<li>/api/v1/sub?format=clash&cc=${env.DEFAULT_CC || "ID,SG"}&vpn=vless,trojan,ss&limit=${env.DEFAULT_LIMIT || "50"}</li>
<li>/sub/1 — daftar dengan pagination</li>
<li>/rp/... — reverse proxy (opsional)</li>
</ul>
<p>Sumber: ${env.PROXY_BANK_URL ? env.PROXY_BANK_URL : "KV/DEMO"}</p>
</div>
</body></html>`;
}

async function loadProxyList(env) {
  if (env.PROXY_BANK_URL) {
    const res = await fetch(env.PROXY_BANK_URL);
    const text = await res.text();
    return parseProxyBank(text);
  }
  if (env.PROXY_KV) {
    const raw = await env.PROXY_KV.get("proxyList");
    if (raw) return JSON.parse(raw);
  }
  // fallback demo
  return [
    { type: "vless", host: "zoom.us", port: 443, cc: "ID", id: "00000000-0000-4000-8000-000000000000", tls: true },
    { type: "trojan", host: "cdn.cloudflare.com", port: 443, cc: "SG", password: "pass", tls: true },
    { type: "ss", host: "example.com", port: 80, cc: "JP", method: "aes-256-gcm", password: "p" },
  ];
}

async function syncKvFromSource(env) {
  if (!env.PROXY_BANK_URL || !env.PROXY_KV) return { skipped: true };
  const res = await fetch(env.PROXY_BANK_URL);
  const text = await res.text();
  const list = parseProxyBank(text);
  await env.PROXY_KV.put("proxyList", JSON.stringify(list), { metadata: { updatedAt: Date.now() } });
  return { count: list.length };
}

/* ------------------ Filter & Rendering ------------------ */

function parseQuery(sp, env) {
  return {
    format: sp.get("format"),
    cc: (sp.get("cc") || env.DEFAULT_CC || "")
      .split(",")
      .filter(Boolean)
      .map(s => s.toUpperCase()),
    vpn: (sp.get("vpn") || "").split(",").filter(Boolean),
    port: (sp.get("port") || "").split(",").map(Number).filter(Boolean),
    domain: sp.get("domain"),
    limit: Number(sp.get("limit")) || undefined,
  };
}

function applyFilters(list, q) {
  let out = list.slice();
  if (q.cc.length) out = out.filter(x => q.cc.includes((x.cc || "").toUpperCase()));
  if (q.vpn.length) out = out.filter(x => q.vpn.includes(x.type));
  if (q.port.length) out = out.filter(x => q.port.includes(Number(x.port)));
  if (q.domain) out = out.filter(x => (x.host || "").includes(q.domain));
  if (q.limit) out = out.slice(0, q.limit);
  return out;
}

function paginate(list, page, size) {
  const start = (page - 1) * size;
  return list.slice(start, start + size);
}

function renderList(list, page) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Daftar — Coba</title>
<style>body{font-family:system-ui;background:#0b0f14;color:#e6edf3;margin:2rem}table{width:100%;border-collapse:collapse}
td,th{border:1px solid #1f2328;padding:.5rem}</style></head><body>
<h2>Halaman ${page}</h2>
<table><thead><tr><th>Tipe</th><th>Host</th><th>Port</th><th>CC</th></tr></thead><tbody>
${list.map(n => `<tr><td>${n.type}</td><td>${n.host}</td><td>${n.port}</td><td>${n.cc || "-"}</td></tr>`).join("")}
</tbody></table>
</body></html>`;
}

/* ------------------ Filter & Rendering ------------------ */

function parseQuery(sp, env) {
  return {
    format: sp.get("format"),
    cc: (sp.get("cc") || env.DEFAULT_CC || "")
      .split(",")
      .filter(Boolean)
      .map(s => s.toUpperCase()),
    vpn: (sp.get("vpn") || "").split(",").filter(Boolean),
    port: (sp.get("port") || "").split(",").map(Number).filter(Boolean),
    domain: sp.get("domain"),
    limit: Number(sp.get("limit")) || undefined,
  };
}

function applyFilters(list, q) {
  let out = list.slice();
  if (q.cc.length) out = out.filter(x => q.cc.includes((x.cc || "").toUpperCase()));
  if (q.vpn.length) out = out.filter(x => q.vpn.includes(x.type));
  if (q.port.length) out = out.filter(x => q.port.includes(Number(x.port)));
  if (q.domain) out = out.filter(x => (x.host || "").includes(q.domain));
  if (q.limit) out = out.slice(0, q.limit);
  return out;
}

function paginate(list, page, size) {
  const start = (page - 1) * size;
  return list.slice(start, start + size);
}

function renderList(list, page) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Daftar — Coba</title>
<style>body{font-family:system-ui;background:#0b0f14;color:#e6edf3;margin:2rem}table{width:100%;border-collapse:collapse}
td,th{border:1px solid #1f2328;padding:.5rem}</style></head><body>
<h2>Halaman ${page}</h2>
<table><thead><tr><th>Tipe</th><th>Host</th><th>Port</th><th>CC</th></tr></thead><tbody>
${list.map(n => `<tr><td>${n.type}</td><td>${n.host}</td><td>${n.port}</td><td>${n.cc || "-"}</td></tr>`).join("")}
</tbody></table>
</body></html>`;
}
