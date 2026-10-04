const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY[name.toLowerCase()] ?? match)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1]);
}

export function parseFeed(xml) {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => ({
    title: tag(match[1], "title"),
    url: tag(match[1], "link"),
    publishedAt: tag(match[1], "pubDate") || tag(match[1], "dc:date"),
    category: tag(match[1], "category"),
    author: tag(match[1], "dc:creator")
  }));
  if (items.length) return items;
  return [...String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(match => {
    const link = match[1].match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
    return {
      title: tag(match[1], "title"),
      url: decodeXml(link?.[1]),
      publishedAt: tag(match[1], "published") || tag(match[1], "updated")
    };
  });
}

export function classifyTitle(title) {
  if (/hack|exploit|attack|breach|security|vulnerability|incident/i.test(title)) return { topic: "安全事件", weight: 4 };
  if (/upgrade|hard fork|mainnet|release|version|migration|launch|deploy|rollout/i.test(title)) return { topic: "升级与产品", weight: 3 };
  if (/fee|revenue|buyback|burn|unlock|tokenomic|distribution/i.test(title)) return { topic: "代币经济", weight: 3 };
  if (/vote|proposal|governance|temperature check|snapshot|referendum/i.test(title)) return { topic: "治理进展", weight: 2 };
  if (/partner|integration|adoption|institution|funding|investment/i.test(title)) return { topic: "采用与合作", weight: 2 };
  return { topic: "项目动态", weight: 1 };
}

export function safeOriginalUrl(value, allowedHosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}
