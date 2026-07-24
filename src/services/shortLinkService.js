import { generateWebPath } from '../utils.js';
import { ConflictError, InvalidPayloadError, MissingDependencyError } from './errors.js';

const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const MAX_QUERY_STRING_BYTES = 4096;
const MAX_GENERATE_ATTEMPTS = 5;

export class ShortLinkService {
    constructor(kv, options = {}) {
        this.kv = kv;
        this.options = options;
    }

    ensureKv() {
        if (!this.kv) {
            throw new MissingDependencyError('Short link service requires a KV store');
        }
        return this.kv;
    }

    async createShortLink(queryString, providedCode) {
        const kv = this.ensureKv();
        this.validateQueryString(queryString);

        const shortCode = providedCode
            ? await this.validateProvidedCode(kv, providedCode)
            : await this.generateUniqueCode(kv);

        const ttl = this.options.shortLinkTtlSeconds;
        const putOptions = ttl ? { expirationTtl: ttl } : undefined;
        await kv.put(shortCode, queryString, putOptions);
        return shortCode;
    }

    async resolveShortCode(code) {
        const kv = this.ensureKv();
        return kv.get(code);
    }

    validateQueryString(queryString) {
        if (typeof queryString !== 'string' || !queryString.startsWith('?') || queryString.length <= 1) {
            throw new InvalidPayloadError('Short link URL must include query parameters');
        }

        if (new TextEncoder().encode(queryString).length > MAX_QUERY_STRING_BYTES) {
            throw new InvalidPayloadError('Short link query is too large');
        }
    }

    async validateProvidedCode(kv, providedCode) {
        const code = String(providedCode || '').trim();
        if (!SHORT_CODE_PATTERN.test(code)) {
            throw new InvalidPayloadError('Short code must be 3-64 characters: letters, numbers, underscore, or hyphen');
        }
        return code;
    }

    async generateUniqueCode(kv) {
        for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
            const code = generateWebPath();
            if (!await kv.get(code)) {
                return code;
            }
        }
        throw new ConflictError('Unable to generate a unique short code');
    }
}
