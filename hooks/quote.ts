// Reads one day's prices for one stock out of the answer Yahoo Finance's chart address gives.

export type Quote = {
  symbol: string
  /** The first price of the day. */
  open: number
  /** The latest price. */
  price: number
  /** The day's prices in order, one a minute, ending with the latest. */
  points: number[]
}

type YahooChart = {
  chart?: {
    result?: {
      meta?: { symbol?: string; regularMarketPrice?: number }
      indicators?: { quote?: { open?: (number | null)[]; close?: (number | null)[] }[] }
    }[]
  }
}

const isPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function quoteAddress(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
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
  const price = result?.meta?.regularMarketPrice
  const symbol = result?.meta?.symbol

  if (symbol === undefined || open === undefined || !isPrice(price) || closes.length === 0) {
    return undefined
  }

  return { symbol, open, price, points: [...closes, price] }
}
