# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-30

First release.

### Added

- **Account balance**: the signed-in account's Platform wallet through the host's
  built-in `deepseekAccount.getBalance()`, reading recharge and granted-bonus
  wallets separately at Platform's full precision.
- **API balance**: `DEEPSEEK_API_KEY` through `GET https://api.deepseek.com/user/balance`.
- **One pill** in `conversation.composer.dock`, matching the official stats band's
  own CSS recipe (ghost background, `999px` radius, `1px 8px` padding, tertiary ink).
- **Automatic collapse**: when both sources describe one wallet (same currency,
  totals within one cent) the pill shows a single figure; a second account's key
  keeps both segments.
- **Click-to-expand dialog** built from the official `useAnchoredPosition` and
  `useDismissOnOutsidePointer` primitives and the official `stat-dialog` panel
  recipe; opening it forces a refresh, Esc or an outside click closes it.
- **Per-source stale-while-error**: a transient failure keeps that source's last
  good reading, marked `⚠` with the reason; signed-out, unsupported and no-key
  are real states and never fall back to a stale value.
- **Custom wallet icon** drawn to the official outline-icon contract, sized to the
  ink width of the icons beside it.
- Host half with **zero imports and zero dependencies**; `deepseekAccount` is read
  optionally so a composition without it still works.
- `tests/host-smoke.mjs` and `tests/client-smoke.mjs`: dependency-free suites that
  load the shipped `lib/` artifacts.
- GitHub Actions CI on Node 20 / 22 / 24, plus a committed-artifact parse check.

### Fixed during development

- A `width: 100%` pill claimed the whole flex row and ellipsized every official
  pill beside it.
- A JS hover/opacity flag could stick and leave the pill faded until the next
  click; hover and expanded state are now pure CSS.
- The wallet glyph was at first too flat (`12.5 x 7`) and then too small
  (`11 x 10`); it is now `12.3 x 11.2`, inside the 12.00–13.25 range of its
  official neighbours.

[0.1.0]: https://github.com/fangweixuan26-hash/dsh-dual-balance/releases/tag/v0.1.0
