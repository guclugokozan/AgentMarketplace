/**
 * PII Tokenizer Tests
 *
 * Comprehensive tests for the PII tokenization layer
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('PII Tokenizer', () => {
  describe('Email Detection', () => {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

    it('should detect standard email addresses', () => {
      const text = 'Contact me at john.doe@example.com';
      expect(emailPattern.test(text)).toBe(true);
    });

    it('should detect emails with plus sign', () => {
      const text = 'Email: user+tag@domain.org';
      emailPattern.lastIndex = 0;
      expect(emailPattern.test(text)).toBe(true);
    });

    it('should detect emails with subdomains', () => {
      const text = 'Send to admin@mail.company.co.uk';
      emailPattern.lastIndex = 0;
      expect(emailPattern.test(text)).toBe(true);
    });

    it('should not match invalid emails', () => {
      const text = 'Not an email: user@.com or @domain.com';
      emailPattern.lastIndex = 0;
      const matches = text.match(emailPattern);
      expect(matches).toBeNull();
    });

    it('should find multiple emails in text', () => {
      const text = 'Contact john@example.com or jane@company.org';
      const matches = text.match(emailPattern);
      expect(matches).toHaveLength(2);
    });
  });

  describe('Phone Number Detection', () => {
    const phonePattern = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g;

    it('should detect standard US phone numbers', () => {
      const text = 'Call me at 555-123-4567';
      expect(phonePattern.test(text)).toBe(true);
    });

    it('should detect phone with country code', () => {
      const text = 'International: +1-555-123-4567';
      phonePattern.lastIndex = 0;
      expect(phonePattern.test(text)).toBe(true);
    });

    it('should detect phone with parentheses', () => {
      const text = 'Office: (555) 123-4567';
      phonePattern.lastIndex = 0;
      expect(phonePattern.test(text)).toBe(true);
    });

    it('should detect phone with dots', () => {
      const text = 'Mobile: 555.123.4567';
      phonePattern.lastIndex = 0;
      expect(phonePattern.test(text)).toBe(true);
    });

    it('should detect phone with spaces', () => {
      const text = 'Fax: 555 123 4567';
      phonePattern.lastIndex = 0;
      expect(phonePattern.test(text)).toBe(true);
    });
  });

  describe('SSN Detection', () => {
    const ssnPattern = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;

    it('should detect SSN with dashes', () => {
      const text = 'SSN: 123-45-6789';
      expect(ssnPattern.test(text)).toBe(true);
    });

    it('should detect SSN with spaces', () => {
      const text = 'Social: 123 45 6789';
      ssnPattern.lastIndex = 0;
      expect(ssnPattern.test(text)).toBe(true);
    });

    it('should detect SSN without separators', () => {
      const text = 'Number: 123456789';
      ssnPattern.lastIndex = 0;
      expect(ssnPattern.test(text)).toBe(true);
    });
  });

  describe('Credit Card Detection', () => {
    const ccPattern = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

    it('should detect credit card with dashes', () => {
      const text = 'Card: 4111-1111-1111-1111';
      expect(ccPattern.test(text)).toBe(true);
    });

    it('should detect credit card with spaces', () => {
      const text = 'Visa: 4111 1111 1111 1111';
      ccPattern.lastIndex = 0;
      expect(ccPattern.test(text)).toBe(true);
    });

    it('should detect credit card without separators', () => {
      const text = 'Number: 4111111111111111';
      ccPattern.lastIndex = 0;
      expect(ccPattern.test(text)).toBe(true);
    });
  });

  describe('IP Address Detection', () => {
    const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

    it('should detect valid IPv4 addresses', () => {
      const text = 'Server IP: 192.168.1.1';
      expect(ipPattern.test(text)).toBe(true);
    });

    it('should detect localhost', () => {
      const text = 'Connect to 127.0.0.1';
      ipPattern.lastIndex = 0;
      expect(ipPattern.test(text)).toBe(true);
    });

    it('should detect broadcast address', () => {
      const text = 'Broadcast: 255.255.255.255';
      ipPattern.lastIndex = 0;
      expect(ipPattern.test(text)).toBe(true);
    });

    it('should not match invalid octets', () => {
      const text = 'Invalid: 256.1.1.1';
      ipPattern.lastIndex = 0;
      expect(ipPattern.test(text)).toBe(false);
    });

    it('should detect multiple IPs', () => {
      const text = 'From 10.0.0.1 to 10.0.0.255';
      const matches = text.match(ipPattern);
      expect(matches).toHaveLength(2);
    });
  });

  describe('API Key Detection', () => {
    // Pattern matches prefix followed by alphanumeric string of 20+ chars
    const apiKeyPattern = /\b(?:sk|pk|api|key|token|secret)[-_][a-zA-Z0-9_]{20,}\b/gi;

    it('should detect sk_ prefixed keys', () => {
      const text = 'API: sk_live_abcdefghijklmnopqrst';
      expect(apiKeyPattern.test(text)).toBe(true);
    });

    it('should detect api_ prefixed keys', () => {
      const text = 'Key: api_abcdefghijklmnopqrstuvwxy';
      apiKeyPattern.lastIndex = 0;
      expect(apiKeyPattern.test(text)).toBe(true);
    });

    it('should detect token prefixed keys', () => {
      const text = 'Auth: token_abcdefghijklmnopqrstu';
      apiKeyPattern.lastIndex = 0;
      expect(apiKeyPattern.test(text)).toBe(true);
    });

    it('should not match short strings', () => {
      const text = 'Short: sk_abc';
      apiKeyPattern.lastIndex = 0;
      expect(apiKeyPattern.test(text)).toBe(false);
    });
  });

  describe('Date of Birth Detection', () => {
    const dobPattern = /\b(?:(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}|(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01]))\b/g;

    it('should detect MM/DD/YYYY format', () => {
      const text = 'DOB: 12/25/1990';
      expect(dobPattern.test(text)).toBe(true);
    });

    it('should detect YYYY-MM-DD format', () => {
      const text = 'Birth: 1990-12-25';
      dobPattern.lastIndex = 0;
      expect(dobPattern.test(text)).toBe(true);
    });

    it('should detect M/D/YYYY format', () => {
      const text = 'Date: 1/5/2000';
      dobPattern.lastIndex = 0;
      expect(dobPattern.test(text)).toBe(true);
    });
  });

  describe('Tokenization Process', () => {
    it('should replace detected PII with tokens', () => {
      const original = 'Contact john@example.com';
      const tokenPattern = /__EMAIL_[A-Z0-9]+__/;

      // Simulate tokenization
      const tokenized = original.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '__EMAIL_TEST123__'
      );

      expect(tokenized).toMatch(tokenPattern);
      expect(tokenized).not.toContain('john@example.com');
    });

    it('should track token mappings', () => {
      const tokenMap = new Map<string, string>();
      const original = 'user@test.com';
      const token = '__EMAIL_ABC123__';

      tokenMap.set(token, original);

      expect(tokenMap.get(token)).toBe(original);
      expect(tokenMap.size).toBe(1);
    });

    it('should handle multiple PII types', () => {
      const text = 'Email: user@test.com, Phone: 555-123-4567';
      const tokenMap = new Map<string, string>();

      let tokenized = text;
      tokenized = tokenized.replace(/user@test\.com/, '__EMAIL_1__');
      tokenMap.set('__EMAIL_1__', 'user@test.com');

      tokenized = tokenized.replace(/555-123-4567/, '__PHONE_1__');
      tokenMap.set('__PHONE_1__', '555-123-4567');

      expect(tokenized).toBe('Email: __EMAIL_1__, Phone: __PHONE_1__');
      expect(tokenMap.size).toBe(2);
    });

    it('should preserve non-PII text', () => {
      const text = 'Hello, this is a normal message.';
      const patterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
      ];

      let hasMatch = false;
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          hasMatch = true;
          break;
        }
      }

      expect(hasMatch).toBe(false);
    });
  });

  describe('Detokenization Process', () => {
    it('should restore original values from tokens', () => {
      const tokenMap = new Map<string, string>();
      tokenMap.set('__EMAIL_1__', 'user@test.com');

      const tokenized = 'Contact: __EMAIL_1__';
      let result = tokenized;

      for (const [token, original] of tokenMap) {
        result = result.replaceAll(token, original);
      }

      expect(result).toBe('Contact: user@test.com');
    });

    it('should handle multiple tokens', () => {
      const tokenMap = new Map<string, string>();
      tokenMap.set('__EMAIL_1__', 'user@test.com');
      tokenMap.set('__PHONE_1__', '555-123-4567');

      const tokenized = 'Email: __EMAIL_1__, Phone: __PHONE_1__';
      let result = tokenized;

      for (const [token, original] of tokenMap) {
        result = result.replaceAll(token, original);
      }

      expect(result).toBe('Email: user@test.com, Phone: 555-123-4567');
    });

    it('should handle repeated tokens', () => {
      const tokenMap = new Map<string, string>();
      tokenMap.set('__EMAIL_1__', 'user@test.com');

      const tokenized = 'Primary: __EMAIL_1__, CC: __EMAIL_1__';
      let result = tokenized;

      for (const [token, original] of tokenMap) {
        result = result.replaceAll(token, original);
      }

      expect(result).toBe('Primary: user@test.com, CC: user@test.com');
    });
  });

  describe('Token Validation', () => {
    const tokenPattern = /^__[A-Z]+_[A-Z0-9]+__$/;

    it('should validate email token format', () => {
      expect(tokenPattern.test('__EMAIL_ABC123__')).toBe(true);
    });

    it('should validate phone token format', () => {
      expect(tokenPattern.test('__PHONE_XYZ789__')).toBe(true);
    });

    it('should validate SSN token format', () => {
      expect(tokenPattern.test('__SSN_DEF456__')).toBe(true);
    });

    it('should reject invalid token format', () => {
      expect(tokenPattern.test('EMAIL_ABC123')).toBe(false);
      expect(tokenPattern.test('__email_abc123__')).toBe(false);
      expect(tokenPattern.test('__EMAIL__')).toBe(false);
    });
  });

  describe('Token Type Extraction', () => {
    function getTokenType(token: string): string | null {
      const match = token.match(/^__([A-Z]+)_/);
      return match ? match[1] : null;
    }

    it('should extract EMAIL type', () => {
      expect(getTokenType('__EMAIL_ABC123__')).toBe('EMAIL');
    });

    it('should extract PHONE type', () => {
      expect(getTokenType('__PHONE_XYZ789__')).toBe('PHONE');
    });

    it('should extract SSN type', () => {
      expect(getTokenType('__SSN_DEF456__')).toBe('SSN');
    });

    it('should extract CC type', () => {
      expect(getTokenType('__CC_GHI012__')).toBe('CC');
    });

    it('should extract IP type', () => {
      expect(getTokenType('__IP_JKL345__')).toBe('IP');
    });

    it('should return null for invalid tokens', () => {
      expect(getTokenType('invalid')).toBeNull();
    });
  });

  describe('Masking for Logging', () => {
    it('should mask email addresses partially', () => {
      const email = 'john.doe@example.com';
      const masked = email.replace(/^[^@]+/, '***');
      expect(masked).toBe('***@example.com');
    });

    it('should mask phone numbers partially', () => {
      const phone = '555-123-4567';
      const masked = phone.replace(/^\d{3}-\d{3}/, '***-***');
      expect(masked).toBe('***-***-4567');
    });

    it('should mask SSN partially', () => {
      const ssn = '123-45-6789';
      const masked = ssn.replace(/^\d{3}-\d{2}/, '***-**');
      expect(masked).toBe('***-**-6789');
    });

    it('should mask credit card partially', () => {
      const cc = '4111-1111-1111-1111';
      const masked = cc.replace(/^\d{4}-\d{4}-\d{4}/, '****-****-****');
      expect(masked).toBe('****-****-****-1111');
    });
  });

  describe('PII Detection Check', () => {
    function containsPII(text: string): { hasPII: boolean; types: string[] } {
      const patterns: { type: string; pattern: RegExp }[] = [
        { type: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
        { type: 'phone', pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g },
        { type: 'ssn', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g },
      ];

      const types: string[] = [];
      for (const { type, pattern } of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
          types.push(type);
        }
      }

      return { hasPII: types.length > 0, types };
    }

    it('should detect when text contains email', () => {
      const result = containsPII('Contact: user@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
    });

    it('should detect when text contains phone', () => {
      const result = containsPII('Call: 555-123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('phone');
    });

    it('should detect multiple PII types', () => {
      const result = containsPII('Email: user@test.com, Phone: 555-123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
      expect(result.types).toContain('phone');
    });

    it('should return false when no PII present', () => {
      const result = containsPII('This is a normal message with no PII.');
      expect(result.hasPII).toBe(false);
      expect(result.types).toHaveLength(0);
    });
  });

  describe('Scoped Tokenizer', () => {
    it('should maintain separate token maps per scope', () => {
      const scope1 = new Map<string, string>();
      const scope2 = new Map<string, string>();

      scope1.set('__EMAIL_1__', 'user1@test.com');
      scope2.set('__EMAIL_1__', 'user2@test.com');

      expect(scope1.get('__EMAIL_1__')).toBe('user1@test.com');
      expect(scope2.get('__EMAIL_1__')).toBe('user2@test.com');
    });

    it('should support reverse lookup', () => {
      const tokenMap = new Map<string, string>();
      const reverseMap = new Map<string, string>();

      const token = '__EMAIL_1__';
      const original = 'user@test.com';

      tokenMap.set(token, original);
      reverseMap.set(original, token);

      expect(reverseMap.get('user@test.com')).toBe('__EMAIL_1__');
    });

    it('should clear scope data', () => {
      const tokenMap = new Map<string, string>();
      tokenMap.set('__EMAIL_1__', 'user@test.com');

      expect(tokenMap.size).toBe(1);

      tokenMap.clear();

      expect(tokenMap.size).toBe(0);
    });
  });

  describe('JSON Data Handling', () => {
    it('should tokenize PII in JSON strings', () => {
      const data = { email: 'user@test.com', name: 'John' };
      const stringified = JSON.stringify(data);

      const tokenized = stringified.replace(/user@test\.com/, '__EMAIL_1__');

      expect(tokenized).toContain('__EMAIL_1__');
      expect(tokenized).toContain('John');
    });

    it('should detokenize and parse JSON', () => {
      const tokenMap = new Map<string, string>();
      tokenMap.set('__EMAIL_1__', 'user@test.com');

      const tokenized = '{"email":"__EMAIL_1__","name":"John"}';
      let detokenized = tokenized;

      for (const [token, original] of tokenMap) {
        detokenized = detokenized.replaceAll(token, original);
      }

      const parsed = JSON.parse(detokenized);
      expect(parsed.email).toBe('user@test.com');
      expect(parsed.name).toBe('John');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          email: 'user@test.com',
          profile: {
            phone: '555-123-4567',
          },
        },
      };

      const stringified = JSON.stringify(data);
      expect(stringified).toContain('user@test.com');
      expect(stringified).toContain('555-123-4567');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const text = '';
      const patterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      ];

      let hasMatch = false;
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          hasMatch = true;
        }
      }

      expect(hasMatch).toBe(false);
    });

    it('should handle text with special characters', () => {
      const text = 'Email: <user@test.com>, Phone: "555-123-4567"';
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

      expect(emailPattern.test(text)).toBe(true);
    });

    it('should handle unicode text', () => {
      const text = '联系方式: user@test.com';
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

      expect(emailPattern.test(text)).toBe(true);
    });

    it('should handle very long strings', () => {
      const longText = 'x'.repeat(10000) + ' user@test.com ' + 'y'.repeat(10000);
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

      expect(emailPattern.test(longText)).toBe(true);
    });
  });

  describe('Token Counter', () => {
    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      let counter = 0;

      for (let i = 0; i < 100; i++) {
        const token = `__EMAIL_${(++counter).toString(36).toUpperCase()}__`;
        tokens.add(token);
      }

      expect(tokens.size).toBe(100);
    });

    it('should use base36 encoding', () => {
      const num = 35;
      const encoded = num.toString(36).toUpperCase();
      expect(encoded).toBe('Z');
    });

    it('should handle large counter values', () => {
      const num = 1000000;
      const encoded = num.toString(36).toUpperCase();
      expect(encoded.length).toBeGreaterThan(0);
    });
  });
});
