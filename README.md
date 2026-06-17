<div align="center">
  <img src="public/favicon.png" alt="Sublink Worker" width="120" height="120"/>

  <h1><b>Sublink Worker</b></h1>
  <h5><i>One Worker, All Subscriptions</i></h5>

  <p><b>A lightweight subscription converter and manager for proxy protocols, deployable on Cloudflare Workers, Vercel, Node.js, or Docker.</b></p>

  <p style="display: flex; align-items: center; gap: 10px; justify-content: center;">
    <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/osGex0o0II/sublink-worker">
      <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" style="height: 32px;"/>
    </a>
    <a href="https://vercel.com/new/clone?repository-url=https://github.com/osGex0o0II/sublink-worker&env=KV_REST_API_URL,KV_REST_API_TOKEN&envDescription=Vercel%20KV%20credentials%20for%20data%20storage&envLink=https://vercel.com/docs/storage/vercel-kv">
      <img src="https://vercel.com/button" alt="Deploy to Vercel" style="height: 32px;"/>
    </a>
  </p>
</div>

## Quick Start

### Cloudflare Workers

```bash
npm install
npm run deploy
```

### Local Development

```bash
npm install
npm run dev
```

### Node.js

```bash
npm install
npm run build:node
node dist/node-server.cjs
```

### Docker

```bash
docker build -t sublink-worker .
docker run -p 8787:8787 sublink-worker
```

### Docker Compose

```bash
docker compose up -d
```

## Features

### Supported Protocols

ShadowSocks, VMess, VLESS, Hysteria2, Trojan, TUIC

### Client Support

Sing-Box, Clash/Mihomo, Xray/V2Ray, Surge

### Input Support

- Base64 subscriptions
- HTTP/HTTPS subscriptions
- Full configs: Sing-Box JSON, Clash YAML, Surge INI

### Core Capabilities

- Import subscriptions from multiple sources
- Generate fixed or random short links with KV storage
- Convert subscriptions for multiple proxy clients
- Customize rule sets and policy groups
- Store reusable base configs by ID
- Multi-language web interface

## Runtime Storage

Short links and saved configs use a KV-compatible storage adapter:

- Cloudflare Workers: Cloudflare KV through `SUBLINK_KV`
- Vercel or Node.js: Redis, Upstash KV, or in-memory KV
- Docker Compose: Redis service included

Useful environment variables:

- `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT`
- `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`
- `REDIS_KEY_PREFIX`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- `CONFIG_TTL_SECONDS`, `SHORT_LINK_TTL_SECONDS`

## API Overview

- `GET /singbox?config=...` outputs Sing-Box JSON
- `GET /clash?config=...` outputs Clash/Mihomo YAML
- `GET /surge?config=...` outputs Surge config
- `GET /xray?config=...` outputs Base64 proxy lines
- `GET /subconverter` outputs rule-set config
- `GET /shorten-v2?url=...` creates a short code
- `POST /config` stores a reusable base config and returns a config ID

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Disclaimer

This project is for learning and exchange purposes only. Do not use it for illegal purposes. Users are responsible for their own usage and consequences.
