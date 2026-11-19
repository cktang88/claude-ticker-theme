import { expect, test } from 'bun:test'

import { chartSvg } from '../hooks/chart'
import { isFresh, quoteAddress, readQuote } from '../hooks/quote'

const answer = (minutes: (number | null)[], price: number, close: { chartPreviousClose?: number } = {}) =>
  JSON.stringify({
    chart: {
      result: [{ meta: { symbol: 'ANT', regularMarketPrice: price, ...close }, indicators: { quote: [{ open: [null, 83, 84.1], close: minutes }] } }],
      error: null,
    },
  })

test('measures against yesterday close, and reads the price now and the minutes in order', () => {
  expect(readQuote(answer([null, 83.5, 90.25, null, 97.1], 98.695, { chartPreviousClose: 81.2 }))).toEqual({
    symbol: 'ANT',
    base: 81.2,
    baseLabel: 'prev close',
    price: 98.695,
    points: [83.5, 90.25, 97.1, 98.695],
  })
})

test('measures against today first price when there is no close yet', () => {
  expect(readQuote(answer([83.5], 84))).toMatchObject({ base: 83, baseLabel: 'open' })
})

test('gives nothing for an answer with no prices or one that is not a chart', () => {
  expect(readQuote(answer([null, null], 98.7))).toBeUndefined()
  expect(readQuote('{"chart":{"result":null,"error":{"code":"Not Found"}}}')).toBeUndefined()
  expect(readQuote('<html>Too Many Requests</html>')).toBeUndefined()
})

test('asks for one day in one-minute steps', () => {
  expect(quoteAddress('ANT')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/ANT?interval=1m&range=1d')
})

test('draws one smooth curve through every minute and writes both numbers', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'prev close', base: 83, price: 98.7, points: [83.5, 90.25, 97.1, 98.7] })
  const curve = picture.match(/<path d="(M[^"]+)" fill="none"/)?.[1] ?? ''

  expect(curve.match(/C/g)?.length).toBe(3)
  expect(picture).toContain('prev close 83.00')
  expect(picture).toContain('ANT 98.70')
  expect(picture).toContain('fill="#3f9d6e" fill-opacity=".75">ANT 98.70')
})

test('ends the curve at the price now, unsmoothed', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'open', base: 80, price: 100, points: [80, 100, 90, 100] })

  expect(picture).toMatch(/<path d="M[^"]+ 935\.0 340\.0" fill="none"/)
})

test('colors the price red below the open and keeps it clear of the open label', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'open', base: 83, price: 82.9, points: [83, 95, 82.9] })

  expect(picture).toContain('fill="#cf6a5e" fill-opacity=".75">ANT 82.90')
  const openAt = Number(picture.match(/y="([\d.]+)%" dy="-8"/)?.[1])
  const priceAt = Number(picture.match(/y="([\d.]+)%" dy="5"/)?.[1])

  expect(priceAt - openAt).toBeCloseTo(4.5, 1)
})

test('draws an empty white page before the first price arrives', () => {
  expect(chartSvg(undefined)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="#fff"/></svg>')
})

test('uses a quote another session saved only while it is recent and for the same stock', () => {
  const quote = { symbol: 'ANT', base: 83, baseLabel: 'prev close' as const, price: 95, points: [95] }

  expect(isFresh({ at: 1000, quote }, 'ANT', 9000, 9000)).toBe(true)
  expect(isFresh({ at: 1000, quote }, 'ANT', 10_000, 9000)).toBe(false)
  expect(isFresh({ at: 1000, quote }, 'AAPL', 2000, 9000)).toBe(false)
  expect(isFresh(undefined, 'ANT', 2000, 9000)).toBe(false)
})
