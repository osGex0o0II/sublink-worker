import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { isSystemGeneratedGroupName } from '../src/builders/helpers/groupNameUtils.js';

describe('system proxy group filter', () => {
    it('detects legacy system group names', () => {
        expect(isSystemGeneratedGroupName('节点选择')).toBe(true);
        expect(isSystemGeneratedGroupName('自动选择')).toBe(true);
        expect(isSystemGeneratedGroupName('🐟 漏网之鱼')).toBe(true);
        expect(isSystemGeneratedGroupName('🤖 AI 自动选择')).toBe(true);
        expect(isSystemGeneratedGroupName('自定义媒体')).toBe(false);
    });

    it('drops imported legacy sing-box selector/urltest groups', async () => {
        const input = JSON.stringify({
            outbounds: [
                { type: 'ss', tag: 'HK-Node', server: 'example.com', server_port: 443, method: 'aes-128-gcm', password: 'test' },
                { type: 'selector', tag: '节点选择', outbounds: ['HK-Node'] },
                { type: 'urltest', tag: '自动选择', outbounds: ['HK-Node'] },
                { type: 'selector', tag: '自定义媒体', outbounds: ['HK-Node'] }
            ]
        });

        const config = await new SingboxConfigBuilder(input, ['AI Services'], [], null, 'zh-CN', 'SFI/1.14.0').build();
        const groupTags = config.outbounds
            .filter(outbound => ['selector', 'urltest'].includes(outbound.type))
            .map(outbound => outbound.tag);

        expect(groupTags).toEqual(expect.arrayContaining(['🖐️ 手动选择', '⚡ 自动选择', '💬 AI 服务', '自定义媒体']));
        expect(groupTags).not.toContain('节点选择');
        expect(groupTags.filter(tag => tag === '自动选择')).toHaveLength(0);
    });

    it('drops imported legacy Clash proxy groups', async () => {
        const input = `
proxies:
  - name: HK-Node
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - HK-Node
  - name: 自动选择
    type: url-test
    proxies:
      - HK-Node
    url: http://www.gstatic.com/generate_204
    interval: 300
  - name: 自定义媒体
    type: select
    proxies:
      - HK-Node
`;

        const config = yaml.load(await new ClashConfigBuilder(input, ['AI Services'], [], null, 'zh-CN', 'mihomo').build());
        const groupNames = config['proxy-groups'].map(group => group.name);

        expect(groupNames).toEqual(expect.arrayContaining(['🖐️ 手动选择', '⚡ 自动选择', '💬 AI 服务', '自定义媒体']));
        expect(groupNames).not.toContain('节点选择');
        expect(groupNames.filter(name => name === '自动选择')).toHaveLength(0);
    });
});
