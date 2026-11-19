// Reads one day's prices for one stock, pre-market and after-hours included, and yesterday's close, out of the
// answer Yahoo Finance's chart address gives.

export type Quote = {
  symbol: string
  /** What today is measured against: yesterday's close, or today's first price when there is no close yet. */
  base: number
  baseLabel: 'prev close' | 'open'
  /** The latest price. */
  price: number
  /** The day's prices in order, one a minute from the pre-market on, ending with the latest. */
  points: number[]
}

type YahooChart = {
  chart?: {
    result?: {
      meta?: { symbol?: string; chartPreviousClose?: number; previousClose?: number }
      indicators?: { quote?: { open?: (number | null)[]; close?: (number | null)[] }[] }
    }[]
  }
}

const isPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function quoteAddress(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`
}

/** Gives the day's quote, or nothing when the answer is not a chart with prices in it. */
export function readQuote(text: string): Quote | undefined {
  let answer: YahooChart

  try {
    answer = JSON.parse(text) as YahooChart
  } catch {
    return undefined
  }

  const result = answer.chart?.result?.[0]
  const minutes = result?.indicators?.quote?.[0]
  const closes = (minutes?.close ?? []).filter(isPrice)
  const open = (minutes?.open ?? []).find(isPrice)
  // The last minute is still forming, so its close is the price now, in and out of regular hours.
  const price = closes.at(-1)
  const symbol = result?.meta?.symbol

  if (symbol === undefined || open === undefined || price === undefined) {
    return undefined
  }

  const close = [result?.meta?.chartPreviousClose, result?.meta?.previousClose].find(isPrice)
  const base = close === undefined ? { base: open, baseLabel: 'open' as const } : { base: close, baseLabel: 'prev close' as const }

  return { symbol, ...base, price, points: closes }
}

/** What one session saves for the others: the quote and when it was fetched. */
export type SavedQuote = { at: number; quote: Quote }

/** True when a saved quote is the right stock and recent enough to use instead of fetching again. */
export function isFresh(saved: unknown, symbol: string, now: number, maxAgeMs: number): saved is SavedQuote {
  const entry = saved as Partial<SavedQuote> | undefined

  return typeof entry?.at === 'number' && entry.quote?.symbol === symbol && now - entry.at < maxAgeMs
}

/** True from 4 am to 8 pm New York time on weekdays: the pre-market, the regular session and after-hours. */
export function isTradingHours(now: number): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now)
  const weekday = parts.find(part => part.type === 'weekday')?.value
  const hour = Number(parts.find(part => part.type === 'hour')?.value)

  return weekday !== 'Sat' && weekday !== 'Sun' && hour >= 4 && hour < 20
}
