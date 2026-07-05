import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const baseUrl = 'http://smoke.test';
const ssLink = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Test';

const assetFixtures = {
    '/styles.css': {
        contentType: 'text/css; charset=utf-8',
        body: '/* smoke css */\n'.repeat(16)
    },
    '/vendor/alpinejs/cdn.min.js': {
        contentType: 'text/javascript; charset=utf-8',
        body: 'window.Alpine={version:"smoke"};\n'.repeat(8)
    },
    '/vendor/js-yaml/js-yaml.min.js': {
        contentType: 'text/javascript; charset=utf-8',
        body: 'window.jsyaml={load:function(){}};\n'.repeat(8)
    }
};

const createAssetFetcher = () => async (request) => {
    const url = new URL(request.url);
    const fixture = assetFixtures[url.pathname];
    if (!fixture) {
        return new Response('Not found', { status: 404 });
    }

    return new Response(fixture.body, {
        headers: {
            'Content-Type': fixture.contentType
        }
    });
};

const createSmokeApp = () => createApp({
    kv: new MemoryKVAdapter(),
    assetFetcher: createAssetFetcher(),
    logger: console,
    config: {
        configTtlSeconds: 60,
        shortLinkTtlSeconds: 60
    }
});

const requestText = async (app, path, options) => {
    const response = await app.request(`${baseUrl}${path}`, options);
    const text = await response.text();
    return { response, text };
};

const createConvertParams = (extra = {}) => new URLSearchParams({
    config: ssLink,
    selectedRules: '[]',
    customRules: '[]',
    ...extra
});

describe('smoke e2e', () => {
    it('covers the primary user conversion, short-link, and config flows', async () => {
        const app = createSmokeApp();
        const checks = [];
        const record = (message) => checks.push(message);

        const home = await requestText(app, '/');
        expect(home.response.status).toBe(200);
        const csp = home.response.headers.get('content-security-policy') || '';
        expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
        expect(csp).toContain("connect-src 'self'");
        expect(home.text).toContain('/vendor/alpinejs/cdn.min.js');
        expect(home.text).toContain('/vendor/js-yaml/js-yaml.min.js');
        expect(home.text).toContain('break-all');
        expect(home.text).not.toContain('api.github.com');
        record('home');

        for (const assetPath of ['/styles.css', '/vendor/alpinejs/cdn.min.js', '/vendor/js-yaml/js-yaml.min.js']) {
            const asset = await requestText(app, assetPath);
            expect(asset.response.status, assetPath).toBe(200);
            expect(asset.text.length).toBeGreaterThan(100);
            record(assetPath);
        }

        const params = createConvertParams();
        const singbox = await requestText(app, `/singbox?${params}`);
        expect(singbox.response.status).toBe(200);
        const singboxJson = JSON.parse(singbox.text);
        expect(singboxJson.outbounds?.some((outbound) => outbound.tag === 'HK-Test')).toBe(true);
        record('singbox');

        const clash = await requestText(app, `/clash?${params}`);
        expect(clash.response.status).toBe(200);
        expect(clash.text).toContain('proxies:');
        expect(clash.text).toContain('HK-Test');
        record('clash');

        const surge = await requestText(app, `/surge?${params}`);
        expect(surge.response.status).toBe(200);
        expect(surge.text).toContain('[Proxy]');
        expect(surge.text).toContain('HK-Test');
        record('surge');

        const xray = await requestText(app, `/xray?${params}`);
        expect(xray.response.status).toBe(200);
        expect(Buffer.from(xray.text, 'base64').toString('utf8')).toContain('HK-Test');
        record('xray');

        const longUrl = `${baseUrl}/singbox?${params}`;
        const shortPayload = {
            urlBase64: Buffer.from(longUrl, 'utf8').toString('base64')
        };
        const shortCode = await requestText(app, '/config/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shortPayload)
        });
        expect(shortCode.response.status).toBe(200);
        const code = shortCode.text.trim();
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        record('config/shorten');

        const resolved = await requestText(app, `/resolve?url=${encodeURIComponent(`${baseUrl}/b/${code}`)}`);
        expect(resolved.response.status).toBe(200);
        const resolvedJson = JSON.parse(resolved.text);
        expect(resolvedJson.originalUrl).toContain('/singbox?');
        expect(resolvedJson.originalUrl).toContain('HK-Test');
        record('resolve');

        const redirect = await app.request(`${baseUrl}/b/${code}`, { redirect: 'manual' });
        expect(redirect.status).toBe(302);
        expect(redirect.headers.get('location')).toContain('/singbox?');
        record('short redirect');

        const duplicateCode = await requestText(app, '/config/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...shortPayload, shortCode: code })
        });
        expect(duplicateCode.response.status).toBe(409);
        expect(duplicateCode.text).toContain('already exists');
        record('duplicate short code');

        const baseConfig = {
            mixed_port: 7890,
            allow_lan: true,
            proxies: [],
            'proxy-groups': []
        };
        const savedConfig = await requestText(app, '/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'clash', content: JSON.stringify(baseConfig) })
        });
        expect(savedConfig.response.status).toBe(200);
        const configId = savedConfig.text.trim();
        expect(configId).toMatch(/^clash_[A-Za-z0-9]{8}$/);
        record('config save');

        const clashWithConfig = await requestText(app, `/clash?${createConvertParams({ configId })}`);
        expect(clashWithConfig.response.status).toBe(200);
        expect(clashWithConfig.text.includes('mixed-port: 7890') || clashWithConfig.text.includes('mixed_port: 7890')).toBe(true);
        record('configId conversion');

        expect(checks).toHaveLength(14);
    });
});
