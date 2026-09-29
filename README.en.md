# dsh-dual-balance

**English** | [中文](README.md)

[![CI](https://github.com/fangweixuan26-hash/dsh-dual-balance/actions/workflows/ci.yml/badge.svg)](https://github.com/fangweixuan26-hash/dsh-dual-balance/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.5--rc.1-blueviolet.svg)](package.json)
[![platform](https://img.shields.io/badge/platform-web-4c8bf5.svg)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

> See the balance of the **DeepSeek account you signed in with** — not just the API key's — right in the DeepSeek Harness status bar.

![The composer stats band in DSH, with the balance pill among the official pills](assets/status-band.png)

*A real screenshot: `余额 ¥9.49` is this plugin, sitting between the official `1 轮 239 步 · 280 tok/s`, `65M tok · 缓存命中 99.6%` and the context ring — same row, same type scale, same icon language.*

---

## Why another balance plugin

DSH has two distinct wallet sources, and the community only covered one of them:

| Source | Data | Community plugins |
| :--- | :--- | :--- |
| **Signed-in account** | Platform wallet: recharge + granted bonus (the `deepseekAccount` service) | ❌ nobody |
| **API key** | `GET https://api.deepseek.com/user/balance` | ✅ several |

[dsh-usage-state](https://github.com/takboo/dsh-usage-state), [dsh-balance-quota](https://github.com/kongshan-zhuyu/dsh-balance-quota), [dsh-balance-status](https://www.npmjs.com/package/dsh-balance-status) and [@absons/dsh-deepseek-balance](https://www.npmjs.com/package/@absons/dsh-deepseek-balance) all read only the API key's balance — none of them uses the host's built-in `deepseekAccount` service, so none can answer "how much is left in the account I'm signed into".

**This plugin puts both in one status bar** and handles the relationship for you:

- Same account (the common case): the two sources are **one wallet**, differing only by the official endpoint's two-decimal rounding → the pill **collapses to one figure**, `余额 ¥9.49`.
- Key belongs to another account: the numbers genuinely differ → both segments show, `账号 … | API …`.

Either way the full breakdown (recharge / bonus / total / timestamp) is one click away.

## Features

- **Account balance** — the host's `deepseekAccount.getBalance()` → Platform wallet, with **recharge and granted bonus read separately**, at Platform's full precision.
- **API balance** — `DEEPSEEK_API_KEY` → the official `/user/balance`.
- **Click for details** — the same anchored dialog seat the official stat pills use (literally the same `useAnchoredPosition` primitive); Esc or an outside click closes it, and opening it forces a fresh read.
- **Automatic collapse** — one wallet shows as one figure; no status-bar width wasted on a duplicate.
- **Zero config, zero dependencies** — install and go; no npm runtime dependency at all.
- **Secrets stay on the machine** — the account grant and API key are used only inside the host process; the browser reads numbers from a loopback-only route.
- **Failures never lie** — a failed read keeps the last good number and marks it `⚠`; a failure is never rendered as `0`.
- **Pixel-aligned with the official status bar** — the pill shape, hover, dialog and icon all reuse the official CSS recipes and primitives (below).

## Install

Requires DSH `0.1.5-rc.1` or newer and Node ≥ 20. The package **ships a prebuilt `lib/`**, so installation has no build step.

**Straight from the repository** (recommended; identical to the source):

```bash
dsh plugin --profile web add github:fangweixuan26-hash/dsh-dual-balance
```

**From a local checkout** (edits take effect immediately — good for development):

```bash
dsh plugin --profile desktop add /path/to/dsh-dual-balance
```

**Desktop clients** are supported too — pass your desktop profile name to `--profile` (this machine uses `desktop`).

Both halves reload through HMR; if the UI does not change, refresh the page once.

Uninstall:

```bash
dsh plugin --profile web remove dsh-dual-balance
```

## What you get

One more pill in the composer stats band:

```
↻ 4 轮 239 步 · 280 tok/s   🗄 65M tok · 缓存命中 99.6%   [wallet] 余额 ¥9.49   ◐ 46%
```

| State | Pill |
| :--- | :--- |
| Normal, one account | `余额 ¥9.49` |
| Two accounts, genuinely different | `账号 ¥13.78 | API ¥2.00` |
| Account signed out | `账号 未登录` |
| Host has no `deepseekAccount` (non-account composition) | `账号 不支持` |
| `DEEPSEEK_API_KEY` not configured | `API 未配置` |
| Request failed | `… 读取失败` (red); the dialog carries the reason |
| Loopback route unreachable | `余额不可用` |
| Failed, but a previous success exists | the old value + `⚠`, dialog marked "last good reading + reason" |
| Signed out / no key / unsupported | **no** stale fallback — those are real states, not failures |

Background refresh every 60 s; opening the dialog forces one immediate refresh.

*(The pill's own labels follow the browser language: Chinese on a `zh-*` locale, English otherwise.)*

## Where the numbers come from

| Segment | Source | Value |
| :--- | :--- | :--- |
| Account | host `deepseekAccount.getBalance()` → Platform `/api/v0/users/get_user_summary` | `normal_wallets` (recharge) + `bonus_wallets` (granted), **Platform's full precision** |
| API | `GET https://api.deepseek.com/user/balance` (Bearer `DEEPSEEK_API_KEY`) | `balance_infos[].total_balance` / `granted_balance` / `topped_up_balance`, two decimals |

The pill shows a single figure: **CNY when present**, otherwise the largest wallet by absolute value. Every currency and the recharge/bonus split live in the dialog.

**Collapse rule**: when both sources are ready, share a currency, and the account side (recharge + bonus) differs from the API total by ≤ 0.01, they are treated as one wallet and the pill collapses. The threshold follows from the official endpoint reporting two decimals — one wallet can differ by at most half a cent across the two.

## Alignment with the official status bar

This is not "looks like the official one" — it reuses the official recipes and primitives, each with its provenance noted in `lib/client.js`:

| Piece | Source |
| :--- | :--- |
| Pill shape | The band's own CSS: ghost background, `border-radius: 999px`, `padding: 1px 8px`, `gap: 6px`, tertiary ink, `calc(var(--dsh-content-font-size-secondary, 13px) - 1px)` type |
| Hover / expanded | `.dshdb-pill:hover, .dshdb-pill[aria-expanded="true"]` → `var(--dsw-alias-interactive-bg-hover)` + `var(--dsw-alias-label-secondary)`, **pure CSS and instant**, exactly like the official pills. The sheet is injected by the plugin and tagged `data-plugin`, so unloading the plugin removes it |
| Click dialog | The official `useAnchoredPosition` + `useDismissOnOutsidePointer` primitives around the official `stat-dialog` panel recipe (`--dsw-specific-menu` surface, `--dsw-elevation-prominent` shadow, `z-index: 1100`), portaled to `<body>` with `role="dialog"` |
| Icon | The official contract: `viewBox="0 0 16 16"`, `fill="none"`, `strokeWidth={1}`, `stroke="currentColor"`, `aria-hidden` |
| Motion tokens | The shared parameters are `--ds-transition-duration` (0.2s), `-fast` (0.1s), `-slow` (0.3s) and `--ds-ease-in-out` (cubic-bezier(0.4, 0, 0.2, 1)). This plugin's hover and expand are instant, like the official pills, so it **invents no motion of its own** |

### Two traps, kept in the source as guardrails

**1. The pill must never set `width: 100%`.** The band is a horizontal flex row; one greedy entry ellipsizes every official pill beside it (`1 轮 1...`). The first version of this plugin did exactly that.

**2. Hover state must not be React state.** Tracking hover in `useState`, or using an `opacity` flag for "refreshing", breaks the moment `mouseleave` does not fire as expected or the flag's clear is dropped by React (which is what happens when you put a side effect inside a `setState` updater) — the pill then stays faded **until the next click**. CSS `:hover` / `[aria-expanded]` has no such failure mode.

### About the wallet icon

The official icon set has **no wallet or coin glyph** (the closest names are `IconApiOutline`, actually a `>_` prompt, and `IconDataOutline`, a database cylinder), so this one is hand-drawn. Its size is not eyeballed either — it is matched to the **ink bounding-box width** of the two official icons beside it, because the band lays its icons out horizontally and the eye compares horizontal run (heights disagree inside the set: the gauge is 13.21 tall, the database 13.78, and matching a cylinder's height would make a solid wallet outline read heavier than every neighbour):

| Icon | Ink w × h |
| :--- | :--- |
| `IconGaugeOutlineRegular` | 13.25 × 13.21 |
| `IconDatabaseOutlineRegular` | 12.00 × 13.78 |
| this wallet (v1, squashed) | 12.50 × 7.00 |
| this wallet (v2, too small) | 11.00 × 10.00 |
| **this wallet (current)** | **12.30 × 11.20** |

That lands inside the pair's own 12.00–13.25: 2.5% wider than the database, 7.2% narrower than the gauge. Swapping in any official icon is a one-place change in `WalletIcon`.

## Configuration

None needed. Internal constants:

| Constant | Default | Meaning |
| :--- | :--- | :--- |
| `ROUTE` (host) | `/api/dsh-dual-balance/status` | Read-only route (`?refresh=1` bypasses the cache) |
| `API_BALANCE_URL` (host) | `https://api.deepseek.com/user/balance` | Official balance endpoint |
| `API_KEY_REF` (host) | `DEEPSEEK_API_KEY` | Credential / environment reference name |
| `CACHE_TTL_MS` (host) | `60000` | Server-side cache window |
| `API_TIMEOUT_MS` (host) | `10000` | Official endpoint timeout |
| `POLL_MS` (client) | `60000` | Browser poll interval |

To display a different API key, point `API_KEY_REF` at another name in `~/.dsh/.credentials.yaml`.

## How it works

```
┌──────────────────────┐                    ┌─────────────────────────────┐
│ Platform wallet      │◀── deepseekAccount │ Host half (lib/index.js)     │
│ (the signed-in acct) │     .getBalance()  │ · zero imports, zero deps    │
├──────────────────────┤                    │ · both wallets read together │
│ api.deepseek.com     │◀── Bearer cred     │ · 60s cache + shared inflight│
│ /user/balance        │                    │ · per-source stale fallback  │
└──────────────────────┘                    │ · GET /api/dsh-dual-balance/ │
                                            │        status                │
                                            └──────────────┬──────────────┘
                                                           │ same-origin fetch
                                            ┌──────────────▼──────────────┐
                                            │ Client half (lib/client.js)  │
                                            │ · composer.dock pill         │
                                            │ · official anchored dialog   │
                                            └─────────────────────────────┘
```

**Host half** (`lib/index.js`) — a function plugin (`name` / `inject` / `apply`) with **zero imports**.

- `deepseekAccount` is deliberately **not** in `inject`: it ships only with the account (desktop) composition, and its absence must not take the whole plugin down. It is read per request through `ctx.get('deepseekAccount')` and reported as `unavailable` when missing.
- `CredentialRef` is a brand over the identifier string, so the literal `'DEEPSEEK_API_KEY'` is the same value at runtime — no dependency on `@deepseek-ai/dsh-credentials` needed.
- Both wallets are read concurrently; concurrent callers share one in-flight read inside the 60 s window; manual refresh bypasses the cache.
- Each source carries its own `state`, plus a per-source stale-while-error fallback.

**Client half** (`lib/client.js`) — the `window.__ModuleLoader__.load({ id, factory })` envelope, requiring only frozen-table platform modules (`react`, `react-dom`, `@deepseek-ai/dsh-client-ui-primitives`), with `inject: ['slots']`, registering into `conversation.composer.dock` (the official stats entry is `id: 'stats', order: 0`; this plugin uses `order: 1`).

> Do not register into `conversation.composer.bar` — that is the composer body itself, a `single` slot the core already owns; registering there conflicts.

## Development and tests

```bash
npm test
# same as:
node tests/host-smoke.mjs     # host half: route, cache, collapse rule, per-source degradation
node tests/client-smoke.mjs   # client half: collapse rule, amount formatting, every state's copy
```

Both suites are **dependency-free plain Node scripts** that load the **shipped `lib/` artifacts** (not a copy of the source), so they test what users actually install.

CI runs both suites on Node 20 / 22 / 24 and separately checks that the committed artifacts parse.

While developing:

- Client-half edits hot-replace through HMR; refresh the page.
- Host-half edits re-import through HMR; restart DSH if they do not take.

**`lib/` must stay committed** — `dsh plugin add github:...` installs the repository as-is, with no build step.

## Compatibility

- Verified on **DSH `0.2.0-rc.2` with the Desktop client (Windows)**: account wallet, API balance, collapse, dialog, and the degradation paths.
- When `deepseekAccount` is absent the plugin reports `账号 不支持` and keeps working (e.g. a plain Web-profile composition).
- Beyond Node built-ins and the platform modules in DSH's frozen module table, it **imports nothing**.

## FAQ

**Why do the two numbers differ?**
The official `/user/balance` reports two decimals while the Platform wallet reports full precision. One wallet can differ by at most half a cent, which is what the plugin collapses on; a larger gap means `DEEPSEEK_API_KEY` belongs to a different account.

**Why is the granted bonus 0?**
The granted credit is used up. The recharge balance is unaffected.

**Does this leak my API key?**
No. The API key and account grant are used only inside the host process; the browser calls a loopback route, `/api/dsh-dual-balance/status`, and receives only numbers, states, and error text.

**The pill looks permanently grey.**
That means a failed or unconfigured read — hover it and the dialog gives the reason. A healthy pill is tertiary ink and darkens on hover.

## License

[MIT](LICENSE)
