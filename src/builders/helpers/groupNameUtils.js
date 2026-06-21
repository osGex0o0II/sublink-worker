/**
 * Group name normalization utilities
 * Handles various Unicode space characters and whitespace normalization
 */

/**
 * Normalize a group name for consistent comparison
 * Handles various Unicode space characters (NBSP, em-space, ideographic space, etc.)
 * @param {string} name - Group name to normalize
 * @returns {string} - Normalized group name
 */
export function normalizeGroupName(name) {
    if (typeof name !== 'string') return name;
    // Replace all types of whitespace (including Unicode spaces) with regular space, then trim
    return name.replace(/[\s\u00A0\u2000-\u200B\u3000]+/g, ' ').trim();
}

/**
 * Check if two group names are equivalent after normalization
 * @param {string} a - First group name
 * @param {string} b - Second group name
 * @returns {boolean} - True if names are equivalent
 */
export function isSameGroupName(a, b) {
    return normalizeGroupName(a) === normalizeGroupName(b);
}

/**
 * Find a group by name using normalized comparison
 * @param {Array} groups - Array of group objects
 * @param {string} name - Group name to find
 * @returns {object|undefined} - Found group or undefined
 */
export function findGroupByName(groups, name) {
    if (!Array.isArray(groups)) return undefined;
    const normName = normalizeGroupName(name);
    return groups.find(g => g && normalizeGroupName(g.name) === normName);
}

/**
 * Find index of a group by name using normalized comparison
 * @param {Array} groups - Array of group objects
 * @param {string} name - Group name to find
 * @returns {number} - Index of the group, or -1 if not found
 */
export function findGroupIndexByName(groups, name) {
    if (!Array.isArray(groups)) return -1;
    const normName = normalizeGroupName(name);
    return groups.findIndex(g => g && normalizeGroupName(g.name) === normName);
}

const SYSTEM_GROUP_NAMES = new Set([
    '节点选择',
    '🚀 节点选择',
    'node select',
    '手动选择',
    '🖐️ 手动选择',
    'manual select',
    'manual switch',
    '手动切换',
    '🖐️ 手动切换',
    '自动选择',
    '⚡ 自动选择',
    'auto select',
    'auto',
    '漏网之鱼',
    '🐟 漏网之鱼',
    'fall back',
    'fallback',
    '默认代理',
    '🌐 默认代理',
    'ai 自动选择',
    '🤖 ai 自动选择',
    'ai auto',
    '🤖 ai auto'
]);

export function isSystemGeneratedGroupName(name) {
    if (typeof name !== 'string') return false;
    const normalized = normalizeGroupName(name).toLowerCase();
    return SYSTEM_GROUP_NAMES.has(normalized);
}
