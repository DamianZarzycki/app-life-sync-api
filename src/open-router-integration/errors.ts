/**
 * OpenRouter Service Error Classes
 * Comprehensive error hierarchy for different failure scenarios
 */

/**
 * Base error class for all OpenRouter service errors
 */
export class OpenRouterServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterServiceError';
    Object.setPrototypeOf(this, OpenRouterServiceError.prototype);
  }
}

/**
 * Authentication error - invalid or expired API key
 */
export class APIKeyInvalidError extends OpenRouterServiceError {
  constructor() {
    super('OpenRouter API key is invalid or expired');
    this.name = 'APIKeyInvalidError';
    Object.setPrototypeOf(this, APIKeyInvalidError.prototype);
  }
}

/**
 * Rate limiting error - too many requests
 */
export class RateLimitError extends OpenRouterServiceError {
  constructor(public retryAfter: number = 60) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Quota exceeded error - monthly API credit quota depleted
 */
export class QuotaExceededError extends OpenRouterServiceError {
  constructor(public resetDate?: string) {
    super(
      `OpenRouter API quota exceeded${resetDate ? ` (resets ${resetDate})` : ''}`
    );
    this.name = 'QuotaExceededError';
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

/**
 * Model not found error - requested model doesn't exist or is unavailable
 */
export class ModelNotFoundError extends OpenRouterServiceError {
  constructor(public modelId: string) {
    super(`Model '${modelId}' not found or unavailable`);
    this.name = 'ModelNotFoundError';
    Object.setPrototypeOf(this, ModelNotFoundError.prototype);
  }
}

/**
 * Service unavailable error - OpenRouter server experiencing issues
 */
export class ServiceUnavailableError extends OpenRouterServiceError {
  constructor() {
    super('OpenRouter service is temporarily unavailable');
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * API timeout error - request exceeded timeout threshold
 */
export class APITimeoutError extends OpenRouterServiceError {
  constructor(public timeoutMs: number) {
    super(`API request timeout after ${timeoutMs}ms`);
    this.name = 'APITimeoutError';
    Object.setPrototypeOf(this, APITimeoutError.prototype);
  }
}

/**
 * Validation error - request parameters invalid
 */
export class ValidationError extends OpenRouterServiceError {
  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Schema validation error - LLM response doesn't match expected schema
 */
export class SchemaValidationError extends ValidationError {
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details);
    this.name = 'SchemaValidationError';
    Object.setPrototypeOf(this, SchemaValidationError.prototype);
  }
}

/**
 * Insufficient data error - not enough data to generate meaningful response
 */
export class InsufficientDataError extends OpenRouterServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientDataError';
    Object.setPrototypeOf(this, InsufficientDataError.prototype);
  }
}

/**
 * Circuit breaker open error - service temporarily unavailable due to repeated failures
 */
export class CircuitBreakerOpenError extends OpenRouterServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}
