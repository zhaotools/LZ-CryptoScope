import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { universe, universeVersion } from "../data/universe.mjs";
import { DAY_MS, priorCompleteUtcDay, returnsFromHistory, rankAssets, utcDay } from "./market-core.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "data", "daily.json");
const SPOT = "https://data-api.binance.vision";
const COINLORE = "https://api.coinlore.net/api/tickers/";
const LLAMA = "https://api.llama.fi";
const HYPERLIQUID = "https://api.hyperliquid.xyz/info";

async function json(url, timeout = 12_000, attempts = 2) {
  let last;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "LZ-CryptoScope/1.0 public research dashboard" } });
      if (!response.ok) throw new Error(`${response.status} ${new URL(url).host}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (i + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 400 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

async function optional(label, task) {
  try { return await task(); }
  catch (error) { console.warn(`${label}: ${error.message}`); return null; }
}

async function mapLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await work(items[i]); }
      catch (error) { console.warn(`${items[i].symbol}: ${error.message}`); results[i] = null; }
    }
  }));
  return results;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function coinLoreMatch(asset, rows) {
  const candidates = rows.filter(row => row.symbol?.toUpperCase() === asset.symbol);
  if (candidates.length === 1) return candidates[0];
  return candidates.find(row => normalizedName(row.name) === normalizedName(asset.name)) || null;
}

async function getCoinLore() {
  const pages = await Promise.all([0, 100, 200, 300, 400].map(start =>
    json(`${COINLORE}?start=${start}&limit=100`, 10_000)));
  return pages.flatMap(page => page.data || []);
}

async function getHistory(pair, startMs, endExclusive) {
  const url = `${SPOT}/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&startTime=${startMs}&endTime=${endExclusive}&limit=1000`;
  const rows = await json(url, 12_000);
  if (!Array.isArray(rows)) throw new Error("invalid spot history");
  return rows
    .filter(row => Number(row[6]) < endExclusive)
    .map(row => [utcDay(Number(row[0])), Number(row[4])])
    .filter(([, close]) => Number.isFinite(close) && close > 0);
}

async function getSpot24h() {
  const rows = await json(`${SPOT}/api/v3/ticker/24hr`, 16_000);
  return new Map(rows.map(row => [row.symbol, row]));
}

function indexLlamaFees(overview) {
  return new Map((overview?.protocols || []).map(row => [row.module, row]));
}

async function getDerivatives(assets) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(HYPERLIQUID, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "LZ-CryptoScope/1.0 public research dashboard" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const [metadata, contexts] = await response.json();
    if (!Array.isArray(metadata?.universe) || !Array.isArray(contexts)) throw new Error("invalid perp metadata");
    const byName = new Map(metadata.universe.map((coin, index) => [coin.name, contexts[index]]));
    const observedAt = new Date().toISOString();
    return new Map(assets.map(asset => {
      const row = byName.get(asset.symbol);
      if (!row) return null;
      const units = numeric(row.openInterest);
      const mark = numeric(row.markPx);
      const funding = Number(row.funding);
      return [asset.symbol, {
        exchange: "Hyperliquid Perps",
        pair: asset.symbol,
        openInterestUnits: units,
        openInterestUsd: units !== null && mark !== null ? units * mark : null,
        fundingRatePct: Number.isFinite(funding) ? funding * 100 : null,
        volume24hUsd: numeric(row.dayNtlVlm),
        observedAt
      }];
    }).filter(Boolean));
  } finally {
    clearTimeout(timer);
  }
}

const endDay = priorCompleteUtcDay();
const endExclusive = endDay + DAY_MS;
const startMs = Date.UTC(new Date(endDay).getUTCFullYear() - 1, 11, 31);
const allAssets = [...universe, { symbol: "BTC", pair: "BTCUSDT" }, { symbol: "ETH", pair: "ETHUSDT" }];
console.log(`Fetching ${allAssets.length} spot histories through ${utcDay(endDay)} UTC`);

const [histories, spot, coinLore, protocols, fees, revenue] = await Promise.all([
  mapLimited(allAssets, 7, async asset => ({ symbol: asset.symbol, history: await getHistory(asset.pair, startMs, endExclusive) })),
  optional("Binance 24h spot", getSpot24h),
  optional("CoinLore market cap", getCoinLore),
  optional("DefiLlama TVL", () => json(`${LLAMA}/protocols`, 22_000)),
  optional("DefiLlama fees", () => json(`${LLAMA}/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, 22_000)),
  optional("DefiLlama revenue", () => json(`${LLAMA}/overview/fees?dataType=dailyRevenue&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, 22_000))
]);

const historiesBySymbol = new Map(histories.filter(Boolean).map(item => [item.symbol, item.history]));
const protocolMap = new Map((protocols || []).map(row => [row.slug, row]));
const feesMap = indexLlamaFees(fees);
const revenueMap = indexLlamaFees(revenue);
const derivativeMap = await optional("Hyperliquid perpetuals", () => getDerivatives(universe)) || new Map();
const missing = [];
const assets = universe.map(asset => {
  const history = historiesBySymbol.get(asset.symbol) || [];
  if (history.at(-1)?.[0] !== utcDay(endDay)) missing.push(asset.symbol);
  const lore = coinLore ? coinLoreMatch(asset, coinLore) : null;
  const spotRow = spot?.get(asset.pair);
  const metrics = asset.llamaSlugs.map(slug => ({
    tvl: numeric(protocolMap.get(slug)?.tvl),
    fees30d: numeric(feesMap.get(slug)?.total30d),
    revenue30d: numeric(revenueMap.get(slug)?.total30d)
  }));
  const sumOrNull = key => {
    const values = metrics.map(row => row[key]).filter(value => value !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const supply = numeric(lore?.msupply);
  const lorePrice = numeric(lore?.price_usd);
  return {
    ...asset,
    history,
    returns: returnsFromHistory(history, endDay),
    market: {
      priceUsd: lorePrice,
      marketCapUsd: numeric(lore?.market_cap_usd),
      fdvUsd: lorePrice !== null && supply !== null && supply > 0 ? lorePrice * supply : null,
      circulatingSupply: numeric(lore?.csupply),
      maxSupply: supply,
      source: lore ? "CoinLore" : null,
      observedAt: lore ? new Date().toISOString() : null
    },
    spot: {
      exchange: "Binance Spot",
      pair: asset.pair,
      volume24hUsdt: numeric(spotRow?.quoteVolume),
      observedAt: spotRow?.closeTime ? new Date(Number(spotRow.closeTime)).toISOString() : null
    },
    derivatives: derivativeMap.get(asset.symbol) || null,
    fundamentals: {
      tvlUsd: sumOrNull("tvl"),
      fees30dUsd: sumOrNull("fees30d"),
      revenue30dUsd: sumOrNull("revenue30d"),
      scope: asset.llamaSlugs,
      source: asset.llamaSlugs.length ? "DefiLlama" : null,
      observedAt: asset.llamaSlugs.length && protocols ? new Date().toISOString() : null
    }
  };
});

const eligible = assets.filter(asset => asset.history.at(-1)?.[0] === utcDay(endDay));
if (eligible.length < Math.ceil(universe.length * 0.8)) {
  throw new Error(`Only ${eligible.length}/${universe.length} assets have a current completed daily candle; previous snapshot preserved.`);
}

const benchmarks = Object.fromEntries(["BTC", "ETH"].map(symbol => [symbol, historiesBySymbol.get(symbol) || []]));
if (Object.values(benchmarks).some(rows => rows.at(-1)?.[0] !== utcDay(endDay))) {
  throw new Error("BTC or ETH benchmark is incomplete; previous snapshot preserved.");
}

const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  asOf: utcDay(endDay),
  universeVersion,
  methodology: {
    price: "Binance Spot USDT pairs, completed UTC daily close",
    periods: { d30: "30 complete UTC days", d90: "90 complete UTC days", ytd: "prior 31 December UTC close to latest completed UTC close" },
    formula: "(end close / start close - 1) × 100",
    ranking: "Top 10 by return among research-universe assets with both required daily closes"
  },
  coverage: { universe: universe.length, currentHistory: eligible.length, missing },
  rankings: Object.fromEntries(["d30", "d90", "ytd"].map(period => [period, rankAssets(eligible, period)])),
  benchmarks,
  assets
};

const tmp = `${OUT}.tmp`;
await writeFile(tmp, `${JSON.stringify(snapshot)}\n`, "utf8");
await rename(tmp, OUT);
console.log(`Saved ${OUT}: ${eligible.length} current assets; top 10s ${Object.values(snapshot.rankings).map(rows => rows.length).join("/")}`);
