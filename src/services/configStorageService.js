import yaml from 'js-yaml';
import { generateWebPath } from '../utils.js';
import { InvalidPayloadError, MissingDependencyError } from './errors.js';

const ALLOWED_CONFIG_TYPES = new Set(['singbox', 'clash', 'surge']);
const MAX_CONFIG_BYTES = 1024 * 1024;
const CONFIG_ID_PATTERN = /^(singbox|clash|surge)_[A-Za-z0-9]{8}$/;

export class ConfigStorageService {
    constructor(kv, options = {}) {
        this.kv = kv;
        this.options = options;
    }

    ensureKv() {
        if (!this.kv) {
            throw new MissingDependencyError('Config storage requires a KV store');
        }
        return this.kv;
    }

    async getConfigById(configId) {
        if (!CONFIG_ID_PATTERN.test(String(configId || ''))) {
            throw new InvalidPayloadError('Invalid config ID');
        }
        const kv = this.ensureKv();
        const stored = await kv.get(configId);
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            throw new InvalidPayloadError('Stored config is not valid JSON');
        }
    }

    async saveConfig(type, content) {
        if (!ALLOWED_CONFIG_TYPES.has(type)) {
            throw new InvalidPayloadError('Unsupported config type');
        }

        const kv = this.ensureKv();
        const configId = `${type}_${generateWebPath(8)}`;
        const configString = this.serializeConfig(type, content);

        let parsed;
        try {
            parsed = JSON.parse(configString);
        } catch {
            throw new InvalidPayloadError('Config content must be valid JSON or YAML');
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new InvalidPayloadError('Config content must be a JSON object');
        }
        if (new TextEncoder().encode(configString).length > MAX_CONFIG_BYTES) {
            throw new InvalidPayloadError('Config content is too large');
        }

        const ttlSeconds = this.options.configTtlSeconds;
        const putOptions = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
        await kv.put(configId, configString, putOptions);
        return configId;
    }

    serializeConfig(type, content) {
        if (type === 'clash') {
            if (typeof content === 'string' && (content.trim().startsWith('-') || content.includes(':'))) {
                let yamlConfig;
                try {
                    yamlConfig = yaml.load(content);
                } catch {
                    throw new InvalidPayloadError('Clash config must be valid YAML');
                }
                if (!yamlConfig || typeof yamlConfig !== 'object' || Array.isArray(yamlConfig)) {
                    throw new InvalidPayloadError('Clash config must be a YAML object');
                }
                return JSON.stringify(yamlConfig);
            }
            return typeof content === 'object' ? JSON.stringify(content) : content;
        }

        if (typeof content === 'object') {
            return JSON.stringify(content);
        }
        if (typeof content === 'string') {
            return content;
        }
        throw new InvalidPayloadError('Unsupported config content type');
    }
}
