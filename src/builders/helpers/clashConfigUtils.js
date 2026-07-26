import { DIRECT_DEFAULT_RULES, NODE_SELECT_DEFAULT_RULES, REJECT_ACTION_RULES } from '../../config/index.js';

function getRuleTarget(rule, translator, fallbackTarget) {
    if (REJECT_ACTION_RULES.has(rule?.outbound) || rule?.outbound === 'REJECT') return 'REJECT';
    if (DIRECT_DEFAULT_RULES.has(rule?.outbound)) return 'DIRECT';
    if (NODE_SELECT_DEFAULT_RULES.has(rule?.outbound)) return fallbackTarget;
    return translator('outboundNames.' + rule.outbound);
}

export function emitClashRules(rules = [], translator, fallbackTarget = translator?.('outboundNames.Node Select')) {
    if (!translator) {
        throw new Error('emitClashRules requires a translator function');
    }
    const results = [];
    const hasValues = (value) => Array.isArray(value) && value.length > 0;

    // Three passes: source rules, then domain-type rules, then IP-type rules
    // (domain before IP avoids resolving domains that a domain rule already
    // covers). Within each pass rules keep their original order so custom
    // rules stay ahead of predefined ones for every match type.
    rules.forEach(rule => {
        if (!hasValues(rule.src_ip_cidr)) return;
        const target = getRuleTarget(rule, translator, fallbackTarget);
        rule.src_ip_cidr.forEach(cidr => {
            if (!cidr) return;
            results.push(`SRC-IP-CIDR,${cidr},${target}`);
        });
    });

    rules.forEach(rule => {
        const target = getRuleTarget(rule, translator, fallbackTarget);
        if (hasValues(rule.domain_suffix)) {
            rule.domain_suffix.forEach(suffix => {
                results.push(`DOMAIN-SUFFIX,${suffix},${target}`);
            });
        }
        if (hasValues(rule.domain_keyword)) {
            rule.domain_keyword.forEach(keyword => {
                results.push(`DOMAIN-KEYWORD,${keyword},${target}`);
            });
        }
        if (hasValues(rule.site_rules) && rule.site_rules[0]) {
            rule.site_rules.forEach(site => {
                results.push(`RULE-SET,${site},${target}`);
            });
        }
    });

    rules.forEach(rule => {
        const target = getRuleTarget(rule, translator, fallbackTarget);
        if (hasValues(rule.ip_rules) && rule.ip_rules[0]) {
            rule.ip_rules.forEach(ip => {
                results.push(`RULE-SET,${ip}-ip,${target},no-resolve`);
            });
        }
        if (hasValues(rule.ip_cidr)) {
            rule.ip_cidr.forEach(cidr => {
                results.push(`IP-CIDR,${cidr},${target},no-resolve`);
            });
        }
    });

    return results;
}

const normalize = (s) => typeof s === 'string' ? s.trim() : s;

export function sanitizeClashProxyGroups(config) {
    const groups = config['proxy-groups'] || [];
    if (!Array.isArray(groups) || groups.length === 0) {
        return;
    }
    const proxyNames = new Set((config.proxies || []).map(p => normalize(p?.name)).filter(Boolean));
    const groupNames = new Set(groups.map(g => normalize(g?.name)).filter(Boolean));
    const validNames = new Set(['DIRECT', 'REJECT'].map(normalize));
    proxyNames.forEach(n => validNames.add(n));
    groupNames.forEach(n => validNames.add(n));

    config['proxy-groups'] = groups.map(group => {
        if (!group || !Array.isArray(group.proxies)) return group;
        const normalizedProxies = group.proxies
            .map(x => typeof x === 'string' ? x.trim() : x)
            .filter(x => typeof x === 'string');
        const seen = new Set();
        const deduped = normalizedProxies.filter(value => {
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });

        // If group uses providers, we cannot validate provider node names at build time.
        // Skip filtering to avoid incorrectly removing valid provider nodes.
        if (Array.isArray(group.use) && group.use.length > 0) {
            return { ...group, proxies: deduped };
        }

        const filtered = deduped.filter(x => validNames.has(normalize(x)));
        return { ...group, proxies: filtered };
    });
}
