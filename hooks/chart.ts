// The picture: a white page, the day's price as one soft, smooth line with a faint wash, measured against a base
// (yesterday's close, or today's open when there is none): green above the base, red below. A dotted line marks
// the base, and two numbers sit at the right (the base and the price now). The line is drawn in a 1000-unit box
// stretched to the window; its stroke keeps its width.

import type { Quote, Week } from './quote'

const BOX = 1000
const LINE = { left: 0, right: 935, top: 340, bottom: 660 } as const
const QUIET = '#a3a3a3'
const UP = '#3f9d6e'
const DOWN = '#cf6a5e'
const LETTERS = 'font-family="ui-monospace, SF Mono, Menlo, monospace"'
/** Closer than this (in thousandths of the window's height), the two numbers would sit on top of each other. */
const CLEAR = 45

const share = (value: number) => `${(value / 10).toFixed(2)}%`

/** Evens out minute-to-minute jitter: each point becomes the average of itself and its neighbours. */
function eased(points: readonly number[]): number[] {
  return points.map((_, index) => {
    const near = points.slice(Math.max(0, index - 2), index + 3)

    return index === points.length - 1 ? points[index]! : near.reduce((sum, value) => sum + value, 0) / near.length
  })
}

/** At most `most` points, evenly picked, always keeping the last: the app refuses a picture over 131,072 characters. */
function thinned(points: readonly number[], most: number): number[] {
  const step = Math.ceil(points.length / most)

  return points.filter((_, index) => index % step === 0 || index === points.length - 1)
}

/** A smooth path through the points: each stretch is a curve whose ends follow the neighbouring points. */
function smoothPath(xy: readonly (readonly [number, number])[]): string {
  const at = (index: number) => xy[Math.min(xy.length - 1, Math.max(0, index))]!
  const round = (value: number) => value.toFixed(1)
  let path = `M${round(xy[0]![0])} ${round(xy[0]![1])}`

  for (let index = 1; index < xy.length; index += 1) {
    const [before, from, to, after] = [at(index - 2), at(index - 1), at(index), at(index + 1)]
    const first = [from[0] + (to[0] - before[0]) / 6, from[1] + (to[1] - before[1]) / 6]
    const second = [to[0] - (after[0] - from[0]) / 6, to[1] - (after[1] - from[1]) / 6]

    path += `C${round(first[0]!)} ${round(first[1]!)} ${round(second[0]!)} ${round(second[1]!)} ${round(to[0])} ${round(to[1])}`
  }

  return path
}

const PAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="100%" height="100%" fill="#fff"/>'

/** The picture while the market is closed: the last five days as one faint gray line with a soft wash under it, and a dotted mark between days. */
export function weekSvg(week: Week, note: string): string {
  const all = week.days.flat()
  const low = Math.min(...all)
  const span = Math.max(...all) - low || 1
  const down = (price: number) => LINE.bottom - ((price - low) / span) * (LINE.bottom - LINE.top)
  const across = (index: number) => LINE.left + (index / Math.max(1, all.length - 1)) * (LINE.right - LINE.left)
  let line = ''
  let marks = ''
  let start = 0

  // Each day is smoothed on its own and keeps its real open and close, and a straight stroke joins one day's close
  // to the next day's open, so the overnight jump shows as it was.
  for (const day of week.days) {
    const smooth = eased(day)

    smooth[0] = day[0]!
    line += smoothPath(smooth.map((price, index) => [across(start + index), down(price)] as const)).replace(/^M/, line === '' ? 'M' : 'L')

    if (start > 0) {
      marks += `M${across(start - 0.5).toFixed(1)} ${LINE.top - 30}V${LINE.bottom + 30}`
    }
    start += day.length
  }

  return (
    PAGE +
    `<svg width="100%" height="100%" viewBox="0 0 ${BOX} ${BOX}" preserveAspectRatio="none">` +
    `<defs><linearGradient id="week-wash" gradientUnits="userSpaceOnUse" x1="0" y1="${LINE.top}" x2="0" y2="${LINE.bottom + 30}"><stop offset="0" stop-color="${QUIET}" stop-opacity=".18"/><stop offset="1" stop-color="${QUIET}" stop-opacity="0"/></linearGradient></defs>` +
    `<path d="${line}L${LINE.right} ${LINE.bottom + 30}L${LINE.left} ${LINE.bottom + 30}Z" fill="url(#week-wash)"/>` +
    `<path d="${marks}" stroke="${QUIET}" stroke-opacity=".6" stroke-width="1" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>` +
    `<path d="${line}" fill="none" stroke="${QUIET}" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>` +
    `<text x="99%" y="${share(LINE.bottom + 50)}" text-anchor="end" ${LETTERS} font-size="10" fill="${QUIET}">${note}</text>` +
    '</svg>'
  )
}

