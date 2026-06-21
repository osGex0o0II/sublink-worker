/**
 * Subconverter Configuration Generator
 * Generates subconverter external config file (INI format) from unified rules
 */

import { createTranslator } from '../i18n/index.js';
import { generateRules } from './ruleGenerators.js';
import { COUNTRY_DATA } from '../utils.js';
import { AI_AUTO_RULES, AI_AUTO_TEST_URL, DIRECT_DEFAULT_RULES, NODE_SELECT_DEFAULT_RULES, REJECT_ACTION_RULES, TRANSPARENT_RULES } from './rules.js';

const SPEED_TEST_URL = 'http://www.gstatic.com/generate_204';
const HIDDEN_GROUP_OPTION = 'hidden=true';
const AI_AUTO_EXPECTED_STATUS = '200-499';

function getRuleTarget(rule, t) {
	if (REJECT_ACTION_RULES.has(rule?.outbound) || rule?.outbound === 'REJECT') return 'REJECT';
	if (DIRECT_DEFAULT_RULES.has(rule?.outbound)) return 'DIRECT';
	if (NODE_SELECT_DEFAULT_RULES.has(rule?.outbound)) return t('outboundNames.Fall Back');
	return t(`outboundNames.${rule.outbound}`);
}

/**
 * Escape special regex characters in a string for use inside subconverter regex
 */
