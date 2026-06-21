import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';

describe('Sing-Box JSON input parsing', () => {
    const sampleSingboxConfig = JSON.stringify({
        "outbounds": [
            {
                "type": "shadowsocks",
                "tag": "SS-Test",
                "server": "ss.example.com",
                "server_port": 8388,
                "method": "aes-256-gcm",
                "password": "test-password"
            },
            {
                "type": "vless",
                "tag": "VLESS-Test",
                "server": "vless.example.com",
                "server_port": 443,
                "uuid": "12345678-1234-1234-1234-123456789abc",
                "tls": {
                    "enabled": true,
                    "server_name": "vless.example.com"
                }
            },
            {
                "type": "vmess",
                "tag": "VMess-Test",
                "server": "vmess.example.com",
                "server_port": 443,
                "uuid": "87654321-4321-4321-4321-cba987654321",
                "alter_id": 0,
                "security": "auto",
                "tls": {
                    "enabled": true,
                    "server_name": "vmess.example.com"
                },
                "transport": {
                    "type": "ws",
                    "path": "/ws"
                }
            },
            {
                "type": "direct",
                "tag": "DIRECT"
            },
            {
                "type": "block",
                "tag": "REJECT"
            },
            {
                "type": "selector",
                "tag": "手动选择",
                "outbounds": ["SS-Test", "VLESS-Test", "VMess-Test"]
            }
        ],
        "dns": {
            "servers": [
                { "type": "udp", "tag": "dns_direct", "server": "223.5.5.5" }
            ]
        }
    });

    it('should parse Sing-Box JSON input and extract proxy nodes', async () => {
        const builder = new SingboxConfigBuilder(
            sampleSingboxConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const proxies = result.outbounds.filter(o => o.server);

        expect(proxies.length).toBe(3);
        expect(proxies.map(p => p.tag)).toContain('SS-Test');
        expect(proxies.map(p => p.tag)).toContain('VLESS-Test');
        expect(proxies.map(p => p.tag)).toContain('VMess-Test');
    });

    it('should filter out non-proxy outbound types (direct, block, selector, urltest)', async () => {
        const builder = new SingboxConfigBuilder(
            sampleSingboxConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const proxies = result.outbounds.filter(o => o.server);

        // Should not include DIRECT, REJECT, or selector groups as proxies
        expect(proxies.map(p => p.tag)).not.toContain('DIRECT');
        expect(proxies.map(p => p.tag)).not.toContain('REJECT');
        expect(proxies.map(p => p.tag)).not.toContain('手动选择');
    });

    it('should preserve proxy details like TLS and transport settings', async () => {
        const builder = new SingboxConfigBuilder(
            sampleSingboxConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const vmessProxy = result.outbounds.find(o => o.tag === 'VMess-Test');

        expect(vmessProxy).toBeDefined();
        expect(vmessProxy.tls?.enabled).toBe(true);
        expect(vmessProxy.transport?.type).toBe('ws');
        expect(vmessProxy.transport?.path).toBe('/ws');
    });

    it('should normalize DNS server references from imported configs', async () => {
        const configWithSpacedDnsReference = JSON.stringify({
            outbounds: [
                {
                    type: 'shadowsocks',
                    tag: 'SS-Test',
                    server: 'ss.example.com',
                    server_port: 8388,
                    method: 'aes-256-gcm',
                    password: 'test-password'
                }
            ],
            dns: {
                final: 'dns direct',
                rules: [
                    {
                        query_type: 'A',
                        server: 'dns proxy'
                    }
                ]
            }
        });

        const builder = new SingboxConfigBuilder(
            configWithSpacedDnsReference,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();

        expect(result.dns.final).toBe('dns_direct');
        expect(result.dns.rules[0].server).toBe('dns_proxy');
    });

    it('should repair dangling DNS and outbound references from imported configs', async () => {
        const configWithDanglingReferences = JSON.stringify({
            outbounds: [
                {
                    type: 'shadowsocks',
                    tag: 'SS-Test',
                    server: 'ss.example.com',
                    server_port: 8388,
                    method: 'aes-256-gcm',
                    password: 'test-password'
                },
                {
                    type: 'direct',
                    tag: 'DIRECT'
                }
            ],
            dns: {
                servers: [
                    { tag: 'local', address: 'https://223.5.5.5/dns-query', detour: 'direct' },
                    { tag: 'remote', address: 'fakeip' },
                    { tag: 'block', address: 'rcode://success' }
                ],
                rules: [
                    { domain: ['example.com'], server: 'dns_direct' }
                ],
                final: 'dns_direct'
            },
            route: {
                rules: [
                    { ip_is_private: true, outbound: 'direct' }
                ]
            }
        });

        const builder = new SingboxConfigBuilder(
            configWithDanglingReferences,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();

        expect(result.dns.final).toBe('local');
        expect(result.dns.rules[0].server).toBe('local');
        expect(result.dns.servers.find(server => server.tag === 'local')).not.toHaveProperty('detour');
        expect(result.dns.servers.find(server => server.tag === 'remote')).toMatchObject({
            type: 'fakeip',
            inet4_range: '198.18.0.0/15',
            inet6_range: 'fc00::/18'
        });
        expect(result.route.rules.some(rule => rule.outbound === 'direct')).toBe(false);
    });

    it('should migrate imported legacy DNS config for sing-box 1.12+', async () => {
        const legacyDnsConfig = JSON.stringify({
            outbounds: [
                {
                    type: 'shadowsocks',
                    tag: 'SS-Test',
                    server: 'ss.example.com',
                    server_port: 8388,
                    method: 'aes-256-gcm',
                    password: 'test-password'
                }
            ],
            dns: {
                servers: [
                    { tag: 'remote', address: 'tls://1.1.1.1', detour: '🖐️ 手动选择' },
                    { tag: 'local', address: 'https://dns.alidns.com/dns-query', address_resolver: 'remote', strategy: 'prefer_ipv4' },
                    { tag: 'fake', address: 'fakeip' },
                    { tag: 'block', address: 'rcode://refused' }
                ],
                rules: [
                    { outbound: 'any', server: 'remote' },
                    { domain: ['local.example'], server: 'local' },
                    { domain: ['blocked.example'], server: 'block' }
                ],
                fakeip: {
                    enabled: true,
                    inet4_range: '198.18.0.0/15',
                    inet6_range: 'fc00::/18'
                },
                final: 'local'
            },
            route: {
                rules: []
            }
        });

        const builder = new SingboxConfigBuilder(
            legacyDnsConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const remote = result.dns.servers.find(server => server.tag === 'remote');
        const local = result.dns.servers.find(server => server.tag === 'local');
        const fake = result.dns.servers.find(server => server.tag === 'fake');

        expect(result.dns).not.toHaveProperty('fakeip');
        expect(result.route.default_domain_resolver).toBe('local');
        expect(remote).toMatchObject({ type: 'tls', server: '1.1.1.1' });
        expect(local).toMatchObject({ type: 'https', server: 'dns.alidns.com', domain_resolver: 'remote' });
        expect(local).not.toHaveProperty('address_resolver');
        expect(local).not.toHaveProperty('strategy');
        expect(fake).toMatchObject({ type: 'fakeip', inet4_range: '198.18.0.0/15', inet6_range: 'fc00::/18' });
        expect(result.dns.servers.some(server => Object.prototype.hasOwnProperty.call(server, 'address'))).toBe(false);
        expect(result.dns.servers.some(server => Object.prototype.hasOwnProperty.call(server, 'strategy'))).toBe(false);
        expect(result.dns.servers.some(server => server.tag === 'block')).toBe(false);
        expect(result.dns.rules.some(rule => Object.prototype.hasOwnProperty.call(rule, 'outbound'))).toBe(false);
        expect(result.dns.rules.find(rule => rule.domain?.includes('local.example'))?.strategy).toBe('prefer_ipv4');
        expect(result.dns.rules.find(rule => rule.domain?.includes('blocked.example'))).toMatchObject({
            action: 'predefined',
            rcode: 'REFUSED'
        });
    });

    it('should migrate untagged legacy DNS server strategy to DNS strategy', async () => {
        const legacyDnsConfig = JSON.stringify({
            outbounds: [
                {
                    type: 'shadowsocks',
                    tag: 'SS-Test',
                    server: 'ss.example.com',
                    server_port: 8388,
                    method: 'aes-256-gcm',
                    password: 'test-password'
                }
            ],
            dns: {
                servers: [
                    { address: '1.1.1.1', strategy: 'prefer_ipv4' }
                ]
            }
        });

        const builder = new SingboxConfigBuilder(
            legacyDnsConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();

        expect(result.dns.strategy).toBe('prefer_ipv4');
        expect(result.dns.servers[0]).toMatchObject({ type: 'udp', server: '1.1.1.1' });
        expect(result.dns.servers[0]).not.toHaveProperty('strategy');
    });

    it('should normalize legacy geosite and geoip rule-set references', async () => {
        const configWithLegacyRuleSetReferences = JSON.stringify({
            outbounds: [
                {
                    type: 'shadowsocks',
                    tag: 'SS-Test',
                    server: 'ss.example.com',
                    server_port: 8388,
                    method: 'aes-256-gcm',
                    password: 'test-password'
                }
            ],
            dns: {
                servers: [
                    { tag: 'local', address: 'https://223.5.5.5/dns-query' }
                ],
                rules: [
                    { rule_set: ['geosite-cn'], server: 'local' }
                ]
            },
            route: {
                rules: [
                    { rule_set: ['geosite-cn', 'geoip-cn'], outbound: 'DIRECT' }
                ]
            }
        });

        const builder = new SingboxConfigBuilder(
            configWithLegacyRuleSetReferences,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const ruleSetTags = result.route.rule_set.map(ruleSet => ruleSet.tag);

        expect(ruleSetTags).toEqual(expect.arrayContaining(['cn', 'cn-ip']));
        expect(result.dns.rules[0].rule_set).toEqual(['cn']);
        expect(result.route.rules.some(rule => (
            Array.isArray(rule.rule_set)
            && rule.rule_set.includes('cn')
            && rule.rule_set.includes('cn-ip')
        ))).toBe(true);
    });

    it('should include base rules and default service rules in balanced preset', async () => {
        const builder = new SingboxConfigBuilder(
            sampleSingboxConfig,
            'balanced',
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();

        expect(result.route.rules).toEqual(expect.arrayContaining([
            expect.objectContaining({
                domain_suffix: ['push.apple.com'],
                outbound: '🖐️ 手动选择'
            })
        ]));
        expect(result.route.rules).toEqual(expect.arrayContaining([
            expect.objectContaining({ rule_set: ['private-ip'], outbound: 'DIRECT' }),
            expect.objectContaining({ rule_set: ['github', 'gitlab'], outbound: '🖐️ 手动选择' }),
            expect.objectContaining({ rule_set: ['geolocation-!cn'], outbound: '🖐️ 手动选择' }),
            expect.objectContaining({ rule_set: ['category-ai-!cn'], outbound: '💬 AI 服务' })
        ]));
        expect(result.route.final).toBe('🖐️ 手动选择');
        expect(result.route.rules).toEqual(expect.arrayContaining([
            expect.objectContaining({ clash_mode: 'global', outbound: '🖐️ 手动选择' })
        ]));
        expect(result.outbounds).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'urltest',
                tag: '⚡ 自动选择',
                url: 'https://api.openai.com/v1/models'
            }),
            expect.objectContaining({
                type: 'selector',
                tag: '💬 AI 服务',
                outbounds: expect.arrayContaining(['⚡ 自动选择'])
            })
        ]));
        const manualGroup = result.outbounds.find(outbound => outbound?.tag === '🖐️ 手动选择');
        expect(manualGroup.outbounds[0]).toBe('⚡ 自动选择');
    });

    it('should always include Private and Location:CN as base rules', async () => {
        const builder = new SingboxConfigBuilder(
            sampleSingboxConfig,
            ['Google'],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();

        expect(result.route.rules).toEqual(expect.arrayContaining([
            expect.objectContaining({ rule_set: ['geolocation-cn', 'cn'], outbound: 'DIRECT' }),
            expect.objectContaining({ rule_set: ['private-ip'], outbound: 'DIRECT' }),
            expect.objectContaining({ rule_set: ['cn-ip'], outbound: 'DIRECT' }),
            expect.objectContaining({ rule_set: ['google'], outbound: '🔍 谷歌服务' })
        ]));
    });

    it('should work with ClashConfigBuilder as well', async () => {
        const builder = new ClashConfigBuilder(
            sampleSingboxConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const resultYaml = await builder.build();
        // ClashConfigBuilder returns YAML string, need to parse it
        const yaml = await import('js-yaml');
        const result = yaml.load(resultYaml);
        const proxies = result.proxies;

        expect(proxies.length).toBe(3);
        // Clash uses 'name' instead of 'tag'
        expect(proxies.map(p => p.name)).toContain('SS-Test');
        expect(proxies.map(p => p.name)).toContain('VLESS-Test');
        expect(proxies.map(p => p.name)).toContain('VMess-Test');
    });

    it('should handle Sing-Box JSON with only outbounds array', async () => {
        const minimalConfig = JSON.stringify({
            "outbounds": [
                {
                    "type": "trojan",
                    "tag": "Trojan-Minimal",
                    "server": "trojan.example.com",
                    "server_port": 443,
                    "password": "trojan-password",
                    "tls": { "enabled": true }
                }
            ]
        });

        const builder = new SingboxConfigBuilder(
            minimalConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const proxies = result.outbounds.filter(o => o.server);

        expect(proxies.length).toBe(1);
        expect(proxies[0].tag).toBe('Trojan-Minimal');
        expect(proxies[0].type).toBe('trojan');
    });

    it('should handle hysteria2 and tuic proxy types', async () => {
        const advancedConfig = JSON.stringify({
            "outbounds": [
                {
                    "type": "hysteria2",
                    "tag": "HY2-Test",
                    "server": "hy2.example.com",
                    "server_port": 443,
                    "password": "hy2-password",
                    "tls": {
                        "enabled": true,
                        "server_name": "hy2.example.com"
                    }
                },
                {
                    "type": "tuic",
                    "tag": "TUIC-Test",
                    "server": "tuic.example.com",
                    "server_port": 443,
                    "uuid": "tuic-uuid",
                    "password": "tuic-password",
                    "congestion_control": "bbr",
                    "tls": {
                        "enabled": true,
                        "server_name": "tuic.example.com"
                    }
                }
            ]
        });

        const builder = new SingboxConfigBuilder(
            advancedConfig,
            [],
            [],
            null,
            'zh-CN',
            null,
            false
        );

        const result = await builder.build();
        const proxies = result.outbounds.filter(o => o.server);

        expect(proxies.length).toBe(2);
        expect(proxies.map(p => p.tag)).toContain('HY2-Test');
        expect(proxies.map(p => p.tag)).toContain('TUIC-Test');

        const tuicProxy = proxies.find(p => p.tag === 'TUIC-Test');
        expect(tuicProxy.congestion_control).toBe('bbr');
    });
});
