import { LEGACY_PRESET_RULE_SETS, PREDEFINED_RULE_SETS, UNIFIED_RULES } from './rules.js';

const freezeList = values => Object.freeze([...values]);

const FULL_RULE_ORDER = freezeList([
	'Ad Block',
	'BitTorrent',
	'AI Services',
	'Bilibili',
	'Youtube',
	'Google',
	'Apple Push',
	'Private',
	'Location:CN',
	'Telegram',
	'Github',
	'Microsoft CN',
	'Microsoft',
	'Apple CN',
	'Apple',
	'Social Media',
	'Streaming',
	'Gaming',
	'Non-China'
]);

const makeScheme = ({ id, version, nameKey, summaryKey, rules, order = rules, finalPolicy = 'Node Select' }) => Object.freeze({
	id,
	version,
	nameKey,
	summaryKey,
	rules: freezeList(rules),
	order: freezeList(order),
	finalPolicy
});

export const DEFAULT_RULE_SCHEME_ID = 'smart-v1';

export const RULE_SCHEMES = Object.freeze({
	'smart-v1': makeScheme({
		id: 'smart-v1',
		version: 1,
		nameKey: 'basic',
		summaryKey: 'smartSummary',
		rules: ['Ad Block', 'Google', 'Non-China'],
		order: ['Ad Block', 'BitTorrent', 'Google', 'Private', 'Location:CN', 'Non-China']
	}),
	'lite-v1': makeScheme({
		id: 'lite-v1',
		version: 1,
		nameKey: 'lite',
		summaryKey: 'liteSummary',
		rules: ['Ad Block', 'Non-China'],
		order: ['Ad Block', 'BitTorrent', 'Private', 'Location:CN', 'Non-China']
	}),
	'full-v1': makeScheme({
		id: 'full-v1',
		version: 1,
		nameKey: 'full',
		summaryKey: 'fullSummary',
		rules: FULL_RULE_ORDER,
		order: FULL_RULE_ORDER
	})
});

export const RULE_SCHEME_ALIASES = Object.freeze({
	basic: DEFAULT_RULE_SCHEME_ID,
	smart: DEFAULT_RULE_SCHEME_ID
});

function createLegacyScheme(name, rules) {
	return makeScheme({
		id: `legacy-${name}`,
		version: 0,
		nameKey: 'custom',
		summaryKey: 'customPresetHint',
		rules,
		order: FULL_RULE_ORDER
	});
}

function createCustomScheme(rules) {
	return makeScheme({
		id: 'custom-v1',
		version: 1,
		nameKey: 'custom',
		summaryKey: 'customPresetHint',
		rules,
		order: UNIFIED_RULES.map(rule => rule.name)
	});
}

export function getRuleScheme(id) {
	if (typeof id !== 'string') return undefined;
	const aliasedId = RULE_SCHEME_ALIASES[id] || id;
	return RULE_SCHEMES[aliasedId];
}

export function resolveRuleScheme(selectedRules) {
	if (typeof selectedRules === 'string') {
		const scheme = getRuleScheme(selectedRules);
		if (scheme) return scheme;

		const legacyRules = LEGACY_PRESET_RULE_SETS[selectedRules] || PREDEFINED_RULE_SETS[selectedRules];
		if (legacyRules) return createLegacyScheme(selectedRules, legacyRules);
		return RULE_SCHEMES[DEFAULT_RULE_SCHEME_ID];
	}

	if (Array.isArray(selectedRules) && selectedRules.length > 0) {
		return createCustomScheme(selectedRules);
	}

	return RULE_SCHEMES[DEFAULT_RULE_SCHEME_ID];
}

export function validateRuleScheme(scheme) {
	const issues = [];
	if (!scheme || typeof scheme !== 'object') return ['scheme is missing'];
	if (typeof scheme.id !== 'string' || !scheme.id) issues.push('scheme id is missing');
	if (!Number.isInteger(scheme.version) || scheme.version < 1) issues.push('scheme version is invalid');
	if (typeof scheme.finalPolicy !== 'string' || !scheme.finalPolicy) issues.push('final policy is missing');
	if (!Array.isArray(scheme.rules) || scheme.rules.length === 0) issues.push('scheme rules are missing');
	if (!Array.isArray(scheme.order) || scheme.order.length === 0) issues.push('scheme order is missing');

	const knownNames = new Set(UNIFIED_RULES.map(rule => rule.name));
	const ruleNames = new Set();
	(scheme.rules || []).forEach(name => {
		if (typeof name !== 'string' || !knownNames.has(name)) issues.push(`unknown rule: ${name}`);
		if (ruleNames.has(name)) issues.push(`duplicate rule: ${name}`);
		ruleNames.add(name);
	});

	const orderNames = new Set();
	(scheme.order || []).forEach(name => {
		if (typeof name !== 'string' || !knownNames.has(name)) issues.push(`unknown ordered rule: ${name}`);
		if (orderNames.has(name)) issues.push(`duplicate ordered rule: ${name}`);
		orderNames.add(name);
	});
	(scheme.rules || []).forEach(name => {
		if (!orderNames.has(name)) issues.push(`rule missing from order: ${name}`);
	});

	return [...new Set(issues)];
}
