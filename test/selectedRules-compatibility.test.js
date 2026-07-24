import { describe, it, expect } from 'vitest';
import { MANDATORY_RULES, PREDEFINED_RULE_SETS, generateRules } from '../src/config/index.js';
import { parseSelectedRules } from '../src/app/createApp.jsx';

describe('selectedRules compatibility', () => {
    it('should keep only essential mandatory routing rules', () => {
        expect(MANDATORY_RULES).toEqual(expect.arrayContaining(['Private', 'Location:CN']));
        expect(MANDATORY_RULES).not.toContain('Github');
        expect(MANDATORY_RULES).not.toContain('Apple Push');
    });

    it('should not mutate custom rule order when generating rules', () => {
        const customRules = [
            { name: 'First', domain_suffix: 'first.example' },
            { name: 'Second', domain_suffix: 'second.example' }
        ];

        generateRules('basic', customRules);

        expect(customRules.map(rule => rule.name)).toEqual(['First', 'Second']);
    });

    it('should accept "basic" preset name', () => {
        const result = parseSelectedRules('basic');
        expect(result).toEqual(PREDEFINED_RULE_SETS.basic);
        expect(result).toContain('Non-China');
        expect(result).toContain('Google');
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

    it('should fallback to basic for invalid JSON', () => {
        const result = parseSelectedRules('invalid-json-{[');
        expect(result).toEqual(PREDEFINED_RULE_SETS.basic);
    });

    it('should fallback to basic for unknown preset name', () => {
        const result = parseSelectedRules('unknown-preset');
        expect(result).toEqual(PREDEFINED_RULE_SETS.basic);
    });

    it('should return empty array if JSON is not an array', () => {
        const jsonObject = JSON.stringify({ rule: 'value' });
        const result = parseSelectedRules(jsonObject);
        expect(result).toEqual([]);
    });
});
