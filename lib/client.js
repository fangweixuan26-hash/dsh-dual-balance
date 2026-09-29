// dsh-dual-balance — Client half.
//
// One pill in `conversation.composer.dock` — the horizontal stats band under
// the composer card, beside the official turns/tokens/context pills:
//
//     ↻ 1 轮 42 步   🗄 29M tok   [wallet] 余额 ¥13.44   ◐ 34%
//
// Clicking it opens the same anchored detail dialog the official pills open.
//
// Not `conversation.composer.bar` — that is the composer body itself, a
// `single` slot the core already owns; `composer.dock` is the additive `list`
// slot below it.
//
// Every visual, motion, and interaction decision is the band's own:
//   · pill        = the band's inline CSS (ghost background, 999px radius,
//                   1px/8px padding, tertiary ink, 13px-minus-one type)
//   · hover       = `--dsw-alias-interactive-bg-hover` +
//                   `--dsw-alias-label-secondary`, instant like the band
//   · click       = the official dialog seat: `useAnchoredPosition` +
//                   `useDismissOnOutsidePointer` (both exported primitives)
//                   around the official `stat-dialog` panel recipe, portaled
//                   to `<body>` with `role="dialog"`
//
// Hover and the open state are CSS `:hover` / `[aria-expanded="true"]` in an
// injected sheet owned by this plugin id — never React state. A JS flag can
// stick when the pointer leaves a certain way and leave the pill faded until
// the next click; a stylesheet cannot.
//
// The pill must never claim width: the band is a flex row, and a greedy entry
// ellipsizes every official pill beside it.
//
// The browser only ever reads numbers from a same-origin loopback route. It
// never sees the account grant or the API key, and an unreachable or failing
// source renders its own reason instead of a fabricated zero.
window.__ModuleLoader__.load({
  id: 'dsh-dual-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const { useCallback, useEffect, useRef, useState } = react
    const { createPortal } = require('react-dom')
    // Platform module (the frozen loader table): the band's own primitives, so
    // the dialog seat cannot drift from the official pills' behaviour.
    const {
      useAnchoredPosition,
      useDismissOnOutsidePointer,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = react.createElement

    /** Matches the host cache window; opening the dialog forces a real read. */
    const POLL_MS = 60 * 1000
    const STATUS_ROUTE = '/api/dsh-dual-balance/status'
    /** The official stat dialog's own placement constants. */
    const PANEL_GAP = 8
    const PANEL_MARGIN = 12
    /** The official first-pass style: measure the panel, then place it. */
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 }

    // ---- copy (follows the browser language, no locale-service dependency) --
    const ZH = {
      account: '账号',
      api: 'API',
      balance: '余额',
      signedOut: '未登录',
      unsupported: '不支持',
      failed: '读取失败',
      notConfigured: '未配置',
      unavailable: '余额不可用',
      bonus: '赠送',
      granted: '赠送',
      toppedUp: '充值',
      total: '合计',
      sameWallet: '两个来源是同一账号的同一笔钱',
      updated: '更新于',
      clickToRefresh: '点击刷新',
      accountNote: 'DSH 登录账号的 Platform 钱包',
      apiNote: 'DEEPSEEK_API_KEY 的官方余额',
      stale: '上次成功数据',
    }
    const EN = {
      account: 'Account',
      api: 'API',
      balance: 'Balance',
      signedOut: 'signed out',
      unsupported: 'unsupported',
      failed: 'read failed',
      notConfigured: 'not configured',
      unavailable: 'balance unavailable',
      bonus: 'Bonus',
      granted: 'Granted',
      toppedUp: 'Topped up',
      total: 'Total',
      sameWallet: 'both sources are one wallet',
      updated: 'updated',
      clickToRefresh: 'click to refresh',
      accountNote: 'Platform wallet of the signed-in account',
      apiNote: 'official balance of DEEPSEEK_API_KEY',
      stale: 'last good reading',
    }
    const T = typeof navigator !== 'undefined'
      && typeof navigator.language === 'string'
      && navigator.language.toLowerCase().startsWith('zh')
      ? ZH
      : EN

    // ---- formatting ---------------------------------------------------------

    /**
     * Currency symbol for a wallet code.
     * @param code - ISO currency code.
     * @returns the display symbol, or a `CODE ` prefix for unknown codes.
     */
    function symbolOf(code) {
      switch (code) {
        case 'CNY': return '¥'
        case 'USD': return '$'
        case 'EUR': return '€'
        case 'HKD': return 'HK$'
        default: return code ? `${code} ` : ''
      }
    }

    /**
     * Render one amount: two decimals when the provider sent a number,
     * otherwise a dash — never a substituted zero.
     * @param raw - the provider's balance string.
     * @returns the display amount without its currency symbol.
     */
    function amountOf(raw) {
      const value = Number(raw)
      return raw !== '' && raw !== null && raw !== undefined && Number.isFinite(value)
        ? value.toFixed(2)
        : '—'
    }

    /**
     * Pick the wallet for the one-line pill: CNY when present, else the largest.
     * The dialog still carries every currency.
     * @param wallets - normalized `{ currency, balance }` rows.
     * @returns the chosen wallet, or null.
     */
    function pickWallet(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null
      const cny = wallets.find(row => row.currency === 'CNY')
      if (cny !== undefined) return cny
      return wallets.reduce((best, row) => {
        const bestValue = Math.abs(Number(best.balance))
        const rowValue = Math.abs(Number(row.balance))
        if (!Number.isFinite(rowValue)) return best
        return !Number.isFinite(bestValue) || rowValue > bestValue ? row : best
      }, wallets[0])
    }

    /**
     * The account's own total for one currency: its recharge wallet plus the
     * granted-bonus wallets — the figure Platform's UI adds up, kept at
     * Platform's full precision.
     * @param source - the `account` payload.
     * @param currency - currency to total.
     * @returns the total, or null when the recharge wallet is missing.
     */
    function accountTotalOf(source, currency) {
      const wallet = (source?.wallets ?? []).find(row => row.currency === currency)
      if (wallet === undefined) return null
      const base = Number(wallet.balance)
      if (!Number.isFinite(base)) return null
      const bonus = (source?.bonusWallets ?? [])
        .filter(row => row.currency === currency)
        .reduce((sum, row) => sum + (Number(row.balance) || 0), 0)
      return base + bonus
    }

    /**
     * Decide whether both reads describe one wallet, so the pill can collapse
     * to a single figure.
     *
     * `/user/balance` reports two decimals while Platform reports the raw
     * amount, so an identical wallet can differ by up to half a cent on each
     * side; anything inside one cent is therefore the same money. Different
     * currencies, or a wider gap (a second account's key), keep both segments.
     * @param payload - the route payload.
     * @returns the collapsed reading, or null when the two must stay separate.
     */
    function sameWalletView(payload) {
      const account = payload?.account
      const api = payload?.api
      if (account?.state !== 'ready' || api?.state !== 'ready') return null
      const accountWallet = pickWallet(account.wallets)
      const apiWallet = pickWallet((api.infos ?? []).map(row => ({
        currency: row.currency,
        balance: row.totalBalance,
      })))
      if (accountWallet === null || apiWallet === null) return null
      if (accountWallet.currency !== apiWallet.currency) return null
      const accountTotal = accountTotalOf(account, accountWallet.currency)
      const apiTotal = Number(apiWallet.balance)
      if (accountTotal === null || !Number.isFinite(apiTotal)) return null
      if (Math.abs(accountTotal - apiTotal) > 0.01) return null
      return { currency: accountWallet.currency, total: accountTotal }
    }

    /**
     * `HH:MM` for a millisecond timestamp.
     * @param ms - epoch milliseconds.
     * @returns the local clock time.
     */
    function clockOf(ms) {
      const date = new Date(ms)
      const pad = value => String(value).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * Project one source into the pill text plus the dialog's detail rows.
     * Every non-ready state keeps its own wording; none becomes a zero.
     * @param kind - `account` or `api`.
     * @param source - that source's payload from the route, if any.
     * @returns the pill face plus `{ currency, total }` and the dialog rows.
     */
    function project(kind, source) {
      const label = kind === 'account' ? T.account : T.api
      const note = kind === 'account' ? T.accountNote : T.apiNote
      const empty = { label, note, text: '—', rows: [], total: null, failed: false }
      if (source === null || source === undefined) return empty

      if (source.state !== 'ready') {
        const wording = source.state === 'signed-out' ? T.signedOut
          : source.state === 'unavailable' ? T.unsupported
            : source.state === 'no-key' ? T.notConfigured
              : T.failed
        const failed = source.state !== 'signed-out'
          && source.state !== 'unavailable'
          && source.state !== 'no-key'
        return {
          ...empty,
          text: wording,
          failed,
          rows: failed ? [[T.failed, String(source.message ?? '')]] : [[T.account === label ? '状态' : 'State', wording]],
        }
      }

      // Both sources reduce to `{ currency, balance, granted, toppedUp }`.
      const wallets = kind === 'account'
        ? (source.wallets ?? []).map(w => ({ currency: w.currency, balance: w.balance }))
        : (source.infos ?? []).map(w => ({
          currency: w.currency,
          balance: w.totalBalance,
          granted: w.grantedBalance,
          toppedUp: w.toppedUpBalance,
        }))
      const main = pickWallet(wallets)
      if (main === null) return empty

      const rows = wallets.map(w => [w.currency, `${symbolOf(w.currency)}${amountOf(w.balance)}`])
      let total = Number(main.balance)
      if (kind === 'account') {
        for (const w of source.bonusWallets ?? []) {
          rows.push([
            `${T.bonus} ${w.currency}`,
            `${symbolOf(w.currency)}${amountOf(w.balance)}`,
          ])
        }
        const sum = accountTotalOf(source, main.currency)
        if (sum !== null && (source.bonusWallets ?? []).length > 0) {
          rows.push([`${T.total} ${main.currency}`, `${symbolOf(main.currency)}${amountOf(sum)}`])
          total = sum
        }
      } else {
        rows.push([`${T.granted} ${main.currency}`, `${symbolOf(main.currency)}${amountOf(main.granted)}`])
        rows.push([`${T.toppedUp} ${main.currency}`, `${symbolOf(main.currency)}${amountOf(main.toppedUp)}`])
        total = Number(main.balance)
      }
      // A kept-over reading carries the warning, so a frozen number never
      // passes for a fresh one.
      const stale = source.stale === true
      if (stale) rows.push([T.stale, String(source.error ?? '')])
      return {
        label,
        note,
        text: `${symbolOf(main.currency)}${amountOf(main.balance)}${stale ? ' ⚠' : ''}`,
        rows,
        total: Number.isFinite(total) ? { currency: main.currency, value: total } : null,
        failed: false,
      }
    }

    // ---- artwork ------------------------------------------------------------
    // The shipped icon set has no wallet glyph (the money-adjacent names are a
    // `>_` prompt and a database cylinder), so this one is drawn to the set's
    // own contract: 16px grid, `fill: none`, 1px `currentColor` stroke.
    //
    // Two proportions the drafts got wrong, both measured against the band's
    // own neighbours rather than eyeballed. Ink bounding boxes, in the shared
    // 16-unit grid:
    //
    //   IconGaugeOutlineRegular     13.25 x 13.21
    //   IconDatabaseOutlineRegular  12.00 x 13.78
    //   draft 1 (squashed slab)     12.50 x  7.00
    //   draft 2 (too small)         11.00 x 10.00
    //   this one                    12.30 x 11.20
    //
    // The target is WIDTH, not height or diagonal: the band lays its icons out
    // horizontally, so the eye compares their horizontal run. Height is where
    // the set disagrees most (a gauge is square-ish, a database is tall), and
    // matching a cylinder's height would make a solid wallet outline read
    // heavier than every neighbour. 12.3 sits inside the pair's own 12.00–13.25.

    /**
     * A wallet glyph, drawn to the official outline-icon contract.
     * @param props - `size` in pixels; defaults to the band's 14px pill icon.
     * @returns the inline SVG element.
     */
    function WalletIcon({ size = 14 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': true,
          strokeWidth: 1,
        },
        // Body: x 1.85–14.15, y 2.4–13.6 (12.3 x 11.2), 1.95 corner radius.
        h('path', {
          d: 'M3.8 2.4H12.2A1.95 1.95 0 0 1 14.15 4.35V11.65A1.95 1.95 0 0 1 12.2 13.6H3.8A1.95 1.95 0 0 1 1.85 11.65V4.35A1.95 1.95 0 0 1 3.8 2.4Z',
          stroke: 'currentColor',
        }),
        // Pocket: the tab that makes the rectangle read as a wallet.
        h('path', {
          d: 'M14.15 6.6H11.64A1.4 1.4 0 0 0 11.64 9.4H14.15',
          stroke: 'currentColor',
        }),
      )
    }

    // ---- presentation -------------------------------------------------------
    // The stats band is a horizontal row of pills; this entry is one more pill,
    // copied from the band's own CSS (ui-chat `StatsPills`). Two rules the v1
    // got wrong and this one keeps:
    //   · `width` is absent — the band is a flex row, and a greedy entry
    //     ellipsizes every official pill beside it;
    //   · hover and the open state are CSS `:hover` / `[aria-expanded]`, never
    //     React state — a JS hover/opacity flag can stick and leave the pill
    //     faded until the next click.
    // The sheet is injected once per page and owned by this plugin id, so the
    // loader drops it on unload, exactly like a built bundle's CSS module.

    const PILL_CSS_ID = 'dsh-dual-balance/pill.css'
    const PILL_CSS = [
      '.dshdb-pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;margin:0;',
      'padding:1px 8px;border:none;border-radius:999px;max-width:100%;min-width:0;background:none;',
      'font-family:inherit;font-weight:inherit;',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);',
      'line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));',
      'color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;',
      'overflow:hidden;cursor:pointer;user-select:none}',
      '.dshdb-pill:hover,.dshdb-pill[aria-expanded="true"]{',
      'background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dshdb-pill[data-failed="true"],',
      '.dshdb-pill[data-failed="true"]:hover,',
      '.dshdb-pill[data-failed="true"][aria-expanded="true"]{color:var(--dsw-alias-state-error-primary)}',
      // The band's own `svg` rule: a 14px icon that a tight row cannot shrink.
      '.dshdb-pill svg{flex:none;width:14px;height:14px}',
      '.dshdb-label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    ].join('')

    if (typeof document !== 'undefined'
      && document.querySelector(`style[data-plugin-css="${PILL_CSS_ID}"]`) === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-dual-balance'
      tag.dataset.pluginCss = PILL_CSS_ID
      tag.textContent = PILL_CSS
      document.head.appendChild(tag)
    }

    // The official `stat-dialog` panel recipe, declaration for declaration.
    const panel = {
      position: 'fixed',
      zIndex: 1100,
      boxSizing: 'border-box',
      border: 0,
      borderRadius: 'var(--dsw-radius-lg)',
      background: 'var(--dsw-specific-menu)',
      width: 'max-content',
      minWidth: 'min(300px, 100vw - 24px)',
      maxWidth: 'min(440px, 100vw - 24px)',
      backdropFilter: 'var(--dsw-menu-backdrop-filter)',
      '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
      boxShadow: 'var(--dsw-elevation-prominent)',
      color: 'var(--dsw-alias-label-secondary)',
      cursor: 'default',
      padding: 16,
      fontSize: 12,
      lineHeight: '18px',
    }

    const panelTitle = {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 8,
      color: 'var(--dsw-alias-label-primary)',
      fontWeight: 500,
    }

    const panelTitleLabel = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
      flex: 'none',
    }

    const panelTitleValue = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

    const panelRule = {
      borderTop: '0.5px solid var(--dsw-alias-border-l2)',
      marginBottom: 10,
    }

    const panelDetails = {
      display: 'grid',
      gridTemplateColumns: 'minmax(76px, auto) minmax(0, 1fr)',
      gap: '6px 16px',
      margin: 0,
      color: 'var(--dsw-alias-label-tertiary)',
    }

    const panelTerm = { minWidth: 0, margin: 0 }
    const panelValue = {
      minWidth: 0,
      margin: 0,
      color: 'var(--dsw-alias-label-secondary)',
      fontVariantNumeric: 'tabular-nums',
      textAlign: 'right',
      overflowWrap: 'anywhere',
    }

    /** A cross-source heading row spanning the dialog's two grid columns. */
    const panelSection = {
      gridColumn: '1 / -1',
      marginTop: 2,
      color: 'var(--dsw-alias-label-primary)',
      fontWeight: 500,
    }

    // ---- component ----------------------------------------------------------

    /** The band pill plus its official anchored detail dialog. */
    function DualBalance() {
      const [payload, setPayload] = useState(null)
      const [routeError, setRouteError] = useState(null)
      const [open, setOpen] = useState(false)
      const alive = useRef(true)
      const rootRef = useRef(null)
      const panelRef = useRef(null)

      // The official seat: same placement maths and same outside-close rule as
      // every stat pill in the band.
      const pos = useAnchoredPosition({
        open,
        anchorRef: rootRef,
        panelRef,
        side: 'top',
        gap: PANEL_GAP,
        margin: PANEL_MARGIN,
      })
      useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

      useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => { document.removeEventListener('keydown', onKeyDown) }
      }, [open])

      const load = useCallback(async (force) => {
        try {
          const response = await fetch(force === true ? `${STATUS_ROUTE}?refresh=1` : STATUS_ROUTE, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
          const body = await response.json()
          if (!alive.current) return
          if (body !== null && typeof body === 'object' && body.ok === true) {
            setPayload(body)
            setRouteError(null)
          } else {
            setRouteError(T.unavailable)
          }
        } catch (error) {
          if (!alive.current) return
          setRouteError(error instanceof Error ? error.message : String(error))
        }
      }, [])

      useEffect(() => {
        alive.current = true
        load(false)
        const timer = setInterval(() => load(false), POLL_MS)
        return () => {
          alive.current = false
          clearInterval(timer)
        }
      }, [load])

      // Opening the dialog is also the manual refresh: one gesture, fresh numbers.
      // Kept OUT of the setOpen updater — a side effect inside an updater can be
      // replayed or dropped, and a dropped clear is what left the pill faded.
      const toggle = useCallback(() => {
        const next = !open
        setOpen(next)
        if (next) load(true)
      }, [open, load])

      // Nothing to say before the first answer arrives — no placeholder flash.
      if (payload === null && routeError === null) return null

      const offline = payload === null
      const account = project('account', payload?.account)
      const api = project('api', payload?.api)
      // One wallet behind two endpoints collapses to one figure; a second
      // account's key keeps both segments — the only case where the pair
      // carries information.
      const merged = offline ? null : sameWalletView(payload)

      const text = offline
        ? T.unavailable
        : merged !== null
          ? `${T.balance} ${symbolOf(merged.currency)}${amountOf(merged.total)}`
          : `${account.label} ${account.text} | ${api.label} ${api.text}`
      const headline = offline
        ? '—'
        : merged !== null
          ? `${symbolOf(merged.currency)}${amountOf(merged.total)}`
          : `${account.text} / ${api.text}`

      const failed = offline || account.failed === true || api.failed === true
      const stamp = `${T.updated} ${clockOf(payload?.fetchedAt ?? Date.now())}`

      /** The dialog body: both sources' own rows, then the read stamp. */
      const rows = []
      if (offline) {
        rows.push({ key: 'why', term: T.failed, value: String(routeError ?? '') })
      } else {
        rows.push({ key: 'account-head', section: `${T.account} · ${account.note}` })
        for (const [term, value] of account.rows) {
          rows.push({ key: `a-${term}`, term, value })
        }
        rows.push({ key: 'api-head', section: `${T.api} · ${api.note}` })
        for (const [term, value] of api.rows) {
          rows.push({ key: `b-${term}`, term, value })
        }
        if (merged !== null) rows.push({ key: 'same', section: T.sameWallet })
        rows.push({ key: 'stamp', term: T.updated, value: clockOf(payload.fetchedAt) })
      }

      const anchor = h(
        'button',
        {
          type: 'button',
          className: 'dshdb-pill',
          ...(failed ? { 'data-failed': 'true' } : null),
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': text,
          onClick: toggle,
        },
        h(WalletIcon, { size: 14 }),
        h('span', { className: 'dshdb-label' }, text),
      )

      return h(
        'span',
        { ref: rootRef, style: { minWidth: 0, display: 'inline-flex' } },
        anchor,
        open
          ? createPortal(
            h(
              'div',
              {
                ref: panelRef,
                role: 'dialog',
                'aria-label': T.balance,
                style: pos === null ? { ...panel, ...MEASURE_STYLE } : { ...panel, ...pos },
              },
              h(
                'div',
                { style: panelTitle },
                h('span', { style: panelTitleLabel }, h(WalletIcon, { size: 14 }), T.balance),
                h('span', { style: panelTitleValue }, headline),
              ),
              h('div', { style: panelRule, 'aria-hidden': true }),
              h(
                'dl',
                { style: panelDetails },
                rows.flatMap((row) => row.section !== undefined
                  ? [h('div', { key: row.key, style: panelSection }, row.section)]
                  : [
                    h('dt', { key: `${row.key}-t`, style: panelTerm }, row.term),
                    h('dd', { key: `${row.key}-d`, style: panelValue }, row.value),
                  ]),
              ),
            ),
            document.body,
          )
          : null,
      )
    }

    // ---- registration -------------------------------------------------------

    /** The slots service is the only thing this half needs. */
    const inject = ['slots']

    /**
     * Register the pill into the composer stats band, right after the official
     * `StatsPills` entry (`id: 'stats'`, `order: 0`).
     * @param ctx - the client root context.
     */
    function apply(ctx) {
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
        {
          name: 'conversation.composer.dock',
          id: 'dual-balance',
          order: 1,
          label: '余额',
        },
        DualBalance,
      ))
    }

    exports.apply = apply
    exports.inject = inject
    // Test-only face: the pure presentation helpers, so `tests/client-smoke.mjs`
    // can assert the collapse rule without mounting React.
    exports.__internals = { amountOf, pickWallet, accountTotalOf, sameWalletView, project }
    return module.exports
  },
})
