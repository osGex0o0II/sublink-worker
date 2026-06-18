# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 协作偏好

- 用中文回复；代码注释用英文，注释写 why 不写 how。
- 简洁直接，不要多余总结和解释；除非存在高风险或信息缺口，直接写代码。
- 函数式优先，TS/JS 中避免 OOP；新功能优先复用或重构现有代码。
- 遵循 KISS、DRY 和 `ai-coding-discipline` 规则。
- 从第一性原理解构问题，警惕 XY 问题；发现不合理方向立即指出，不奉承。
- 架构权衡参考 `ddia-principles` 和 `software-design-philosophy`。

## 项目概览

Sublink Worker 是运行在 Cloudflare Workers 上的代理订阅转换器：将各类协议（ShadowSocks/VMess/VLESS/Hysteria2/Trojan/TUIC）转为客户端配置（Sing-Box/Clash/Xray/Surge）。技术栈：Hono（Web/JSX SSR）+ Vitest + Wrangler。

## 常用命令

- `npm run dev` — Wrangler 本地开发（Cloudflare Workers 入口）
- `npm test` — Vitest（基于 `@cloudflare/vitest-pool-workers`，依赖 `wrangler.toml`）
- `npx vitest test/<file>.test.js` — 跑单个测试文件
- `npm run deploy` — `setup-kv` + `wrangler deploy`

无 ESLint/Prettier/Biome 配置，未启用自动格式化。

## Cloudflare Workers 架构

入口：`src/worker.jsx` 通过 `createCloudflareRuntime(env)` 创建运行时，再通过 `createApp(runtime)`（`src/app/createApp.jsx`）创建 Hono app。

- `src/runtime/cloudflare.js` 提供 Cloudflare KV 与 Assets 绑定适配
- `src/runtime/runtimeConfig.js` 规范化 KV、资源获取、日志、环境变量默认值

## KV 存储抽象

统一接口：`get(key)`、`put(key, value, options)`、`delete(key)`。实现：`CloudflareKVAdapter`、`MemoryKVAdapter`。

- 服务层：`ShortLinkService`（短链）、`ConfigStorageService`（base config 存储，默认 30 天 TTL）
- Cloudflare 用 `wrangler.toml` 的 `SUBLINK_KV` 与 `ASSETS` binding

部署前用 `npm run setup-kv` 检查或创建 `SUBLINK_KV` 命名空间。

## 协议解析与配置构建

**ProxyParser**（`src/parsers/ProxyParser.js`）按 URL scheme 分发到 `src/parsers/protocols/<protocol>Parser.js`。HTTP(S) 订阅走 `httpSubscriptionFetcher` → `subscriptionContentParser`，自动识别 Sing-Box JSON / Clash YAML / Surge INI / Base64 列表。

返回值约定：
- 协议 parser：`{ tag, type, ...protocolFields }`
- 订阅级 parser：`{ type: 'yamlConfig'|'singboxConfig'|'surgeConfig', config, proxies }`

**新增协议**：在 `src/parsers/protocols/` 加 parser，并在 `ProxyParser.js` 的 `protocolParsers` map 注册。

**Builder 模式**：`SingboxConfigBuilder` / `ClashConfigBuilder` / `SurgeConfigBuilder` 都继承 `BaseConfigBuilder`。子类必须实现：`getProxies()`、`getProxyName(proxy)`、`convertProxy(proxy)`、`addProxyToConfig(proxy)`、`addAutoSelectGroup(list)`、`addNodeSelectGroup(list)`、`addOutboundGroups(outbounds, list)`、`addCustomRuleGroups(list)`、`addFallBackGroup(list)`、`addCountryGroups()`、`formatConfig()`。

**Config Override**：订阅含完整配置时，`applyConfigOverrides()` 合并非代理字段到 base config；blacklist（proxies、rules、rule-providers）永远不被覆盖；Clash `proxy-groups` 可被订阅覆盖以保留用户分组结构。

国家分组逻辑在 `src/utils.js#groupProxiesByCountry`。

## 测试

Vitest + `@cloudflare/vitest-pool-workers`，配置 `vitest.config.js` 指向 `wrangler.toml`。测试文件在 `test/`。

- 写测试时用 `MemoryKVAdapter` 做 KV，用 `createApp(runtime)` 拿到可测的 Hono app
- 覆盖：路由、各 builder、各 parser（含 YAML 订阅）、country grouping、selectedRules 向后兼容

## 关键约定

- `.jsx` 文件用 Hono JSX runtime，**不是 React**
- Base64 输入用 `tryDecodeSubscriptionLines()` 处理（同时支持原文和 Base64）
- 错误用 `ServiceError` 子类（`InvalidPayloadError`、`MissingDependencyError`），返回干净响应
- i18n：zh-CN / en-US / fa-IR，文件在 `src/i18n/`

## 本地工作流

- 本地分层规划放 `.roadmap/roadmap.md`（已 `.gitignore`）；更新前先同步 GitHub open issues，每条记录留 issue 链接、优先级依据、下一步
- 个人偏好、沙盒、临时上下文写入 `CLAUDE.local.md`（不提交）
- 通用 agent 规则放 `AGENTS.md` / `AGENTS.local.md`
- Claude 本地设置写入 `.claude/settings.local.json`（不提交）

## 文档参考

代理工具配置问题查官方文档：
- sing-box: https://sing-box.sagernet.org/
- clash/mihomo: https://wiki.metacubex.one/
- surge: https://blankwonder.gitbooks.io/surge-manual/content/
- xray: https://xtls.github.io/config/
