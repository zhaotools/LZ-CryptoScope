import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { universe } from "../data/universe.mjs";
import { rankAssets, returnsFromHistory, normalizedSeries, utcDay, periodStart } from "./market-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = name => readFile(join(root, "data", name), "utf8").then(JSON.parse);
const [daily, news, archive] = await Promise.all([read("daily.json"), read("news.json"), read("archive-2026-09-28.json")]);

assert.equal(new Set(universe.map(item => item.symbol)).size, universe.length, "duplicate universe symbol");
assert.equal(new Set(universe.map(item => item.pair)).size, universe.length, "duplicate spot pair");
assert.equal(daily.coverage.universe, universe.length);
assert.equal(daily.assets.length, universe.length);
assert.match(daily.asOf, /^\d{4}-\d{2}-\d{2}$/);

const endDay = Date.parse(`${daily.asOf}T00:00:00Z`);
for (const asset of daily.assets) {
  assert.equal(asset.pair, `${asset.symbol}USDT`, `${asset.symbol}: unexpected pair`);
  assert.equal(new Set(asset.history.map(([date]) => date)).size, asset.history.length, `${asset.symbol}: duplicate UTC day`);
  assert.ok(asset.history.every(([, close]) => Number.isFinite(close) && close > 0), `${asset.symbol}: bad close`);
  assert.ok(asset.history.every(([date]) => date <= daily.asOf), `${asset.symbol}: future candle`);
  const calculated = returnsFromHistory(asset.history, endDay);
  for (const period of ["d30", "d90", "ytd"]) {
    if (calculated[period] === null) assert.equal(asset.returns[period], null);
    else assert.ok(Math.abs(asset.returns[period] - calculated[period]) < 1e-8, `${asset.symbol}: ${period} mismatch`);
  }
}

for (const period of ["d30", "d90", "ytd"]) {
  const expected = rankAssets(daily.assets, period);
  assert.deepEqual(daily.rankings[period], expected, `${period}: rank order mismatch`);
  assert.equal(expected.length, 10, `${period}: expected ten assets`);
  assert.equal(new Set(expected.map(row => row.symbol)).size, 10, `${period}: duplicate winner`);
  for (const row of expected) {
    const asset = daily.assets.find(item => item.symbol === row.symbol);
    const series = normalizedSeries(asset.history, period, endDay);
    assert.equal(series[0][0], utcDay(periodStart(endDay, period)));
    assert.ok(Math.abs(series.at(-1)[1] - row.returnPct) < 1e-8, `${period}: chart endpoint mismatch`);
  }
}
for (const benchmark of ["BTC", "ETH"]) assert.equal(daily.benchmarks[benchmark].at(-1)[0], daily.asOf);

assert.ok(news.issues.length >= 1, "no daily news issue");
assert.equal(new Set(news.issues.map(issue => issue.date)).size, news.issues.length, "duplicate news day");
for (const issue of news.issues) {
  assert.match(issue.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(issue.sourceStatus.some(source => source.ok), `${issue.date}: no healthy news sources`);
  for (const item of issue.items) {
    assert.equal(new URL(item.url).protocol, "https:");
    assert.ok(item.title && item.source && item.symbols.length, "incomplete news item");
  }
}

assert.equal(archive.asOf, "2026-09-28");
assert.deepEqual(archive.sections.map(section => section.items.length), [10, 10, 10]);
const archiveUnion = new Set(archive.sections.flatMap(section => section.items.map(item => item.symbol)));
assert.equal(archiveUnion.size, 14);

const index = await readFile(join(root, "index.html"), "utf8");
assert.ok(index.includes(`data-static-snapshot="${daily.asOf}"`), "published HTML is behind market snapshot");
assert.ok(index.includes(`${news.issues[0].date.replaceAll("-", ".")} · ${news.issues[0].items.length} 条`), "published HTML is behind news snapshot");
assert.equal((index.match(/class="rank-static-link"/g) || []).length, 30, "static page must contain all three Top 10s");
for (const asset of daily.assets) {
  const detail = await readFile(join(root, "projects", `${asset.symbol}.html`), "utf8");
  assert.ok(detail.includes(`${asset.name}（${asset.symbol}）项目资料`), `${asset.symbol}: missing project page`);
}
for (const issue of news.issues) {
  const page = await readFile(join(root, "news", `${issue.date}.html`), "utf8");
  assert.ok(page.includes(`${issue.date} 每日新闻`), `${issue.date}: missing news page`);
}
console.log(`Checks passed: ${daily.assets.length} assets, three Top 10s, ${news.issues.length} news issues, generated pages, legacy archive.`);
