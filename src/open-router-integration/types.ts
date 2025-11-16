/**
 * OpenRouter API Type Definitions
 */

// Message roles for chat completions
export type MessageRole = 'system' | 'user' | 'assistant';

// Chat completion request types
export interface Message {
  role: MessageRole;
  content: string;
}

export interface ResponseFormatJsonSchema {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

export interface ResponseFormat {
  type: 'json_schema';
  json_schema: ResponseFormatJsonSchema;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  response_format?: ResponseFormat;
}

// Chat completion response types
export interface Choice {
  message: Message;
  finish_reason: 'stop' | 'length' | 'content_filter';
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Choice[];
  usage: TokenUsage;
  created: number;
}

// Service statistics
export interface ServiceUsageStats {
  requests_count: number;
  total_tokens_used: number;
  estimated_cost: number;
  errors_count: number;
  average_response_time_ms: number;
}

// Model information
export interface ModelPricing {
  input: number;
  output: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  pricing: ModelPricing;
  context_length: number;
  capabilities: string[];
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  data: unknown | null;
  errors: string[] | null;
}
