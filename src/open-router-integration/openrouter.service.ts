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
  SchemaValidationError,
  InsufficientDataError,
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
  private responseTimes: number[] = [];
  private modelCache: Map<string, unknown> = new Map();
  private modelCacheExpiry: number = 0;

  /**
   * Initialize OpenRouter service with configuration
   * @param apiKey - OpenRouter API key (required)
   * @param baseUrl - API base URL (default: https://openrouter.ai/api/v1)
   * @param timeout - Request timeout in milliseconds (default: 30000)
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @param retryDelayMs - Initial retry delay in milliseconds (default: 1000)
   * @throws Error if API key is not provided
   */
  constructor(
    apiKey: string,
    baseUrl: string = 'https://openrouter.ai/api/v1',
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
   * Build response format for JSON schema structured responses
   * Converts standard JSON schema to OpenRouter's expected format
   * @private
   */
  private buildResponseFormat(schema: {
    name: string;
    schema: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      type: 'json_schema',
      json_schema: {
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    };
  }

  /**
   * Validate response against expected JSON schema
   * Parses and validates LLM response structure
   * @private
   */
  private validateResponseAgainstSchema(
    response: string,
    schema: Record<string, unknown>
  ): { valid: boolean; data: unknown; errors: string[] } {
    try {
      // Parse JSON response
      const data = JSON.parse(response);

      // Basic schema validation
      const errors = this.validateSchemaProperties(
        data,
        schema as { properties?: Record<string, unknown>; required?: string[] }
      );

      return {
        valid: errors.length === 0,
        data,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        data: null,
        errors: [
          `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  /**
   * Validate schema properties match expected structure
   * @private
   */
  private validateSchemaProperties(
    data: unknown,
    schema: { properties?: Record<string, unknown>; required?: string[] }
  ): string[] {
    const errors: string[] = [];

    if (typeof data !== 'object' || data === null) {
      errors.push('Response must be an object');
      return errors;
    }

    const dataObj = data as Record<string, unknown>;
    const required = schema.required || [];

    // Check required properties
    for (const prop of required) {
      if (!(prop in dataObj)) {
        errors.push(`Missing required property: ${prop}`);
      }
    }

    // Remove dangerous properties
    delete dataObj.__proto__;
    delete (dataObj as any).constructor;
    delete (dataObj as any).prototype;

    return errors;
  }

  /**
   * Check if model cache is valid and not expired
   * @private
   */
  private isCacheValid(): boolean {
    return this.modelCache.size > 0 && Date.now() < this.modelCacheExpiry;
  }

  /**
   * Update model cache with expiration time (1 hour)
   * @private
   */
  private updateModelCache(
    key: string,
    value: unknown
  ): void {
    this.modelCache.set(key, value);
    // Set expiration to 1 hour from now
    this.modelCacheExpiry = Date.now() + 3600000;
  }

  /**
   * Clear model cache
   * @private
   */
  private clearModelCache(): void {
    this.modelCache.clear();
    this.modelCacheExpiry = 0;
  }

  /**
   * Get value from model cache
   * @private
   */
  private getFromModelCache<T>(key: string): T | null {
    if (!this.isCacheValid()) {
      this.clearModelCache();
      return null;
    }
    const value = this.modelCache.get(key);
    return value as T | null;
  }

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
    console.log('url:: ', url);
    const startTime = Date.now();

    try {
      // Use Promise.race to implement timeout
      const response = (await Promise.race([
        fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            // 'HTTP-Referer': 'https://lifesync.app',
            // 'X-Title': 'LifeSync',
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
        console.log('error:: ', error);
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

  /**
   * Validate response content against JSON schema
   * Checks if LLM response matches expected structure
   *
   * @param response - Response text to validate
   * @param schema - Expected JSON schema with properties and required fields
   * @returns Validation result with parsed data and errors
   * @throws ValidationError if response cannot be parsed
   *
   * @example
   * ```typescript
   * const result = await service.validateResponse(
   *   responseText,
   *   {
   *     properties: {
   *       summary: { type: 'string' },
   *       items: { type: 'array' }
   *     },
   *     required: ['summary', 'items']
   *   }
   * );
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   * ```
   */
  validateResponse(
    response: string,
    schema: Record<string, unknown>
  ): { valid: boolean; data: unknown; errors: string[] } {
    return this.validateResponseAgainstSchema(response, schema);
  }

  /**
   * Get cache information for monitoring
   * Returns cache status and expiration time
   *
   * @returns Cache info with status and time remaining
   *
   * @example
   * ```typescript
   * const cacheInfo = service.getCacheInfo();
   * console.log(`Cache valid: ${cacheInfo.isValid}`);
   * console.log(`Expires in: ${cacheInfo.expiresInMs}ms`);
   * ```
   */
  getCacheInfo(): {
    isValid: boolean;
    size: number;
    expiresInMs: number;
  } {
    const isValid = this.isCacheValid();
    const timeRemaining = Math.max(0, this.modelCacheExpiry - Date.now());

    return {
      isValid,
      size: this.modelCache.size,
      expiresInMs: isValid ? timeRemaining : 0,
    };
  }

  /**
   * Clear all cached data
   * Useful for force-refreshing model list
   */
  clearCache(): void {
    this.clearModelCache();
    console.log('[OpenRouterService] Cache cleared');
  }

  /**
   * Generate a weekly report from user notes
   * Sends notes to LLM with system prompt for analysis and recommendations
   *
   * @param notes - Array of user notes for the week
   * @param categories - Active categories with metadata
   * @param preferences - User preferences (timezone, etc)
   * @returns Generated report with analysis, recommendations, and HTML/text versions
   * @throws InsufficientDataError if fewer than minimum notes
   * @throws OpenRouterServiceError on API failures
   *
   * @example
   * ```typescript
   * const report = await service.generateWeeklyReport(
   *   notes,
   *   categories,
   *   { timezone: 'America/New_York' }
   * );
   * // Returns: { html, text_version, llm_model, system_prompt_version, ... }
   * ```
   */
  async generateWeeklyReport(
    notes: Array<{ id: string; content: string; category_id: string; title?: string }>,
    categories: Array<{ id: string; name: string }>,
    preferences: { timezone?: string }
  ): Promise<{
    html: string;
    text_version: string | null;
    llm_model: string;
    system_prompt_version: string;
  }> {
    // Validate minimum notes
    const MIN_NOTES = 1;
    if (notes.length < MIN_NOTES) {
      throw new InsufficientDataError(
        `Minimum ${MIN_NOTES} note(s) required, but only ${notes.length} provided`
      );
    }

    // Build system prompt for report generation
    const systemPrompt = this.buildReportSystemPrompt(categories, preferences);

    // Format notes by category
    const formattedNotes = this.formatNotesForLLM(notes, categories);

    // Build user message with notes
    const userMessage = `Please analyze the following weekly notes and provide insights:\n\n${formattedNotes}`;

    // Call LLM with report generation request
    const response = await this.createChatCompletion({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    // Parse response
    const reportContent = response.choices[0].message.content;

    // Generate HTML and text versions
    return {
      html: this.generateReportHTML(reportContent),
      text_version: this.generateReportText(reportContent),
      llm_model: response.model,
      system_prompt_version: 'v1.0',
    };
  }

  /**
   * Generate a weekly report from user-provided reflections
   * Accepts pre-formatted reflections grouped by category name
   *
   * @param reflections - Object with category names as keys and array of reflections as values
   * @returns Generated report with analysis, recommendations, and HTML/text versions
   * @throws InsufficientDataError if no reflections provided
   * @throws OpenRouterServiceError on API failures
   *
   * @example
   * ```typescript
   * const reflections = {
   *   "goals": [
   *     {
   *       "title": "Financial Progress",
   *       "description": "Saved $150 by cutting subscriptions",
   *       "date": "2025-10-27"
   *     }
   *   ],
   *   "work": [
   *     {
   *       "title": "Bug Fix",
   *       "description": "Fixed async race condition",
   *       "date": "2025-10-27"
   *     }
   *   ]
   * };
   * const report = await service.generateReportFromReflections(reflections);
   * ```
   */
  async generateReportFromReflections(reflections: Record<
    string,
    Array<{ title: string; description: string; date: string }>
  >): Promise<{
    html: string;
    text_version: string | null;
    llm_model: string;
    system_prompt_version: string;
  }> {
    // Validate that at least one reflection category exists
    const totalReflections = Object.values(reflections).reduce(
      (sum, items) => sum + items.length,
      0
    );

    if (totalReflections === 0) {
      throw new InsufficientDataError(
        'At least one reflection is required to generate a report'
      );
    }

    // Get category names
    const categories = Object.keys(reflections);

    // Build system prompt for report generation
    const systemPrompt = this.buildReportSystemPromptFromReflections(
      categories
    );

    // Format reflections for LLM
    const formattedReflections =
      this.formatReflectionsForLLM(reflections);

    // Build user message with reflections
    const userMessage = `Please analyze the following weekly reflections and provide insights:\n\n${formattedReflections}`;

    // Call LLM with report generation request
    const response = await this.createChatCompletion({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    //   max_tokens: 2048,
    });

    // Parse response
    const reportContent = response.choices[0].message.content;

    // Generate HTML and text versions
    return {
      html: this.generateReportHTML(reportContent),
      text_version: this.generateReportText(reportContent),
      llm_model: response.model,
      system_prompt_version: 'v1.0',
    };
  }

  /**
   * Build system prompt for weekly report generation
   * @private
   */
  private buildReportSystemPrompt(
    categories: Array<{ id: string; name: string }>,
    preferences: { timezone?: string }
  ): string {
    const categoryList = categories.map((c) => c.name).join(', ');

    return `You are LifeSync, a compassionate AI assistant helping users reflect on their weekly life balance.

The user has been tracking their weekly activities in these categories: ${categoryList}

Your task is to analyze their weekly notes and provide:
1. A summary of their week
2. Key strengths and positive achievements
3. Areas for improvement
4. Specific, actionable recommendations for next week
5. Encouraging insights about their life balance

Be supportive and constructive. Focus on celebrating wins while identifying growth opportunities.
Format your response as clear, well-structured text that can be converted to a readable report.`;
  }

  /**
   * Build system prompt for report generation from reflections
   * @private
   */
  private buildReportSystemPromptFromReflections(
    categories: string[]
  ): string {
    const categoryList = categories.join(', ');

    return `You are LifeSync, a compassionate AI assistant helping users reflect on their weekly life balance.

The user has documented their weekly reflections in these life areas: ${categoryList}

Your task is to analyze their weekly reflections and provide:
1. A meaningful summary of their week
2. Key strengths and positive achievements
3. Areas where they're growing
4. Specific, actionable recommendations for next week
5. Encouraging insights about their life balance and personal growth

Be supportive and constructive. Focus on celebrating wins while identifying growth opportunities.
Acknowledge their effort in tracking these reflections - it shows self-awareness.
Format your response as clear, well-structured text that can be converted to a readable report.`;
  }

  /**
   * Format notes by category for LLM consumption
   * @private
   */
  private formatNotesForLLM(
    notes: Array<{ id: string; content: string; category_id: string; title?: string }>,
    categories: Array<{ id: string; name: string }>
  ): string {
    // Create category map
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    // Group notes by category
    const groupedNotes: Record<string, string[]> = {};
    for (const note of notes) {
      const categoryName = categoryMap.get(note.category_id) || 'Other';
      if (!groupedNotes[categoryName]) {
        groupedNotes[categoryName] = [];
      }
      groupedNotes[categoryName].push(note.content);
    }

    // Format for LLM
    let formatted = '';
    for (const [category, categoryNotes] of Object.entries(groupedNotes)) {
      formatted += `**${category}:**\n`;
      categoryNotes.forEach((note) => {
        formatted += `- ${note}\n`;
      });
      formatted += '\n';
    }

    return formatted;
  }

  /**
   * Format reflections grouped by category for LLM consumption
   * @private
   */
  private formatReflectionsForLLM(
    reflections: Record<
      string,
      Array<{ title: string; description: string; date: string }>
    >
  ): string {
    let formatted = '';

    for (const [category, items] of Object.entries(reflections)) {
      formatted += `**${this.capitalizeCategory(category)}:**\n`;

      items.forEach((item) => {
        formatted += `- ${item.title}: ${item.description}\n`;
      });

      formatted += '\n';
    }

    return formatted;
  }

  /**
   * Capitalize category name for display
   * @private
   */
  private capitalizeCategory(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Generate HTML version of report
   * @private
   */
  private generateReportHTML(content: string): string {
    // Simple HTML generation - can be enhanced with better formatting
    const htmlContent = content
      .split('\n')
      .map((line) => {
        if (line.startsWith('**') && line.endsWith(':**')) {
          const title = line.replace(/\*\*/g, '');
          return `<h2>${title}</h2>`;
        }
        if (line.startsWith('- ')) {
          return `<li>${line.substring(2)}</li>`;
        }
        if (line.trim() === '') {
          return '';
        }
        return `<p>${line}</p>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Weekly Report</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 20px; }
    li { margin: 8px 0; }
    p { color: #666; }
  </style>
</head>
<body>
  <h1>Weekly Report</h1>
  ${htmlContent}
</body>
</html>`;
  }

  /**
   * Generate plain text version of report
   * @private
   */
  private generateReportText(content: string): string {
    // Remove markdown formatting
    return content
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim();
  }

  /**
   * Analyze user feedback on reports
   * Helps understand user satisfaction and identify patterns
   *
   * @param feedbackRating - Rating from 1-5
   * @param feedbackComment - Optional user comment
   * @param previousReports - Previous report analyses for context
   * @returns Feedback analysis with sentiment and recommendations
   *
   * @example
   * ```typescript
   * const analysis = await service.analyzeFeedback(
   *   5,
   *   'Great insights! More exercise recommendations would help.',
   *   previousReports
   * );
   * ```
   */
  async analyzeFeedback(
    feedbackRating: number,
    feedbackComment: string | null,
    previousReports: Array<{ content: string }>
  ): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    key_themes: string[];
    recommendations: string[];
    trend_analysis: string;
  }> {
    // Determine sentiment from rating
    const sentiment: 'positive' | 'neutral' | 'negative' =
      feedbackRating >= 4 ? 'positive' : feedbackRating <= 2 ? 'negative' : 'neutral';

    // Build analysis prompt
    const systemPrompt =
      'You are analyzing user feedback on LifeSync weekly reports. Extract key themes and provide constructive recommendations.';

    const previousContext =
      previousReports.length > 0
        ? `\n\nContext from previous 3 reports:\n${previousReports
            .slice(-3)
            .map((r) => r.content)
            .join('\n---\n')}`
        : '';

    const userMessage = `User Rating: ${feedbackRating}/5
User Comment: ${feedbackComment || '(no comment)'}${previousContext}

Analyze this feedback and identify:
1. Key themes or topics mentioned
2. Specific recommendations for improvement
3. Patterns compared to previous reports`;

    const response = await this.createChatCompletion({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 1024,
    });

    const analysisText = response.choices[0].message.content;

    return {
      sentiment,
      key_themes: this.extractThemes(analysisText),
      recommendations: this.extractRecommendations(analysisText),
      trend_analysis: this.generateTrendAnalysis(
        previousReports.length,
        sentiment
      ),
    };
  }

  /**
   * Extract themes from analysis text
   * @private
   */
  private extractThemes(text: string): string[] {
    const themes: string[] = [];
    const keywords = [
      'exercise',
      'health',
      'sleep',
      'stress',
      'family',
      'work',
      'social',
      'productivity',
      'relationships',
      'balance',
    ];

    for (const keyword of keywords) {
      if (text.toLowerCase().includes(keyword)) {
        themes.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
      }
    }

    return themes.slice(0, 5); // Top 5 themes
  }

  /**
   * Extract recommendations from analysis text
   * @private
   */
  private extractRecommendations(text: string): string[] {
    return text
      .split('\n')
      .filter(
        (line) =>
          line.toLowerCase().includes('recommend') ||
          line.toLowerCase().includes('suggest') ||
          line.toLowerCase().includes('should')
      )
      .slice(0, 3) // Top 3 recommendations
      .map((line) => line.replace(/^[-*]\s/, '').trim());
  }

  /**
   * Generate trend analysis
   * @private
   */
  private generateTrendAnalysis(
    reportCount: number,
    sentiment: string
  ): string {
    if (reportCount === 0) {
      return 'First report - no trends to analyze yet.';
    }
    if (sentiment === 'positive') {
      return `Positive trend observed across ${reportCount} reports. User satisfaction is increasing.`;
    }
    if (sentiment === 'negative') {
      return `User may be experiencing challenges. Consider increasing support frequency.`;
    }
    return `Neutral feedback on current report. Consistency maintained across reports.`;
  }
}
