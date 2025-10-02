async function main() {
  const {
    PROXY_BANK_URL,
    CF_API_TOKEN,
    CF_ACCOUNT_ID,
    CF_NAMESPACE_ID,
  } = process.env;

  if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_NAMESPACE_ID) {
    console.log("Missing Cloudflare credentials; aborting.");
    process.exit(0);
  }

  let list = [];
  if (PROXY_BANK_URL) {
    const res = await fetch(PROXY_BANK_URL);
    const text = await res.text();
    list = parseProxyBank(text);
  } else {
    // fallback ke file lokal jika tidak ada sumber
    const text = fs.readFileSync("./data/proxyList.txt", "utf-8");
    list = parseProxyBank(text);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/proxyList`;
  const put = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(list),
  });

  const out = await put.json();
  console.log("KV update status:", out.success ? "success" : "failed", out);
}

function parseProxyBank(text) {
  // Minimal parser: mirip worker
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : [];
  } catch {
    return text
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .map(line => {
        if (line.startsWith("vless://")) {
          const noSchema = line.replace("vless://", "");
          const [userHost, rest] = noSchema.split("?");
          const [uuid, hostPort] = userHost.split("@");
          const [host, port] = hostPort.split(":");
          const params = new URLSearchParams(rest || "");
          return {
            type: "vless",
            host,
            port: Number(port),
            id: uuid,
            tls: (params.get("security") || "").toLowerCase() === "tls",
            sni: params.get("sni") || host,
          };
        }
        if (line.startsWith("trojan://")) {
          const noSchema = line.replace("trojan://", "");
          const [userHost, rest] = noSchema.split("?");
          const [password, hostPort] = userHost.split("@");
          const [host, port] = hostPort.split(":");
          const params = new URLSearchParams(rest || "");
          return {
            type: "trojan",
            host,
            port: Number(port),
            password,
            tls: true,
            sni: params.get("sni") || host,
          };
        }
        if (line.startsWith("ss://")) {
          const noSchema = line.replace("ss://", "");
          if (noSchema.includes("@")) {
            const [methodPass, hostPort] = noSchema.split("@");
            const [method, password] = methodPass.split(":");
            const [host, portAndTag] = hostPort.split(":");
            const port = portAndTag.split("#")[0];
            return {
              type: "ss",
              host,
              port: Number(port),
              method,
              password,
            };
          }
        }
        return null;
      })
      .filter(Boolean);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


