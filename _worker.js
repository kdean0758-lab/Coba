// src/_worker.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ENV expected:
    // PROXY_BANK_URL: URL daftar proxy (plain text / json)
    // REVERSE_PROXY_TARGET: target untuk reverse proxy (opsional)
    // PROXY_KV: KV namespace binding (opsional)

    if (path === "/" || path === "/index.html") {
      return new Response(renderHome(), { headers: htmlHeaders() });
    }

    // Reverse proxy simple
    if (path.startsWith("/rp/")) {
      const target = env.REVERSE_PROXY_TARGET;
      if (!target) return json({ error: "REVERSE_PROXY_TARGET not set" }, 400);
      const proxied = new URL(request.url);
      proxied.hostname = new URL(target).hostname;
      proxied.protocol = new URL(target).protocol;
      return fetch(proxied.toString(), request);
    }

    // Subscription API: /api/v1/sub?format=clash&cc=ID&vpn=vless,trojan&limit=10
    if (path.startsWith("/api/v1/sub")) {
      const q = parseQuery(url.searchParams);
      const list = await loadProxyList(env, q);
      const filtered = applyFilters(list, q); // cc, vpn, port, domain, limit
      const formatted = formatSubscription(filtered, q.format || "raw");
      return new Response(formatted, {
        headers: {
          "content-type": q.format === "clash" ? "text/plain" : "application/octet-stream",
        },
      });
    }

    // Pagination list: /sub/:page
    if (path.startsWith("/sub")) {
      const page = Number(path.replace("/sub/", "")) || 1;
      const q = parseQuery(url.searchParams);
      const list = await loadProxyList(env, q);
      const paged = paginate(list, page, q.limit || 20);
      return new Response(renderList(paged, page), { headers: htmlHeaders() });
    }

    return json({ error: "Not found" }, 404);
  },
};

function htmlHeaders() {
  return { "content-type": "text/html; charset=utf-8" };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderHome() {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Selat</title>
<style>body{font-family:system-ui;background:#0b0f14;color:#e6edf3;margin:2rem}
a{color:#58a6ff} .card{padding:1rem;border:1px solid #1f2328;border-radius:8px}</style></head>
<body>
<h1>Selat — Serverless Tunnel</h1>
<div class="card">
<p>Endpoint:</p>
<ul>
<li>/api/v1/sub?format=clash&cc=ID&vpn=vless,trojan,ss&limit=10</li>
<li>/sub/1 — daftar dengan pagination</li>
<li>/rp/... — reverse proxy (opsional)</li>
</ul>
</div>
</body></html>`;
}

async function loadProxyList(env, q) {
  // Prioritas: PROXY_BANK_URL -> KV -> fallback demo
  if (env.PROXY_BANK_URL) {
    const res = await fetch(env.PROXY_BANK_URL);
    const text = await res.text();
    return parseProxyBank(text);
  }
  if (env.PROXY_KV) {
    const raw = await env.PROXY_KV.get("proxyList");
    if (raw) return JSON.parse(raw);
  }
  // Fallback minimal demo
  return [
    { type: "vless", host: "zoom.us", port: 443, cc: "ID", id: "8b1e...uuidv4", tls: true },
    { type: "trojan", host: "cdn.cloudflare.com", port: 443, cc: "SG", password: "pass", tls: true },
    { type: "ss", host: "example.com", port: 80, cc: "JP", method: "aes-256-gcm", password: "p" },
  ];
}

function parseProxyBank(text) {
  // Terima plain text atau json sederhana
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : [];
  } catch {
    return text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(parseLineToNode)
      .filter(Boolean);
  }
}

function parseLineToNode(line) {
  // Implementasi ringan: deteksi schema vless:// trojan:// ss://
  // Kamu bisa perkuat parser sesuai kebutuhan
  if (line.startsWith("vless://")) {
    // parse vless URI -> object
    return { type: "vless", host: "example", port: 443, cc: "ID", id: "uuid" };
  }
  if (line.startsWith("trojan://")) {
    return { type: "trojan", host: "example", port: 443, cc: "SG", password: "xxx" };
  }
  if (line.startsWith("ss://")) {
    return { type: "ss", host: "example", port: 80, cc: "JP", method: "aes-256-gcm", password: "xxx" };
  }
  return null;
}

function parseQuery(sp) {
  return {
    format: sp.get("format"),
    cc: (sp.get("cc") || "").split(",").filter(Boolean),
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

function formatSubscription(list, format) {
  if (format === "clash") {
    // contoh sangat minimal: hanya nodes -> proxies
    const proxies = list.map(n => {
      if (n.type === "vless") {
        return {
          name: `${n.cc}-vless-${n.host}`,
          type: "vless",
          server: n.host,
          port: n.port,
          uuid: n.id,
          tls: !!n.tls,
        };
      }
      if (n.type === "trojan") {
        return {
          name: `${n.cc}-trojan-${n.host}`,
          type: "trojan",
          server: n.host,
          port: n.port,
          password: n.password,
          sni: n.sni || n.host,
        };
      }
      if (n.type === "ss") {
        return {
          name: `${n.cc}-ss-${n.host}`,
          type: "ss",
          server: n.host,
          port: n.port,
          cipher: n.method,
          password: n.password,
        };
      }
      return null;
    }).filter(Boolean);
    return `proxies:\n${proxies.map(p => `  - ${JSON.stringify(p)}`).join("\n")}\n`;
  }
  // default raw (baris per node)
  return list.map(n => `${n.type} ${n.host}:${n.port} ${n.cc}`).join("\n");
}

function renderList(list, page) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Daftar — Selat</title>
<style>body{font-family:system-ui;background:#0b0f14;color:#e6edf3;margin:2rem}table{width:100%;border-collapse:collapse}
td,th{border:1px solid #1f2328;padding:.5rem}</style></head><body>
<h2>Halaman ${page}</h2>
<table><thead><tr><th>Tipe</th><th>Host</th><th>Port</th><th>CC</th></tr></thead><tbody>
${list.map(n => `<tr><td>${n.type}</td><td>${n.host}</td><td>${n.port}</td><td>${n.cc || "-"}</td></tr>`).join("")}
</tbody></table>
</body></html>`;
}
