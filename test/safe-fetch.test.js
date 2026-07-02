import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTextResource } from '../src/parsers/subscription/safeFetch.js';

describe('safe subscription fetch', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects localhost and private IP URLs before fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchTextResource('http://127.0.0.1/sub')).rejects.toThrow('not allowed');
        await expect(fetchTextResource('http://localhost/sub')).rejects.toThrow('not allowed');
        await expect(fetchTextResource('http://[::ffff:127.0.0.1]/sub')).rejects.toThrow('not allowed');
        await expect(fetchTextResource('http://[ff02::1]/sub')).rejects.toThrow('not allowed');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects redirects to blocked hosts', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
            status: 302,
            headers: { location: 'http://127.0.0.1/metadata' }
        })));

        await expect(fetchTextResource('https://example.com/sub')).rejects.toThrow('not allowed');
    });

    it('rejects oversized responses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(16), { status: 200 })));

        await expect(fetchTextResource('https://example.com/sub', { maxBytes: 8 })).rejects.toThrow('too large');
    });
});
