/**
 * Client-half smoke test — no browser and no React render.
 *
 * Loads the shipped bundle's factory envelope with stub `window`, `react`,
 * `react-dom`, and primitives modules, then exercises the pure helpers behind
 * the pill: amount formatting, wallet choice, the collapse rule that decides
 * whether the two endpoints are one wallet, and every degradation path.
 * Run with `node tests/client-smoke.mjs`.
 */
import assert from 'node:assert/strict'

/**
 * Pin the locale the bundle reads for its copy.
 *
 * Node 21+ exposes a real global `navigator`, so without this the suite takes
 * its wording from whatever machine runs it: it passes on a zh-CN host and
 * fails on an en-US one. Pinning is what makes the assertions mean something.
 * @param language - BCP 47 tag the bundle will read.
 */
function pinLocale(language) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language },
    configurable: true,
    writable: true,
  })
}

/**
 * Load the shipped bundle and hand back its registration envelope.
 * @param specifier - module specifier; a query string busts the ESM cache so a
 * second load re-reads the locale.
 * @returns the `window.__ModuleLoader__.load` handoff.
 */
async function loadBundle(specifier) {
  let handoff
  globalThis.window = { __ModuleLoader__: { load(value) { handoff = value } } }
  await import(specifier)
  assert.notEqual(handoff, undefined, 'the bundle must register via __ModuleLoader__.load')
  return handoff
}

/** Every specifier the factory is allowed to require, in order. */
const EXPECTED_REQUIRES = ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives']

/**
 * Materialize a handoff's factory with stub platform modules.
 * @param handoff - envelope from {@link loadBundle}.
 * @param seen - array collecting the required specifiers.
 * @returns the bundle's exported module object.
 */
function materialize(handoff, seen) {
  return handoff.factory(spec => {
    seen.push(spec)
    if (spec === 'react') {
      // The factory only destructures hooks and createElement; nothing renders.
      return {
        createElement: () => {},
        useCallback: () => {},
        useEffect: () => {},
        useRef: () => {},
        useState: () => {},
      }
    }
    if (spec === 'react-dom') return { createPortal: () => {} }
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
      // The dialog seat must come from the official primitives, not a local copy.
      return { useAnchoredPosition: () => {}, useDismissOnOutsidePointer: () => {} }
    }
    throw new Error(`unexpected require: ${spec}`)
  })
}

// ---- wiring (zh-CN) ------------------------------------------------------

pinLocale('zh-CN')
const handoff = await loadBundle('../lib/client.js')

assert.equal(handoff.id, 'dsh-dual-balance')
assert.equal(typeof handoff.factory, 'function')

const seen = []
const mod = materialize(handoff, seen)

// Only frozen-table platform modules may be required.
assert.deepEqual(seen, EXPECTED_REQUIRES)
assert.deepEqual(mod.inject, ['slots'])
assert.equal(typeof mod.apply, 'function')

const { amountOf, pickWallet, accountTotalOf, sameWalletView, project } = mod.__internals

// ---- amounts -------------------------------------------------------------

assert.equal(amountOf('15.34571394'), '15.35')
assert.equal(amountOf('0'), '0.00')
assert.equal(amountOf(''), '—', 'an absent amount is a dash, never 0')
assert.equal(amountOf(null), '—')
assert.equal(amountOf('nope'), '—')

// ---- wallet choice -------------------------------------------------------

assert.equal(pickWallet([]), null)
assert.equal(pickWallet(null), null)
assert.equal(pickWallet([{ currency: 'USD', balance: '99' }, { currency: 'CNY', balance: '1' }]).currency, 'CNY')
assert.equal(pickWallet([{ currency: 'USD', balance: '99' }, { currency: 'EUR', balance: '1' }]).currency, 'USD')

// ---- account total folds the bonus wallet --------------------------------

const account = {
  state: 'ready',
  wallets: [{ currency: 'CNY', balance: '13.7798513800000000' }],
  bonusWallets: [{ currency: 'CNY', balance: '1.5658625600000000' }],
}
assert.equal(accountTotalOf(account, 'CNY'), 13.7798513800000000 + 1.5658625600000000)
assert.equal(accountTotalOf(account, 'USD'), null)

