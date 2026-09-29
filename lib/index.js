/**
 * dsh-dual-balance — Host half.
 *
 * One read-only loopback route serves both DeepSeek wallets side by side:
 *
 *   account  The current DSH account's Platform wallet, read through the
 *            built-in `deepseekAccount` service (recharge wallets plus the
 *            granted-bonus wallets), exactly the figure the Account settings
 *            page shows.
 *   api      The `DEEPSEEK_API_KEY` wallet, read through
 *            `GET https://api.deepseek.com/user/balance`.
 *
 * Neither the account grant nor the API key ever leaves this process: only
 * numbers, states, and error text cross the route. A failing source keeps its
 * own state instead of degrading to a fabricated zero, and the last good
 * payload is served stale rather than dropped.
 *
 * @module dsh-dual-balance
 */

/** Plugin id, matching the package name. */
export const name = 'dsh-dual-balance'

/**
 * Hard service dependencies.
 *
 * `deepseekAccount` is deliberately NOT listed: it ships with the account
 * (desktop) composition but not with every Host, so it is read through
 * `ctx.get()` per request and reported as `unavailable` when absent.
 */
export const inject = ['credentials', 'webServer']

/** The single route the browser half polls. */
const ROUTE = '/api/dsh-dual-balance/status'

/** Official DeepSeek API wallet endpoint. */
const API_BALANCE_URL = 'https://api.deepseek.com/user/balance'

/**
 * Credential reference for the API wallet.
 *
 * `credentialRef()` is a brand over the identifier string, so the literal is
 * the same value at runtime — spelling it keeps this plugin dependency-free.
 */
const API_KEY_REF = 'DEEPSEEK_API_KEY'

/** Freshness window for one full read; `?refresh=1` bypasses it. */
const CACHE_TTL_MS = 60_000

/** Per-request timeout for the official API-balance call. */
const API_TIMEOUT_MS = 10_000

/**
 * Identity this Host reports to Platform on account calls. These are request
 * reporting headers only — they carry no credential and are not validated
 * locally.
 */
const CLIENT_VERSION = '0.2.0'
const CLIENT_LOCALE = 'zh-CN'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

/**
 * Write one JSON response.
 * @param res - the route's response.
 * @param status - HTTP status code.
 * @param body - serializable payload.
 */
function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * Read a thrown value as display text.
 * @param error - the thrown value.
 * @returns its message, or the stringified value.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Build the `AccountClientMetadata` the account service attributes this read to.
 * @returns client version, active language, and UTC offset in seconds.
 */
