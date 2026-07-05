import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import * as yaml from 'js-yaml';

const createTestApp = (overrides = {}) => {
    const runtime = {
        kv: overrides.kv ?? new MemoryKVAdapter(),
        assetFetcher: overrides.assetFetcher ?? null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null,
            ...(overrides.config || {})
        }
    };
    return createApp(runtime);
};

describe('Worker', () => {
    it('GET /health returns service status without caching', async () => {
        const app = createTestApp({
            assetFetcher: async () => new Response('asset')
        });
        const res = await app.request('http://localhost/health');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect(res.headers.get('cache-control')).toBe('no-store');
        const json = await res.json();
        expect(json).toMatchObject({
            status: 'ok',
            name: 'Sublink Worker',
            version: '2.4.2',
            services: {
                kv: 'available',
                assets: 'available'
            }
        });
        expect(Date.parse(json.timestamp)).not.toBeNaN();
    });

    it('GET / returns HTML', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const text = await res.text();
        expect(text).toContain('Sublink Worker');
        expect(text).toContain('/styles.css');
        expect(text).toContain('/vendor/fontawesome/css/all.min.css');
        expect(text).toContain('/vendor/js-yaml/js-yaml.min.js');
        expect(text).toContain('/vendor/alpinejs/cdn.min.js');
        expect(text).toContain('最小化');
        expect(text).toContain('日常推荐');
        expect(text).toContain('影音社媒');
        expect(text).toContain('全面');
        expect(text).toContain('非中国');
        expect(text).toContain('data-results-section');
        expect(text).not.toContain('cdn.tailwindcss.com');
        expect(text).not.toContain('updateChecker(');
        expect(text).not.toContain('api.github.com');
        expect(text).toContain('font-mono text-xs text-gray-500 dark:text-gray-400 break-all');
        expect(text).not.toContain('font-mono text-xs text-gray-500 dark:text-gray-400 truncate');
        const csp = res.headers.get('content-security-policy');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("'unsafe-eval'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).not.toContain('api.github.com');
        expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    });

    it('GET /singbox returns JSON', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const json = await res.json();
        expect(json).toHaveProperty('outbounds');
    });

    it('GET /singbox returns legacy config for sing-box 1.11 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFI/1.12.2 (Build 2; sing-box 1.11.4; language zh_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('address');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('type');
        expect(json?.route).not.toHaveProperty('default_domain_resolver');
    });

    it('GET /singbox returns 1.12+ config for sing-box 1.12 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFA/1.12.12 (587; sing-box 1.12.12; language zh_Hans_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('type');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('address');
        expect(json?.route).toHaveProperty('default_domain_resolver', 'dns_resolver');
    });

    it('GET /clash returns YAML', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        // Clash builder returns text/yaml
        expect(res.headers.get('content-type')).toContain('text/yaml');
        const text = await res.text();
        expect(text).toContain('proxies:');
    });

    it('GET /singbox ignores malformed proxy links without exposing parser internals', async () => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent('vmess://not-base64')}`);

        expect(res.status).not.toBe(500);
        const text = await res.text();
        expect(text).not.toContain('Unexpected token');
    });

    it('Clash API uses loopback controller and generated secret by default', async () => {
        const app = createTestApp();
        const config = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Test';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}&enable_clash_ui=true`);

        expect(res.status).toBe(200);
        const parsed = yaml.load(await res.text());
        expect(parsed['external-controller']).toBe('127.0.0.1:9090');
        expect(parsed.secret).toMatch(/^[A-Za-z0-9]{24}$/);
    });

    it('GET /clash rejects empty url-test proxy groups with a diagnostic error', async () => {
        const app = createTestApp();
        const config = `
proxies:
  - name: Node-A
    type: ss
    server: a.example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: Empty Test Group
    type: url-test
    proxies: []
`;
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain('Invalid proxy group "Empty Test Group"');
        expect(text).toContain('requires at least one proxy or provider reference');
    });

    it('GET /shorten-v2 returns short code', async () => {
        const url = 'http://example.com/singbox?config=test';
        const kvMock = {
            put: vi.fn(async () => {}),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => {})
        };
        const app = createTestApp({ kv: kvMock });
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBeTruthy();
        expect(kvMock.put).toHaveBeenCalled();
    });

    it('POST /shorten-v2 returns short code', async () => {
        const url = 'http://example.com/singbox?config=test';
        const kvMock = {
            put: vi.fn(async () => {}),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => {})
        };
        const app = createTestApp({ kv: kvMock });
        const res = await app.request('http://localhost/shorten-v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBeTruthy();
        expect(kvMock.put).toHaveBeenCalled();
    });

    it('POST /shorten-v2 accepts base64 encoded URL payloads', async () => {
        const url = 'http://example.com/singbox?config=ss%3A%2F%2Ftest';
        const app = createTestApp();
        const res = await app.request('http://localhost/shorten-v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urlBase64: btoa(url) })
        });

        expect(res.status).toBe(200);
        const code = await res.text();
        const resolved = await app.request(`http://localhost/resolve?url=${encodeURIComponent(`http://localhost/b/${code}`)}`);
        expect(resolved.status).toBe(200);
        expect((await resolved.json()).originalUrl).toBe('http://localhost/singbox?config=ss%3A%2F%2Ftest');
    });

    it('POST /config/shorten accepts base64 encoded URL payloads', async () => {
        const url = 'http://example.com/singbox?config=ss%3A%2F%2Ftest';
        const app = createTestApp();
        const res = await app.request('http://localhost/config/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urlBase64: btoa(url) })
        });

        expect(res.status).toBe(200);
        const code = await res.text();
        const resolved = await app.request(`http://localhost/resolve?url=${encodeURIComponent(`http://localhost/b/${code}`)}`);
        expect(resolved.status).toBe(200);
        expect((await resolved.json()).originalUrl).toBe('http://localhost/singbox?config=ss%3A%2F%2Ftest');
    });

    it('GET /shorten-v2 rejects URLs without query parameters', async () => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent('http://example.com')}`);

        expect(res.status).toBe(400);
        expect(await res.text()).toContain('query parameters');
    });

    it('GET /shorten-v2 rejects duplicate custom short codes', async () => {
        const app = createTestApp();
        const firstUrl = encodeURIComponent('http://example.com/singbox?config=one');
        const secondUrl = encodeURIComponent('http://example.com/clash?config=two');

        const first = await app.request(`http://localhost/shorten-v2?url=${firstUrl}&shortCode=fixed-code`);
        const second = await app.request(`http://localhost/shorten-v2?url=${secondUrl}&shortCode=fixed-code`);

        expect(first.status).toBe(200);
        expect(second.status).toBe(409);
    });

    it('one short code resolves to each output endpoint prefix', async () => {
        const app = createTestApp();
        const fullUrl = 'http://example.com/singbox?config=ss%3A%2F%2Ftest';

        const shorten = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(fullUrl)}`);
        expect(shorten.status).toBe(200);
        const code = await shorten.text();

        const expectations = {
            x: '/xray?config=ss%3A%2F%2Ftest',
            b: '/singbox?config=ss%3A%2F%2Ftest',
            c: '/clash?config=ss%3A%2F%2Ftest',
            s: '/surge?config=ss%3A%2F%2Ftest'
        };

        for (const [prefix, target] of Object.entries(expectations)) {
            const res = await app.request(`http://localhost/${prefix}/${code}`);
            expect(res.status).toBe(302);
            expect(res.headers.get('location')).toBe(`http://localhost${target}`);
        }
    });

    it('POST /config stores allowed config types with a scoped ID', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'singbox',
                content: { outbounds: [], route: { rules: [] } }
            })
        });

        expect(res.status).toBe(200);
        expect(await res.text()).toMatch(/^singbox_[A-Za-z0-9]{8}$/);
    });

    it('POST /config rejects unsupported config types', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'other',
                content: { ok: true }
            })
        });

        expect(res.status).toBe(400);
    });

    it('POST /config rejects non-object JSON payloads', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'null'
        });

        expect(res.status).toBe(400);
    });
});
