import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { createTranslator } from '../src/i18n/index.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { sanitizeClashProxyGroups } from '../src/builders/helpers/clashConfigUtils.js';

// Create translator for tests
const t = createTranslator('zh-CN');

describe('Clash Builder Tests', () => {
  it('should clean up proxy-groups and remove non-existent proxies', async () => {
    const input = `
proxies:
  - name: Valid-SS
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: 自定义选择
    type: select
    proxies:
      - DIRECT
      - REJECT
      - Valid-SS
      - NotExist
    `;

    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const grp = (built['proxy-groups'] || []).find(g => g && g.name === '自定义选择');
    expect(grp).toBeDefined();

    const expected = ['DIRECT', 'REJECT', 'Valid-SS'];
    const actual = grp.proxies || [];

    expect(actual).toEqual(expected);
  });

  it('should reference user-defined proxy-providers in generated proxy-groups', async () => {
    const input = `
proxy-providers:
  my-provider:
    type: http
    url: https://example.com/sub
    path: ./my.yaml
    interval: 3600

proxies:
  - name: local
    type: ss
    server: 127.0.0.1
    port: 1080
    cipher: aes-256-gcm
    password: test
`;

    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const nodeSelect = (built['proxy-groups'] || []).find(g => g && g.name === '🐟 漏网之鱼');
    expect(nodeSelect).toBeDefined();
    expect(nodeSelect.use).toContain('my-provider');
  });

  it('should hide internal helper groups while keeping routing selectors visible', async () => {
    const input = `
ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Node
ss://YWVzLTEyOC1nY206dGVzdA@example.com:444#JP-Node
    `;

    const builder = new ClashConfigBuilder(input, ['AI Services', 'Google'], [], null, 'zh-CN', 'mihomo', true);
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const groups = built['proxy-groups'] || [];
    const visibleGroupNames = groups.filter(g => !g.hidden).map(g => g.name);
    const hiddenGroupNames = groups.filter(g => g.hidden).map(g => g.name);
    const aiAutoGroup = groups.find(g => g.name === '🤖 AI 自动选择');

    expect(visibleGroupNames).toEqual(expect.arrayContaining([
      '🐟 漏网之鱼',
      '💬 AI 服务',
      '🔍 谷歌服务'
    ]));
    expect(hiddenGroupNames).toEqual(expect.arrayContaining([
      '⚡ 自动选择',
      '🤖 AI 自动选择',
      '🖐️ 手动切换',
      '🇭🇰 Hong Kong',
      '🇯🇵 Japan'
    ]));
    expect(aiAutoGroup?.['expected-status']).toBe('200-499');
  });

  it('sanitizeClashProxyGroups should not remove provider node references when group uses providers', () => {
    const config = {
      proxies: [],
      'proxy-groups': [
        {
          name: 'Custom Group',
          type: 'select',
          use: ['my-provider'],
          proxies: ['node-from-provider']
        }
      ]
    };

    sanitizeClashProxyGroups(config);

    const grp = (config['proxy-groups'] || [])[0];
    expect(grp).toBeDefined();
    expect(grp.proxies).toContain('node-from-provider');
  });

  it('should route transparent rules without creating extra groups', async () => {
    const input = `
ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Node-1
ss://YWVzLTEyOC1nY206dGVzdA@example.com:444#US-Node-1
    `;

    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const groupNames = (built['proxy-groups'] || []).map(g => g.name);

    expect(groupNames).not.toContain(t('outboundNames.Private'));
    expect(groupNames).not.toContain(t('outboundNames.Location:CN'));
    expect(built.rules).toEqual(expect.arrayContaining([
      'RULE-SET,private-ip,DIRECT,no-resolve',
      'RULE-SET,cn,DIRECT',
      'RULE-SET,cn-ip,DIRECT,no-resolve',
      `RULE-SET,geolocation-!cn,${t('outboundNames.Node Select')}`
    ]));

    // Other groups should NOT default to DIRECT
    const fallbackName = t('outboundNames.Fall Back');
    const fallbackGroup = (built['proxy-groups'] || []).find(g => g && g.name === fallbackName);
    expect(fallbackGroup).toBeDefined();
    expect(fallbackGroup.proxies[0]).not.toBe('DIRECT');
  });
});
