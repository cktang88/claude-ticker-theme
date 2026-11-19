// Ticker theme: a white page with one stock's day drawn as a single jagged line, the day's opening price and the
// price now. The price is fetched again every ten seconds, and the picture is drawn again only when it changed.

import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { chartSvg } from './chart'
import { makeColors } from './make-colors.js'
import { quoteAddress, readQuote } from './quote'
import type { Quote } from './quote'

// TODO(kwuang): let the person choose the stock when more than this one is wanted.
const SYMBOL = 'ANT'
const EVERY_MS = 10_000
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
let built: { from: Quote | undefined; source: string } | undefined

function backdropSource(): string {
  if (built === undefined || built.from !== latest) {
    built = { from: latest, source: chartSvg(latest) }
  }

  return built.source
}

/** Fetches the price and asks for a new picture when it moved. A failed fetch keeps the last picture. */
async function refresh($: EngineInterface): Promise<void> {
  const answer = await $.http.fetch(quoteAddress(SYMBOL), { headers: { 'user-agent': 'Mozilla/5.0' } })
  const fresh = answer.ok ? readQuote(answer.text) : undefined

  if (fresh === undefined || (fresh.price === latest?.price && fresh.points.length === latest.points.length)) {
    return
  }

  latest = fresh
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

    const said = await show($)

    if (said !== 'The ticker theme is on.') {
      void $.ui.toast(said)
    }

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

    return <Svg alt={`A white page with the day's price of ${SYMBOL} as one jagged line, the opening price and the price now`} source={backdropSource()} />
  })
}
