/**
 * OpenRouter Integration Module
 * Exports all service components, types, and error classes
 */

import { OpenRouterService } from './openrouter.service.js';

export { OpenRouterService } from './openrouter.service.js';

// Error classes
export {
  OpenRouterServiceError,
  APIKeyInvalidError,
  RateLimitError,
  QuotaExceededError,
  ModelNotFoundError,
  ServiceUnavailableError,
  APITimeoutError,
  ValidationError,
  SchemaValidationError,
  InsufficientDataError,
  CircuitBreakerOpenError,
} from './errors.js';

// Type definitions
export type {
  MessageRole,
  Message,
  ResponseFormatJsonSchema,
  ResponseFormat,
  ChatCompletionRequest,
  Choice,
  TokenUsage,
  ChatCompletionResponse,
  ServiceUsageStats,
  ModelPricing,
  ModelInfo,
  ValidationResult,
} from './types.js';

/**
 * Factory function to create OpenRouterService from environment variables
 * @returns Configured OpenRouterService instance
 * @throws Error if OPENROUTER_API_KEY environment variable is not set
 */
export function createOpenRouterService(): OpenRouterService {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  return new OpenRouterService(
    apiKey,
    process.env.OPENROUTER_BASE_URL || 'https://openrouter.io/api/v1',
    parseInt(process.env.OPENROUTER_TIMEOUT || '30000', 10),
    parseInt(process.env.OPENROUTER_MAX_RETRIES || '3', 10),
    parseInt(process.env.OPENROUTER_RETRY_DELAY || '1000', 10)
  );
}
