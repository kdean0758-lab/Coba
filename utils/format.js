export function formatSubscription(list, format) {
  if (format === "clash") {
    const proxies = list.map(n => {
      if (n.type === "vless") {
        return {
          name: `${(n.cc || "XX")}-vless-${n.host}`,
          type: "vless",
          server: n.host,
          port: n.port,
          uuid: n.id,
          tls: !!n.tls,
          servername: n.sni || n.host,
        };
      }
      if (n.type === "trojan") {
        return {
          name: `${(n.cc || "XX")}-trojan-${n.host}`,
          type: "trojan",
          server: n.host,
          port: n.port,
          password: n.password,
          sni: n.sni || n.host,
        };
      }
      if (n.type === "ss") {
        return {
          name: `${(n.cc || "XX")}-ss-${n.host}`,
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
  return list.map(n => `${n.type} ${n.host}:${n.port} ${n.cc || "XX"}`).join("\n");
}
