<div align="center">
  <img src="public/favicon.png" alt="Sublink Worker" width="120" height="120"/>

  <h1><b>Sublink Worker</b></h1>
  <h5><i>一个 Worker，处理所有订阅</i></h5>

  <p><b>运行在 Cloudflare Workers 上的轻量级代理订阅转换与管理工具。</b></p>

  <p style="display: flex; align-items: center; gap: 10px; justify-content: center;">
    <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/osGex0o0II/sublink-worker">
      <img src="https://deploy.workers.cloudflare.com/button" alt="部署到 Cloudflare Workers" style="height: 32px;"/>
    </a>
  </p>
</div>

## 快速开始

### Cloudflare Workers

```bash
npm install
npm run deploy
```

### 本地开发与测试

```bash
npm install
npm run dev
npm test
```

## 功能特性

### 支持的协议

ShadowSocks, VMess, VLESS, Hysteria2, Trojan, TUIC

### 支持的客户端

Sing-Box, Clash/Mihomo, Xray/V2Ray, Surge

### 支持的输入

- Base64 订阅
- HTTP/HTTPS 订阅
- 完整配置：Sing-Box JSON、Clash YAML、Surge INI

### 核心能力

- 导入多个来源的订阅
- 基于 KV 存储生成固定或随机短链
- 将订阅转换为多个代理客户端配置
- 自定义规则集与策略组
- 按 ID 存储可复用的基础配置
- 多语言 Web 界面

## Cloudflare 运行时

短链和已保存配置使用 Cloudflare KV。`npm run deploy` 会先执行 `scripts/setup-kv.cjs`，自动检查或创建 `SUBLINK_KV` 命名空间，并更新 `wrangler.toml`。

静态资源由 Workers Assets 提供，配置位于 `wrangler.toml`：

```toml
[assets]
directory = "./public"
binding = "ASSETS"
```

## API 概览

- `GET /singbox?config=...`：输出 Sing-Box JSON
- `GET /clash?config=...`：输出 Clash/Mihomo YAML
- `GET /surge?config=...`：输出 Surge 配置
- `GET /xray?config=...`：输出 Base64 代理链接列表
- `GET /subconverter`：输出规则集配置
- `GET /shorten-v2?url=...`：创建短链代码
- `POST /config`：存储可复用的基础配置并返回配置 ID

## 开发检查清单

- 改协议解析时，同步检查协议解析器注册、客户端配置转换和对应测试。
- 改配置生成时，确认 Sing-Box、Clash/Mihomo、Surge、Xray/V2Ray 是否都受影响。
- 改运行时或 KV 时，验证 Cloudflare Workers 入口、KV 绑定和本地 Wrangler 开发环境。
- 改 Web 界面文案时，同步维护 `src/i18n/` 下的多语言内容。
- 小改动优先跑相关单测；涉及入口、运行时、KV 或共享逻辑后跑 `npm test`。

## 维护约束

- 不引入新的格式化、检查或构建工具，除非确有必要。
- 不随手重构无关模块，避免把运行时差异放进协议解析或配置构建逻辑。
- 不用临时字符串拼接替代已有解析器、构建器或结构化配置处理逻辑。
- 不改生成产物、锁文件或部署配置，除非本次变更确实依赖它们。

## 许可证

本项目使用 MIT 许可证。详情见 [LICENSE](LICENSE)。

## 免责声明

本项目仅供学习与交流使用，请勿用于非法用途。使用者需自行承担使用行为及其后果。
