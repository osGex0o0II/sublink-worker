import { afterEach, describe, expect, it, vi } from 'vitest';
import * as yaml from 'js-yaml';
import { createApp, parseSelectedRules } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';
import { formLogicFn } from '../src/components/formLogic.js';
import {
	RULE_SCHEMES,
	generateRuleSets,
	generateRules,
	generateSubconverterConfig,
	getRuleScheme,
	resolveRuleScheme,
	validateRuleScheme
} from '../src/config/index.js';

const SS_NODE = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#Node';

function buildClash(input, selectedRules = 'smart-v1', customRules = []) {
	return new ClashConfigBuilder(input, selectedRules, customRules, null, 'zh-CN', 'mihomo/1.0', false);
}

function buildSurge(input, selectedRules = 'smart-v1', customRules = []) {
	return new SurgeConfigBuilder(input, selectedRules, customRules, null, 'zh-CN', 'Surge', false);
}

function createFormData(initialStorage = {}) {
	const storage = new Map(Object.entries(initialStorage));
	const fakeWindow = {
		APP_TRANSLATIONS: {},
		PREDEFINED_RULE_SETS: { basic: ['Ad Block', 'Google', 'Non-China'] },
		LEGACY_PRESET_RULE_SETS: {
			balanced: ['Ad Block', 'AI Services', 'Google', 'Youtube', 'Telegram', 'Non-China']
		},
		RULE_SCHEMES: {
			'smart-v1': { rules: ['Ad Block', 'Google', 'Non-China'] },
			'lite-v1': { rules: ['Ad Block', 'Non-China'] }
		},
		RULE_SCHEME_ALIASES: { basic: 'smart-v1' },
		DEFAULT_RULE_SCHEME_ID: 'smart-v1',
		MANDATORY_RULES: ['Private', 'Location:CN', 'BitTorrent'],
		HIDDEN_RULES: ['Private', 'Location:CN', 'BitTorrent', 'Non-China'],
		location: {
			origin: 'https://example.com',
			href: 'https://example.com/',
			pathname: '/',
			search: '',
			hash: ''
		},
		history: { replaceState() {} }
	};
	const fn = new Function('window', `(${formLogicFn.toString()})(); return window;`);
	const result = fn(fakeWindow);
	const data = result.formData();
	globalThis.localStorage = {
		getItem: key => storage.get(key) ?? null,
		setItem: (key, value) => storage.set(key, String(value)),
		removeItem: key => storage.delete(key)
	};
	data.$watch = () => {};
	data.init();
	return data;
}

