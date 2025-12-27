import { parse as parseYaml } from 'yaml';

/**
 * Supported locales for output
 */
export type Locale = 'en_US' | 'ja_JP';

/**
 * Locale-specific strings
 */
export interface LocaleStrings {
  monthNames: string[];
  weekLabel: string;
  periodLabel: string;
}

/**
 * Locale configurations
 */
export const localeConfigs: Record<Locale, LocaleStrings> = {
  en_US: {
    monthNames: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    weekLabel: 'Week',
    periodLabel: '📅 Period:',
  },
  ja_JP: {
    monthNames: [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ],
    weekLabel: '第週',
    periodLabel: '📅 期間:',
  },
};

/**
 * Get locale strings for a specific locale
 */
export function getLocaleStrings(locale: Locale): LocaleStrings {
  return localeConfigs[locale];
}

/**
 * AI configuration structure
 */
export interface AIModelConfig {
  provider: string;
  id: string;
}

export interface AIGenerationConfig {
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number | null;
  presencePenalty: number;
  frequencyPenalty: number;
  stopSequences: string[];
  seed: number | null;
  maxRetries: number;
}

export interface AISummaryOverrides {
  weekly?: Partial<AIGenerationConfig>;
  monthly?: Partial<AIGenerationConfig>;
  yearly?: Partial<AIGenerationConfig>;
}

export interface AIConfig {
  model: AIModelConfig;
  generation: AIGenerationConfig;
  summaryOverrides?: AISummaryOverrides;
}

/**
 * Default AI configuration
 */
export const defaultAIConfig: AIConfig = {
  model: {
    provider: 'openai',
    id: 'gpt-4.1-mini-2025-04-14',
  },
  generation: {
    maxTokens: 4096,
    temperature: 0.7,
    topP: 0.9,
    topK: null,
    presencePenalty: 0,
    frequencyPenalty: 0,
    stopSequences: [],
    seed: null,
    maxRetries: 2,
  },
};

/**
 * Load AI configuration from YAML string
 */
export function loadAIConfig(yamlContent: string): AIConfig {
  try {
    const parsed = parseYaml(yamlContent) as Partial<AIConfig>;
    return mergeWithDefaults(parsed);
  } catch {
    console.warn('Failed to parse AI config, using defaults');
    return defaultAIConfig;
  }
}

/**
 * Merge parsed config with defaults
 */
function mergeWithDefaults(parsed: Partial<AIConfig>): AIConfig {
  return {
    model: {
      ...defaultAIConfig.model,
      ...parsed.model,
    },
    generation: {
      ...defaultAIConfig.generation,
      ...parsed.generation,
    },
    summaryOverrides: parsed.summaryOverrides,
  };
}

/**
 * Get generation config for specific summary type
 */
export function getGenerationConfigForType(
  config: AIConfig,
  type: 'weekly' | 'monthly' | 'yearly'
): AIGenerationConfig {
  const baseConfig = config.generation;
  const overrides = config.summaryOverrides?.[type];

  if (!overrides) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...overrides,
  };
}

/**
 * Single prompt template with system and user parts
 */
export interface PromptTemplate {
  system: string;
  user: string;
}

/**
 * Prompt templates structure (cache-optimized with system/user separation)
 */
export interface PromptTemplates {
  weekly: PromptTemplate;
  monthly: PromptTemplate;
  yearly: PromptTemplate;
}

/**
 * Default prompt templates (fallback)
 * Split into system (cacheable) and user (dynamic) parts
 * Default language: English (en_US)
 */
export const defaultPromptTemplates: PromptTemplates = {
  weekly: {
    system: `You are an assistant that creates activity summaries.

Analyze the post logs provided by the user and create a weekly activity summary.

## Output Requirements
1. **Highlights**: Summarize the main activities and achievements of this week in 3-5 points
2. **Category Organization**: Categorize activities appropriately
3. **Challenges & Insights**: Summarize challenges faced and insights gained
4. **Next Week's Priorities**: Summarize items that carry over to next week

Output in Markdown format.`,
    user: `Below are this week's post logs. Please analyze and create a summary.

{{posts}}`,
  },

  monthly: {
    system: `You are an assistant that creates activity summaries.

Analyze the weekly summaries provided by the user and create a monthly activity summary.

## Output Requirements
1. **Monthly Highlights**: Summarize the main achievements and activities of this month in 5-7 points
2. **Progress Status**: Summarize the progress of major projects
3. **Growth & Learning**: Summarize growth achieved throughout this month
4. **Retrospective**: Organize what went well and areas for improvement
5. **Next Month's Outlook**: Summarize the direction for next month

Output in Markdown format.`,
    user: `Below are this month's weekly summaries. Please analyze and create a monthly summary.

{{weeklySummaries}}`,
  },

  yearly: {
    system: `You are an assistant that creates activity summaries.

Analyze the monthly summaries provided by the user and create an annual activity summary.

## Output Requirements
1. **Annual Highlights**: Summarize the important achievements of this year in 7-10 points
2. **Project Summary**: Reflect on the achievements and learnings from major projects
3. **Skill Growth**: Summarize skills and knowledge that have grown
4. **Year in Numbers**: Show quantitative achievements
5. **Annual Retrospective**: Reflect on successes and challenges
6. **Next Year's Outlook**: Suggest goals for next year

Output in Markdown format.`,
    user: `Below are the monthly summaries for {{year}}. Please analyze and create an annual summary.

{{monthlySummaries}}`,
  },
};

/**
 * Load prompt template from markdown content
 * Parses markdown with "## System Message" and "## User Message" sections
 */
export function loadPromptTemplate(markdownContent: string): PromptTemplate {
  const systemMatch = markdownContent.match(
    /## System Message\s*\n([\s\S]*?)(?=\n---\n|\n## User Message|$)/
  );
  const userMatch = markdownContent.match(/## User Message\s*\n([\s\S]*?)$/);

  const system = systemMatch ? systemMatch[1].trim() : '';
  const user = userMatch ? userMatch[1].trim() : '';

  // Fallback: if no sections found, treat entire content as system message
  if (!system && !user) {
    return {
      system: markdownContent.trim(),
      user: '',
    };
  }

  return { system, user };
}

/**
 * Build prompt with variable substitution
 */
export function buildPrompt(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}