function clientMetadata() {
  return {
    version: CLIENT_VERSION,
    locale: CLIENT_LOCALE,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}

/**
 * Normalize one wallet row.
 * @param value - a candidate `AccountWallet`.
 * @returns the wallet, or null when the payload is malformed.
 */
function wallet(value) {
  if (value === null || typeof value !== 'object') return null
  const currency = typeof value.currency === 'string' ? value.currency : undefined
  const balance = typeof value.balance === 'string' ? value.balance : undefined
  if (currency === undefined || balance === undefined) return null
  return { currency, balance }
}

/**
 * Normalize a wallet list.
 * @param value - a candidate `AccountWallet[]`.
 * @returns the normalized wallets, dropping malformed rows.
 */
function walletList(value) {
  return Array.isArray(value) ? value.map(wallet).filter(row => row !== null) : []
}

/**
 * Read the signed-in account's Platform wallet.
 *
 * A missing service, an absent grant, a Platform failure, and a malformed
 * payload are four different states — this never collapses them into a zero.
 * @param ctx - the plugin's Host context.
 * @returns the account read outcome.
 */
async function readAccount(ctx) {
  const service = ctx.get('deepseekAccount')
  if (service === undefined) {
    return { state: 'unavailable', message: 'this Host provides no deepseekAccount service' }
  }
  let result
  try {
    result = await service.getBalance(clientMetadata())
  } catch (error) {
    return { state: 'error', message: messageOf(error) }
  }
  // null means signed out, or the grant changed while the query ran.
  if (result === null || result === undefined) return { state: 'signed-out' }
  if (result.status === 'failed') {
    return { state: 'error', message: 'Platform balance query failed' }
  }
  if (result.status !== 'ready') {
    return { state: 'error', message: `unexpected account status "${String(result.status)}"` }
  }
  return {
    state: 'ready',
    wallets: walletList(result.value),
    bonusWallets: walletList(result.bonusWallets),
  }
}

/**
 * Read the API key's wallet from the official endpoint.
 * @param ctx - the plugin's Host context.
 * @returns the API read outcome.
 */
async function readApi(ctx) {
  let hit
  try {
    hit = await ctx.credentials.resolve(API_KEY_REF)
  } catch (error) {
    return { state: 'error', message: messageOf(error) }
  }
  if (hit === undefined) return { state: 'no-key' }

  let response
  try {
    response = await fetch(API_BALANCE_URL, {
      headers: {
        authorization: `Bearer ${hit.value}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
  } catch (error) {
    return { state: 'error', message: messageOf(error) }
  }
  if (!response.ok) return { state: 'error', message: `HTTP ${response.status}` }

  let body
  try {
    body = await response.json()
  } catch (error) {
    return { state: 'error', message: `malformed JSON: ${messageOf(error)}` }
  }
  if (body === null || typeof body !== 'object') {
    return { state: 'error', message: 'unexpected response shape' }
  }
  const infos = Array.isArray(body.balance_infos) ? body.balance_infos : []
  return {
    state: 'ready',
    isAvailable: body.is_available === true,
    infos: infos
      .filter(row => row !== null && typeof row === 'object')
      .map(row => ({
        currency: typeof row.currency === 'string' ? row.currency : '',
        totalBalance: String(row.total_balance ?? ''),
        grantedBalance: String(row.granted_balance ?? ''),
        toppedUpBalance: String(row.topped_up_balance ?? ''),
      })),
  }
}

/**
 * Read both wallets concurrently, keeping each source's last good reading.
 *
 * A transient failure must not blank a number the user was already reading:
 * an `error` state falls back to that source's previous success, flagged
 * `stale` with the reason attached. Signed-out, unsupported, and no-key are
 * real states, not failures — they are served as they are.
 * @param ctx - the plugin's Host context.
 * @param lastGood - per-source store of the last successful reading.
 * @returns the payload body without cache metadata.
 */
async function readBoth(ctx, lastGood) {
  const [accountFresh, apiFresh] = await Promise.all([readAccount(ctx), readApi(ctx)])
  return {
    fetchedAt: Date.now(),
    account: keepLastGood(lastGood, 'account', accountFresh),
    api: keepLastGood(lastGood, 'api', apiFresh),
  }
}

/**
 * Replace a failed read with that source's previous success.
 * @param lastGood - per-source store, updated in place on success.
 * @param key - `account` or `api`.
 * @param fresh - this read's outcome.
 * @returns the outcome to publish.
 */
function keepLastGood(lastGood, key, fresh) {
  if (fresh.state === 'ready') {
    lastGood[key] = fresh
    return fresh
  }
  const previous = lastGood[key]
  if (fresh.state !== 'error' || previous === undefined) return fresh
  return { ...previous, stale: true, error: fresh.message }
}

/**
 * Mount the read-only status route, with a shared in-flight read and a
 * stale-while-error cache so a flaky Platform never blanks the status bar.
 * @param ctx - the plugin's Host context.
 */
export function apply(ctx) {
  /** Last successful payload, served inside the freshness window. */
  let cached
  /** The one read concurrent callers share. */
  let inflight
  /** Last successful reading per source, so a flaky read keeps its number. */
  const lastGood = { account: undefined, api: undefined }

  /**
   * Read with de-duplication.
   * @returns the fresh payload body.
   */
  const readShared = () => {
    inflight ??= readBoth(ctx, lastGood).finally(() => { inflight = undefined })
    return inflight
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      const query = new URL(req.url ?? ROUTE, 'http://127.0.0.1').searchParams
      const manual = query.get('refresh') === '1'
      if (!manual && cached !== undefined && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        sendJson(res, 200, { ok: true, cached: true, ...cached })
        return
      }
      try {
        const payload = await readShared()
        cached = payload
        sendJson(res, 200, { ok: true, cached: false, ...payload })
      } catch (error) {
        // A throw here is unexpected (each half reports its own failure), so
        // keep the last good numbers visible and surface the reason alongside.
        ctx.logger.warn(`dsh-dual-balance: status read failed: ${messageOf(error)}`)
        if (cached !== undefined) {
          sendJson(res, 200, { ok: true, cached: true, stale: true, error: messageOf(error), ...cached })
          return
        }
        sendJson(res, 200, {
          ok: true,
          cached: false,
          stale: true,
          error: messageOf(error),
          fetchedAt: Date.now(),
          account: { state: 'error', message: messageOf(error) },
          api: { state: 'error', message: messageOf(error) },
        })
      }
    },
  }), 'dsh-dual-balance: status route')
}
