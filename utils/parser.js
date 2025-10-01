export function parseProxyBank(text) {
  // Coba JSON dulu
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? normalizeArray(j) : [];
  } catch {
    // Plain text baris: vless://..., trojan://..., ss://...
    return text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(parseLineToNode)
      .filter(Boolean);
  }
}

function normalizeArray(arr) {
  return arr
    .map(x => ({
      type: x.type,
      host: x.host,
      port: Number(x.port),
      cc: (x.cc || "").toUpperCase(),
      id: x.id,
      password: x.password,
      method: x.method,
      tls: !!x.tls,
      sni: x.sni,
    }))
    .filter(x => x.type && x.host && x.port);
}

function parseLineToNode(line) {
  if (line.startsWith("vless://")) return parseVless(line);
  if (line.startsWith("trojan://")) return parseTrojan(line);
  if (line.startsWith("ss://")) return parseSs(line);
  return null;
}

function parseVless(uri) {
  // vless://UUID@host:port?security=tls&sni=domain#name
  try {
    const noSchema = uri.replace("vless://", "");
    const [userHost, rest] = noSchema.split("?");
    const [user, hostPort] = userHost.split("@");
    const [host, port] = hostPort.split(":");
    const params = new URLSearchParams(rest || "");
    return {
      type: "vless",
      host,
      port: Number(port),
      id: user,
      tls: (params.get("security") || "").toLowerCase() === "tls",
      sni: params.get("sni") || host,
    };
  } catch {
    return null;
  }
}

function parseTrojan(uri) {
  // trojan://password@host:port?sni=domain#name
  try {
    const noSchema = uri.replace("trojan://", "");
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
  } catch {
    return null;
  }
}

function parseSs(uri) {
  // ss://method:password@host:port#name or base64 variant (disederhanakan)
  try {
    const noSchema = uri.replace("ss://", "");
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
    // TODO: dukung base64 jika diperlukan
    return null;
  } catch {
    return null;
  }
}
