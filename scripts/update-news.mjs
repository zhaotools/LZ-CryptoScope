import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { newsSources } from "../data/news-sources.mjs";
import { parseFeed, classifyTitle, safeOriginalUrl } from "./news-core.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "data", "news.json");
const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
let previous = { schemaVersion: 1, issues: [] };
try { previous = JSON.parse(await readFile(OUT, "utf8")); } catch { /* initial run */ }

const currentIssue = previous.issues.find(issue => issue.date === today);
const seen = new Set(previous.issues.filter(issue => issue.date !== today).flatMap(issue => issue.items.map(item => item.url)));
const mostRecentCheck = previous.issues[0]?.checkedAt ? Date.parse(previous.issues[0].checkedAt) : NaN;
const since = Number.isFinite(mostRecentCheck) ? Math.max(Date.now() - 7 * 86_400_000, mostRecentCheck - 6 * 3_600_000) : Date.now() - 72 * 3_600_000;
const status = [];
const proposed = [];

for (const source of newsSources) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers: { "user-agent": "LZ-CryptoScope/1.0 public research news monitor" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = source.kind === "github-releases"
      ? (await response.json()).filter(release => !release.draft && !release.prerelease).map(release => ({
          title: `${source.symbols[0]} · ${release.name || release.tag_name}`,
          url: release.html_url,
          publishedAt: release.published_at,
          category: "Release"
        }))
      : parseFeed(await response.text());
    if (!Array.isArray(items) || !items.length) throw new Error("empty or unsupported feed");
    status.push({ id: source.id, ok: true, itemsRead: items.length });
    for (const item of items) {
      const url = safeOriginalUrl(item.url, source.hosts);
      const date = Date.parse(item.publishedAt);
      if (!url || !item.title || !Number.isFinite(date) || date < since || date > Date.now() + 3_600_000 || seen.has(url)) continue;
      if (source.categories && !source.categories.includes(item.category)) continue;
      if (/daily digest|weekly digest|free api|debian|final report|about the .* category/i.test(item.title)) continue;
      const classification = classifyTitle(item.title);
      if (source.kind === "governance") {
        if (item.category === "Proposals" || item.category === "Security Council" || item.category === "Finalized AIPs") classification.weight = Math.max(classification.weight, 3);
        if (classification.weight < 2) continue;
      }
      if (source.kind === "github-releases") { classification.topic = "代码版本"; classification.weight = 2; }
      if (source.kind === "official-blog" && /how to|guide to|what is|explainer|tutorial/i.test(item.title)) continue;
      proposed.push({
        title: item.title,
        url,
        publishedAt: new Date(date).toISOString(),
        source: source.label,
        sourceType: source.kind,
        symbols: source.symbols,
        topic: classification.topic,
        weight: classification.weight
      });
    }
  } catch (error) {
    status.push({ id: source.id, ok: false, error: error.message });
    console.warn(`${source.id}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

if (!status.some(item => item.ok)) throw new Error("All news sources failed; previous issue preserved.");

const unique = [...new Map([...(currentIssue?.items || []), ...proposed].map(item => [item.url, item])).values()];
unique.sort((a, b) => b.weight - a.weight || b.publishedAt.localeCompare(a.publishedAt));
const issue = {
  date: today,
  checkedAt: now.toISOString(),
  sourceStatus: status,
  items: unique.slice(0, 12)
};
const issues = [issue, ...previous.issues.filter(old => old.date !== today)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90);
const output = { schemaVersion: 1, methodology: "Daily links from official project governance forums and release feeds. Original headlines only; no article body is copied.", issues };
const tmp = `${OUT}.tmp`;
await writeFile(tmp, `${JSON.stringify(output)}\n`, "utf8");
await rename(tmp, OUT);
console.log(`Saved ${today} news issue: ${issue.items.length} items; ${status.filter(item => item.ok).length}/${status.length} sources healthy`);
