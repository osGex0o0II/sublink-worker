import { describe, it, expect } from 'vitest';
import { BASE_RULES, MANDATORY_RULES, PREDEFINED_RULE_SETS, generateRules } from '../src/config/index.js';
import { parseSelectedRules } from '../src/app/createApp.jsx';

/**
 * Test for backward compatibility fix:
 * Ensures selectedRules parameter accepts both preset names and JSON arrays
 */

describe('selectedRules backward compatibility', () => {
    it('should keep mandatory routing rules out of presets', () => {
        expect(MANDATORY_RULES).toEqual(expect.arrayContaining(['Private', 'Location:CN', 'Github']));
        expect(BASE_RULES).toBe(MANDATORY_RULES);
        expect(PREDEFINED_RULE_SETS.balanced).not.toContain('Github');
    });

    it('should not mutate custom rule order when generating rules', () => {
        const customRules = [
            { name: 'First', domain_suffix: 'first.example' },
            { name: 'Second', domain_suffix: 'second.example' }
        ];

        generateRules('minimal', customRules);

        expect(customRules.map(rule => rule.name)).toEqual(['First', 'Second']);
    });

    it('should accept "minimal" preset name', () => {
        const result = parseSelectedRules('minimal');
        expect(result).toEqual(PREDEFINED_RULE_SETS.minimal);
        expect(result).toContain('Non-China');
    });

    it('should accept "domestic" preset name', () => {
        const result = parseSelectedRules('domestic');
        expect(result).toEqual(PREDEFINED_RULE_SETS.domestic);
        expect(result).toEqual(PREDEFINED_RULE_SETS.minimal);
    });

    it('should accept "balanced" preset name', () => {
        const result = parseSelectedRules('balanced');
        expect(result).toEqual(PREDEFINED_RULE_SETS.balanced);
        expect(result.length).toBeGreaterThan(PREDEFINED_RULE_SETS.minimal.length);
        expect(result).toContain('Apple Push');
        expect(result).not.toContain('Github');
    });

    it('should accept "media" preset name', () => {
        const result = parseSelectedRules('media');
        expect(result).toEqual(PREDEFINED_RULE_SETS.media);
        expect(result).toContain('Streaming');
        expect(result).toContain('Social Media');
    });

    it('should accept "comprehensive" preset name', () => {
        const result = parseSelectedRules('comprehensive');
        expect(result).toEqual(PREDEFINED_RULE_SETS.comprehensive);
        expect(result.length).toBeGreaterThanOrEqual(PREDEFINED_RULE_SETS.balanced.length);
    });

    it('should accept "full" preset name', () => {
        const result = parseSelectedRules('full');
        expect(result).toEqual(PREDEFINED_RULE_SETS.full);
        expect(result).toEqual(PREDEFINED_RULE_SETS.comprehensive);
    });

    it('should parse valid JSON array', () => {
        const jsonArray = JSON.stringify(['Google', 'Youtube', 'Github']);
        const result = parseSelectedRules(jsonArray);
        expect(result).toEqual(['Google', 'Youtube', 'Github']);
    });

    it('should return empty array for empty string', () => {
        const result = parseSelectedRules('');
        expect(result).toEqual([]);
    });

    it('should return empty array for undefined', () => {
        const result = parseSelectedRules(undefined);
        expect(result).toEqual([]);
    });

    it('should return empty array for null', () => {
        const result = parseSelectedRules(null);
        expect(result).toEqual([]);
    });

    it('should fallback to minimal for invalid JSON', () => {
        const result = parseSelectedRules('invalid-json-{[');
        expect(result).toEqual(PREDEFINED_RULE_SETS.minimal);
    });

    it('should fallback to minimal for unknown preset name', () => {
        const result = parseSelectedRules('unknown-preset');
        expect(result).toEqual(PREDEFINED_RULE_SETS.minimal);
    });

    it('should return empty array if JSON is not an array', () => {
        const jsonObject = JSON.stringify({ rule: 'value' });
        const result = parseSelectedRules(jsonObject);
        expect(result).toEqual([]);
    });
});
