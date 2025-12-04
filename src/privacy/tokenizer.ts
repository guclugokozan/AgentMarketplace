/**
 * PII Tokenization Layer
 *
 * Protects sensitive data from being sent to the model:
 * - Detects PII patterns (email, phone, SSN, credit card, etc.)
 * - Replaces with tokens before model processing
 * - Detokenizes after execution for actual operations
 *
 * This allows real data to flow between tools without
 * exposing it to the model context.
 */

import { randomBytes } from 'crypto';
import { createLogger, StructuredLogger } from '../logging/logger.js';

export interface TokenizedData {
  tokenized: string;
  tokenMap: Map<string, string>;
  detectedTypes: PIIType[];
  tokenCount: number;
}

export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'date_of_birth'
  | 'address'
  | 'name'
  | 'passport'
  | 'driver_license'
  | 'bank_account'
  | 'api_key'
  | 'password';

interface PIIPattern {
  type: PIIType;
  pattern: RegExp;
  format: () => string;
}

export class PIITokenizer {
  private tokenCounter = 0;
  private sessionId: string;
  private logger: StructuredLogger;

  // PII detection patterns
  private patterns: PIIPattern[] = [
    // Email addresses
    {
      type: 'email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      format: () => `__EMAIL_${this.nextToken()}__`,
    },
    // Phone numbers (various formats)
    {
      type: 'phone',
      pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
      format: () => `__PHONE_${this.nextToken()}__`,
    },
    // SSN
    {
      type: 'ssn',
      pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
      format: () => `__SSN_${this.nextToken()}__`,
    },
    // Credit card numbers
    {
      type: 'credit_card',
      pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      format: () => `__CC_${this.nextToken()}__`,
    },
    // IP addresses
    {
      type: 'ip_address',
      pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      format: () => `__IP_${this.nextToken()}__`,
    },
    // Date of birth patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
    {
      type: 'date_of_birth',
      pattern: /\b(?:(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}|(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01]))\b/g,
      format: () => `__DOB_${this.nextToken()}__`,
    },
    // API keys (common patterns)
    {
      type: 'api_key',
      pattern: /\b(?:sk|pk|api|key|token|secret)[-_]?[a-zA-Z0-9]{20,}\b/gi,
      format: () => `__APIKEY_${this.nextToken()}__`,
    },
    // Passport numbers
    {
      type: 'passport',
      pattern: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
      format: () => `__PASSPORT_${this.nextToken()}__`,
    },
    // Bank account numbers (simplified)
    {
      type: 'bank_account',
      pattern: /\b\d{8,17}\b/g,
      format: () => `__BANKACCT_${this.nextToken()}__`,
    },
  ];

  constructor() {
    this.sessionId = randomBytes(8).toString('hex');
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Tokenize PII in data
   */
  tokenize(data: unknown): TokenizedData {
    const tokenMap = new Map<string, string>();
    const detectedTypes: PIIType[] = [];
    let tokenized = typeof data === 'string' ? data : JSON.stringify(data);
    let tokenCount = 0;

    for (const { type, pattern, format } of this.patterns) {
      const matches = tokenized.match(pattern);
      if (matches) {
        if (!detectedTypes.includes(type)) {
          detectedTypes.push(type);
        }

        // Reset pattern for replacement
        pattern.lastIndex = 0;

        tokenized = tokenized.replace(pattern, (match) => {
          const token = format();
          tokenMap.set(token, match);
          tokenCount++;
          return token;
        });
      }
    }

    if (tokenCount > 0) {
      this.logger.info('pii_tokenized', {
        types: detectedTypes,
        count: tokenCount,
      });
    }

    return {
      tokenized,
      tokenMap,
      detectedTypes,
      tokenCount,
    };
  }

  /**
   * Tokenize with specific types only
   */
  tokenizeTypes(data: unknown, types: PIIType[]): TokenizedData {
    const tokenMap = new Map<string, string>();
    const detectedTypes: PIIType[] = [];
    let tokenized = typeof data === 'string' ? data : JSON.stringify(data);
    let tokenCount = 0;

    for (const { type, pattern, format } of this.patterns) {
      if (!types.includes(type)) continue;

      const matches = tokenized.match(pattern);
      if (matches) {
        if (!detectedTypes.includes(type)) {
          detectedTypes.push(type);
        }

        pattern.lastIndex = 0;

        tokenized = tokenized.replace(pattern, (match) => {
          const token = format();
          tokenMap.set(token, match);
          tokenCount++;
          return token;
        });
      }
    }

    return {
      tokenized,
      tokenMap,
      detectedTypes,
      tokenCount,
    };
  }

  /**
   * Detokenize data back to original values
   */
  detokenize(tokenized: string, tokenMap: Map<string, string>): string {
    let result = tokenized;

    for (const [token, original] of tokenMap) {
      result = result.replaceAll(token, original);
    }

    return result;
  }

  /**
   * Detokenize and parse as JSON if possible
   */
  detokenizeToObject(tokenized: string, tokenMap: Map<string, string>): unknown {
    const detokenized = this.detokenize(tokenized, tokenMap);
    try {
      return JSON.parse(detokenized);
    } catch {
      return detokenized;
    }
  }

  /**
   * Check if data contains PII
   */
  containsPII(data: unknown): { hasPII: boolean; types: PIIType[] } {
    const stringified = typeof data === 'string' ? data : JSON.stringify(data);
    const types: PIIType[] = [];

    for (const { type, pattern } of this.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(stringified)) {
        types.push(type);
      }
    }

    return { hasPII: types.length > 0, types };
  }

  /**
   * Mask PII for logging (partial redaction)
   */
  maskForLogging(data: unknown): string {
    let masked = typeof data === 'string' ? data : JSON.stringify(data);

    // Mask with partial visibility
    const maskPatterns = [
      { pattern: /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g, replace: '***@$2' },
      { pattern: /\b(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g, replace: '***-***-$3' },
      { pattern: /\b(\d{3})[-\s]?(\d{2})[-\s]?(\d{4})\b/g, replace: '***-**-$3' },
      { pattern: /\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g, replace: '****-****-****-$4' },
    ];

    for (const { pattern, replace } of maskPatterns) {
      masked = masked.replace(pattern, replace);
    }

    return masked;
  }

  /**
   * Validate token format
   */
  isToken(value: string): boolean {
    return /^__[A-Z]+_[A-Z0-9]+__$/.test(value);
  }

  /**
   * Get token type
   */
  getTokenType(token: string): PIIType | null {
    const match = token.match(/^__([A-Z]+)_/);
    if (!match) return null;

    const typeMap: Record<string, PIIType> = {
      'EMAIL': 'email',
      'PHONE': 'phone',
      'SSN': 'ssn',
      'CC': 'credit_card',
      'IP': 'ip_address',
      'DOB': 'date_of_birth',
      'APIKEY': 'api_key',
      'PASSPORT': 'passport',
      'BANKACCT': 'bank_account',
    };

    return typeMap[match[1]] ?? null;
  }

  /**
   * Create scoped tokenizer for a specific run
   */
  createScoped(): ScopedTokenizer {
    return new ScopedTokenizer(this);
  }

  /**
   * Generate next token ID
   */
  private nextToken(): string {
    return `${this.sessionId}${(++this.tokenCounter).toString(36).toUpperCase()}`;
  }
}

