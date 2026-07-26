import { describe, it, expect } from 'vitest';
import * as yaml from 'js-yaml';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';
import { createTranslator } from '../src/i18n/index.js';
import { normalizeSelectedRules } from '../src/config/ruleGenerators.js';
import { parseSelectedRules } from '../src/app/createApp.jsx';
import { LEGACY_PRESET_RULE_SETS } from '../src/config/rules.js';

const SS_NODE = 'ss://YWVzLTI1Ni1nY206dGVzdA==@example.com:8388#Test-Node';

const CLASH_SUB_WITH_TOP_LEVEL_KEYS = `
port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info
external-controller: 127.0.0.1:9090
proxies:
  - name: yaml-node
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: pwd
rules:
  - MATCH,DIRECT
`;

describe('cross-format config override gating', () => {
    it('does not leak Clash top-level keys into sing-box output', async () => {
        const builder = new SingboxConfigBuilder(CLASH_SUB_WITH_TOP_LEVEL_KEYS, ['Google'], [], null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        for (const key of ['port', 'socks-port', 'allow-lan', 'mode', 'log-level', 'external-controller']) {
            expect(config, `unexpected key "${key}"`).not.toHaveProperty(key);
        }
        expect(config.outbounds.some(o => o.tag === 'yaml-node')).toBe(true);
    });

    it('does not leak sing-box sections into Clash YAML output', async () => {
        const singboxSub = JSON.stringify({
            log: { level: 'warn' },
            inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 2080 }],
            experimental: { cache_file: { enabled: true } },
            route: { rules: [], rule_set: [] },
            dns: { servers: [{ type: 'udp', tag: 'dns_resolver', server: '223.5.5.5' }], final: 'dns_resolver' },
            outbounds: [
                { type: 'shadowsocks', tag: 'sb-node', server: '5.6.7.8', server_port: 8388, method: 'aes-256-gcm', password: 'pwd' }
            ]
        });
        const builder = new ClashConfigBuilder(singboxSub, ['Google'], [], null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());

        for (const key of ['route', 'inbounds', 'experimental', 'log', 'ntp']) {
            expect(config, `unexpected key "${key}"`).not.toHaveProperty(key);
        }
        // Clash base dns must survive untouched by sing-box dns structures
        expect(config.dns['enhanced-mode']).toBe('fake-ip');
        expect(config.dns).not.toHaveProperty('servers');
        expect(config.proxies.some(p => p.name === 'sb-node')).toBe(true);
    });
});

