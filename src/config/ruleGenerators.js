/**
 * Rule Generators
 * Functions for generating rules and rule sets
 */

import { MANDATORY_RULES, UNIFIED_RULES, PREDEFINED_RULE_SETS, resolvePresetRules, COMPANION_RULES, SITE_RULE_SETS, IP_RULE_SETS, CLASH_SITE_RULE_SETS, CLASH_IP_RULE_SETS } from './rules.js';
import { SITE_RULE_SET_BASE_URL, IP_RULE_SET_BASE_URL, CLASH_SITE_RULE_SET_BASE_URL, CLASH_IP_RULE_SET_BASE_URL } from './ruleUrls.js';

const DEFAULT_RULE_SET_DOWNLOAD_DETOUR = 'DIRECT';

function toStringArray(value) {
	if (Array.isArray(value)) {
		return value
			.filter(x => typeof x === 'string').map(x => x.trim())
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		return value.split(',').map(x => x.trim()).filter(Boolean);
	}
	return [];
}

function createSingboxRemoteRuleSet(tag, url) {
	return {
		tag,
		type: 'remote',
		format: 'binary',
		url,
		download_detour: DEFAULT_RULE_SET_DOWNLOAD_DETOUR
	};
}

export function normalizeSelectedRules(selectedRules = []) {
	if (typeof selectedRules === 'string') {
		selectedRules = resolvePresetRules(selectedRules) ?? PREDEFINED_RULE_SETS.basic;
	}

	if (!selectedRules || selectedRules.length === 0) {
		selectedRules = PREDEFINED_RULE_SETS.basic;
	}

	const companions = selectedRules.flatMap(name => COMPANION_RULES[name] ?? []);
	return [...new Set([...MANDATORY_RULES, ...selectedRules, ...companions])];
}

// Helper function to get outbounds based on selected rule names
export function getOutbounds(selectedRuleNames) {
	selectedRuleNames = normalizeSelectedRules(selectedRuleNames);
	return UNIFIED_RULES
		.filter(rule => selectedRuleNames.includes(rule.name))
		.map(rule => rule.name);
}

// Helper function to generate rules based on selected rule names
export function generateRules(selectedRules = [], customRules = []) {
	selectedRules = normalizeSelectedRules(selectedRules);

	const rules = [];

	UNIFIED_RULES.forEach(rule => {
		if (selectedRules.includes(rule.name)) {
			rules.push({
				site_rules: rule.site_rules,
				ip_rules: rule.ip_rules,
				domain_suffix: rule?.domain_suffix,
				ip_cidr: rule?.ip_cidr,
				outbound: rule.name
			});
		}
	});

	[...customRules].reverse().forEach((rule) => {
		rules.unshift({
			site_rules: toStringArray(rule.site),
			ip_rules: toStringArray(rule.ip),
			domain_suffix: toStringArray(rule.domain_suffix),
			domain_keyword: toStringArray(rule.domain_keyword),
			ip_cidr: toStringArray(rule.ip_cidr),
			src_ip_cidr: toStringArray(rule.src_ip_cidr),
			protocol: toStringArray(rule.protocol),
			outbound: rule.name
		});
	});

	return rules;
}

export function generateRuleSets(selectedRules = [], customRules = []) {
	selectedRules = normalizeSelectedRules(selectedRules);

	const selectedRulesSet = new Set(selectedRules);

	const siteRuleSets = new Set();
	const ipRuleSets = new Set();

	UNIFIED_RULES.forEach(rule => {
		if (selectedRulesSet.has(rule.name)) {
			rule.site_rules.forEach(siteRule => siteRuleSets.add(siteRule));
			rule.ip_rules.forEach(ipRule => ipRuleSets.add(ipRule));
		}
	});

	const site_rule_sets = Array.from(siteRuleSets)
		.map(rule => createSingboxRemoteRuleSet(rule, `${SITE_RULE_SET_BASE_URL}${SITE_RULE_SETS[rule]}`));

	const ip_rule_sets = Array.from(ipRuleSets)
		.map(rule => createSingboxRemoteRuleSet(`${rule}-ip`, `${IP_RULE_SET_BASE_URL}${IP_RULE_SETS[rule]}`));

	if (!selectedRules.includes('Non-China')) {
		site_rule_sets.push(createSingboxRemoteRuleSet(
			'geolocation-!cn',
			`${SITE_RULE_SET_BASE_URL}geolocation-!cn.srs`
		));
	}

	if (customRules) {
		customRules.forEach(rule => {
			toStringArray(rule.site).forEach(site => {
				site_rule_sets.push(createSingboxRemoteRuleSet(
					site,
					`${SITE_RULE_SET_BASE_URL}${site}.srs`
				));
			});
			toStringArray(rule.ip).forEach(ip => {
				ip_rule_sets.push(createSingboxRemoteRuleSet(
					`${ip}-ip`,
					`${IP_RULE_SET_BASE_URL}${ip}.srs`
				));
			});
		});
	}

	return { site_rule_sets, ip_rule_sets };
}

// Generate rule sets for Clash using .mrs format
export function generateClashRuleSets(selectedRules = [], customRules = [], useMrs = true) {
	selectedRules = normalizeSelectedRules(selectedRules);

	// Determine format based on client compatibility
	const format = useMrs ? 'mrs' : 'yaml';
	const ext = useMrs ? '.mrs' : '.yaml';

	const selectedRulesSet = new Set(selectedRules);

	const siteRuleSets = new Set();
	const ipRuleSets = new Set();

	UNIFIED_RULES.forEach(rule => {
		if (selectedRulesSet.has(rule.name)) {
			rule.site_rules.forEach(siteRule => siteRuleSets.add(siteRule));
			rule.ip_rules.forEach(ipRule => ipRuleSets.add(ipRule));
		}
	});

	const site_rule_providers = {};
	const ip_rule_providers = {};

	Array.from(siteRuleSets).forEach(rule => {
		site_rule_providers[rule] = {
			type: 'http',
			format: format,
			behavior: 'domain',
			url: `${CLASH_SITE_RULE_SET_BASE_URL}${rule}${ext}`,
			path: `./ruleset/${rule}${ext}`,
			interval: 86400
		};
	});

	Array.from(ipRuleSets).forEach(rule => {
		ip_rule_providers[`${rule}-ip`] = {
			type: 'http',
			format: format,
			behavior: 'ipcidr',
			url: `${CLASH_IP_RULE_SET_BASE_URL}${rule}${ext}`,
			path: `./ruleset/${rule}-ip${ext}`,
			interval: 86400
		};
	});

	// Unlike sing-box (whose base DNS rules consume geolocation-!cn), Clash's
	// DNS policy uses the geosite: engine, so no forced provider is needed here
	// — an unreferenced provider would only waste client downloads.

	// Add custom rules
	if (customRules) {
		customRules.forEach(rule => {
			toStringArray(rule.site).forEach(site => {
				site_rule_providers[site] = {
					type: 'http',
					format: format,
					behavior: 'domain',
					url: `${CLASH_SITE_RULE_SET_BASE_URL}${site}${ext}`,
					path: `./ruleset/${site}${ext}`,
					interval: 86400
				};
			});
			toStringArray(rule.ip).forEach(ip => {
				ip_rule_providers[`${ip}-ip`] = {
					type: 'http',
					format: format,
					behavior: 'ipcidr',
					url: `${CLASH_IP_RULE_SET_BASE_URL}${ip}${ext}`,
					path: `./ruleset/${ip}-ip${ext}`,
					interval: 86400
				};
			});
		});
	}

	return { site_rule_providers, ip_rule_providers };
}
