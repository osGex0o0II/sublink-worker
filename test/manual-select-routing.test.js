import { describe, expect, it } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

const proxyInput = 'ss://YWVzLTEyOC1nY206cGFzcw@example.com:443#ManualNode';

describe('manual select routing target', () => {
    it('routes default proxy traffic through Manual Select while defaulting to Auto Select', async () => {
        const builder = new SingboxConfigBuilder(proxyInput, 'minimal', [], null, 'zh-CN', 'sing-box');

        const config = await builder.build();

        const manualGroup = config.outbounds.find(outbound => outbound?.tag === '🖐️ 手动选择');
        const autoGroup = config.outbounds.find(outbound => outbound?.tag === '⚡ 自动选择');

        expect(manualGroup?.type).toBe('selector');
        expect(manualGroup?.outbounds?.[0]).toBe('⚡ 自动选择');
        expect(autoGroup?.type).toBe('urltest');

        expect(config.route.final).toBe('🖐️ 手动选择');
        expect(config.route.rules).toContainEqual(expect.objectContaining({
            clash_mode: 'global',
            outbound: '🖐️ 手动选择'
        }));
        expect(config.route.rules).toContainEqual(expect.objectContaining({
            rule_set: ['geolocation-!cn'],
            outbound: '🖐️ 手动选择'
        }));
    });
});