function createRuntimeApp() {
	return createApp({
		kv: new MemoryKVAdapter(),
		logger: console,
		config: { configTtlSeconds: 60, shortLinkTtlSeconds: 60 }
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('versioned rule schemes', () => {
	it('exposes valid built-in manifests and aliases', () => {
		for (const scheme of Object.values(RULE_SCHEMES)) {
			expect(validateRuleScheme(scheme)).toEqual([]);
		}
		expect(getRuleScheme('basic')).toBe(RULE_SCHEMES['smart-v1']);
		expect(resolveRuleScheme('balanced').id).toBe('legacy-balanced');
		expect(parseSelectedRules('lite-v1')).toEqual(RULE_SCHEMES['lite-v1'].rules);
	});

	it('keeps explicit scheme order while retaining mandatory rules', () => {
		expect(generateRules('smart-v1').map(rule => rule.outbound)).toEqual([
			'Ad Block',
			'BitTorrent',
			'Google',
			'Private',
			'Location:CN',
			'Non-China'
		]);
		expect(generateRules('lite-v1').map(rule => rule.outbound)).toEqual([
			'Ad Block',
			'BitTorrent',
			'Private',
			'Location:CN',
			'Non-China'
		]);
	});

	it('does not create duplicate sing-box rule-set tags', () => {
		const result = generateRuleSets('smart-v1', [{
			name: 'Duplicate',
			site: 'google',
			ip: 'private'
		}]);
		const tags = [...result.site_rule_sets, ...result.ip_rule_sets].map(ruleSet => ruleSet.tag);
		expect(new Set(tags).size).toBe(tags.length);
	});

	it('rejects unsafe custom rule names before they reach Surge output', async () => {
		const output = await buildSurge('', 'smart-v1', [{
			name: 'X\n[Rule]\nFINAL,EVIL',
			domain_suffix: 'evil.example'
		}]).build();

		expect(output).not.toContain('FINAL,EVIL');
		expect(output).not.toContain('DOMAIN-SUFFIX,evil.example');
	});
});

describe('rule scheme compatibility regressions', () => {
	it('preserves provider-only Clash imports and use bindings', async () => {
		const input = [
			'proxy-providers:',
			'  airport:',
			'    type: http',
			'    url: https://example.com/sub',
			'proxy-groups:',
			'  - name: Proxy',
			'    type: select',
			'    use:',
			'      - airport',
			'rules:',
			'  - MATCH,Proxy'
		].join('\n');
		const output = yaml.load(await buildClash(input).build());

		expect(output['proxy-providers'].airport.url).toBe('https://example.com/sub');
		const proxyGroup = output['proxy-groups'].find(group => group.name === 'Proxy');
		expect(proxyGroup.use).toContain('airport');
	});

	it('does not emit an empty Surge auto-select group', async () => {
		const output = await buildSurge('').build();
		expect(output).not.toContain('⚡ 自动选择 = url-test');
	});

	it('keeps AI manual selection ahead of auto-select in Subconverter output', () => {
		const output = generateSubconverterConfig({
			selectedRules: ['AI Services'],
			customRules: [],
			lang: 'zh-CN',
			includeAutoSelect: true,
			groupByCountry: false
		});
		const aiGroup = output.split('\n').find(line => line.startsWith('custom_proxy_group=💬 AI 服务'));
		expect(aiGroup).toBeTruthy();
		expect(aiGroup.indexOf('[]🖐️ 手动选择')).toBeLessThan(aiGroup.indexOf('[]⚡ 自动选择'));
	});

	it('accepts the new scheme ID through the Sing-box route', async () => {
		const config = await new SingboxConfigBuilder(SS_NODE, 'lite-v1', [], null, 'zh-CN', 'sing-box/1.14', false).build();
		expect(config.route.rules.some(rule => rule.rule_set?.includes('geolocation-!cn'))).toBe(true);
		expect(config.route.final).toBe('🖐️ 手动选择');
	});

	it('keeps the Xray endpoint as a subscription passthrough', async () => {
		const app = createApp({
			kv: new MemoryKVAdapter(),
			logger: console,
			config: { configTtlSeconds: 60, shortLinkTtlSeconds: null }
		});
		const response = await app.request(`http://localhost/xray?config=${encodeURIComponent(SS_NODE)}&selectedRules=full-v1`);
		expect(response.status).toBe(200);
		expect(Buffer.from(await response.text(), 'base64').toString()).toContain(SS_NODE);
	});

	it('converts a direct subscription through all HTTP endpoints', async () => {
		const app = createRuntimeApp();
		const query = new URLSearchParams({ config: SS_NODE, selectedRules: 'smart-v1', customRules: '[]' });

		const singboxResponse = await app.request(`http://localhost/singbox?${query}`);
		expect(singboxResponse.status).toBe(200);
		const singbox = await singboxResponse.json();
		expect(singbox.outbounds.some(outbound => outbound.tag === 'Node')).toBe(true);
		expect(singbox.route.rules.some(rule => rule.rule_set?.includes('geolocation-!cn'))).toBe(true);

		const clashResponse = await app.request(`http://localhost/clash?${query}`);
		expect(clashResponse.status).toBe(200);
		const clash = yaml.load(await clashResponse.text());
		expect(clash.proxies.some(proxy => proxy.name === 'Node')).toBe(true);

		const surgeResponse = await app.request(`http://localhost/surge?${query}`);
		expect(surgeResponse.status).toBe(200);
		expect(await surgeResponse.text()).toContain('[Proxy]');

		const xrayResponse = await app.request(`http://localhost/xray?${query}`);
		expect(xrayResponse.status).toBe(200);
		expect(Buffer.from(await xrayResponse.text(), 'base64').toString()).toContain('Node');
	});

	it('keeps provider-only Clash configuration through Base64 input', async () => {
		const app = createRuntimeApp();
		const providerYaml = [
			'proxy-providers:',
			'  airport:',
			'    type: http',
			'    url: https://example.com/sub',
			'proxy-groups:',
			'  - name: Proxy',
			'    type: select',
			'    use:',
			'      - airport',
			'rules:',
			'  - MATCH,Proxy'
		].join('\n');
		const response = await app.request(`http://localhost/clash?config=${encodeURIComponent(Buffer.from(providerYaml).toString('base64'))}`);

		expect(response.status).toBe(200);
		const output = yaml.load(await response.text());
		expect(output['proxy-providers'].airport.url).toBe('https://example.com/sub');
		expect(output['proxy-groups'].find(group => group.name === 'Proxy').use).toContain('airport');
	});

	it('fetches remote subscriptions, propagates userinfo, and retains Clash providers', async () => {
		const clashYaml = [
			'proxies:',
			'  - name: Remote-HK',
			'    type: ss',
			'    server: hk.example.com',
			'    port: 443',
			'    cipher: aes-128-gcm',
			'    password: test'
		].join('\n');
		vi.stubGlobal('fetch', vi.fn(async (url) => new Response(
			String(url).includes('clash') ? clashYaml : Buffer.from(SS_NODE).toString('base64'),
			{
				status: 200,
				headers: { 'subscription-userinfo': 'upload=1; download=2; total=3' }
			}
		)));
		const app = createRuntimeApp();

		const singboxResponse = await app.request(`http://localhost/singbox?config=${encodeURIComponent('https://remote.example.com/sub')}`);
		expect(singboxResponse.status).toBe(200);
		expect(singboxResponse.headers.get('subscription-userinfo')).toBe('upload=1; download=2; total=3');
		expect((await singboxResponse.json()).outbounds.some(outbound => outbound.tag === 'Node')).toBe(true);

		const clashResponse = await app.request(`http://localhost/clash?config=${encodeURIComponent('https://remote.example.com/clash-sub')}`);
		expect(clashResponse.status).toBe(200);
		const clash = yaml.load(await clashResponse.text());
		expect(Object.keys(clash['proxy-providers'])).toHaveLength(1);
		expect(clash['proxy-groups'].some(group => group.use?.length > 0)).toBe(true);
		expect(clashResponse.headers.get('subscription-userinfo')).toBe('upload=1; download=2; total=3');

		const xrayResponse = await app.request(`http://localhost/xray?config=${encodeURIComponent('https://remote.example.com/sub')}`);
		expect(xrayResponse.status).toBe(200);
		expect(xrayResponse.headers.get('subscription-userinfo')).toBe('upload=1; download=2; total=3');
		expect(Buffer.from(await xrayResponse.text(), 'base64').toString()).toContain('Node');
	});
});

describe('rule scheme form migration', () => {
	it('defaults to the versioned scheme and normalizes aliases', () => {
		const data = createFormData();
		expect(data.selectedPredefinedRule).toBe('smart-v1');
		expect(data.getRuleSelectionParam()).toBe('smart-v1');
		data.selectRulePreset('basic');
		expect(data.selectedPredefinedRule).toBe('smart-v1');
		delete globalThis.localStorage;
	});

	it('restores a legacy saved preset as an explicit custom selection', () => {
		const data = createFormData({ selectedPredefinedRule: 'balanced' });
		expect(data.selectedPredefinedRule).toBe('custom');
		expect(data.selectedRules).toEqual(['Ad Block', 'AI Services', 'Google', 'Youtube', 'Telegram']);
		delete globalThis.localStorage;
	});

	it('normalizes a scheme ID while importing a generated URL', () => {
		const data = createFormData();
		data.populateFormFromUrl(new URL('https://example.com/clash?selectedRules=basic'));
		expect(data.selectedPredefinedRule).toBe('smart-v1');
		expect(data.getRuleSelectionParam()).toBe('smart-v1');
		delete globalThis.localStorage;
	});
});
