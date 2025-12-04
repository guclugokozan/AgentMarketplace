/**
 * Base Provider
 *
 * Abstract base class for all AI provider adapters.
 * Handles common functionality: auth, retries, rate limiting, error handling.
 */

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  originalError?: unknown;
}

export abstract class BaseProvider {
  protected config: Required<ProviderConfig>;
  protected name: string;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      baseUrl: '',
      ...config,
    };

    if (!this.config.apiKey) {
      throw new Error(`${name}: API key is required`);
    }
  }

  /**
   * Make a fetch request with retries and error handling
   */
  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {},
    retries: number = this.config.maxRetries
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await this.parseError(response);

        if (error.retryable && retries > 0) {
          const delay = error.retryAfter
            ? error.retryAfter * 1000
            : this.config.retryDelay * (this.config.maxRetries - retries + 1);

          await this.sleep(delay);
          return this.fetchWithRetry(url, options, retries - 1);
        }

        throw new Error(`${this.name} API error: ${error.message} (${error.code})`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }

      return response.text() as unknown as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`${this.name} API timeout after ${this.config.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Make a fetch request that returns binary data
   */
  protected async fetchBinary(
    url: string,
    options: RequestInit = {}
  ): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getAuthHeaders(),
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await this.parseError(response);
        throw new Error(`${this.name} API error: ${error.message} (${error.code})`);
      }

      return response.arrayBuffer();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get authorization headers
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Parse error response
   */
  protected async parseError(response: Response): Promise<ProviderError> {
    try {
      const body = await response.json();
      return {
        code: body.error?.code || body.code || response.status.toString(),
        message: body.error?.message || body.message || response.statusText,
        retryable: response.status === 429 || response.status >= 500,
        retryAfter: parseInt(response.headers.get('retry-after') || '0', 10) || undefined,
        originalError: body,
      };
    } catch {
      return {
        code: response.status.toString(),
        message: response.statusText,
        retryable: response.status >= 500,
      };
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }
}

/**
 * Helper function to check if an API key is configured
 */
export function requireApiKey(envVar: string, providerName: string): string {
  const apiKey = process.env[envVar];
  if (!apiKey) {
    throw new Error(
      `${providerName} API key required. Set ${envVar} environment variable.`
    );
  }
  return apiKey;
}
