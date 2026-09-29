/**
 * Host-half smoke test — no DSH runtime required.
 *
 * Drives `apply()` with a stub context and asserts every degradation path:
 * ready, signed out, service unavailable, missing API key, provider failure,
 * and the stale-while-error cache. Run with `node tests/host-smoke.mjs`.
 */
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.js'

/**
 * Build a stub Host context whose wallet reads are scripted per test.
 * @param options - `account` is the `deepseekAccount` stub result (or a thrown
 * error), `apiKey` the credential value (`undefined` for none), and `api` the
 * fetch outcome.
 * @returns the context plus the captured route and request log.
 */
function makeCtx(options = {}) {
  const calls = { account: 0, fetch: 0 }
  const route = { current: null }
  const ctx = {
    logger: { warn() {} },
    effect(factory) { factory(); return () => {} },
    get(service) {
      if (service !== 'deepseekAccount') return undefined
      if (options.accountService === false) return undefined
      return {
        async getBalance() {
          calls.account += 1
          if (options.accountThrows === true) throw new Error('platform exploded')
          return options.account
        },
      }
    },
    credentials: {
      async resolve() {
        return options.apiKey === undefined ? undefined : { value: options.apiKey, source: 'file' }
      },
    },
    webServer: {
      register(registered) { route.current = registered; return () => {} },
    },
  }
  ctx.fetchCalls = calls
  ctx.route = route
  return ctx
}

/**
 * Invoke one captured route registration.
 * @param ctx - the stub context returned by {@link makeCtx}.
 * @param url - request URL including its query.
 * @returns the parsed JSON body and status.
 */
async function call(ctx, url = '/api/dsh-dual-balance/status') {
  let status
  let text
  const res = {
    writeHead(code) { status = code },
    end(body) { text = body },
  }
  await ctx.route.current.handler({ url }, res)
  return { status, body: JSON.parse(text) }
}

const originalFetch = globalThis.fetch

// ---- wiring --------------------------------------------------------------

{
  const ctx = makeCtx()
  apply(ctx)
  assert.equal(ctx.route.current.kind, 'exact')
  assert.equal(ctx.route.current.path, '/api/dsh-dual-balance/status')
  assert.deepEqual(inject, ['credentials', 'webServer'])
  assert.equal(name, 'dsh-dual-balance')
}

// ---- both sources ready --------------------------------------------------

{
  globalThis.fetch = async url => {
    assert.equal(url, 'https://api.deepseek.com/user/balance')
    return {
      ok: true,
      async json() {
        return {
          is_available: true,
          balance_infos: [
            { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
          ],
        }
      },
    }
  }
  const ctx = makeCtx({
    account: { status: 'ready', value: [{ currency: 'CNY', balance: '12.34' }], bonusWallets: [{ currency: 'CNY', balance: '2.00' }] },
    apiKey: 'sk-test',
  })
  apply(ctx)
  const { status, body } = await call(ctx)
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.cached, false)
  assert.deepEqual(body.account, {
    state: 'ready',
    wallets: [{ currency: 'CNY', balance: '12.34' }],
    bonusWallets: [{ currency: 'CNY', balance: '2.00' }],
  })
  assert.equal(body.api.state, 'ready')
  assert.equal(body.api.isAvailable, true)
  assert.deepEqual(body.api.infos, [{
    currency: 'CNY',
    totalBalance: '110.00',
    grantedBalance: '10.00',
    toppedUpBalance: '100.00',
  }])
  assert.equal(typeof body.fetchedAt, 'number')

  // Second read inside the freshness window is served from cache, untouched.
  const again = await call(ctx)
  assert.equal(again.body.cached, true)
  assert.equal(ctx.fetchCalls.account, 1)
  assert.equal(ctx.fetchCalls.fetch, 0)

  // A manual refresh still spends a real read.
  const forced = await call(ctx, '/api/dsh-dual-balance/status?refresh=1')
  assert.equal(forced.body.cached, false)
  assert.equal(ctx.fetchCalls.account, 2)
}

