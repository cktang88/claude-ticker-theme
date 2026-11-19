import { expect, test } from 'bun:test'

import { chartSvg } from '../hooks/chart'
import { quoteAddress, readQuote } from '../hooks/quote'

const answer = (close: (number | null)[], price: number) =>
  JSON.stringify({
    chart: {
      result: [{ meta: { symbol: 'ANT', regularMarketPrice: price }, indicators: { quote: [{ open: [null, 83, 84.1], close }] } }],
      error: null,
    },
  })

test('reads the open, the price now and the minutes in order, skipping empty minutes', () => {
  expect(readQuote(answer([null, 83.5, 90.25, null, 97.1], 98.695))).toEqual({ symbol: 'ANT', open: 83, price: 98.695, points: [83.5, 90.25, 97.1, 98.695] })
})

test('gives nothing for an answer with no prices or one that is not a chart', () => {
  expect(readQuote(answer([null, null], 98.7))).toBeUndefined()
  expect(readQuote('{"chart":{"result":null,"error":{"code":"Not Found"}}}')).toBeUndefined()
  expect(readQuote('<html>Too Many Requests</html>')).toBeUndefined()
})

test('asks for one day in one-minute steps', () => {
  expect(quoteAddress('ANT')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/ANT?interval=1m&range=1d')
})

test('draws one line piece per minute and writes both numbers', () => {
  const picture = chartSvg({ symbol: 'ANT', open: 83, price: 98.7, points: [83.5, 90.25, 97.1, 98.7] })

  expect(picture.match(/<line x1="[\d.]+%"/g)?.length).toBe(3)
  expect(picture).toContain('open 83.00')
  expect(picture).toContain('ANT 98.70')
  expect(picture).toContain('#167a48')
})

test('colors the price red below the open and keeps it clear of the open label', () => {
  const picture = chartSvg({ symbol: 'ANT', open: 83, price: 82.9, points: [83, 84, 82.9] })

  expect(picture).toContain('#b3392f')
  // The open sits at 63.09% and the price's own place (66%) is under 4.5 away, so the price is written 4.5 below the open.
  expect(picture).toMatch(/y="63\.09%" dy="-7"[^>]*>open 83\.00/)
  expect(picture).toMatch(/y="67\.59%" dy="5"[^>]*>ANT 82\.90/)
})

test('draws an empty white page before the first price arrives', () => {
  expect(chartSvg(undefined)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="#fff"/></svg>')
})