// ---- one wallet behind two endpoints collapses ----------------------------

const apiReady = total => ({
  state: 'ready',
  isAvailable: true,
  infos: [{ currency: 'CNY', totalBalance: total, grantedBalance: '1.56', toppedUpBalance: '13.77' }],
})

const collapsed = sameWalletView({ account, api: apiReady('15.34') })
assert.notEqual(collapsed, null, 'a half-cent report gap is the same wallet')
assert.equal(collapsed.currency, 'CNY')
assert.equal(amountOf(collapsed.total), '15.35')

assert.equal(sameWalletView({ account, api: apiReady('12.00') }), null, 'a real gap keeps both segments')

// A second account's key in another currency never collapses.
assert.equal(sameWalletView({
  account,
  api: { state: 'ready', isAvailable: true, infos: [{ currency: 'USD', totalBalance: '15.34' }] },
}), null)

// Neither half alone may collapse: a single reading stays its own segment.
assert.equal(sameWalletView({ account, api: { state: 'no-key' } }), null)
assert.equal(sameWalletView({ account: { state: 'signed-out' }, api: apiReady('15.34') }), null)

// ---- segment projection --------------------------------------------------

const accountFace = project('account', account)
assert.equal(accountFace.text, '¥13.78')
assert.equal(accountFace.failed, false)
assert.deepEqual(accountFace.rows, [
  ['CNY', '¥13.78'],
  ['赠送 CNY', '¥1.57'],
  ['合计 CNY', '¥15.35'],
], 'the dialog spells out the sum so a collapsed pill is reproducible')
assert.equal(accountFace.total.value, 13.7798513800000000 + 1.5658625600000000)

const apiFace = project('api', apiReady('15.34'))
assert.equal(apiFace.text, '¥15.34')
assert.deepEqual(apiFace.rows.map(row => row[0]), ['CNY', '赠送 CNY', '充值 CNY'])

assert.equal(project('account', { state: 'signed-out' }).text, '未登录')
assert.equal(project('account', { state: 'signed-out' }).failed, false, 'signed out is a state, not a failure')
assert.equal(project('account', undefined).text, '—')
assert.equal(project('api', { state: 'no-key' }).text, '未配置')
assert.equal(project('api', { state: 'no-key' }).failed, false)
assert.equal(project('api', { state: 'unavailable' }).text, '不支持')

const failed = project('api', { state: 'error', message: 'HTTP 401' })
assert.equal(failed.text, '读取失败')
assert.deepEqual(failed.rows, [['读取失败', 'HTTP 401']])
assert.equal(failed.failed, true, 'a failure is the only thing that leaves the band ink')

// ---- a kept-over reading carries its warning ------------------------------

const stale = project('api', { ...apiReady('15.34'), stale: true, error: 'network down' })
assert.equal(stale.text, '¥15.34 ⚠', 'a frozen number is marked on the pill')
assert.deepEqual(stale.rows.at(-1), ['上次成功数据', 'network down'])
assert.equal(stale.failed, false, 'stale is not a failure face')

// Staleness is a timing fact, not a different wallet: it still collapses.
assert.notEqual(sameWalletView({ account, api: { ...apiReady('15.34'), stale: true } }), null)

// ---- the English dictionary, for a non-zh host ---------------------------

pinLocale('en-US')
const enSeen = []
const en = materialize(await loadBundle('../lib/client.js?locale=en'), enSeen)
assert.deepEqual(enSeen, EXPECTED_REQUIRES, 'the required specifiers must not depend on locale')
assert.equal(en.__internals.project('account', { state: 'signed-out' }).text, 'signed out')
assert.equal(en.__internals.project('api', { state: 'no-key' }).text, 'not configured')
assert.equal(en.__internals.project('api', { state: 'error', message: 'HTTP 401' }).text, 'read failed')
assert.deepEqual(
  en.__internals.project('account', account).rows,
  [['CNY', '¥13.78'], ['Bonus CNY', '¥1.57'], ['Total CNY', '¥15.35']],
)

console.log('client-smoke: all assertions passed (zh-CN and en-US)')
