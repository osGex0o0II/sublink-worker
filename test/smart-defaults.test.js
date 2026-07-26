import { describe, it, expect } from 'vitest';
import * as yaml from 'js-yaml';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';
import { createTranslator } from '../src/i18n/index.js';
import { PREDEFINED_RULE_SETS, HIDDEN_RULES } from '../src/config/rules.js';
import { normalizeSelectedRules } from '../src/config/ruleGenerators.js';

const SS_NODE = 'ss://YWVzLTI1Ni1nY206dGVzdA==@example.com:8388#Node-1';
const t = createTranslator('zh-CN');

describe('BitTorrent protection (mandatory)', () => {
    it('sing-box routes sniffed BT and tracker domains to DIRECT without a group', async () => {
        const builder = new SingboxConfigBuilder(SS_NODE, ['Google'], [], null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        expect(config.route.rules.some(r => r.protocol === 'bittorrent' && r.outbound === 'DIRECT')).toBe(true);
        expect(config.route.rules.some(r => Array.isArray(r.rule_set)
            && r.rule_set.includes('category-public-tracker') && r.outbound === 'DIRECT')).toBe(true);
        expect(config.outbounds.some(o => o.tag === t('outboundNames.BitTorrent'))).toBe(false);
    });

    it('clash routes tracker domains to DIRECT', async () => {
        const builder = new ClashConfigBuilder(SS_NODE, ['Google'], [], null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());

        expect(config.rules.some(r => r.startsWith('RULE-SET,category-public-tracker,DIRECT'))).toBe(true);
        expect(config['rule-providers']['category-public-tracker']).toBeDefined();
    });

    it('surge routes tracker domains to DIRECT', async () => {
        const builder = new SurgeConfigBuilder(SS_NODE, ['Google'], [], null, 'zh-CN', 'Surge/5.0');
        const output = await builder.build();
        expect(output).toMatch(/RULE-SET,[^\n]*category-public-tracker\.conf,DIRECT/);
    });
});

describe('AI Services default egress is manual, not url-test', () => {
    it.each([
        ['sing-box', async () => {
            const b = new SingboxConfigBuilder(SS_NODE, ['AI Services'], [], null, 'zh-CN', 'sing-box');
            const cfg = await b.build();
            return cfg.outbounds.find(o => o.tag === t('outboundNames.AI Services'))?.outbounds;
        }],
        ['clash', async () => {
            const b = new ClashConfigBuilder(SS_NODE, ['AI Services'], [], null, 'zh-CN', 'mihomo/1.0');
            const cfg = yaml.load(await b.build());
            return cfg['proxy-groups'].find(g => g.name === t('outboundNames.AI Services'))?.proxies;
        }],
    ])('%s AI group leads with Node Select', async (_name, getMembers) => {
        const members = await getMembers();
        expect(members?.[0]).toBe(t('outboundNames.Node Select'));
        expect(members?.[0]).not.toBe(t('outboundNames.Auto Select'));
    });

    it('surge AI group leads with Node Select', async () => {
        const b = new SurgeConfigBuilder(SS_NODE, ['AI Services'], [], null, 'zh-CN', 'Surge/5.0');
        const output = await b.build();
        const line = output.split('\n').find(l => l.startsWith(`${t('outboundNames.AI Services')} = select`));
        expect(line).toBeDefined();
        expect(line.split(',')[1].trim()).toBe(t('outboundNames.Node Select'));
    });
});

describe('Netflix geoip coverage', () => {
    it('streaming selection emits netflix ip rules pointing at the streaming group', async () => {
        const builder = new ClashConfigBuilder(SS_NODE, ['Streaming'], [], null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());
        const line = config.rules.find(r => r.startsWith('RULE-SET,netflix-ip,'));
        expect(line).toBeDefined();
        expect(line).toContain(t('outboundNames.Streaming'));
    });
});

describe('@cn companion split for Apple/Microsoft', () => {
    it('selecting Apple auto-adds a DIRECT apple@cn rule ahead of the apple rule', async () => {
        const builder = new SingboxConfigBuilder(SS_NODE, ['Apple'], [], null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        const cnIdx = config.route.rules.findIndex(r => Array.isArray(r.rule_set) && r.rule_set.includes('apple@cn'));
        const appleIdx = config.route.rules.findIndex(r => Array.isArray(r.rule_set) && r.rule_set.includes('apple'));
        expect(cnIdx).toBeGreaterThan(-1);
        expect(config.route.rules[cnIdx].outbound).toBe('DIRECT');
        expect(appleIdx).toBeGreaterThan(cnIdx);
        // companion is transparent: no group of its own
        expect(config.outbounds.some(o => o.tag === t('outboundNames.Apple CN'))).toBe(false);
    });

    it('companions are not selectable UI rules and not auto-added without parent', () => {
        expect(HIDDEN_RULES).toContain('Apple CN');
        expect(HIDDEN_RULES).toContain('Microsoft CN');
        expect(normalizeSelectedRules(['Google'])).not.toContain('Apple CN');
        expect(normalizeSelectedRules(['Microsoft'])).toContain('Microsoft CN');
    });
});

describe('ad blocking on by default', () => {
    it('basic preset includes Ad Block and emits REJECT rules', async () => {
        expect(PREDEFINED_RULE_SETS.basic).toContain('Ad Block');

        const builder = new ClashConfigBuilder(SS_NODE, 'basic', [], null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());
        expect(config.rules.some(r => r.startsWith('RULE-SET,category-ads-all,REJECT'))).toBe(true);
    });
});

describe('clash fake-ip hygiene', () => {
    it('base config ships a fake-ip-filter covering LAN/NTP/portal checks', async () => {
        const builder = new ClashConfigBuilder(SS_NODE, ['Google'], [], null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());
        const filter = config.dns['fake-ip-filter'];
        expect(Array.isArray(filter)).toBe(true);
        expect(filter).toContain('*.lan');
        expect(filter).toContain('+.msftconnecttest.com');
        expect(filter).toContain('+.pool.ntp.org');
    });
});
