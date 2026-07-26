/**
 * Rule Definitions
 * Contains unified rule structure and predefined rule sets
 */

export const CUSTOM_RULES = [];

export const UNIFIED_RULES = [
	{
		name: 'Ad Block',
		site_rules: ['category-ads-all'],
		ip_rules: []
	},
	{
		// Keeps BT off proxy nodes (airlines ban accounts for P2P relay);
		// sing-box additionally matches sniffed protocol, see builder
		name: 'BitTorrent',
		site_rules: ['category-public-tracker'],
		ip_rules: []
	},
	{
		name: 'AI Services',
		site_rules: ['category-ai-!cn',],
		ip_rules: []
	},
	{
		name: 'Bilibili',
		site_rules: ['bilibili'],
		ip_rules: []
	},
	{
		name: 'Youtube',
		site_rules: ['youtube'],
		ip_rules: []
	},
	{
		name: 'Google',
		site_rules: ['google'],
		ip_rules: ['google']
	},
	{
		name: 'Apple Push',
		site_rules: [],
		ip_rules: [],
		domain_suffix: [
			'push.apple.com'
		]
	},
	{
		name: 'Private',
		site_rules: [],
		ip_rules: ['private']
	},
	{
		name: 'Location:CN',
		site_rules: ['geolocation-cn', 'cn'],
		ip_rules: ['cn']
	},
	{
		name: 'Telegram',
		site_rules: [],
		ip_rules: ['telegram']
	},
	{
		name: 'Github',
		site_rules: ['github', 'gitlab'],
		ip_rules: []
	},
	{
		// Auto-selected with 'Microsoft' (see COMPANION_RULES): CN-hosted
		// Microsoft services resolve to local CDNs — proxying them is slower
		name: 'Microsoft CN',
		site_rules: ['microsoft@cn'],
		ip_rules: []
	},
	{
		name: 'Microsoft',
		site_rules: ['microsoft'],
		ip_rules: []
	},
	{
		// Auto-selected with 'Apple' (see COMPANION_RULES)
		name: 'Apple CN',
		site_rules: ['apple@cn'],
		ip_rules: []
	},
	{
		name: 'Apple',
		site_rules: ['apple'],
		ip_rules: []
	},
	{
		name: 'Social Media',
		site_rules: ['facebook', 'instagram', 'twitter', 'tiktok', 'linkedin'],
		ip_rules: []
	},
	{
		name: 'Streaming',
		site_rules: ['netflix', 'hulu', 'disney', 'hbo', 'amazon', 'bahamut'],
		// Netflix clients hit IPs directly (appboot); without the geoip rule
		// that traffic escapes to Node Select instead of the unlock group
		ip_rules: ['netflix']
	},
	{
		name: 'Gaming',
		site_rules: ['steam', 'epicgames', 'ea', 'ubisoft', 'blizzard'],
		ip_rules: []
	},
	{
		name: 'Non-China',
		site_rules: ['geolocation-!cn'],
		ip_rules: []
	}
];

export const MANDATORY_RULES = ['Private', 'Location:CN', 'BitTorrent'];
export const BASE_RULES = MANDATORY_RULES;
export const HIDDEN_RULES = [...MANDATORY_RULES, 'Non-China', 'Apple CN', 'Microsoft CN'];
export const AI_AUTO_TEST_URL = 'https://www.gstatic.com/generate_204';
export const DIRECT_DEFAULT_RULES = new Set(['Private', 'Location:CN', 'BitTorrent', 'Apple CN', 'Microsoft CN']);
export const NODE_SELECT_DEFAULT_RULES = new Set(['Github', 'Apple Push', 'Non-China']);
export const TRANSPARENT_RULES = new Set([...DIRECT_DEFAULT_RULES, ...NODE_SELECT_DEFAULT_RULES]);
export const REJECT_ACTION_RULES = new Set(['Ad Block']);

// Rules silently co-selected with their parent: the @cn split only makes
// sense while the parent rule is active
export const COMPANION_RULES = {
	Apple: ['Apple CN'],
	Microsoft: ['Microsoft CN']
};

export const PREDEFINED_RULE_SETS = {
	basic: ['Ad Block', 'Google', 'Non-China'],
};

// Presets removed by the basic+custom refactor. Old short links and saved
// URLs still carry these names, so keep resolving them to their historical
// rule sets instead of silently downgrading everyone to `basic`.
export const LEGACY_PRESET_RULE_SETS = {
	domestic: ['AI Services', 'Non-China'],
	balanced: ['Ad Block', 'AI Services', 'Google', 'Youtube', 'Telegram', 'Non-China'],
	media: ['Ad Block', 'Youtube', 'Streaming', 'Social Media', 'Telegram', 'Non-China'],
	full: UNIFIED_RULES.map(rule => rule.name),
	minimal: ['Non-China'],
	comprehensive: UNIFIED_RULES.map(rule => rule.name)
};

export function resolvePresetRules(name) {
	return PREDEFINED_RULE_SETS[name] ?? LEGACY_PRESET_RULE_SETS[name];
}

// Generate SITE_RULE_SETS and IP_RULE_SETS from UNIFIED_RULES
export const SITE_RULE_SETS = UNIFIED_RULES.reduce((acc, rule) => {
	rule.site_rules.forEach(site_rule => {
		acc[site_rule] = `${site_rule}.srs`;
	});
	return acc;
}, {});

export const IP_RULE_SETS = UNIFIED_RULES.reduce((acc, rule) => {
	rule.ip_rules.forEach(ip_rule => {
		acc[ip_rule] = `${ip_rule}.srs`;
	});
	return acc;
}, {});

// Generate CLASH_SITE_RULE_SETS and CLASH_IP_RULE_SETS for .mrs format
export const CLASH_SITE_RULE_SETS = UNIFIED_RULES.reduce((acc, rule) => {
	rule.site_rules.forEach(site_rule => {
		acc[site_rule] = `${site_rule}.mrs`;
	});
	return acc;
}, {});

export const CLASH_IP_RULE_SETS = UNIFIED_RULES.reduce((acc, rule) => {
	rule.ip_rules.forEach(ip_rule => {
		acc[ip_rule] = `${ip_rule}.mrs`;
	});
	return acc;
}, {});