/** The day's picture. With a `closed` note (a weeknight), it is all gray and says when trading opens. */
export function chartSvg(quote: Quote | undefined, closed?: string): string {
  if (quote === undefined) {
    return `${PAGE}</svg>`
  }

  const points = thinned(eased(quote.points), 240)
  const low = Math.min(quote.base, ...points)
  const high = Math.max(quote.base, ...points)
  const span = high - low || 1
  const down = (price: number) => LINE.bottom - ((price - low) / span) * (LINE.bottom - LINE.top)
  const across = (index: number) => LINE.left + (index / Math.max(1, points.length - 1)) * (LINE.right - LINE.left)
  const line = smoothPath(points.map((price, index) => [across(index), down(price)] as const))
  const baseAt = down(quote.base)
  const tipAt = down(quote.price)
  const isUp = quote.price >= quote.base
  const wash = `${line}L${LINE.right} ${baseAt.toFixed(1)}L${LINE.left} ${baseAt.toFixed(1)}Z`
  // The price is written beside the line's end. When that is too near the base's label, it moves away from it.
  const priceAt = Math.abs(tipAt - baseAt) < CLEAR ? baseAt + (isUp ? -CLEAR : CLEAR) : tipAt
  const [upTint, downTint] = closed === undefined ? [UP, DOWN] : [QUIET, QUIET]
  const colour = isUp ? upTint : downTint
  // One copy of the line and wash per side of the base, each cut to its side, so the color changes where the
  // line crosses the base.
  const side = (id: string, tint: string) =>
    `<g clip-path="url(#${id})">` +
    `<path d="${wash}" fill="url(#${id}-wash)"/>` +
    `<path d="${line}" fill="none" stroke="${tint}" stroke-opacity=".04" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    `<path d="${line}" fill="none" stroke="${tint}" stroke-opacity="${closed === undefined ? 0.22 : 0.45}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>`

  return (
    PAGE +
    `<line x1="0" y1="${share(baseAt)}" x2="100%" y2="${share(baseAt)}" stroke="${QUIET}" stroke-width="1" stroke-dasharray="1 7" stroke-linecap="round"/>` +
    `<svg width="100%" height="100%" viewBox="0 0 ${BOX} ${BOX}" preserveAspectRatio="none"><defs>` +
    `<clipPath id="up"><rect x="-10" y="-10" width="${BOX + 20}" height="${(baseAt + 10).toFixed(1)}"/></clipPath>` +
    `<clipPath id="down"><rect x="-10" y="${baseAt.toFixed(1)}" width="${BOX + 20}" height="${BOX}"/></clipPath>` +
    `<linearGradient id="up-wash" gradientUnits="userSpaceOnUse" x1="0" y1="${LINE.top}" x2="0" y2="${baseAt.toFixed(1)}"><stop offset="0" stop-color="${upTint}" stop-opacity=".16"/><stop offset="1" stop-color="${upTint}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="down-wash" gradientUnits="userSpaceOnUse" x1="0" y1="${LINE.bottom}" x2="0" y2="${baseAt.toFixed(1)}"><stop offset="0" stop-color="${downTint}" stop-opacity=".16"/><stop offset="1" stop-color="${downTint}" stop-opacity="0"/></linearGradient>` +
    `</defs>${side('up', upTint)}${side('down', downTint)}</svg>` +
    `<circle cx="${share(LINE.right)}" cy="${share(tipAt)}" r="5" fill="${colour}" fill-opacity=".12"/>` +
    `<circle cx="${share(LINE.right)}" cy="${share(tipAt)}" r="2" fill="${colour}" fill-opacity=".7"/>` +
    `<text x="99%" y="${share(baseAt)}" dy="-8" text-anchor="end" ${LETTERS} font-size="10" fill="${QUIET}">${quote.baseLabel} ${quote.base.toFixed(2)}</text>` +
    `<text x="${share(LINE.right + 10)}" y="${share(priceAt)}" dy="5" ${LETTERS} font-size="13" fill="${colour}" fill-opacity=".75">${quote.symbol} ${quote.price.toFixed(2)}</text>` +
    (closed === undefined ? '' : `<text x="99%" y="${share(LINE.bottom + 50)}" text-anchor="end" ${LETTERS} font-size="10" fill="${QUIET}">${closed}</text>`) +
    '</svg>'
  )
}
