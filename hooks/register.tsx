// Ticker theme: a white page with one stock's day drawn as a single soft line, yesterday's close (or today's open
// when there is none) and the price now. The price is fetched again every ten seconds from 4 am to 8 pm New York
// time, and the picture is drawn again only when it changed.

import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { chartSvg, weekSvg } from './chart'
import { makeColors } from './make-colors.js'
import { isFresh, isTradingHours, opensNote, quoteAddress, readQuote, readWeek, weekAddress } from './quote'
import type { Quote, Week } from './quote'

// TODO(kwuang): let the person choose the stock when more than this one is wanted.
const SYMBOL = 'ANT'
const EVERY_MS = 10_000
/** The store key every session of this theme reads and writes. The store is shared by all sessions on the machine. */
const SAVED = 'latest-quote'
const SAVED_WEEK = 'latest-week'
/** While the market is closed, sessions share one fetch of the week for this long. */
const WEEK_MAX_AGE_MS = 6 * 60 * 60 * 1000
const COMMAND = 'ticker'
const SCENE = 'ticker'

const { theme, problems } = makeColors({
  label: 'Ticker',
  only: 'light',
  roles: { accent: '#1a1a1a', danger: '#b3392f', success: '#167a48', warning: '#a86f14', pro: '#6d4f94' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f3f3f3',
        'surface-1': '#fafafa',
        'surface-2': '#ffffff',
        'text-primary': '#1a1a1a',
        'text-secondary': '#444444',
        'text-muted': '#5e5e5e',
      },
    },
  },
})

// The scene's name goes under `id` as well as `scene`, as the theme-examples plugin sets its own.
const LOOK = {
  colors: theme,
  backdrop: { scene: SCENE, id: SCENE, glass: { blur: 0, tint: '#ffffff', opacity: 0.55 } },
} as unknown as ThemeSetArgs

/**
 * The backdrop hook must answer at once (the app shows a late answer as a still picture), so the latest quote is
 * kept here and the picture is built once per quote.
 */
let latest: Quote | undefined
/** While the market is closed: the week to draw, and when trading opens again. */
let closed: { week: Week; note: string } | undefined
let built: { from: Quote | typeof closed; source: string } | undefined

function backdropSource(): string {
  const from = closed ?? latest

  if (built === undefined || built.from !== from) {
    built = { from, source: closed === undefined ? chartSvg(latest) : weekSvg(closed.week, closed.note) }
  }

  return built.source
}

/** The latest quote: the one another session saved in the last ten seconds, or a fresh fetch saved for the others. */
async function latestQuote($: EngineInterface): Promise<Quote | undefined> {
  const now = await $.clock.now()
  const saved = await $.store.get(SAVED)

  if (isFresh(saved, SYMBOL, now, EVERY_MS - 1000)) {
    return saved.quote
  }

  const answer = await $.http.fetch(quoteAddress(SYMBOL), { headers: { 'user-agent': 'Mozilla/5.0' } })
  const fetched = answer.ok ? readQuote(answer.text) : undefined

  if (fetched !== undefined) {
    await $.store.set(SAVED, { at: now, quote: fetched })
  }

  return fetched
}

/** The week, fetched once per closed stretch and shared like the day's quote. */
async function latestWeek($: EngineInterface, now: number): Promise<Week | undefined> {
  const saved = (await $.store.get(SAVED_WEEK)) as { at?: number; week?: Week } | undefined

  if (saved?.week?.symbol === SYMBOL && typeof saved.at === 'number' && now - saved.at < WEEK_MAX_AGE_MS) {
    return saved.week
  }

  const answer = await $.http.fetch(weekAddress(SYMBOL), { headers: { 'user-agent': 'Mozilla/5.0' } })
  const week = answer.ok ? readWeek(answer.text) : undefined

  if (week !== undefined) {
    await $.store.set(SAVED_WEEK, { at: now, week })
  }

  return week
}

/** Asks for a new picture when the price moved, or when the market opened or closed. A failed fetch keeps the last picture. */
async function refresh($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  if (!isTradingHours(now)) {
    if (closed === undefined) {
      const week = await latestWeek($, now)

      if (week !== undefined) {
        closed = { week, note: opensNote(now) }
        $.ui.invalidate('ui.render')
      }
    }

    return
  }

  const wasClosed = closed !== undefined
  const fresh = await latestQuote($)

  closed = undefined

  const isSame = fresh === undefined || (fresh.price === latest?.price && fresh.points.length === latest.points.length)

  if (isSame && !wasClosed) {
    return
  }

  latest = fresh ?? latest
  $.ui.invalidate('ui.render')
}

async function show($: EngineInterface): Promise<string> {
  const unpainted = problems.find(problem => problem.startsWith("Desktop won't paint"))

  if (unpainted !== undefined) {
    return unpainted
  }

  const set = await $.theme.set(LOOK)

  return set.isDrawn ? 'The ticker theme is on.' : `The ticker theme is set, but this window does not draw it: ${set.reason}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const quietly = () => void refresh($).catch(() => undefined)

    await $.command.register({
      name: COMMAND,
      description: 'Ticker theme: alone it turns the theme on; "off" clears it.',
    })
    quietly()
    $.clock.every(EVERY_MS, quietly)

    // Not drawn yet is normal here: the window attaches later, and `session.attach` sets the theme again.
    await show($)

    return result
  })

  // A new session starts before its window attaches, and the theme set then is not drawn. Set it again on attach.
  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const result = await next(e)
    await show($).catch(() => undefined)
    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'off') {
      await $.theme.clear()

      return { text: 'The ticker theme is off for this session. /ticker turns it on again.' }
    }

    return { text: await show($) }
  }).catch(() => ({ text: 'The ticker theme hit an error. Run /ticker again.' }))

  // Not async, on purpose: see `latest`.
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.scene !== SCENE || e.surface !== 'desktop') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg alt={`A white page with the day's price of ${SYMBOL} as one soft line, yesterday's close and the price now`} source={backdropSource()} />
  })
}