/**
 * Scoped tokenizer for a single run
 * Maintains its own token map for the run lifecycle
 */
export class ScopedTokenizer {
  private tokenMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private parent: PIITokenizer;

  constructor(parent: PIITokenizer) {
    this.parent = parent;
  }

  /**
   * Tokenize data and store mapping
   */
  tokenize(data: unknown): string {
    const result = this.parent.tokenize(data);

    // Merge into scoped maps
    for (const [token, original] of result.tokenMap) {
      this.tokenMap.set(token, original);
      this.reverseMap.set(original, token);
    }

    return result.tokenized;
  }

  /**
   * Detokenize using accumulated map
   */
  detokenize(tokenized: string): string {
    return this.parent.detokenize(tokenized, this.tokenMap);
  }

  /**
   * Get all tokens in this scope
   */
  getTokens(): Map<string, string> {
    return new Map(this.tokenMap);
  }

  /**
   * Get token for a specific value
   */
  getTokenFor(value: string): string | null {
    return this.reverseMap.get(value) ?? null;
  }

  /**
   * Clear scope
   */
  clear(): void {
    this.tokenMap.clear();
    this.reverseMap.clear();
  }
}

// Singleton instance
let instance: PIITokenizer | null = null;

export function getPIITokenizer(): PIITokenizer {
  if (!instance) {
    instance = new PIITokenizer();
  }
  return instance;
}
