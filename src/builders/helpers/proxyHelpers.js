function defaultGetName(item) {
    return item?.name || item?.tag || '';
}

function defaultSetName(item, name) {
    if (item) {
        if ('name' in item) {
            item.name = name;
        } else if ('tag' in item) {
            item.tag = name;
        }
    }
}

function defaultIsSame(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

const INFO_NODE_PATTERNS = [
    /(?:剩余|已用|总计|总量|流量|到期|过期|有效期|重置|套餐|订阅|官网|公告|通知|客服|工单|账户|账号|倍率|使用量)/i,
    /(?:traffic|expire|expiry|expired|remaining|used|total|reset|renew|plan|package|subscription|official|website|notice|support|account|quota|data\s*usage)/i,
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b.*(?:expire|expiry|expired|到期|过期|有效期)/i,
    /\b\d+(?:\.\d+)?\s*(?:GB|MB|TB)\b.*(?:remaining|used|total|left|剩余|已用|总量|流量)/i
];

export function isInformationalProxyName(name) {
    if (typeof name !== 'string') return false;
    const normalized = name
        .replace(/[\s|｜:：,，;；()[\]【】{}<>《》"'`~!！?？]+/g, ' ')
        .trim();

    if (!normalized) return false;
    return INFO_NODE_PATTERNS.some(pattern => pattern.test(normalized));
}

export function isInformationalProxy(proxy, getName = defaultGetName) {
    return isInformationalProxyName(getName(proxy));
}

export function addProxyWithDedup(collection, proxy, { getName = defaultGetName, setName = defaultSetName, isSame = defaultIsSame } = {}) {
    if (!proxy) return;
    if (!Array.isArray(collection)) {
        throw new Error('addProxyWithDedup expects the target collection to be an array');
    }

    let candidate = proxy;
    const targetName = getName(candidate) || '';
    const similarProxies = collection.filter(item => {
        const name = getName(item) || '';
        return targetName && name.includes(targetName);
    });

    const hasIdentical = collection.some(item => isSame(item, candidate));
    if (hasIdentical) {
        return;
    }

    if (similarProxies.length > 0 && typeof setName === 'function' && targetName) {
        const updated = setName(candidate, `${targetName} ${similarProxies.length + 1}`);
        if (typeof updated !== 'undefined') {
            candidate = updated;
        }
    }

    collection.push(candidate);
}
