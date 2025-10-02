export default {
  async fetch(request, env) {
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
      const out = formatSubscription(filtered, q.format || "raw", env);
      return new Response(out, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
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

    // Cron handler
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
<h1>Coba — Serverless Proxy Bank</h1>
<div class="card">
<p>Endpoint:</p>
<ul>
<li>/api/v1/sub?format=vless</li>
<li>/api/v1/sub?format=trojan</li>
<li>/api/v1/sub?format=ss</li>
<li>/api/v1/sub?format=clash</li>
<li>/sub/1 — daftar dengan pagination</li>
<li>/rp/... — reverse proxy (opsional)</li>
</ul>
<p>Sumber: ${env.PROXY_BANK_URL || "KV/DEMO"}</p>
</div>
</body></html>`;
}

/* ------------------ Loader ------------------ */

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
  return [];
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
    limit: Number(sp.get("limit")) || undefined,
  };
}

function applyFilters(list, q) {
  let out = list.slice();
  if (q.cc.length) out = out.filter(x => q.cc.includes((x.cc || "").toUpperCase()));
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
<table><thead><tr><th>Host</th><th>Port</th><th>CC</th><th>Provider</th></tr></thead><tbody>
${list.map(n => `<tr><td>${n.host}</td><td>${n.port}</td><td>${n.cc}</td><td>${n.provider}</td></tr>`).join("")}
</tbody></table>
</body></html>`;
}

/* ------------------ Parser CSV ------------------ */

function parseProxyBank(text) {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(l => {
      const parts = l.split(",");
      if (parts.length < 4) return null;

      const proxy = parts[0].trim();          // alamat proxy / host
      const port = Number(parts[1].trim());   // port
      const cc = (parts[2] || "").trim().toUpperCase(); // kategori negara
      const server = parts.slice(3).join(",").trim();   // nama server (bisa ada koma)

      return { host: proxy, port, cc, provider: server };
    })
    .filter(Boolean);
}



/* ------------------ Generators ------------------ */

function toVless(node, env) {
  return `vless://${env.DEFAULT_UUID}@${node.host}:${node.port}?security=tls&sni=${node.host}#${node.cc}-${node.provider}`;
}

function toTrojan(node, env) {
  return `trojan://${env.DEFAULT_TROJAN_PASS}@${node.host}:${node.port}?sni=${node.host}#${node.cc}-${node.provider}`;
}

function toSs(node, env) {
  const base = btoa(`${env.DEFAULT_SS_METHOD}:${env.DEFAULT_SS_PASS}`);
  return `ss://${base}@${node.host}:${node.port}#${node.cc}-${node.provider}`;
}

/* ------------------ Formatter ------------------ */

function formatSubscription(list, format, env) {
  if (format === "vless") return list.map(n => toVless(n, env)).join("\n");
  if (format === "trojan") return list.map(n => toTrojan(n, env)).join("\n");
  if (format === "ss") return list.map(n => toSs(n, env)).join("\n");

  if (format === "clash") {
    const proxies = list.map((n, i) => ({
      name: `${n.cc || "XX"}-${n.host}-${i}`,
      type: "ss",
      server: n.host,
      port: n.port,
      cipher: env.DEFAULT_SS_METHOD,
      password: env.DEFAULT_SS_PASS
    }));
    return `proxies:\n${proxies.map(p => "  - " + JSON.stringify(p)).join("\n")}\n`;
  }

  return list.map(n => `${n.host}:${n.port} ${n.cc}`).join("\n");
}
