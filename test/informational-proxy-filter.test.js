import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { isInformationalProxyName } from '../src/builders/helpers/proxyHelpers.js';

describe('informational proxy filter', () => {
    const realNode = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Node';
    const trafficNode = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:444#剩余流量 120GB';
    const expireNode = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:445#套餐到期 2026-12-31';
    const noticeNode = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:446#官网地址 example.com';

    it('detects common informational node names conservatively', () => {
        expect(isInformationalProxyName('剩余流量 120GB')).toBe(true);
        expect(isInformationalProxyName('Expire Date 2026-12-31')).toBe(true);
        expect(isInformationalProxyName('官网地址 example.com')).toBe(true);
        expect(isInformationalProxyName('HK 100GB Port')).toBe(false);
        expect(isInformationalProxyName('US 2026')).toBe(false);
    });

    it('filters informational URI nodes before building Clash groups', async () => {
        const builder = new ClashConfigBuilder(
            [realNode, trafficNode, expireNode, noticeNode].join('\n'),
            'minimal',
            [],
            null,
            'zh-CN',
            'mihomo'
        );

        const config = yaml.load(await builder.build());
        const proxyNames = config.proxies.map(proxy => proxy.name);
        const groupMembers = config['proxy-groups'].flatMap(group => group.proxies || []);

        expect(proxyNames).toEqual(['HK-Node']);
        expect(groupMembers).toContain('HK-Node');
        expect(groupMembers.join('\n')).not.toContain('剩余流量');
        expect(groupMembers.join('\n')).not.toContain('套餐到期');
        expect(groupMembers.join('\n')).not.toContain('官网地址');
    });

    it('filters informational imported Clash proxy entries for sing-box output', async () => {
        const clashYaml = `
proxies:
  - name: HK-Node
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
  - name: 剩余流量 120GB
    type: ss
    server: example.com
    port: 444
    cipher: aes-128-gcm
    password: test
  - name: 套餐到期 2026-12-31
    type: ss
    server: example.com
    port: 445
    cipher: aes-128-gcm
    password: test
`;

        const builder = new SingboxConfigBuilder(clashYaml, 'minimal', [], null, 'zh-CN', 'sing-box');
        const config = await builder.build();
        const outboundTags = config.outbounds.map(outbound => outbound.tag).filter(Boolean);

        expect(outboundTags).toContain('HK-Node');
        expect(outboundTags).not.toContain('剩余流量 120GB');
        expect(outboundTags).not.toContain('套餐到期 2026-12-31');
    });
});
