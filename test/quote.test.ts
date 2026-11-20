import { expect, test } from 'bun:test'

import { chartSvg, weekSvg } from '../hooks/chart'
import { isFresh, isTradingHours, nextOpen, opensNote, quoteAddress, readQuote, readWeek } from '../hooks/quote'

const answer = (minutes: (number | null)[], close: { chartPreviousClose?: number } = {}) =>
  JSON.stringify({
    chart: {
      result: [{ meta: { symbol: 'ANT', regularMarketPrice: 97.17, ...close }, indicators: { quote: [{ open: [null, 83, 84.1], close: minutes }] } }],
      error: null,
    },
  })

test('measures against yesterday close, and takes the last minute as the price now, after-hours too', () => {
  expect(readQuote(answer([null, 83.5, 90.25, null, 94.9], { chartPreviousClose: 81.2 }))).toEqual({
    symbol: 'ANT',
    base: 81.2,
    baseLabel: 'prev close',
    price: 94.9,
    points: [83.5, 90.25, 94.9],
  })
})

test('measures against today first price when there is no close yet', () => {
  expect(readQuote(answer([83.5]))).toMatchObject({ base: 83, baseLabel: 'open' })
})

test('gives nothing for an answer with no prices or one that is not a chart', () => {
  expect(readQuote(answer([null, null]))).toBeUndefined()
  expect(readQuote('{"chart":{"result":null,"error":{"code":"Not Found"}}}')).toBeUndefined()
  expect(readQuote('<html>Too Many Requests</html>')).toBeUndefined()
})

test('asks for one day in one-minute steps, pre-market and after-hours included', () => {
  expect(quoteAddress('ANT')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/ANT?interval=1m&range=1d&includePrePost=true')
})

test('draws one smooth curve through every minute and writes both numbers', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'prev close', base: 83, price: 98.7, points: [83.5, 90.25, 97.1, 98.7] })
  const curve = picture.match(/<path id="line" d="(M[^"]+)"/)?.[1] ?? ''

  expect(curve.match(/C/g)?.length).toBe(3)
  expect(picture).toContain('prev close 83.00')
  expect(picture).toContain('ANT 98.70')
  expect(picture).toContain('fill="#3f9d6e" fill-opacity=".75">ANT 98.70')
})

test('ends the curve at the price now, unsmoothed', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'open', base: 80, price: 100, points: [80, 100, 90, 100] })

  expect(picture).toMatch(/<path id="line" d="M[^"]+ 935\.0 340\.0"/)
})

test('colors the price red below the open and keeps it clear of the open label', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'open', base: 83, price: 82.9, points: [83, 95, 82.9] })

  expect(picture).toContain('fill="#e8652e" fill-opacity=".75">ANT 82.90')
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

test('trades from 4 am to 8 pm New York time on weekdays', () => {
  expect(isTradingHours(Date.parse('2026-11-19T08:59:00Z'))).toBe(false)
  expect(isTradingHours(Date.parse('2026-11-19T09:00:00Z'))).toBe(true)
  expect(isTradingHours(Date.parse('2026-11-20T00:59:00Z'))).toBe(true)
  expect(isTradingHours(Date.parse('2026-11-20T01:00:00Z'))).toBe(false)
  expect(isTradingHours(Date.parse('2026-11-21T15:00:00Z'))).toBe(false)
})

test('splits the week into days by New York date, each starting at its open', () => {
  const thursdayClose = Date.parse('2026-11-19T20:45:00Z') / 1000
  const fridayOpen = Date.parse('2026-11-20T14:30:00Z') / 1000
  const text = JSON.stringify({
    chart: { result: [{ meta: { symbol: 'ANT' }, timestamp: [thursdayClose, fridayOpen, fridayOpen + 900], indicators: { quote: [{ open: [96.8, null, 94.1], close: [97.1, null, 95.2] }] } }] },
  })

  expect(readWeek(text)).toEqual({ symbol: 'ANT', days: [[96.8, 97.1], [94.1, 95.2]] })
})

test('says when trading opens again', () => {
  expect(opensNote(Date.parse('2026-11-21T02:00:00Z'))).toBe('closed · opens Mon 4:00 am')
  expect(opensNote(Date.parse('2026-11-20T02:00:00Z'))).toBe('closed · opens Fri 4:00 am')
})

test('draws the week as one line with a mark between each day, and the note', () => {
  const picture = weekSvg({ symbol: 'ANT', days: [[90, 91], [92, 93], [94, 95]] }, 'closed · opens Mon 4:00 am')

  expect(picture.match(/V\d/g)?.length).toBe(2)
  expect(picture).toContain('>closed · opens Mon 4:00 am</text>')
})

test('joins one day to the next with a straight stroke, so the overnight jump shows', () => {
  const picture = weekSvg({ symbol: 'ANT', days: [[90, 91, 92], [99, 98, 97]] }, '')
  const line = picture.match(/<path d="(M[^"]+)" fill="none"/)?.[1] ?? ''

  expect(line.match(/L/g)?.length).toBe(1)
})

test('grays out the day after the close and says when trading opens', () => {
  const picture = chartSvg({ symbol: 'ANT', baseLabel: 'prev close', base: 83, price: 98.7, points: [83.5, 98.7] }, 'closed · opens Fri 4:00 am')

  expect(picture).not.toContain('#3f9d6e')
  expect(picture).toContain('>closed · opens Fri 4:00 am</text>')
})

test('opens again the next morning on a weeknight, and after the weekend on Friday night', () => {
  const hours = (from: string) => (nextOpen(Date.parse(from)) - Date.parse(from)) / 3_600_000

  expect(hours('2026-11-20T01:30:00Z')).toBeLessThan(12)
  expect(hours('2026-11-21T01:30:00Z')).toBeGreaterThan(12)
})

test('a full extended day stays under the app limit of 131,072 characters', () => {
  const points = Array.from({ length: 960 }, (_, index) => 100 + Math.sin(index / 7) * 3 + (index % 5) * 0.37)
  const svg = chartSvg({ symbol: 'ANT', base: 100, baseLabel: 'prev close', price: points.at(-1)!, points }, 'closed · opens Mon 4:00 am')

  expect(svg.length).toBeLessThan(131_072)
  expect(svg.match(/ d="M/g)?.length).toBe(2)
})
