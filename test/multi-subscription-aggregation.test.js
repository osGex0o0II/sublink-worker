import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { decodeBase64 } from '../src/utils.js';

const firstSubscriptionUrl = 'https://provider-a.example.com/sub';
const secondSubscriptionUrl = 'https://provider-b.example.com/sub';
const firstProxyUri = 'ss://YWVzLTEyOC1nY206cGFzcw@one.example.com:443#MultiSubOne';
const secondProxyUri = 'ss://YWVzLTEyOC1nY206cGFzcw@two.example.com:443#MultiSubTwo';

function createTestApp() {
    return createApp({
        kv: new MemoryKVAdapter(),
        assetFetcher: null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null
        }
    });
}

function mockRemoteSubscriptions() {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
        ok: true,
        status: 200,
        text: async () => String(url).includes('provider-b') ? secondProxyUri : firstProxyUri,
        headers: {
            get: () => null
        }
    })));
}

describe('Multiple remote subscription aggregation', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('aggregates multiple remote subscriptions for Sing-Box', async () => {
        mockRemoteSubscriptions();
        const app = createTestApp();
        const input = `${firstSubscriptionUrl}\n${secondSubscriptionUrl}`;

        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(input)}`);

        expect(res.status).toBe(200);
        const json = await res.json();
        const outboundTags = json.outbounds.map(outbound => outbound?.tag);
        expect(outboundTags).toContain('MultiSubOne');
        expect(outboundTags).toContain('MultiSubTwo');
    });

    it('aggregates multiple remote subscriptions for Clash', async () => {
        mockRemoteSubscriptions();
        const app = createTestApp();
        const input = `${firstSubscriptionUrl}\n${secondSubscriptionUrl}`;

        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(input)}`);

        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('MultiSubOne');
        expect(text).toContain('MultiSubTwo');
    });

    it('aggregates multiple remote subscriptions for Xray', async () => {
        mockRemoteSubscriptions();
        const app = createTestApp();
        const input = `${firstSubscriptionUrl}\n${secondSubscriptionUrl}`;

        const res = await app.request(`http://localhost/xray?config=${encodeURIComponent(input)}`);

        expect(res.status).toBe(200);
        const text = decodeBase64(await res.text());
        expect(text).toContain('MultiSubOne');
        expect(text).toContain('MultiSubTwo');
    });

    it('keeps multiple remote subscriptions through short links', async () => {
        mockRemoteSubscriptions();
        const app = createTestApp();
        const input = `${firstSubscriptionUrl}\n${secondSubscriptionUrl}`;
        const fullUrl = `http://localhost/singbox?config=${encodeURIComponent(input)}`;

        const shortenRes = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(fullUrl)}`);
        expect(shortenRes.status).toBe(200);
        const code = await shortenRes.text();

        const redirectRes = await app.request(`http://localhost/b/${code}`);
        expect(redirectRes.status).toBe(302);
        const location = redirectRes.headers.get('location');
        expect(location).toBeTruthy();

        const res = await app.request(location);
        expect(res.status).toBe(200);
        const json = await res.json();
        const outboundTags = json.outbounds.map(outbound => outbound?.tag);
        expect(outboundTags).toContain('MultiSubOne');
        expect(outboundTags).toContain('MultiSubTwo');
    });
});
