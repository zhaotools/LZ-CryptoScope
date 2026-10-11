import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { universe } from "../data/universe.mjs";
import { rankAssets, returnsFromHistory, normalizedSeries, utcDay, periodStart } from "./market-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = name => readFile(join(root, "data", name), "utf8").then(JSON.parse);
const [daily, archive] = await Promise.all([read("daily.json"), read("archive-2026-09-28.json")]);

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

assert.equal(archive.asOf, "2026-09-28");
assert.deepEqual(archive.sections.map(section => section.items.length), [10, 10, 10]);
const archiveUnion = new Set(archive.sections.flatMap(section => section.items.map(item => item.symbol)));
assert.equal(archiveUnion.size, 14);

const index = await readFile(join(root, "index.html"), "utf8");
assert.ok(index.includes(`data-static-snapshot="${daily.asOf}"`), "published HTML is behind market snapshot");
assert.equal((index.match(/class="rank-static-name"/g) || []).length, 30, "static page must contain all three Top 10s");
assert.ok(index.indexOf('id="rankings"') < index.indexOf('id="method"'), "rankings must be the first content section");
for (const removed of ['class="hero"', 'id="projects"', 'id="news"', 'id="detail-view"']) {
  assert.ok(!index.includes(removed), `removed module still present: ${removed}`);
}
console.log(`Checks passed: ${daily.assets.length} assets, three Top 10s, ranking-first page, legacy archive.`);
