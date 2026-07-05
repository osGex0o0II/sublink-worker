# Operations Guide

## 上线前门禁

每次合并或部署前执行：

```bash
npm ci
npm run verify
```

`npm run verify` 会依次执行构建、完整测试、安全审计和依赖 freshness 检查。任何一步失败都不要部署。

## GitHub Secrets

Cloudflare 部署需要在 GitHub Actions 中配置：

- `CLOUDFLARE_API_TOKEN`
- `CF_ACCOUNT_ID`

API Token 至少需要允许 Workers 部署和 KV namespace 管理。缺少 token 时，Wrangler 在非交互环境会拒绝执行。

官方参考：

- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/wrangler/system-environment-variables/

## Cloudflare 安全规则

订阅客户端通常以 CLI、移动客户端或代理客户端 User-Agent 访问以下路径：

- `/singbox`
- `/clash`
- `/xray`
- `/surge`
- `/b/*`
- `/c/*`
- `/x/*`
- `/s/*`

如果 Cloudflare 对这些机器访问返回 `cf-mitigated: challenge`，请求会在到达 Worker 前被拦截，订阅客户端无法完成转换或更新。

建议在 Cloudflare WAF 中为上述路径创建 Skip/Allow 规则，跳过会产生交互挑战的安全产品。普通 Bot Fight Mode 不能通过 WAF Skip 规则绕过；如果它拦截订阅客户端，需要在 Cloudflare 控制台调整对应 Bot 设置。

官方参考：

- https://developers.cloudflare.com/waf/custom-rules/skip/
- https://developers.cloudflare.com/waf/custom-rules/skip/options/
- https://developers.cloudflare.com/bots/get-started/bot-fight-mode/

## 线上验证清单

部署后至少验证：

- 首页能加载，并且控制台无脚本错误。
- 输入一个 `ss://` 测试节点后能生成 SingBox、Clash、Xray、Surge 四类链接。
- 不填写自定义短码时能生成 `/b/`、`/c/`、`/x/`、`/s/` 四类短链接。
- 重复自定义短码时页面显示明确错误，例如 `Short code already exists`。
- 使用 `curl -I` 或订阅客户端验证转换接口没有被 Cloudflare challenge 拦截。

## 回滚

优先回滚到上一条已验证提交：

```bash
git revert <bad_commit>
git push origin main
```

如果是 Cloudflare 安全规则导致的问题，优先回滚规则或关闭对应 challenge，而不是改 Worker 代码。
