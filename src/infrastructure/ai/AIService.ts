import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { ModelMessage } from 'ai';
import { generateText } from 'ai';
import type { GeneratedContent, IAIService, Post, Summary } from '@/domain';
import { AIServiceError } from '@/shared/errors';
import {
  type AIConfig,
  type AIGenerationConfig,
  buildPrompt,
  defaultAIConfig,
  defaultPromptTemplates,
  getGenerationConfigForType,
  getLocaleStrings,
  type Locale,
  type PromptTemplate,
  type PromptTemplates,
} from '../config';

// Type for model returned by provider factories
type AIModel = Parameters<typeof generateText>[0]['model'];

/**
 * AI generation service implementation
 * Uses Vercel AI SDK with configurable provider (OpenAI/Anthropic)
 */
export class AIService implements IAIService {
  private readonly config: AIConfig;
  private readonly prompts: PromptTemplates;
  private readonly model: AIModel;
  private readonly locale: Locale;

  constructor(params: {
    apiKey: string;
    config?: AIConfig;
    prompts?: PromptTemplates;
    locale?: Locale;
  }) {
    this.config = params.config ?? defaultAIConfig;
    this.prompts = params.prompts ?? defaultPromptTemplates;
    this.model = this.createModel(params.apiKey);
    this.locale = params.locale ?? 'en_US';
  }

  /**
   * Create language model based on provider configuration
   * Note: Type assertion needed due to SDK version compatibility (V1 vs V3)
   */
  private createModel(apiKey: string): AIModel {
    const { provider, id } = this.config.model;

    switch (provider) {
      case 'openai': {
        const openai = createOpenAI({ apiKey });
        return openai(id) as unknown as AIModel;
      }
      case 'anthropic': {
        const anthropic = createAnthropic({ apiKey });
        return anthropic(id) as unknown as AIModel;
      }
      default: {
        // Default to OpenAI
        const openai = createOpenAI({ apiKey });
        return openai(id) as unknown as AIModel;
      }
    }
  }

  /**
   * Create AIService with legacy parameters (backward compatible)
   */
  static createWithLegacyParams(params: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    locale?: Locale;
  }): AIService {
    const config: AIConfig = {
      model: {
        provider: 'openai',
        id: params.model ?? defaultAIConfig.model.id,
      },
      generation: {
        ...defaultAIConfig.generation,
        maxTokens: params.maxTokens ?? defaultAIConfig.generation.maxTokens,
      },
    };

    return new AIService({ apiKey: params.apiKey, config, locale: params.locale });
  }

  async generateWeeklySummary(posts: Post[]): Promise<GeneratedContent> {
    if (posts.length === 0) {
      throw new AIServiceError('Posts array is empty');
    }

    const postsText = posts.map((p) => p.toSummaryFormat()).join('\n');
    const messages = this.buildMessages(this.prompts.weekly, { posts: postsText });
    const generationConfig = getGenerationConfigForType(this.config, 'weekly');

    return this.generate(messages, generationConfig);
  }

  async generateMonthlySummary(weeklySummaries: Summary[]): Promise<GeneratedContent> {
    if (weeklySummaries.length === 0) {
      throw new AIServiceError('Weekly summaries array is empty');
    }

    const localeStrings = getLocaleStrings(this.locale);
    const summariesText = weeklySummaries
      .map((s, i) => {
        const weekLabel =
          this.locale === 'ja_JP' ? `第${i + 1}週` : `${localeStrings.weekLabel} ${i + 1}`;
        return `### ${weekLabel}\n${s.content}`;
      })
      .join('\n\n');
    const messages = this.buildMessages(this.prompts.monthly, { weeklySummaries: summariesText });
    const generationConfig = getGenerationConfigForType(this.config, 'monthly');

    return this.generate(messages, generationConfig);
  }

  async generateYearlySummary(monthlySummaries: Summary[]): Promise<GeneratedContent> {
    if (monthlySummaries.length === 0) {
      throw new AIServiceError('Monthly summaries array is empty');
    }

    const localeStrings = getLocaleStrings(this.locale);
    const summariesText = monthlySummaries
      .map((s) => `### ${localeStrings.monthNames[(s.month ?? 1) - 1]}\n${s.content}`)
      .join('\n\n');

    const year = monthlySummaries[0].year;
    const messages = this.buildMessages(this.prompts.yearly, {
      monthlySummaries: summariesText,
      year: year.toString(),
    });
    const generationConfig = getGenerationConfigForType(this.config, 'yearly');

    return this.generate(messages, generationConfig);
  }

  /**
   * Build messages array from prompt template
   * Separates system message (cacheable) from user message (dynamic)
   */
  private buildMessages(
    template: PromptTemplate,
    variables: Record<string, string>
  ): ModelMessage[] {
    const messages: ModelMessage[] = [];

    // System message (static, cacheable)
    if (template.system) {
      messages.push({
        role: 'system',
        content: template.system,
      });
    }

    // User message with variable substitution (dynamic)
    if (template.user) {
      messages.push({
        role: 'user',
        content: buildPrompt(template.user, variables),
      });
    }

    return messages;
  }

  /**
   * Generate content using messages array format
   * Using messages array enables prompt caching for system messages
   */
  private async generate(
    messages: ModelMessage[],
    generationConfig: AIGenerationConfig
  ): Promise<GeneratedContent> {
    try {
      const result = await generateText({
        model: this.model,
        messages,
        maxOutputTokens: generationConfig.maxTokens,
        temperature: generationConfig.temperature,
        topP: generationConfig.topP,
        topK: generationConfig.topK ?? undefined,
        presencePenalty: generationConfig.presencePenalty,
        frequencyPenalty: generationConfig.frequencyPenalty,
        stopSequences:
          generationConfig.stopSequences.length > 0 ? generationConfig.stopSequences : undefined,
        seed: generationConfig.seed ?? undefined,
        maxRetries: generationConfig.maxRetries,
      });

      return {
        content: result.text,
        metadata: {
          tokensUsed: result.usage?.totalTokens ?? 0,
          model: this.config.model.id,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      throw new AIServiceError(
        error instanceof Error ? error.message : 'AI generation failed',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get current configuration (for debugging/logging)
   */
  getConfig(): AIConfig {
    return this.config;
  }

  /**
   * Get current locale (for debugging/logging)
   */
  getLocale(): Locale {
    return this.locale;
  }
}
