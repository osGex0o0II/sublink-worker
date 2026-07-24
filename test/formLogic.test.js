import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

const createFormDataForRules = () => {
  const storage = new Map();
  const fakeLocalStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const fakeWindow = {
    APP_TRANSLATIONS: {},
    PREDEFINED_RULE_SETS: {
      basic: ['Google', 'Non-China']
    },
    MANDATORY_RULES: ['Private', 'Location:CN'],
    HIDDEN_RULES: ['Private', 'Location:CN', 'Non-China'],
    location: {
      origin: 'https://example.com',
      href: 'https://example.com/',
      pathname: '/',
      search: '',
      hash: ''
    },
    history: { replaceState() {} }
  };
  const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
  const result = fn(fakeWindow);
  const data = result.formData();
  globalThis.localStorage = fakeLocalStorage;
  data.$watch = () => {};
  data.init();
  return data;
};

describe('formLogic toString fix', () => {
  it('includes parseSurgeConfigInput definition in toString output', () => {
    const fnString = formLogicFn.toString();

    // Verify the function references parseSurgeConfigInput
    expect(fnString).toContain('parseSurgeConfigInput');

    // Verify the arrow function definitions ARE included
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeConfigInput\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeValue\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+convertSurgeIniToJson\s*=/);
  });

  it('does not contain __name calls that break in browser runtime', () => {
    const fnString = formLogicFn.toString();
    // Ensure no function declarations that esbuild would inject __name() for
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeValue\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+convertSurgeIniToJson\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeConfigInput\b/m);
  });

  it('formData() returns a valid Alpine data object', () => {
    // Simulate browser global environment using Function constructor
    const storage = new Map();
    const fakeLocalStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    };
    const fakeWindow = {
      APP_TRANSLATIONS: {},
      PREDEFINED_RULE_SETS: {},
      MANDATORY_RULES: [],
      HIDDEN_RULES: [],
      location: {
        href: 'https://example.com/',
        pathname: '/',
        search: '',
        hash: ''
      },
      history: { replaceState() {} }
    };
    const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
    const result = fn(fakeWindow);
    const data = result.formData();
    globalThis.localStorage = fakeLocalStorage;
    data.$watch = () => {};
    data.init();
    expect(typeof data.submitForm).toBe('function');
    expect(typeof data.toggleAccordion).toBe('function');
    expect(data.showAdvanced).toBe(false);
    delete globalThis.localStorage;
  });

  it('defaults to the basic rule preset', () => {
    const data = createFormDataForRules();

    expect(data.selectedPredefinedRule).toBe('basic');
    expect(data.getRuleSelectionParam()).toBe('basic');
    expect(data.getSelectedOptionalRules()).toEqual(['Google']);

    delete globalThis.localStorage;
  });

  it('keeps preset names as the rule selection parameter', () => {
    const data = createFormDataForRules();

    data.selectRulePreset('basic');

    expect(data.selectedRules).toEqual(['Google']);
    expect(data.getSelectedOptionalRules()).toEqual(['Google']);
    expect(data.getRuleSelectionParam()).toBe('basic');

    data.selectCustomRules();
    data.selectedRules = ['Google', 'Telegram'];

    expect(data.getRuleSelectionParam()).toBe(JSON.stringify(['Google', 'Telegram']));
    delete globalThis.localStorage;
  });

  it('generates conversion links with preset names instead of expanded rule arrays', async () => {
    const data = createFormDataForRules();
    const originalDocument = globalThis.document;
    globalThis.document = {
      querySelector(selector) {
        if (selector === 'input[name="customRules"]') return { value: '[]' };
        if (selector === '[data-results-section]') return { scrollIntoView() {} };
        return null;
      }
    };

    data.input = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Test';
    data.customUA = '';
    data.selectRulePreset('basic');

    await data.submitForm();

    expect(data.generatedLinks.singbox).toContain('selectedRules=basic');
    expect(data.generatedLinks.singbox).not.toContain('Google');

    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    delete globalThis.localStorage;
  });
});
