const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

const LOCAL_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain'
]);

export class FetchSafetyError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'FetchSafetyError';
        this.status = status;
    }
}

export async function fetchTextResource(url, {
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS
} = {}) {
    let currentUrl = validateFetchUrl(url);
    let redirects = 0;

    while (true) {
        const response = await fetchWithTimeout(currentUrl.toString(), {
            method: 'GET',
            headers,
            redirect: 'manual'
        }, timeoutMs);

        if (isRedirectStatus(response.status)) {
            if (redirects >= maxRedirects) {
                throw new FetchSafetyError('Too many redirects');
            }
            const location = response.headers.get('location');
            if (!location) {
                throw new FetchSafetyError('Redirect response missing Location header');
            }
            currentUrl = validateFetchUrl(new URL(location, currentUrl).toString());
            redirects += 1;
            continue;
        }

        if (!response.ok) {
            throw new FetchSafetyError(`HTTP error! status: ${response.status}`, response.status);
        }

        const text = await readResponseText(response, maxBytes);
        return {
            text,
            url: currentUrl.toString(),
            headers: response.headers,
            status: response.status
        };
    }
}

function validateFetchUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new FetchSafetyError('Invalid subscription URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new FetchSafetyError('Only HTTP(S) subscription URLs are allowed');
    }

    if (parsed.username || parsed.password) {
        throw new FetchSafetyError('Subscription URL credentials are not allowed');
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname || isBlockedHostname(hostname)) {
        throw new FetchSafetyError('Subscription URL host is not allowed');
    }

    return parsed;
}

function normalizeHostname(hostname) {
    return String(hostname || '')
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '');
}

function isBlockedHostname(hostname) {
    if (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
        return true;
    }
    return isBlockedIpv4(hostname) || isBlockedIpv6(hostname);
}

function isBlockedIpv4(hostname) {
    const octets = parseIpv4Octets(hostname);
    if (octets === false) {
        return true;
    }
    if (!octets) {
        return false;
    }

    return isBlockedIpv4Octets(octets);
}

function parseIpv4Octets(hostname) {
    const parts = hostname.split('.');
    if (parts.length !== 4 || !parts.every(part => /^\d+$/.test(part))) {
        return null;
    }

    const octets = parts.map(Number);
    return octets.some(octet => octet < 0 || octet > 255) ? false : octets;
}

function isBlockedIpv4Octets(octets) {
    const [a, b, c] = octets;
    return a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 0 && c === 2) ||
        (a === 192 && b === 88 && c === 99) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113) ||
        a >= 224;
}

function isBlockedIpv6(hostname) {
    if (!hostname.includes(':')) {
        return false;
    }

    const bytes = parseIpv6Bytes(hostname);
    if (!bytes) {
        return true;
    }

    return isAllZeros(bytes) ||
        isLoopbackIpv6(bytes) ||
        isIpv4CompatibleIpv6(bytes) ||
        isBlockedIpv4MappedIpv6(bytes) ||
        isBlockedIpv6WithEmbeddedIpv4(bytes) ||
        (bytes[0] & 0xfe) === 0xfc ||
        (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) ||
        bytes[0] === 0xff ||
        (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8);
}

function parseIpv6Bytes(hostname) {
    const normalized = normalizeHostname(hostname);
    const parts = normalized.split('::');
    if (parts.length > 2) return null;

    const head = parseIpv6Groups(parts[0]);
    const tail = parts.length === 2 ? parseIpv6Groups(parts[1]) : [];
    if (!head || !tail) return null;

    const missingGroups = 8 - head.length - tail.length;
    if (parts.length === 1 && missingGroups !== 0) return null;
    if (parts.length === 2 && missingGroups < 0) return null;

    const groups = [...head, ...Array(Math.max(missingGroups, 0)).fill(0), ...tail];
    if (groups.length !== 8) return null;

    const bytes = [];
    groups.forEach(group => {
        bytes.push((group >> 8) & 0xff, group & 0xff);
    });
    return bytes;
}

function parseIpv6Groups(value) {
    if (!value) return [];

    const groups = [];
    for (const group of value.split(':')) {
        if (group.includes('.')) {
            const octets = parseIpv4Octets(group);
            if (!octets || octets === false) return null;
            groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
            continue;
        }
        if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
        groups.push(parseInt(group, 16));
    }
    return groups;
}

function isAllZeros(bytes) {
    return bytes.every(byte => byte === 0);
}

function isLoopbackIpv6(bytes) {
    return bytes.slice(0, 15).every(byte => byte === 0) && bytes[15] === 1;
}

function isIpv4CompatibleIpv6(bytes) {
    return bytes.slice(0, 12).every(byte => byte === 0) &&
        bytes.slice(12).some(byte => byte !== 0);
}

function isBlockedIpv4MappedIpv6(bytes) {
    const isMapped = bytes.slice(0, 10).every(byte => byte === 0) &&
        bytes[10] === 0xff &&
        bytes[11] === 0xff;
    return isMapped ? true : false;
}

function isBlockedIpv6WithEmbeddedIpv4(bytes) {
    const isNat64 = bytes[0] === 0x00 &&
        bytes[1] === 0x64 &&
        bytes[2] === 0xff &&
        bytes[3] === 0x9b &&
        bytes.slice(4, 12).every(byte => byte === 0);
    const is6to4 = bytes[0] === 0x20 && bytes[1] === 0x02;
    if (!isNat64 && !is6to4) return false;

    const octets = isNat64 ? bytes.slice(12, 16) : bytes.slice(2, 6);
    return isBlockedIpv4Octets(octets);
}

async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function readResponseText(response, maxBytes) {
    if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        if (new TextEncoder().encode(text).length > maxBytes) {
            throw new FetchSafetyError('Subscription response is too large', 413);
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            try {
                await reader.cancel();
            } catch {
                // Ignore cancel errors after the safety limit is reached.
            }
            throw new FetchSafetyError('Subscription response is too large', 413);
        }
        chunks.push(value);
    }

    const all = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => {
        all.set(chunk, offset);
        offset += chunk.byteLength;
    });

    return new TextDecoder().decode(all);
}

function isRedirectStatus(status) {
    return status === 301 ||
        status === 302 ||
        status === 303 ||
        status === 307 ||
        status === 308;
}
