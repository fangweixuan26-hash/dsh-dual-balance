# dsh-dual-balance

[English](README.en.md) | **中文**

[![CI](https://github.com/fangweixuan26-hash/dsh-dual-balance/actions/workflows/ci.yml/badge.svg)](https://github.com/fangweixuan26-hash/dsh-dual-balance/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.5--rc.1-blueviolet.svg)](package.json)
[![platform](https://img.shields.io/badge/platform-web-4c8bf5.svg)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

> 在 DeepSeek Harness 的状态栏里，一眼看到 **DSH 登录账号的余额**——不只是 API Key 的那个。

![DSH 输入框下方的统计带，余额药丸位于官方药丸之间](assets/status-band.png)

*真实截图：`余额 ¥9.49` 就是本插件，夹在官方的 `1 轮 239 步 · 280 tok/s`、`65M tok · 缓存命中 99.6%` 和上下文环之间——同一行、同一字号、同一套图标语言。*

---

## 为什么还要一个余额插件

DSH 里有两个不同的钱包来源，社区插件此前只覆盖了一半：

| 来源 | 数据 | 社区插件 |
| :--- | :--- | :--- |
| **登录账号** | Platform 钱包：充值余额 + 赠送余额（`deepseekAccount` 服务） | ❌ 无人实现 |
| **API Key** | `GET https://api.deepseek.com/user/balance` | ✅ 已有多个 |

[dsh-usage-state](https://github.com/takboo/dsh-usage-state)、[dsh-balance-quota](https://github.com/kongshan-zhuyu/dsh-balance-quota)、[dsh-balance-status](https://www.npmjs.com/package/dsh-balance-status)、[@absons/dsh-deepseek-balance](https://www.npmjs.com/package/@absons/dsh-deepseek-balance) 都只读 API Key 余额——它们没有用宿主内置的 `deepseekAccount` 服务，所以看不到"我登录的这个账号里还有多少钱"。

**本插件把两者并排放在同一条状态栏里**，并自动处理它们的关系：

- 同一个账号时（最常见），两个来源是**同一笔钱**，只差官方接口的两位小数舍入 → 自动**合并成一段**「余额 ¥9.49」；
- Key 属于另一个账号时，两个数字真的不同 → 自动**并排显示**「账号 … | API …」。

不管哪种情况，完整明细（充值/赠送/合计/更新时刻）都在点击展开的面板里。

## 特性

- **账号余额**：宿主内置 `deepseekAccount.getBalance()` → Platform 钱包，**充值余额与赠送余额分开取**，保留官方原始精度；
- **API 余额**：`DEEPSEEK_API_KEY` → 官方 `/user/balance`；
- **点击展开详情面板**：与官方统计药丸同一套锚定弹层（同一个 `useAnchoredPosition` 原语），Esc / 点击外部关闭；打开即触发一次真实刷新；
- **自动折叠**：同一笔钱只显示一段，不浪费状态栏宽度；
- **零配置、零依赖**：装完即用，不引入任何 npm 运行时依赖；
- **密钥不出本机**：账号凭证与 API Key 只在 Host 进程内使用，浏览器只从本机只读路由读数字；
- **失败不撒谎**：读取失败保留上次成功值并标 `⚠`，绝不把失败显示成 `0`；
- **和官方状态栏像素级对齐**：药丸外形、悬停、弹层、图标全部复用官方的 CSS 配方与原语（见下）。

## 安装

要求：DSH `0.1.5-rc.1` 或更高、Node ≥ 20。包内**自带预构建的 `lib/`**，安装时没有构建步骤。

**从仓库直接装**（推荐，内容与仓库一致）：

```bash
dsh plugin --profile web add github:fangweixuan26-hash/dsh-dual-balance
```

**从本地目录装**（改源码即生效，开发时用）：

```bash
dsh plugin --profile desktop add /path/to/dsh-dual-balance
```

**桌面版**：本插件同样适用于 Desktop 客户端，把 `--profile` 换成桌面版的 profile 名即可（本机为 `desktop`）。

安装后宿主与客户端半区都会随 HMR 重新导入；若界面没变化，刷新一次页面。

卸载：

```bash
dsh plugin --profile web remove dsh-dual-balance
```

## 你会看到什么

统计带里多一枚药丸：

```
↻ 4 轮 239 步 · 280 tok/s   🗄 65M tok · 缓存命中 99.6%   [钱包] 余额 ¥9.49   ◐ 46%
```

| 状态 | 显示 |
| :--- | :--- |
| 正常（同一账号） | `余额 ¥9.49` |
| 两个账号，真的不同 | `账号 ¥13.78 | API ¥2.00` |
| 账号未登录 | `账号 未登录` |
| 宿主没有 `deepseekAccount`（非账号版组合） | `账号 不支持` |
| 未配置 `DEEPSEEK_API_KEY` | `API 未配置` |
| 请求失败 | `… 读取失败`（红色），面板给出原因 |
| 本机路由不可达 | `余额不可用` |
| 读取失败但有上次成功值 | 旧值 + `⚠`，面板标注「上次成功数据 + 原因」 |
| 未登录 / 无 Key / 不支持 | **不**用旧值兜底——这些是真实状态，不是故障 |

空闲 60 秒自动刷新一次；点击药丸打开面板时强制刷新一次。

## 口径

| 段 | 数据源 | 取到的数 |
| :--- | :--- | :--- |
| 账号 | 宿主 `deepseekAccount.getBalance()` → Platform `/api/v0/users/get_user_summary` | `normal_wallets`（充值）+ `bonus_wallets`（赠送），**保留官方原始精度** |
| API | `GET https://api.deepseek.com/user/balance`（Bearer `DEEPSEEK_API_KEY`） | `balance_infos[].total_balance` / `granted_balance` / `topped_up_balance`，官方两位小数 |

药丸只显示一个数：**优先 CNY**，没有 CNY 时取绝对值最大的币种；全部币种与充值/赠送拆分都在面板里。

**折叠判定**：两个来源都是 ready、币种相同、且账号侧（充值 + 赠送）与 API 侧总额相差 ≤ 0.01 时，视为同一笔钱，折叠成一段。阈值来自官方接口只给两位小数这件事——同一个钱包在两侧最多差半分钱。

## 和官方状态栏的对齐

这不是"像官方"，而是直接复用官方的配方与原语（`lib/client.js` 顶部注明了每一条的出处）：

| 项 | 来源 |
| :--- | :--- |
| 药丸外形 | 官方统计带自己的 CSS：ghost 背景、`border-radius: 999px`、`padding: 1px 8px`、`gap: 6px`、tertiary 墨色、`calc(var(--dsh-content-font-size-secondary, 13px) - 1px)` 字号 |
| 悬停 / 展开态 | `.dshdb-pill:hover, .dshdb-pill[aria-expanded="true"]` → `var(--dsw-alias-interactive-bg-hover)` + `var(--dsw-alias-label-secondary)`，**纯 CSS、瞬时**，与官方药丸一致。样式表由插件自己注入并用 `data-plugin` 标记归属，卸载时随插件一起被移除 |
| 点击面板 | 官方原语 `useAnchoredPosition` + `useDismissOnOutsidePointer`，配官方 `stat-dialog` 面板配方（`--dsw-specific-menu` 底、`--dsw-elevation-prominent` 阴影、`z-index: 1100`），`createPortal` 到 `<body>`，`role="dialog"` |
| 图标 | 官方契约：`viewBox="0 0 16 16"`、`fill="none"`、`strokeWidth={1}`、`stroke="currentColor"`、`aria-hidden` |
| 动效 token | 官方共享参数是 `--ds-transition-duration`(0.2s) / `-fast`(0.1s) / `-slow`(0.3s) / `--ds-ease-in-out`(cubic-bezier(0.4,0,0.2,1))。本插件的悬停/展开都是瞬时的（和官方药丸一样），所以**不自己造动效** |

### 两个踩过的坑（留在源码注释里当护栏）

**一、药丸不能用 `width: 100%`。** 统计带是横向 flex 行，一个贪心条目会把旁边的官方药丸全部压成省略号（`1 轮 1...`）。本插件第一个版本正是这么翻的车。

**二、悬停态不能用 React state。** 用 `useState` 记 hover、或者用一个 `opacity` 标志表示"刷新中"，一旦 `mouseleave` 没按预期触发、或那个标志的清除被 React 丢弃（在 `setState` 的 updater 里做副作用就会这样），药丸会一直淡着，**直到下次点击才恢复**。CSS 的 `:hover` / `[aria-expanded]` 没有这个失败模式。

### 关于钱包图标

官方图标集里**没有钱包/硬币类图标**（名字最接近的 `IconApiOutline` 实际是 `>_` 提示符、`IconDataOutline` 是数据库柱），所以自绘了一枚。尺寸不是"看着差不多"，而是按旁边两个官方图标的**墨迹包围盒宽度**定的——这条带子横向排布，眼睛比的就是水平跨度（高度上官方自己就不统一：仪表偏方 13.21，数据库偏高 13.78，硬追圆柱的高度会让实心轮廓的钱包显得比所有邻居都重）：

| 图标 | 墨迹 w × h |
| :--- | :--- |
| `IconGaugeOutlineRegular` | 13.25 × 13.21 |
| `IconDatabaseOutlineRegular` | 12.00 × 13.78 |
| 本插件钱包（初版，偏扁） | 12.50 × 7.00 |
| 本插件钱包（二版，偏小） | 11.00 × 10.00 |
| **本插件钱包（当前）** | **12.30 × 11.20** |

落在两个官方邻居的 12.00–13.25 之间：比数据库宽 2.5%，比仪表窄 7.2%。要换成任何官方图标，改 `WalletIcon` 一处即可。

## 配置

无需配置。内部常量：

| 常量 | 默认 | 说明 |
| :--- | :--- | :--- |
| `ROUTE`（host） | `/api/dsh-dual-balance/status` | 只读路由（`?refresh=1` 绕过缓存） |
| `API_BALANCE_URL`（host） | `https://api.deepseek.com/user/balance` | 官方余额接口 |
| `API_KEY_REF`（host） | `DEEPSEEK_API_KEY` | 凭据库/环境变量引用名 |
| `CACHE_TTL_MS`（host） | `60000` | 服务端缓存窗口 |
| `API_TIMEOUT_MS`（host） | `10000` | 官方接口超时 |
| `POLL_MS`（client） | `60000` | 前端轮询间隔 |

要显示别的 API Key，把 `API_KEY_REF` 改成 `~/.dsh/.credentials.yaml` 里的另一个名字即可。

## 工作原理

```
┌──────────────────────┐                    ┌─────────────────────────────┐
│ Platform 钱包         │◀── deepseekAccount │ Host 半区 (lib/index.js)     │
│ (DSH 登录账号)        │     .getBalance()  │ · 零 import、零依赖          │
├──────────────────────┤                    │ · 两个钱包并发读             │
│ api.deepseek.com     │◀── Bearer 取凭据    │ · 60s 缓存 + 在途请求共享     │
│ /user/balance        │                    │ · 每源 stale-while-error     │
└──────────────────────┘                    │ · GET /api/dsh-dual-balance/ │
                                            │        status               │
                                            └──────────────┬──────────────┘
                                                           │ 同源 fetch
                                            ┌──────────────▼──────────────┐
                                            │ Client 半区 (lib/client.js)  │
                                            │ · composer.dock 药丸         │
                                            │ · 官方原语的锚定详情面板      │
                                            └─────────────────────────────┘
```

**Host 半区**（`lib/index.js`）：函数插件（`name` / `inject` / `apply`），**零 import**。

- `deepseekAccount` 故意**不写进 `inject`**：它只随账号版（桌面）组合提供，缺了不该让整个插件挂掉，所以每请求用 `ctx.get('deepseekAccount')` 取，缺席时报 `unavailable`；
- `CredentialRef` 只是标识符字符串的品牌类型，所以直接写字面量 `'DEEPSEEK_API_KEY'` 即可，不必引入 `@deepseek-ai/dsh-credentials`；
- 两个钱包并发读取，60 秒内共享同一次在途请求；手动刷新绕过缓存；
- 每个数据源各带自己的 `state`，并有按源的 stale-while-error（失败保留上次成功值）。

**Client 半区**（`lib/client.js`）：`window.__ModuleLoader__.load({ id, factory })` 信封，只 `require` 冻结模块表里的平台模块（`react` / `react-dom` / `@deepseek-ai/dsh-client-ui-primitives`），只 `inject: ['slots']`，注册到 `conversation.composer.dock`（官方统计条目是 `id: 'stats', order: 0`，本插件 `order: 1`）。

> 不要注册 `conversation.composer.bar` —— 那是输入框本体的 `single` 槽，已被核心占用，注册会冲突。

## 开发与测试

```bash
npm test
# 等价于：
node tests/host-smoke.mjs     # Host 半区：路由、缓存、折叠判定、每源降级
node tests/client-smoke.mjs   # Client 半区：折叠规则、金额格式化、各状态文案
```

两个测试都是**零依赖**的纯 Node 脚本，直接加载仓库里**实际发布的 `lib/` 产物**（不是源码副本），所以测的就是用户装到的东西。

CI 在 Node 20 / 22 / 24 上跑这两个套件，并单独校验提交进仓库的产物能解析。

改源码时：

- 客户端半区改动：HMR 自动热替换，刷新页面即可；
- 宿主半区改动：随 HMR 重新导入；若没生效，重启 DSH。

**`lib/` 产物必须提交进仓库** —— `dsh plugin add github:...` 直接装仓库、没有构建步骤。

## 兼容性

- 已在 **DSH `0.2.0-rc.2` + Desktop 客户端（Windows）** 上真机验证：账户钱包、API 余额、折叠、弹层、降级路径；
- 宿主侧 `deepseekAccount` 缺失时会显示「账号 不支持」，插件本身仍正常工作（例如纯 Web profile 的组合）；
- 除 Node 内置模块与 DSH 冻结模块表里的平台模块外，**不 import 任何东西**。

## 常见问题

**Q：为什么两个数字不一样？**
A：官方 `/user/balance` 只给两位小数，Platform 钱包给完整精度。同一个钱包两侧最多差半分钱，插件据此合并显示；差得更多说明 `DEEPSEEK_API_KEY` 属于另一个账号。

**Q：为什么面板里的「赠送」变成了 0？**
A：赠送额度用完了。充值余额不受影响。

**Q：会泄露我的 Key 吗？**
A：不会。API Key 与账号凭证只在 Host 进程内使用，浏览器只访问本机路由 `/api/dsh-dual-balance/status`，只拿到数字、状态和错误文本。

**Q：药丸颜色一直是灰的？**
A：说明读取失败或未配置，把鼠标移上去看面板里的原因；正常状态是 tertiary 墨色，悬停变深。

## 许可

[MIT](LICENSE)