describe('sing-box dangling reference safety net', () => {
    it('prunes route rules whose rule_set or outbound cannot be resolved', async () => {
        const singboxSub = JSON.stringify({
            route: {
                rules: [
                    { rule_set: ['my-private-ruleset'], outbound: 'proxy-out' },
                    { domain_suffix: ['orphan.example'], outbound: 'nonexistent-outbound' },
                    { domain_suffix: ['keep.example'], outbound: 'DIRECT' }
                ],
                rule_set: [{ tag: 'my-private-ruleset', type: 'remote', url: 'https://example.com/x.srs', format: 'binary' }]
            },
            outbounds: [
                { type: 'vmess', tag: 'node-a', server: '5.6.7.8', server_port: 443, uuid: '00000000-0000-0000-0000-000000000000' }
            ]
        });
        const builder = new SingboxConfigBuilder(singboxSub, ['Google'], [], null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        const definedRuleSets = new Set(config.route.rule_set.map(rs => rs.tag));
        const outboundTags = new Set(config.outbounds.map(o => o.tag));
        for (const rule of config.route.rules) {
            const refs = Array.isArray(rule.rule_set) ? rule.rule_set : (rule.rule_set ? [rule.rule_set] : []);
            refs.forEach(tag => expect(definedRuleSets, `dangling rule_set "${tag}"`).toContain(tag));
            if (typeof rule.outbound === 'string') {
                expect(outboundTags, `dangling outbound "${rule.outbound}"`).toContain(rule.outbound);
            }
        }
        // The resolvable user rule survives
        expect(config.route.rules.some(r => Array.isArray(r.domain_suffix) && r.domain_suffix.includes('keep.example'))).toBe(true);
    });

    it('walks nested logical rules when pruning dangling rule_set refs', async () => {
        const singboxSub = JSON.stringify({
            route: {
                rules: [
                    { type: 'logical', mode: 'and', rules: [{ rule_set: 'their-own-set' }, { port: 443 }], outbound: 'node-a' },
                    { type: 'logical', mode: 'or', rules: [{ domain_suffix: ['ok.example'] }, { network: 'udp' }], outbound: 'node-a' }
                ],
                rule_set: [{ tag: 'their-own-set', type: 'remote', url: 'https://example.com/o.srs', format: 'binary' }]
            },
            outbounds: [
                { type: 'vmess', tag: 'node-a', server: '5.6.7.8', server_port: 443, uuid: '00000000-0000-0000-0000-000000000000' }
            ]
        });
        const builder = new SingboxConfigBuilder(singboxSub, ['Google'], [], null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        const defined = new Set(config.route.rule_set.map(rs => rs.tag));
        const dangling = [];
        const walk = (rule) => {
            if (!rule || typeof rule !== 'object') return;
            const refs = Array.isArray(rule.rule_set) ? rule.rule_set : (rule.rule_set ? [rule.rule_set] : []);
            refs.forEach(tag => { if (!defined.has(tag)) dangling.push(tag); });
            (Array.isArray(rule.rules) ? rule.rules : []).forEach(walk);
        };
        config.route.rules.forEach(walk);
        expect(dangling).toEqual([]);
        // The logical rule with resolvable branches survives
        expect(config.route.rules.some(r => r.type === 'logical'
            && (r.rules || []).some(n => Array.isArray(n.domain_suffix) && n.domain_suffix.includes('ok.example')))).toBe(true);
    });

    it('keeps rule-set download detour valid when base config lacks a DIRECT tag', async () => {
        const baseConfig = {
            dns: { servers: [{ type: 'udp', tag: 'dns_resolver', server: '223.5.5.5' }], final: 'dns_resolver' },
            outbounds: [],
            route: { rule_set: [], rules: [] }
        };
        const builder = new SingboxConfigBuilder(SS_NODE, ['Google'], [], baseConfig, 'zh-CN', 'sing-box', false, false, null, null, '1.12');
        const config = await builder.build();

        const outboundTags = new Set(config.outbounds.map(o => o.tag));
        expect(config.outbounds.some(o => o.type === 'direct')).toBe(true);
        config.route.rule_set.forEach(ruleSet => {
            if (ruleSet.download_detour !== undefined) {
                expect(outboundTags).toContain(ruleSet.download_detour);
            }
        });
        config.route.rules.forEach(rule => {
            if (typeof rule.outbound === 'string') {
                expect(outboundTags).toContain(rule.outbound);
            }
        });
    });
});

describe('custom rule priority across match types', () => {
    const customRules = [{ name: 'My-VPS', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], ip_cidr: ['203.0.113.7/32'], protocol: [] }];

    it('sing-box: custom ip_cidr rule precedes predefined ip rule-sets', async () => {
        const builder = new SingboxConfigBuilder(SS_NODE, ['Google'], customRules, null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        const customIdx = config.route.rules.findIndex(r => Array.isArray(r.ip_cidr) && r.ip_cidr.includes('203.0.113.7/32'));
        const cnIpIdx = config.route.rules.findIndex(r => Array.isArray(r.rule_set) && r.rule_set.includes('cn-ip'));
        expect(customIdx).toBeGreaterThan(-1);
        expect(cnIpIdx).toBeGreaterThan(-1);
        expect(customIdx).toBeLessThan(cnIpIdx);
    });

    it('clash: custom IP-CIDR rule precedes predefined RULE-SET ip rules', async () => {
        const builder = new ClashConfigBuilder(SS_NODE, ['Google'], customRules, null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());

        const customIdx = config.rules.findIndex(r => r.startsWith('IP-CIDR,203.0.113.7/32'));
        const cnIpIdx = config.rules.findIndex(r => r.startsWith('RULE-SET,cn-ip'));
        expect(customIdx).toBeGreaterThan(-1);
        expect(cnIpIdx).toBeGreaterThan(-1);
        expect(customIdx).toBeLessThan(cnIpIdx);
    });

    it('surge: custom IP-CIDR rule precedes predefined ip RULE-SET rules', async () => {
        const builder = new SurgeConfigBuilder(SS_NODE, ['Google'], customRules, null, 'zh-CN', 'Surge/5.0');
        const output = await builder.build();

        const lines = output.split('\n');
        const customIdx = lines.findIndex(l => l.startsWith('IP-CIDR,203.0.113.7/32'));
        const cnIpIdx = lines.findIndex(l => l.includes('/cn.txt,'));
        expect(customIdx).toBeGreaterThan(-1);
        expect(cnIpIdx).toBeGreaterThan(-1);
        expect(customIdx).toBeLessThan(cnIpIdx);
    });
});

describe('custom rule names containing dots', () => {
    it('translator fallback keeps the full name after the prefix', () => {
        const t = createTranslator('zh-CN');
        expect(t('outboundNames.my.rule')).toBe('my.rule');
    });

    it('sing-box group tag matches route rule outbound for dotted names', async () => {
        const customRules = [{ name: 'ai.example', site: 'google' }];
        const builder = new SingboxConfigBuilder(SS_NODE, ['Google'], customRules, null, 'zh-CN', 'sing-box');
        const config = await builder.build();

        const group = config.outbounds.find(o => o.tag === 'ai.example');
        expect(group).toBeDefined();
        expect(config.route.rules.some(r => r.outbound === 'ai.example')).toBe(true);
    });
});

describe('legacy preset compatibility', () => {
    it('normalizeSelectedRules resolves legacy preset names to their historical sets', () => {
        const rules = normalizeSelectedRules('balanced');
        for (const name of LEGACY_PRESET_RULE_SETS.balanced) {
            expect(rules).toContain(name);
        }
        // mandatory rules still appended
        expect(rules).toContain('Private');
        expect(rules).toContain('Location:CN');
    });

    it('parseSelectedRules accepts legacy names instead of downgrading to basic', () => {
        expect(parseSelectedRules('comprehensive')).toEqual(LEGACY_PRESET_RULE_SETS.comprehensive);
        expect(parseSelectedRules('minimal')).toEqual(LEGACY_PRESET_RULE_SETS.minimal);
    });

    it('legacy preset produces the corresponding groups in clash output', async () => {
        const builder = new ClashConfigBuilder(SS_NODE, 'balanced', [], null, 'zh-CN', 'mihomo/1.0');
        const config = yaml.load(await builder.build());
        expect(config.rules.some(r => r.startsWith('RULE-SET,telegram-ip'))).toBe(true);
    });
});
