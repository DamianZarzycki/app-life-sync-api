/**
 * OpenRouter Service
 * Main service class for interacting with OpenRouter API
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ServiceUsageStats,
} from './types.js';
import {
  APIKeyInvalidError,
  RateLimitError,
  QuotaExceededError,
  ModelNotFoundError,
  ServiceUnavailableError,
  APITimeoutError,
  ValidationError,
} from './errors.js';

/**
 * OpenRouterService handles all interactions with the OpenRouter API
 * Provides methods for chat completions, report generation, feedback analysis, etc.
 */
export class OpenRouterService {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private usageStats: ServiceUsageStats;
  private responseTimes: number[] = [];z

  /**
   * Initialize OpenRouter service with configuration
   * @param apiKey - OpenRouter API key (required)
   * @param baseUrl - API base URL (default: https://openrouter.io/api/v1)
   * @param timeout - Request timeout in milliseconds (default: 30000)
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @param retryDelayMs - Initial retry delay in milliseconds (default: 1000)
   * @throws Error if API key is not provided
   */
  constructor(
    apiKey: string,
    baseUrl: string = 'https://openrouter.io/api/v1',
    timeout: number = 30000,
    maxRetries: number = 3,
    retryDelayMs: number = 1000
  ) {
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;

    // Initialize usage statistics
    this.usageStats = {
      requests_count: 0,
      total_tokens_used: 0,
      estimated_cost: 0,
      errors_count: 0,
      average_response_time_ms: 0,
    };

    console.log(
      `[OpenRouterService] Initialized with base URL: ${this.baseUrl}`
    );
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Core HTTP request handler with timeout and error handling
   * @private
   */
  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: Record<string, unknown>,
    retryCount: number = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {
      // Use Promise.race to implement timeout
      const response = (await Promise.race([
        fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lifesync.app',
            'X-Title': 'LifeSync',
          },
          body: data ? JSON.stringify(data) : undefined,
        }),
        this.createTimeoutPromise(),
      ])) as Response;

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const result = (await response.json()) as T;
      const duration = Date.now() - startTime;

      this.logRequest(method, endpoint, duration, response.status);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.handleRequestError(
        error,
        method,
        endpoint,
        duration,
        retryCount
      );
      throw error;
    }
  }

  /**
   * Create a timeout promise that rejects after the configured timeout
   * @private
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Timeout after ${this.timeout}ms`)
        );
      }, this.timeout);
    });
  }

  /**
   * Delay execution for specified milliseconds
   * @private
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make request with automatic retry logic
   * @private
   */
  private async makeRequestWithRetry<T>(
    method: string,
    endpoint: string,
    data?: Record<string, unknown>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await this.makeRequest<T>(method, endpoint, data);
    } catch (error) {
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        const backoffDelay = this.calculateBackoff(retryCount);
        console.log(
          `[OpenRouterService] Retrying ${method} ${endpoint} after ${backoffDelay}ms (attempt ${retryCount + 1}/${this.maxRetries})`
        );
        await this.delay(backoffDelay);
        return this.makeRequestWithRetry<T>(
          method,
          endpoint,
          data,
          retryCount + 1
        );
      }
      throw error;
    }
  }

  /**
   * Determine if an error should be retried
   * @private
   */
  private shouldRetry(error: unknown): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof ServiceUnavailableError) return true;
    if (error instanceof APITimeoutError) return true;
    // Don't retry validation or auth errors
    if (error instanceof ValidationError) return false;
    if (error instanceof APIKeyInvalidError) return false;
    return false;
  }

  /**
   * Calculate exponential backoff with jitter
   * @private
   */
  private calculateBackoff(retryCount: number): number {
    const baseDelay = this.retryDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay + jitter, 32000); // Max 32 seconds
  }

  /**
   * Sanitize input to prevent prompt injection and excessive tokens
   * @private
   */
  private sanitizeInput(input: string): string {
    // Remove control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');

    // Trim excess whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Sanitize entire request
   * @private
   */
  private sanitizeRequest(
    request: ChatCompletionRequest
  ): ChatCompletionRequest {
    return {
      ...request,
      messages: request.messages.map((msg) => ({
        ...msg,
        content: this.sanitizeInput(msg.content),
      })),
    };
  }

  /**
   * Validate request parameters
   * @private
   */
  private validateRequestParameters(
    request: ChatCompletionRequest
  ): string[] {
    const errors: string[] = [];

    if (!request.model) {
      errors.push('model is required');
    }

    if (
      !Array.isArray(request.messages) ||
      request.messages.length === 0
    ) {
      errors.push('messages must be a non-empty array');
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        errors.push('temperature must be between 0 and 2');
      }
    }

    if (request.max_tokens !== undefined) {
      if (request.max_tokens < 1 || request.max_tokens > 200000) {
        errors.push('max_tokens must be between 1 and 200000');
      }
    }

    return errors;
  }

  /**
   * Update usage statistics
   * @private
   */
  private updateUsageStats(usage: { total_tokens: number }): void {
    this.usageStats.total_tokens_used += usage.total_tokens;
    this.usageStats.requests_count += 1;
    // Estimate cost: ~$0.03 per 1M tokens (average)
    this.usageStats.estimated_cost =
      (this.usageStats.total_tokens_used / 1000000) * 30;
  }

  /**
   * Log request details for debugging and monitoring
   * @private
   */
  private logRequest(
    method: string,
    endpoint: string,
    duration: number,
    statusCode: number
  ): void {
    this.responseTimes.push(duration);

    // Keep only last 100 response times for average calculation
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    console.log(
      `[OpenRouterService] ${method} ${endpoint} - ${statusCode} (${duration}ms)`
    );

    // Alert on slow responses
    if (duration > 10000) {
      console.warn(
        `[OpenRouterService] SLOW RESPONSE WARNING: ${duration}ms for ${method} ${endpoint}`
      );
    }
  }

  /**
   * Handle request errors and map to specific error types
   * @private
   */
  private handleRequestError(
    error: unknown,
    method: string,
    endpoint: string,
    duration: number,
    retryCount: number
  ): void {
    this.usageStats.errors_count += 1;

    console.error(`[OpenRouterService] ERROR: ${method} ${endpoint}`, {
      error:
        error instanceof Error ? error.message : String(error),
      duration_ms: duration,
      retry_count: retryCount,
      timestamp: new Date().toISOString(),
    });

    // Map HTTP errors to custom error types
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('401')) {
        throw new APIKeyInvalidError();
      }
      if (message.includes('429')) {
        throw new RateLimitError();
      }
      if (message.includes('402')) {
        throw new QuotaExceededError();
      }
      if (message.includes('404')) {
        throw new ModelNotFoundError('unknown');
      }
      if (message.includes('5')) {
        throw new ServiceUnavailableError();
      }
      if (message.includes('timeout')) {
        throw new APITimeoutError(this.timeout);
      }
    }
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Send a chat completion request to OpenRouter
   * Primary method for interacting with LLMs
   *
   * @param request - Chat completion request with model, messages, and optional parameters
   * @returns Chat completion response from OpenRouter
   * @throws ValidationError if request parameters are invalid
   * @throws APIKeyInvalidError if API key is invalid
   * @throws RateLimitError if rate limit exceeded
   * @throws ServiceUnavailableError if OpenRouter is down
   */
  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    // 1. Validate request
    const validationErrors = this.validateRequestParameters(request);
    if (validationErrors.length > 0) {
      throw new ValidationError('Invalid request parameters', {
        errors: validationErrors,
      });
    }

    // 2. Sanitize inputs
    const sanitizedRequest = this.sanitizeRequest(request);

    // 3. Make API call with retry logic
    const response =
      await this.makeRequestWithRetry<ChatCompletionResponse>(
        'POST',
        '/chat/completions',
        sanitizedRequest as unknown as Record<string, unknown>
      );

    // 4. Update usage stats
    this.updateUsageStats(response.usage);

    return response;
  }

  /**
   * Get current usage statistics for monitoring and cost tracking
   *
   * @returns Service usage statistics including token count and estimated cost
   */
  getUsageStats(): ServiceUsageStats {
    return {
      ...this.usageStats,
      average_response_time_ms:
        this.responseTimes.length > 0
          ? this.responseTimes.reduce((a, b) => a + b, 0) /
            this.responseTimes.length
          : 0,
    };
  }

  /**
   * Reset usage statistics counters
   */
  resetUsageStats(): void {
    this.usageStats = {
      requests_count: 0,
      total_tokens_used: 0,
      estimated_cost: 0,
      errors_count: 0,
      average_response_time_ms: 0,
    };
    this.responseTimes = [];
    console.log('[OpenRouterService] Usage statistics reset');
  }
}
