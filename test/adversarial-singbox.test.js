import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { ProxyParser } from '../src/parsers/ProxyParser.js';

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

describe('Adversarial Sing-Box subscription conversion', () => {

    describe('tag injection resistance', () => {
        it('should deduplicate identical proxy content (same server/creds, different tag)', async () => {
            const input = [
                'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A',
                'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#Proxy-B'
            ].join('\n');

            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server && o.server === 'a.example.com');
            expect(proxies.length).toBe(1);
        });

        it('should handle unicode tag characters without error', async () => {
            const input = 'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#📡🇯🇵東京-1';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const tags = result.outbounds.filter(o => o.server).map(o => o.tag);
            expect(tags).toContain('📡🇯🇵東京-1');
        });

        it('should handle tag with special regex characters', async () => {
            const input = 'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#Proxy.$+*?^()[]{}|\\';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const tags = result.outbounds.filter(o => o.server).map(o => o.tag);
            expect(tags.length).toBe(1);
        });

        it('should handle extremely long tag names', async () => {
            const longTag = 'A'.repeat(500);
            const input = `ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#${longTag}`;
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const tags = result.outbounds.filter(o => o.server).map(o => o.tag);
            expect(tags[0]).toBe(longTag);
        });

        it('should handle tag with only whitespace', async () => {
            const input = 'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#   ';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);
            expect(proxies.length).toBe(1);
        });
    });

    describe('protocol adversarial inputs', () => {
        it('should handle shadowsocks with all known ciphers', async () => {
            const ciphers = [
                'YWVzLTI1Ni1nY206dGVzdA==',
                'YWVzLTEyOC1nY206dGVzdA==',
                'Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTp0ZXN0',
                'YWVzLTI1Ni1jZmI6dGVzdA==',
                'cmM0LW1kNTp0ZXN0',
                'YWVzLTEyOC1jZmI6dGVzdA==',
                'cGxhaW46dGVzdA==',
                'bm9uZTp0ZXN0'
            ];
            for (const method of ciphers) {
                const input = `ss://${method}@c.example.com:443#Cipher-Test`;
                const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
                const result = await builder.build();
                const proxies = result.outbounds.filter(o => o.server);
                expect(proxies.length).toBe(1);
            }
        });

        it('should handle shadowsocks with SIP002 format', async () => {
            const input = 'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@example.com:443?plugin=obfs-local%3Bobfs%3Dhttp#SS-Plugin';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);
            expect(proxies.length).toBe(1);
        });

        it('should handle VMess with all security types as valid', async () => {
            const urls = [
                'vmess://eyJ2IjoyLCJwcyI6IlZTZWN1cmUiLCJhZGQiOiJ2LmV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwiYWlkIjoiMCIsInNjeSI6ImF1dG8iLCJuZXQiOiJ0Y3AiLCJ0eXBlIjoibm9uZSIsInRscyI6InRscyJ9',
                'vmess://eyJ2IjoyLCJwcyI6IlZTZWN1cmUiLCJhZGQiOiJ2LmV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwiYWlkIjoiMCIsInNjeSI6ImFlcy0xMjgtZ2NtIiwibmV0IjoidGNwIiwidHlwZSI6Im5vbmUiLCJ0bHMiOiJ0bHMifQ==',
                'vmess://eyJ2IjoyLCJwcyI6IlZTZWN1cmUiLCJhZGQiOiJ2LmV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwiYWlkIjoiMCIsInNjeSI6ImNoYWNoYTIwLXBvbHkxMzA1IiwibmV0IjoidGNwIiwidHlwZSI6Im5vbmUiLCJ0bHMiOiJ0bHMifQ==',
                'vmess://eyJ2IjoyLCJwcyI6IlZTZWN1cmUiLCJhZGQiOiJ2LmV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwiYWlkIjoiMCIsInNjeSI6Im5vbmUiLCJuZXQiOiJ0Y3AiLCJ0eXBlIjoibm9uZSIsInRscyI6InRscyJ9'
            ];
            for (const url of urls) {
                const builder = new SingboxConfigBuilder(url, [], [], null, 'zh-CN', null, false);
                const result = await builder.build();
                const proxies = result.outbounds.filter(o => o.server);
                expect(proxies.length).toBe(1);
            }
        });

        it('should handle VMess with all transport types', async () => {
            const transports = [
                { name: 'tcp', net: 'tcp' },
                { name: 'ws', net: 'ws', path: '/' },
                { name: 'grpc', net: 'grpc', serviceName: 'test' },
                { name: 'http', net: 'http', path: '/' }
            ];
            for (const t of transports) {
                const config = {
                    v: '2', ps: 'T-Test', add: 't.example.com', port: '443',
                    id: 'add66666-8888-8888-8888-888888888888', aid: '0',
                    scy: 'auto', net: t.net, type: 'none', tls: 'tls',
                    ...(t.path ? { path: t.path } : {}),
                    ...(t.serviceName ? { serviceName: t.serviceName } : {})
                };
                const url = 'vmess://' + btoa(JSON.stringify(config));
                const builder = new SingboxConfigBuilder(url, [], [], null, 'zh-CN', null, false);
                const result = await builder.build();
                const proxies = result.outbounds.filter(o => o.server);
                expect(proxies.length).toBe(1);
            }
        });

        it('should handle VLESS with flow parameters', async () => {
            const flows = ['xtls-rprx-vision', 'xtls-rprx-vision-udp443', ''];
            for (const flow of flows) {
                const params = flow ? `?flow=${flow}&security=tls&sni=v.example.com` : '?security=tls&sni=v.example.com';
                const input = `vless://12345678-1234-1234-1234-123456789abc@v.example.com:443${params}#VLESS-${flow || 'plain'}`;
                const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
                const result = await builder.build();
                const proxies = result.outbounds.filter(o => o.server);
                expect(proxies.length).toBe(1);
                if (flow) {
                    expect(proxies[0].flow).toBe(flow);
                }
            }
        });

        it('should handle Trojan with all TLS options', async () => {
            const input = 'trojan://password@tr.example.com:443?security=tls&sni=tr.example.com&alpn=http/1.1&alpn=h2#Trojan-Full';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);
            expect(proxies.length).toBe(1);
            expect(proxies[0].tls?.server_name).toBe('tr.example.com');
        });

        it('should handle Hysteria2 with obfuscation', async () => {
            const input = 'hysteria2://password@hy.example.com:443?obfs=salamander&obfs-password=testobfs&sni=hy.example.com#HY2-Obfs';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);
            expect(proxies.length).toBe(1);
        });

        it('should handle TUIC with all congestion controls', async () => {
            const controls = ['bbr', 'cubic', 'new_reno', ''];
            for (const cc of controls) {
                const params = cc ? `?congestion_control=${cc}` : '';
                const input = `tuic://uuid@tu.example.com:443?password=test${params ? '&' + params.slice(1) : ''}#TUIC-${cc || 'default'}`;
                const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
                const result = await builder.build();
                const proxies = result.outbounds.filter(o => o.server);
                expect(proxies.length).toBe(1);
            }
        });
    });

    describe('empty and edge proxy lists', () => {
        it('should produce valid config with no proxies', async () => {
            const builder = new SingboxConfigBuilder('', [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            expect(result.outbounds).toBeDefined();
            expect(result.dns).toBeDefined();
            expect(result.route).toBeDefined();
            expect(result.route.rules.length).toBeGreaterThanOrEqual(4);
        });

        it('should produce valid config with only invalid proxy links', async () => {
            const input = ['not-a-proxy', 'vmess://invalid', 'ss://bad'].join('\n');
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);
            expect(proxies.length).toBe(0);
            expect(result.outbounds.some(o => o.tag === 'DIRECT')).toBe(true);
        });

        it('should produce valid config with only REJECT-type proxies', async () => {
            const builder = new SingboxConfigBuilder('', ['Ad Block'], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);
            expect(proxies.length).toBe(0);
            const rejectRule = result.route.rules.find(r => r.action === 'reject');
            expect(rejectRule).toBeDefined();
        });
    });

    describe('DNS chain integrity', () => {
        it('every DNS server detour should reference a valid outbound', async () => {
            const input = [
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A',
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@b.example.com:443#Proxy-B'
            ].join('\n');
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            const outboundTags = new Set(result.outbounds.map(o => o.tag));
            for (const server of result.dns.servers) {
                if (server.detour) {
                    expect(outboundTags.has(server.detour),
                        `DNS server "${server.tag}" detour "${server.detour}" not found in outbounds`
                    ).toBe(true);
                }
            }
        });

        it('DNS final server should reference an existing server tag', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            const serverTags = new Set(result.dns.servers.map(s => s.tag));
            expect(serverTags.has(result.dns.final),
                `DNS final "${result.dns.final}" not found in server tags`
            ).toBe(true);
        });

        it('every DNS rule server should reference an existing server tag', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            const serverTags = new Set(result.dns.servers.map(s => s.tag));
            for (const rule of result.dns.rules) {
                if (rule.server && typeof rule.server === 'string') {
                    expect(serverTags.has(rule.server),
                        `DNS rule server "${rule.server}" not found in server tags`
                    ).toBe(true);
                }
            }
        });
    });

    describe('outbound group integrity', () => {
        it('every outbound group reference should exist', async () => {
            const input = [
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A',
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@b.example.com:443#Proxy-B'
            ].join('\n');
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            const allTags = new Set(result.outbounds.map(o => o.tag));
            for (const outbound of result.outbounds) {
                if (outbound.outbounds && Array.isArray(outbound.outbounds)) {
                    for (const ref of outbound.outbounds) {
                        expect(allTags.has(ref) || ref === 'DIRECT',
                            `outbound "${outbound.tag}" references "${ref}" which does not exist`
                        ).toBe(true);
                    }
                }
            }
        });

        it('should not create duplicate outbound groups', async () => {
            const input = [
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A'
            ].join('\n');
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            const tags = result.outbounds.map(o => o.tag);
            const uniqueTags = new Set(tags);
            expect(tags.length).toBe(uniqueTags.size);
        });

        it('urltest groups should have at least one outbound', async () => {
            const input = [
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A'
            ].join('\n');
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            for (const outbound of result.outbounds) {
                if (outbound.type === 'urltest') {
                    expect(outbound.outbounds?.length).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('rule_set integrity', () => {
        it('every rule reference should have a corresponding rule_set definition', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A';
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            const ruleSetTags = new Set(result.route.rule_set.map(rs => rs.tag));
            const checkRule = (rule) => {
                if (!rule || !rule.rule_set) return;
                const sets = Array.isArray(rule.rule_set) ? rule.rule_set : [rule.rule_set];
                for (const rs of sets) {
                    if (typeof rs === 'string') {
                        expect(ruleSetTags.has(rs),
                            `rule references rule-set "${rs}" with no definition`
                        ).toBe(true);
                    }
                }
            };

            result.route.rules.forEach(checkRule);
            result.dns.rules.forEach(checkRule);
        });

        it('every rule_set should have valid remote URL format', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A';
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, false);
            const result = await builder.build();

            for (const rs of result.route.rule_set) {
                if (rs.type === 'remote') {
                    expect(rs.url).toMatch(/^https?:\/\//);
                    expect(rs.format).toBe('binary');
                }
            }
            // 1.14 tier uses shared http_client instead of per-rule-set download_detour
            if (result.route.default_http_client) {
                expect(result.http_clients).toBeDefined();
            } else {
                result.route.rule_set.forEach(rs => {
                    if (rs.type === 'remote') {
                        expect(rs.download_detour).toBe('DIRECT');
                    }
                });
            }
        });
    });

    describe('cross-protocol subscription', () => {
        it('should handle every protocol type in one subscription', async () => {
            const input = [
                'ss://YWVzLTI1Ni1nY206dGVzdHBhc3M@a.example.com:443#SS-Test',
                'vmess://eyJ2IjoyLCJwcyI6IlZNZXNzLVRlc3QiLCJhZGQiOiJ2LmV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwiYWlkIjoiMCIsInNjeSI6ImF1dG8iLCJuZXQiOiJ3cyIsInR5cGUiOiJub25lIiwidGxzIjoidGxzIn0=',
                'vless://12345678-1234-1234-1234-123456789abc@v.example.com:443?security=tls&sni=v.example.com#VLESS-Test',
                'trojan://password@tr.example.com:443?security=tls#Trojan-Test',
                'hysteria2://password@hy.example.com:443?&sni=hy.example.com#HY2-Test',
                'tuic://uuid@tu.example.com:443?password=test&congestion_control=bbr#TUIC-Test'
            ].join('\n');

            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false);
            const result = await builder.build();
            const proxies = result.outbounds.filter(o => o.server);

            expect(proxies.length).toBe(6);
            expect(proxies.map(p => p.type)).toEqual(
                expect.arrayContaining(['shadowsocks', 'vmess', 'vless', 'trojan', 'hysteria2', 'tuic'])
            );
        });
    });

    describe('config override and merge', () => {
        it('should merge user proxy groups without breaking references', async () => {
            const baseConfig = {
                outbounds: [
                    { type: 'selector', tag: 'MyGroup', outbounds: ['Proxy-A', 'DIRECT'] }
                ],
                route: { rule_set: [], rules: [] },
                dns: {
                    servers: [
                        { type: 'udp', tag: 'dns_direct', server: '223.5.5.5' }
                    ],
                    rules: [],
                    final: 'dns_direct'
                },
                experimental: {}
            };

            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A';
            const builder = new SingboxConfigBuilder(input, [], [], baseConfig, 'zh-CN', null, false);
            const result = await builder.build();

            const myGroup = result.outbounds.find(o => o.tag === 'MyGroup');
            expect(myGroup).toBeDefined();
            expect(myGroup.outbounds).toContain('DIRECT');
        });
    });

    describe('HTTP endpoint adversarial tests', () => {
        it('should handle malformed base64 subscription input gracefully', async () => {
            const app = createTestApp();
            const res = await app.request('http://localhost/singbox?config=' + encodeURIComponent('not-base64-at-all!!!'));
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.outbounds).toBeDefined();
        });

        it('should handle very long config parameter', async () => {
            const app = createTestApp();
            const longConfig = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#' + 'A'.repeat(1000);
            const res = await app.request('http://localhost/singbox?config=' + encodeURIComponent(longConfig));
            expect(res.status).toBe(200);
        });

        it('should handle missing config parameter', async () => {
            const app = createTestApp();
            const res = await app.request('http://localhost/singbox');
            expect(res.status).toBe(400);
        });

        it('should reject empty config parameter with 400', async () => {
            const app = createTestApp();
            const res = await app.request('http://localhost/singbox?config=');
            expect(res.status).toBe(400);
        });

        it('should handle sb_version query parameter correctly', async () => {
            const app = createTestApp();
            const config = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Test';
            const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}&sb_version=1.14`);
            expect(res.status).toBe(200);
        });

        it('should handle singbox_version=latest correctly', async () => {
            const app = createTestApp();
            const config = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Test';
            const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}&singbox_version=latest`);
            expect(res.status).toBe(200);
        });
    });

    describe('v1.14 version path', () => {
        it('should build config explicitly with version 1.14', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Test';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false, false, null, null, '1.14');
            const result = await builder.build();
            expect(result.outbounds.some(o => o.tag === 'Test')).toBe(true);
            expect(result.dns.servers[0]).toHaveProperty('type');
            expect(result.route).toHaveProperty('default_domain_resolver');
        });

        it('should apply modern DNS sanitization for v1.14 (not skip it)', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Test';
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false, false, null, null, '1.14');
            const result = await builder.build();
            expect(result.dns).not.toHaveProperty('fakeip');
        });

        it('clean mode (include_auto_select=false) should work with v1.14', async () => {
            const input = [
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#Proxy-A',
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@b.example.com:443#Proxy-B'
            ].join('\n');
            const builder = new SingboxConfigBuilder(input, [], [], null, 'zh-CN', null, false, false, null, null, '1.14', false);
            const result = await builder.build();
            expect(result.outbounds.some(o => o.type === 'urltest')).toBe(false);
            expect(result.outbounds.some(o => o.type === 'selector')).toBe(true);
        });
    });

    describe('groupByCountry edge cases', () => {
        it('should not crash with groupByCountry and no matching country data', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@x.example.com:443#Unknown-Region';
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, true);
            const result = await builder.build();
            expect(result.outbounds.length).toBeGreaterThan(0);
        });

        it('should create country groups with groupByCountry enabled', async () => {
            const input = [
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@a.example.com:443#🇯🇵 JP-Tokyo',
                'ss://YWVzLTEyOC1nY206dGVzdHBhc3M@b.example.com:443#🇺🇸 US-LA'
            ].join('\n');
            const builder = new SingboxConfigBuilder(input, ['balanced'], [], null, 'zh-CN', null, true);
            const result = await builder.build();
            const urltestGroups = result.outbounds.filter(o => o.type === 'urltest' && o.tag !== '⚡ 自动选择');
            expect(urltestGroups.length).toBeGreaterThan(0);
        });
    });

    describe('ProxyParser resilience', () => {
        it('should handle null input to proxy parser', async () => {
            const result = await ProxyParser.parse(null);
            expect(result).toBeUndefined();
        });

        it('should handle undefined input to proxy parser', async () => {
            const result = await ProxyParser.parse(undefined);
            expect(result).toBeUndefined();
        });

        it('should handle non-string input to proxy parser', async () => {
            const result = await ProxyParser.parse(123);
            expect(result).toBeUndefined();
        });

        it('should handle empty string input to proxy parser', async () => {
            const result = await ProxyParser.parse('');
            expect(result).toBeUndefined();
        });

        it('should handle unknown protocol without throwing', async () => {
            const result = await ProxyParser.parse('unknown://test@example.com');
            expect(result).toBeUndefined();
        });

        it('should handle base64 with bad padding', async () => {
            const result = await ProxyParser.parse('vmess://eyJ2IjoyLCJwcyI6IlRlc3QiLCJhZGQiOiJ0ZXN0LmNvbSJ9');
            expect(result).toBeDefined();
        });

        it('should handle JSON injection in vmess config', async () => {
            const malicious = btoa(JSON.stringify({
                v: '2', ps: 'Test", "extra": "injected',
                add: 'evil.com', port: '443', id: 'add66666-8888-8888-8888-888888888888',
                aid: '0', scy: 'auto', net: 'tcp', type: 'none'
            }));
            const parsed = await ProxyParser.parse('vmess://' + malicious);
            expect(parsed).toBeDefined();
            expect(parsed.tag).toBe('Test", "extra": "injected');
        });
    });
});
