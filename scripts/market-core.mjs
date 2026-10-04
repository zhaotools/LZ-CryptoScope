export const DAY_MS = 86_400_000;

export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function priorCompleteUtcDay(now = Date.now()) {
  const today = new Date(now);
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1);
}

export function periodStart(endDay, period) {
  if (period === "d30") return endDay - 30 * DAY_MS;
  if (period === "d90") return endDay - 90 * DAY_MS;
  if (period === "ytd") return Date.UTC(new Date(endDay).getUTCFullYear() - 1, 11, 31);
  throw new Error(`Unknown period: ${period}`);
}

export function returnsFromHistory(history, endDay) {
  const byDate = new Map(history.map(([date, close]) => [date, close]));
  const endPrice = byDate.get(utcDay(endDay));
  if (!Number.isFinite(endPrice) || endPrice <= 0) return { d30: null, d90: null, ytd: null };
  return Object.fromEntries(["d30", "d90", "ytd"].map(period => {
    const base = byDate.get(utcDay(periodStart(endDay, period)));
    return [period, Number.isFinite(base) && base > 0 ? (endPrice / base - 1) * 100 : null];
  }));
}

export function rankAssets(assets, period) {
  return assets
    .filter(asset => Number.isFinite(asset.returns?.[period]))
    .sort((a, b) => b.returns[period] - a.returns[period] || a.symbol.localeCompare(b.symbol))
    .slice(0, 10)
    .map((asset, index) => ({ symbol: asset.symbol, rank: index + 1, returnPct: asset.returns[period] }));
}

export function normalizedSeries(history, period, endDay) {
  const start = utcDay(periodStart(endDay, period));
  const end = utcDay(endDay);
  const subset = history.filter(([date]) => date >= start && date <= end);
  if (subset.length < 2 || subset[0][0] !== start || subset.at(-1)[0] !== end) return [];
  const base = subset[0][1];
  return subset.map(([date, price]) => [date, (price / base - 1) * 100]);
}
