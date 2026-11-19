// The picture: a white page, the day's price as one jagged line, a dotted line at the day's opening price, and
// two numbers at the right (the open and the price now). Every place is a share of the window, so it fits any
// window without stretching the line's thickness.

import type { Quote } from './quote'

const LINE = { left: 0, right: 88, top: 34, bottom: 66 } as const
const INK = '#1a1a1a'
const QUIET = '#9a9a9a'
const UP = '#167a48'
const DOWN = '#b3392f'
const LETTERS = 'font-family="ui-monospace, SF Mono, Menlo, monospace"'
/** Closer than this (in shares of the window's height), the two numbers would sit on top of each other. */
const CLEAR = 4.5

const share = (value: number) => `${value.toFixed(2)}%`

export function chartSvg(quote: Quote | undefined): string {
  const page = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="#fff"/>'

  if (quote === undefined) {
    return `${page}</svg>`
  }

  const low = Math.min(quote.open, ...quote.points)
  const high = Math.max(quote.open, ...quote.points)
  const span = high - low || 1
  const down = (price: number) => LINE.bottom - ((price - low) / span) * (LINE.bottom - LINE.top)
  const across = (index: number) => LINE.left + (index / Math.max(1, quote.points.length - 1)) * (LINE.right - LINE.left)
  let line = ''

  for (let index = 1; index < quote.points.length; index += 1) {
    line += `<line x1="${share(across(index - 1))}" y1="${share(down(quote.points[index - 1]!))}" x2="${share(across(index))}" y2="${share(down(quote.points[index]!))}"/>`
  }

  const openAt = down(quote.open)
  const tipAt = down(quote.price)
  const isUp = quote.price >= quote.open
  // The price is written beside the line's end. When that is too near the open's label, it moves away from it.
  const gap = tipAt - openAt
  const priceAt = Math.abs(gap) < CLEAR ? openAt + (isUp ? -CLEAR : CLEAR) : tipAt
  const colour = isUp ? UP : DOWN

  return (
    page +
    `<line x1="0" y1="${share(openAt)}" x2="100%" y2="${share(openAt)}" stroke="${QUIET}" stroke-width="1" stroke-dasharray="1 7" stroke-linecap="round"/>` +
    `<g stroke="${INK}" stroke-width="1.5" stroke-linecap="round">${line}</g>` +
    `<circle cx="${share(LINE.right)}" cy="${share(tipAt)}" r="3" fill="${colour}"/>` +
    `<text x="99%" y="${share(openAt)}" dy="-7" text-anchor="end" ${LETTERS} font-size="12" fill="${QUIET}">open ${quote.open.toFixed(2)}</text>` +
    `<text x="${share(LINE.right + 1.2)}" y="${share(priceAt)}" dy="5" ${LETTERS} font-size="15" font-weight="600" fill="${colour}">${quote.symbol} ${quote.price.toFixed(2)}</text>` +
    '</svg>'
  )
}