function escapeRegex(str) {
	return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Build the member list suffix for a proxy group that references country groups.
 * Used by manual selection and rule outbound groups when groupByCountry is enabled.
 */
function buildCountryGroupRefs(countryGroupNames) {
	return countryGroupNames.map(name => `[]${name}`).join('`');
}

/**
 * Generate subconverter external config (INI format)
 * @param {object} options
 * @param {string[]|string} options.selectedRules - Selected rule names or preset name
 * @param {string} options.lang - Language for group name translation
 * @param {boolean} options.includeAutoSelect - Whether to include auto select group
 * @param {boolean} options.groupByCountry - Whether to group proxies by country
 * @returns {string} INI format config string
 */
export function generateSubconverterConfig({ selectedRules = [], customRules = [], lang = 'zh-CN', includeAutoSelect = true, groupByCountry = false } = {}) {
	const t = createTranslator(lang);
	const rules = generateRules(selectedRules, customRules);

	const lines = ['[custom]'];

	// --- Ruleset lines ---
	// Domain-type rules first, then IP-type rules (reduces DNS leaks, same as SurgeConfigBuilder)

	// Source-IP rules first (highest priority, no DNS needed)
	rules.forEach(rule => {
		const groupName = getRuleTarget(rule, t);

		if (rule.src_ip_cidr) {
			rule.src_ip_cidr.forEach(cidr => {
				if (cidr) lines.push(`ruleset=${groupName},[]SRC-IP-CIDR,${cidr}`);
			});
		}
	});

	// First pass: domain-type rules (DOMAIN-SUFFIX, DOMAIN-KEYWORD, GEOSITE)
	rules.forEach(rule => {
		const groupName = getRuleTarget(rule, t);

		if (rule.domain_suffix) {
			rule.domain_suffix.forEach(suffix => {
				if (suffix) lines.push(`ruleset=${groupName},[]DOMAIN-SUFFIX,${suffix}`);
			});
		}
		if (rule.domain_keyword) {
			rule.domain_keyword.forEach(keyword => {
				if (keyword) lines.push(`ruleset=${groupName},[]DOMAIN-KEYWORD,${keyword}`);
			});
		}
		if (rule.site_rules) {
			rule.site_rules.forEach(site => {
				if (site) lines.push(`ruleset=${groupName},[]GEOSITE,${site}`);
			});
		}
	});

	// Second pass: IP-type rules (GEOIP, IP-CIDR)
	rules.forEach(rule => {
		const groupName = getRuleTarget(rule, t);

		if (rule.ip_rules) {
			rule.ip_rules.forEach(ip => {
				if (ip) lines.push(`ruleset=${groupName},[]GEOIP,${ip}`);
			});
		}
		if (rule.ip_cidr) {
			rule.ip_cidr.forEach(cidr => {
				if (cidr) lines.push(`ruleset=${groupName},[]IP-CIDR,${cidr}`);
			});
		}
	});

	// FINAL rule
	const fallBackName = t('outboundNames.Fall Back');
	lines.push(`ruleset=${fallBackName},[]FINAL`);

	// --- Proxy group lines ---
	lines.push('');

	const autoSelectName = t('outboundNames.Auto Select');
	const aiAutoName = t('outboundNames.AI Auto');
	const manualSelectName = t('outboundNames.Node Select');

	// Pre-compute country group names and lines if groupByCountry is enabled
	const countryGroupNames = [];
	const countryGroupLines = [];

	if (groupByCountry) {
		Object.values(COUNTRY_DATA).forEach(country => {
			const groupName = `${country.emoji} ${country.name}`;
			countryGroupNames.push(groupName);
			const regex = country.aliases.map(a => {
				const escaped = escapeRegex(a);
				// Add word boundary for ASCII aliases to prevent substring matching (e.g. US matching AUS/RUS)
				return /^[A-Za-z\s]+$/.test(a) ? `\\b${escaped}\\b` : escaped;
			}).join('|');
			countryGroupLines.push(`custom_proxy_group=${groupName}\`url-test\`(?i)(${regex})\`${SPEED_TEST_URL}\`300,,50\`${HIDDEN_GROUP_OPTION}`);
		});
	}

	// Manual Select group (top-level selector)
	if (groupByCountry) {
		const refs = buildCountryGroupRefs(countryGroupNames);
		if (includeAutoSelect) {
			lines.push(`custom_proxy_group=${manualSelectName}\`select\`[]${autoSelectName}\`${refs}\`[]DIRECT`);
		} else {
			lines.push(`custom_proxy_group=${manualSelectName}\`select\`${refs}\`[]DIRECT`);
		}
	} else {
		if (includeAutoSelect) {
			lines.push(`custom_proxy_group=${manualSelectName}\`select\`[]${autoSelectName}\`[]DIRECT\`.*`);
		} else {
			lines.push(`custom_proxy_group=${manualSelectName}\`select\`[]DIRECT\`.*`);
		}
	}

	// Auto Select group
	if (includeAutoSelect) {
		lines.push(`custom_proxy_group=${autoSelectName}\`url-test\`.*\`${SPEED_TEST_URL}\`300,,50\`${HIDDEN_GROUP_OPTION}`);
	}

	if (rules.some(rule => AI_AUTO_RULES.has(rule.outbound))) {
		lines.push(`custom_proxy_group=${aiAutoName}\`url-test\`.*\`${AI_AUTO_TEST_URL}\`300,,50\`${HIDDEN_GROUP_OPTION}\`expected-status=${AI_AUTO_EXPECTED_STATUS}`);
	}

	// Country groups (url-test per country with regex matching)
	countryGroupLines.forEach(line => lines.push(line));

	// Rule outbound groups
	const processedGroups = new Set([manualSelectName]);
	if (includeAutoSelect) processedGroups.add(autoSelectName);
	if (groupByCountry) {
		countryGroupNames.forEach(name => processedGroups.add(name));
	}

	rules.forEach(rule => {
		const groupName = t(`outboundNames.${rule.outbound}`);
		if (TRANSPARENT_RULES.has(rule.outbound)) return;
		if (processedGroups.has(groupName)) return;
		processedGroups.add(groupName);

		if (REJECT_ACTION_RULES.has(rule.outbound)) {
			lines.push(`custom_proxy_group=${groupName}\`select\`[]REJECT\`[]DIRECT`);
		} else if (DIRECT_DEFAULT_RULES.has(rule.outbound)) {
			lines.push(`custom_proxy_group=${groupName}\`select\`[]DIRECT\`[]${manualSelectName}`);
		} else if (AI_AUTO_RULES.has(rule.outbound)) {
			if (groupByCountry) {
				const refs = buildCountryGroupRefs(countryGroupNames);
				if (includeAutoSelect) {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${aiAutoName}\`[]${manualSelectName}\`[]${autoSelectName}\`${refs}\`[]DIRECT`);
				} else {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${aiAutoName}\`[]${manualSelectName}\`${refs}\`[]DIRECT`);
				}
			} else {
				if (includeAutoSelect) {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${aiAutoName}\`[]${manualSelectName}\`[]${autoSelectName}\`[]DIRECT\`.*`);
				} else {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${aiAutoName}\`[]${manualSelectName}\`[]DIRECT\`.*`);
				}
			}
		} else {
			if (groupByCountry) {
				const refs = buildCountryGroupRefs(countryGroupNames);
				if (includeAutoSelect) {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${manualSelectName}\`[]${autoSelectName}\`${refs}\`[]DIRECT`);
				} else {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${manualSelectName}\`${refs}\`[]DIRECT`);
				}
			} else {
				if (includeAutoSelect) {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${manualSelectName}\`[]${autoSelectName}\`[]DIRECT\`.*`);
				} else {
					lines.push(`custom_proxy_group=${groupName}\`select\`[]${manualSelectName}\`[]DIRECT\`.*`);
				}
			}
		}
	});

	// Config flags
	lines.push('');
	lines.push('enable_rule_generator=true');
	lines.push('overwrite_original_rules=true');

	return lines.join('\n');
}