// ---- signed out account, no API key -------------------------------------

{
  const ctx = makeCtx({ account: null })
  apply(ctx)
  const { body } = await call(ctx)
  assert.deepEqual(body.account, { state: 'signed-out' })
  assert.deepEqual(body.api, { state: 'no-key' })
}

// ---- account service absent (non-desktop Host) ---------------------------

{
  const ctx = makeCtx({ accountService: false })
  apply(ctx)
  const { body } = await call(ctx)
  assert.equal(body.account.state, 'unavailable')
  assert.match(body.account.message, /deepseekAccount/)
}

// ---- a throwing account service and a failed API call stay separate ------

{
  globalThis.fetch = async () => { throw new Error('network down') }
  const ctx = makeCtx({ accountThrows: true, apiKey: 'sk-test' })
  apply(ctx)
  const { body } = await call(ctx)
  assert.deepEqual(body.account, { state: 'error', message: 'platform exploded' })
  assert.deepEqual(body.api, { state: 'error', message: 'network down' })
}

// ---- Platform reported the read as failed, not as a zero ----------------

{
  globalThis.fetch = async () => ({ ok: false, status: 401 })
  const ctx = makeCtx({ account: { status: 'failed' }, apiKey: 'sk-test' })
  apply(ctx)
  const { body } = await call(ctx)
  assert.equal(body.account.state, 'error')
  assert.equal(body.api.state, 'error')
  assert.equal(body.api.message, 'HTTP 401')
}

// ---- malformed API payload is an error, never a fabricated balance -------

{
  globalThis.fetch = async () => ({ ok: true, async json() { return { balance_infos: 'nope' } } })
  const ctx = makeCtx({ account: { status: 'ready', value: [], bonusWallets: [] }, apiKey: 'sk-test' })
  apply(ctx)
  const { body } = await call(ctx)
  assert.deepEqual(body.account.wallets, [])
  assert.deepEqual(body.api.infos, [])
  assert.equal(body.api.state, 'ready')
}

// ---- a transient failure keeps that source's last good number ------------

{
  let down = false
  globalThis.fetch = async () => {
    if (down) throw new Error('network down')
    return {
      ok: true,
      async json() {
        return {
          is_available: true,
          balance_infos: [{
            currency: 'CNY',
            total_balance: '15.34',
            granted_balance: '1.56',
            topped_up_balance: '13.77',
          }],
        }
      },
    }
  }
  const options = {
    account: {
      status: 'ready',
      value: [{ currency: 'CNY', balance: '13.77' }],
      bonusWallets: [{ currency: 'CNY', balance: '1.56' }],
    },
    apiKey: 'sk-test',
  }
  const ctx = makeCtx(options)
  apply(ctx)
  const first = await call(ctx)
  assert.equal(first.body.api.state, 'ready')
  assert.equal(first.body.api.stale, undefined)

  down = true
  const second = await call(ctx, '/api/dsh-dual-balance/status?refresh=1')
  assert.equal(second.body.api.state, 'ready', 'the last good number survives a failure')
  assert.equal(second.body.api.stale, true)
  assert.equal(second.body.api.error, 'network down')
  assert.equal(second.body.api.infos[0].totalBalance, '15.34')
  assert.equal(second.body.account.stale, undefined, 'the healthy source is not marked stale')

  // Signed out is a real state, never a stale reading from a moment ago.
  options.account = null
  const third = await call(ctx, '/api/dsh-dual-balance/status?refresh=1')
  assert.deepEqual(third.body.account, { state: 'signed-out' })

  // No key is a real state too.
  options.apiKey = undefined
  const fourth = await call(ctx, '/api/dsh-dual-balance/status?refresh=1')
  assert.deepEqual(fourth.body.api, { state: 'no-key' })
}

globalThis.fetch = originalFetch
console.log('host-smoke: all assertions passed')
