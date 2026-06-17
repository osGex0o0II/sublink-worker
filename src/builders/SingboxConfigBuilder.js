
import { SING_BOX_CONFIG, generateRuleSets, generateRules, getOutbounds, PREDEFINED_RULE_SETS, DIRECT_DEFAULT_RULES, REJECT_ACTION_RULES } from '../config/index.js';
import { BaseConfigBuilder } from './BaseConfigBuilder.js';
import { deepCopy, groupProxiesByCountry } from '../utils.js';
import { addProxyWithDedup } from './helpers/proxyHelpers.js';
import { buildSelectorMembers as buildSelectorMemberList, buildNodeSelectMembers, buildCustomRuleMembers, uniqueNames } from './helpers/groupBuilder.js';
import { normalizeGroupName } from './helpers/groupNameUtils.js';

export class SingboxConfigBuilder extends BaseConfigBuilder {
    constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry = false, enableClashUI = false, externalController, externalUiDownloadUrl, singboxVersion = '1.12', includeAutoSelect = true) {
        const resolvedBaseConfig = baseConfig ?? SING_BOX_CONFIG;
        super(inputString, resolvedBaseConfig, lang, userAgent, groupByCountry, includeAutoSelect);

        this.selectedRules = selectedRules;
        this.customRules = customRules;
        this.countryGroupNames = [];
        this.manualGroupName = null;
        this.enableClashUI = enableClashUI;
        this.externalController = externalController;
        this.externalUiDownloadUrl = externalUiDownloadUrl;
        this.singboxVersion = singboxVersion;  // '1.11' or '1.12'

        if (this.config?.dns?.servers?.length > 0) {
            this.config.dns.servers[0].detour = this.t('outboundNames.Node Select');
        }
    }

    isCompatibleProviderFormat(format) {
        return false;
    }

    getAllProviderTags() {
        return [];
    }

    getProxies() {
        return this.config.outbounds.filter(outbound => outbound?.server != undefined);
    }

    getProxyName(proxy) {
        return proxy.tag;
    }

    convertProxy(proxy) {
        // Create a shallow copy to avoid mutating the original
        const sanitized = { ...proxy };

        // Strip Clash-only / mis-typed fields that conflict with sing-box semantics.
        // `udp` is Clash-only. Top-level `network` in sing-box is a TCP/UDP allowlist
        // (NetworkList in option/types.go); a stray "tcp" silently disables UDP for
        // every group that selects this node — including DNS hijack and fakeip.
        delete sanitized.udp;
        delete sanitized.network;

        // Remove 'alpn' from root level - it should only exist inside 'tls' object for sing-box
        // For protocols like vless/vmess, alpn belongs inside the tls configuration
        if (sanitized.alpn && sanitized.tls) {
            // Move alpn into tls if tls exists and doesn't have alpn
            if (!sanitized.tls.alpn) {
                sanitized.tls = { ...sanitized.tls, alpn: sanitized.alpn };
            }
            delete sanitized.alpn;
        } else if (sanitized.alpn && !sanitized.tls) {
            // No TLS, remove alpn entirely
            delete sanitized.alpn;
        }

        // Remove packet_encoding for now - it's version-specific in sing-box
        // xudp is default in newer versions
        delete sanitized.packet_encoding;

        return sanitized;
    }

    addProxyToConfig(proxy) {
        this.config.outbounds = this.config.outbounds || [];
        addProxyWithDedup(this.config.outbounds, proxy, {
            getName: (item) => item?.tag,
            setName: (item, name) => {
                if (item) item.tag = name;
            },
            isSame: (existing = {}, incoming = {}) => {
                const { tag: _incomingTag, ...restIncoming } = incoming;
                const { tag: _existingTag, ...restExisting } = existing;
                return JSON.stringify(restIncoming) === JSON.stringify(restExisting);
            }
        });
    }

    hasOutboundTag(tag) {
        const target = normalizeGroupName(tag);
        return (this.config.outbounds || []).some(outbound => normalizeGroupName(outbound?.tag) === target);
    }

    hasAutoSelectCandidates(proxyList = this.getProxyList()) {
        return (Array.isArray(proxyList) && proxyList.length > 0) || this.getAllProviderTags().length > 0;
    }

    addAutoSelectGroup(proxyList) {
        if (!this.includeAutoSelect) return;
        this.config.outbounds = this.config.outbounds || [];
        const tag = this.t('outboundNames.Auto Select');
        if (this.hasOutboundTag(tag)) return;
        const autoSelectMembers = deepCopy(uniqueNames(proxyList));
        if (autoSelectMembers.length === 0) return;

        const group = {
            type: "urltest",
            tag,
            outbounds: autoSelectMembers
        };

        this.config.outbounds.unshift(group);
    }

    addNodeSelectGroup(proxyList) {
        this.config.outbounds = this.config.outbounds || [];
        const tag = this.t('outboundNames.Node Select');
        if (this.hasOutboundTag(tag)) return;
        const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList);
        const members = buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect,
            includeReject: false
        });

        const group = {
            type: "selector",
            tag,
            outbounds: members
        };

        this.config.outbounds.unshift(group);
    }

    buildSelectorMembers(proxyList = []) {
        return buildSelectorMemberList({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList),
            includeReject: false
        });
    }

    addOutboundGroups(outbounds, proxyList) {
        outbounds.forEach(outbound => {
            if (outbound !== this.t('outboundNames.Node Select')) {
                if (REJECT_ACTION_RULES.has(outbound)) return;
                let selectorMembers = this.buildSelectorMembers(proxyList);
                const tag = this.t(`outboundNames.${outbound}`);
                if (this.hasOutboundTag(tag)) {
                    return;
                }
                // For rules that should default to DIRECT, move DIRECT to the front
                if (DIRECT_DEFAULT_RULES.has(outbound)) {
                    selectorMembers = ['DIRECT', ...selectorMembers.filter(p => p !== 'DIRECT')];
                }
                this.config.outbounds.push({
                    type: "selector",
                    tag,
                    outbounds: selectorMembers
                });
            }
        });
    }

    addCustomRuleGroups(proxyList) {
        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList);
                const selectorMembers = buildCustomRuleMembers({
                    proxyList,
                    translator: this.t,
                    manualGroupName: this.manualGroupName,
                    includeAutoSelect,
                    includeReject: false
                });
                if (this.hasOutboundTag(rule.name)) return;
                this.config.outbounds.push({
                    type: "selector",
                    tag: rule.name,
                    outbounds: selectorMembers
                });
            });
        }
    }

    addFallBackGroup(proxyList) {
        const selectorMembers = this.buildSelectorMembers(proxyList);
        if (this.hasOutboundTag(this.t('outboundNames.Fall Back'))) return;
        this.config.outbounds.push({
            type: "selector",
            tag: this.t('outboundNames.Fall Back'),
            outbounds: selectorMembers
        });
    }

    addCountryGroups() {
        const proxies = this.getProxies();
        const countryGroups = groupProxiesByCountry(proxies, {
            getName: proxy => this.getProxyName(proxy)
        });

        const existingTags = new Set((this.config.outbounds || []).map(o => normalizeGroupName(o?.tag)).filter(Boolean));

        const manualProxyNames = proxies.map(p => p?.tag).filter(Boolean);
        const manualGroupName = manualProxyNames.length > 0 ? this.t('outboundNames.Manual Switch') : null;
        if (manualGroupName) {
            const manualNorm = normalizeGroupName(manualGroupName);
            if (!existingTags.has(manualNorm)) {
                this.config.outbounds.push({
                    type: 'selector',
                    tag: manualGroupName,
                    outbounds: manualProxyNames
                });
                existingTags.add(manualNorm);
            }
        }

        const countries = Object.keys(countryGroups).sort((a, b) => a.localeCompare(b));
        const countryGroupNames = [];
        const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates();

        countries.forEach(country => {
            const { emoji, name, proxies: countryProxies } = countryGroups[country];
            if (!countryProxies || countryProxies.length === 0) {
                return;
            }
            const groupName = `${emoji} ${name}`;
            const norm = normalizeGroupName(groupName);
            if (!existingTags.has(norm)) {
                this.config.outbounds.push({
                    tag: groupName,
                    type: 'urltest',
                    outbounds: countryProxies
                });
                existingTags.add(norm);
            }
            countryGroupNames.push(groupName);
        });

        const nodeSelectTag = this.t('outboundNames.Node Select');
        const nodeSelectGroup = this.config.outbounds.find(o => normalizeGroupName(o?.tag) === normalizeGroupName(nodeSelectTag));
        if (nodeSelectGroup && Array.isArray(nodeSelectGroup.outbounds)) {
            const rebuilt = buildNodeSelectMembers({
                proxyList: [],
                translator: this.t,
                groupByCountry: true,
                manualGroupName,
                countryGroupNames,
                includeAutoSelect,
                includeReject: false
            });
            nodeSelectGroup.outbounds = rebuilt;
        }

        this.countryGroupNames = countryGroupNames;
        this.manualGroupName = manualGroupName;
    }

    /**
     * Merge user-defined proxy groups (selector/urltest outbounds) with system-generated ones
     * @param {Array} userGroups - User-defined proxy groups from input config (converted to Clash format)
     */
    mergeUserProxyGroups(userGroups) {
        if (!Array.isArray(userGroups)) return;

        const proxyList = this.getProxyList();
        const validProxyTags = new Set(proxyList);
        // Build valid reference set (proxy tags, group tags, special names)
        const groupTags = new Set(
            (this.config.outbounds || [])
                .filter(o => o.type === 'selector' || o.type === 'urltest')
                .map(o => normalizeGroupName(o?.tag))
                .filter(Boolean)
        );
        const validRefs = new Set(['DIRECT', 'direct']);
        proxyList.forEach(n => validRefs.add(n));
        groupTags.forEach(n => validRefs.add(n));

        userGroups.forEach(userGroup => {
            if (!userGroup?.name) return;

            // Find existing outbound by normalized tag/name
            const existingIndex = (this.config.outbounds || []).findIndex(o =>
                normalizeGroupName(o?.tag) === normalizeGroupName(userGroup.name)
            );

            if (existingIndex >= 0) {
                // Merge with existing system group
                const existing = this.config.outbounds[existingIndex];

                // Merge 'outbounds' field (equivalent to Clash 'proxies')
                if (Array.isArray(userGroup.proxies) && userGroup.proxies.length > 0) {
                    const validUserOutbounds = userGroup.proxies.filter(p => validRefs.has(p));
                    existing.outbounds = [...new Set([
                        ...(existing.outbounds || []),
                        ...validUserOutbounds
                    ])];
                }

                // Preserve user's custom settings
                if (userGroup.url) existing.url = userGroup.url;
                if (typeof userGroup.interval === 'number') {
                    existing.interval = `${userGroup.interval}s`;
                }
            } else {
                // New user-defined group - convert from Clash format and add
                const newOutbound = {
                    type: userGroup.type === 'url-test' ? 'urltest' : 'selector',
                    tag: userGroup.name
                };

                // Validate outbounds references
                if (Array.isArray(userGroup.proxies)) {
                    newOutbound.outbounds = userGroup.proxies.filter(p => validRefs.has(p));
                }

                // Only add if has valid outbounds
                if (newOutbound.outbounds?.length > 0) {
                    this.config.outbounds.push(newOutbound);
                }
            }
        });
    }

    /**
     * Validate outbounds before final output
     * Ensures urltest groups have outbounds, fills empty ones with all proxy tags
     */
    validateOutbounds() {
        const proxyList = this.getProxyList();
        const invalidTags = new Set();

        (this.config.outbounds || []).forEach(outbound => {
            // For urltest groups, ensure they have outbounds
            if (outbound.type === 'urltest' &&
                (!outbound.outbounds || outbound.outbounds.length === 0)) {
                // Fill with all available proxy tags
                outbound.outbounds = [...proxyList];
                if (!outbound.outbounds || outbound.outbounds.length === 0) {
                    invalidTags.add(normalizeGroupName(outbound.tag));
                }
            }
        });

        if (invalidTags.size > 0) {
            this.config.outbounds = (this.config.outbounds || [])
                .filter(outbound => !invalidTags.has(normalizeGroupName(outbound?.tag)))
                .map(outbound => {
                    if (Array.isArray(outbound.outbounds)) {
                        outbound.outbounds = outbound.outbounds.filter(tag => !invalidTags.has(normalizeGroupName(tag)));
                    }
                    return outbound;
                });
        }
    }

    sanitizeLegacySpecialOutbounds() {
        const legacyTags = new Set(
            (this.config.outbounds || [])
                .filter(outbound => outbound?.type === 'block' || outbound?.type === 'dns')
                .map(outbound => normalizeGroupName(outbound?.tag))
                .filter(Boolean)
        );
        legacyTags.add(normalizeGroupName('REJECT'));

        this.config.outbounds = (this.config.outbounds || [])
            .filter(outbound => !legacyTags.has(normalizeGroupName(outbound?.tag)))
            .map(outbound => {
                if (Array.isArray(outbound.outbounds)) {
                    outbound.outbounds = outbound.outbounds.filter(tag => !legacyTags.has(normalizeGroupName(tag)));
                }
                return outbound;
            })
            .filter(outbound => {
                if (outbound?.type !== 'selector' && outbound?.type !== 'urltest') return true;
                return outbound.outbounds?.length > 0;
            });
    }

    normalizeDnsServerReferences() {
        const dns = this.config?.dns;
        const servers = Array.isArray(dns?.servers) ? dns.servers : [];
        const serverTags = servers.map(server => server?.tag).filter(Boolean);
        const outboundTags = (this.config?.outbounds || []).map(outbound => outbound?.tag).filter(Boolean);
        if (serverTags.length === 0 && outboundTags.length === 0) return;

        const normalizeDnsReference = (value, fallbackTag) => {
            const normalized = this.normalizeReferenceToTag(value, serverTags);
            if (normalized) return normalized;
            if (typeof value !== 'string') {
                return value;
            }
            return fallbackTag ?? value;
        };
        const normalizeOutboundReference = (value) => (
            this.normalizeReferenceToTag(value, outboundTags) ?? value
        );

        const fallbackDnsTag = this.getFallbackDnsServerTag(serverTags);

        if (dns && serverTags.length > 0) {
            dns.final = normalizeDnsReference(dns.final, fallbackDnsTag);
            (dns.rules || []).forEach(rule => {
                if (!rule || typeof rule !== 'object') return;
                if (Array.isArray(rule.server)) {
                    rule.server = rule.server.map(server => normalizeDnsReference(server, fallbackDnsTag));
                } else {
                    rule.server = normalizeDnsReference(rule.server, fallbackDnsTag);
                }
            });
            servers.forEach(server => {
                server.domain_resolver = normalizeDnsReference(server.domain_resolver);
                server.address_resolver = normalizeDnsReference(server.address_resolver);
                server.detour = normalizeOutboundReference(server.detour);
            });
        }
        (this.config?.route?.rules || []).forEach(rule => {
            if (!rule || typeof rule !== 'object') return;
            rule.outbound = normalizeOutboundReference(rule.outbound);
        });
    }

    normalizeReferenceToTag(value, tags) {
        if (typeof value !== 'string' || !Array.isArray(tags) || tags.length === 0) {
            return undefined;
        }
        if (tags.includes(value)) {
            return value;
        }
        const tagByNormalized = new Map(
            tags.map(tag => [this.normalizeReferenceTag(tag), tag])
        );
        return tagByNormalized.get(this.normalizeReferenceTag(value));
    }

    getFallbackDnsServerTag(tags) {
        if (!Array.isArray(tags) || tags.length === 0) return undefined;
        return this.normalizeReferenceToTag('dns_direct', tags)
            || this.normalizeReferenceToTag('local', tags)
            || this.normalizeReferenceToTag('direct', tags)
            || tags[0];
    }

    normalizeReferenceTag(tag) {
        return String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    buildRouteTarget(rule) {
        if (REJECT_ACTION_RULES.has(rule?.outbound) || rule?.outbound === 'REJECT') {
            return { action: 'reject' };
        }
        return { outbound: this.t(`outboundNames.${rule.outbound}`) };
    }

    formatConfig() {
        const rules = generateRules(this.selectedRules, this.customRules);
        const { site_rule_sets, ip_rule_sets } = generateRuleSets(this.selectedRules, this.customRules);

        this.config.route.rule_set = [...site_rule_sets, ...ip_rule_sets];

        delete this.config.outbound_providers;

        // Validate outbounds: fill empty urltest groups with all proxies
        this.validateOutbounds();
        this.sanitizeLegacySpecialOutbounds();
        this.normalizeDnsServerReferences();

        const attachProtocolIfNeeded = (entry, rule) => {
            if (Array.isArray(rule?.protocol) && rule.protocol.length > 0) {
                entry.protocol = rule.protocol;
            }
            return entry;
        };

        const hasMatchValues = (value) => {
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'string') return value.trim() !== '';
            return false;
        };

        rules.filter(rule => Array.isArray(rule.src_ip_cidr) && rule.src_ip_cidr.length > 0).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                source_ip_cidr: rule.src_ip_cidr,
                ...this.buildRouteTarget(rule)
            }, rule));
        });

        rules.filter(rule => hasMatchValues(rule.domain_suffix) || hasMatchValues(rule.domain_keyword)).map(rule => {
            const entry = {
                ...this.buildRouteTarget(rule)
            };

            if (hasMatchValues(rule.domain_suffix)) entry.domain_suffix = rule.domain_suffix;
            if (hasMatchValues(rule.domain_keyword)) entry.domain_keyword = rule.domain_keyword;

            this.config.route.rules.push(attachProtocolIfNeeded(entry, rule));
        });

        rules.filter(rule => !!rule.site_rules[0]).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                rule_set: [
                    ...(rule.site_rules.length > 0 && rule.site_rules[0] !== '' ? rule.site_rules : []),
                ],
                ...this.buildRouteTarget(rule)
            }, rule));
        });

        rules.filter(rule => !!rule.ip_rules[0]).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                rule_set: [
                    ...(rule.ip_rules
                        .map(ip => ip.trim())
                        .filter(ip => ip !== '')
                        .map(ip => `${ip}-ip`))
                ],
                ...this.buildRouteTarget(rule)
            }, rule));
        });

        rules.filter(rule => hasMatchValues(rule.ip_cidr)).map(rule => {
            this.config.route.rules.push(attachProtocolIfNeeded({
                ip_cidr: rule.ip_cidr,
                ...this.buildRouteTarget(rule)
            }, rule));
        });

        // Order matters: sniff first so downstream rules can match on protocol;
        // hijack-dns before clash_mode so DNS never escapes into a selector when
        // the user toggles global mode (selectors only support TCP+UDP if the
        // currently selected node does, which is fragile).
        this.config.route.rules.unshift(
            { action: 'sniff' },
            { protocol: 'dns', action: 'hijack-dns' },
            { clash_mode: 'direct', outbound: 'DIRECT' },
            { clash_mode: 'global', outbound: this.t('outboundNames.Node Select') }
        );

        this.config.route.auto_detect_interface = true;
        this.config.route.final = this.t('outboundNames.Fall Back');
        // 如果启用了 Clash UI，添加配置
        // 如果启用 Clash UI 或传入了自定义参数，添加/覆盖 Clash API 配置
        if (this.enableClashUI || this.externalController || this.externalUiDownloadUrl) {
            const defaultExternalController = "0.0.0.0:9090";
            const defaultExternalUiDownloadUrl = "https://gh-proxy.com/https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip";
            const defaultExternalUi = "./ui";
            const defaultSecret = "";
            const defaultDownloadDetour = "DIRECT";
            const defaultClashMode = "rule";

            this.config.experimental = this.config.experimental || {};
            const existingClashApi = this.config.experimental.clash_api || {};

            const externalController = this.externalController || existingClashApi.external_controller || defaultExternalController;
            const externalUiDownloadUrl = this.externalUiDownloadUrl || existingClashApi.external_ui_download_url || defaultExternalUiDownloadUrl;
            const externalUi = existingClashApi.external_ui || defaultExternalUi;
            const secret = existingClashApi.secret ?? defaultSecret;
            const externalUiDownloadDetour = existingClashApi.external_ui_download_detour || defaultDownloadDetour;
            const clashMode = existingClashApi.default_mode || defaultClashMode;

            this.config.experimental.clash_api = {
                ...existingClashApi,
                external_controller: externalController,
                external_ui: externalUi,
                external_ui_download_url: externalUiDownloadUrl,
                external_ui_download_detour: externalUiDownloadDetour,
                secret,
                default_mode: clashMode
            };
        }
        return this.config;
    }
}
