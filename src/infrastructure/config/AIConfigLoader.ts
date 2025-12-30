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
    id: 'gpt-5-mini-2025-08-07',
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
 * English prompt templates
 */
const englishPromptTemplates: PromptTemplates = {
  weekly: {
    system: `You are an assistant that creates activity summaries.

Analyze the post logs provided by the user and create a weekly activity summary.

## Output Requirements
1. **Highlights**: Summarize the main activities and achievements of this week in 3-5 points
2. **Category Organization**: Categorize activities appropriately
3. **Challenges & Insights**: Summarize challenges faced and insights gained
4. **Carryover Items**: List items that need to continue next week (if any)

## Important Rules
- Output ONLY the summary content
- Do NOT ask questions or make interactive suggestions
- Do NOT offer to create tickets or assign tasks
- Keep the summary concise and factual

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

## Important Rules
- Output ONLY the summary content
- Do NOT ask questions or make interactive suggestions
- Do NOT offer to create tickets or assign tasks
- Keep the summary concise and factual

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

## Important Rules
- Output ONLY the summary content
- Do NOT ask questions or make interactive suggestions
- Do NOT offer to create tickets or assign tasks
- Keep the summary concise and factual

Output in Markdown format.`,
    user: `Below are the monthly summaries for {{year}}. Please analyze and create an annual summary.

{{monthlySummaries}}`,
  },
};

/**
 * Japanese prompt templates
 */
const japanesePromptTemplates: PromptTemplates = {
  weekly: {
    system: `あなたは活動サマリーを作成するアシスタントです。

ユーザーから提供される投稿ログを分析し、週次活動サマリーを作成してください。

## 出力スタイル
- **網羅性より強弱を重視**: すべてを列挙するのではなく、重要度・インパクトに応じてメリハリをつける
- **ハイライト優先**: 特に重要な成果や出来事を目立たせる
- **簡潔さ重視**: 詳細よりも要点を押さえた記述を心がける

## 出力構成
1. **今週のハイライト**: 最も重要な1-3個の成果・出来事（★で強調）
2. **活動まとめ**: その他の主要な活動を簡潔に（3-5点）

## 重要なルール
- サマリーの内容のみを出力すること
- 質問や対話的な提案をしないこと
- チケット作成や担当アサインの提案をしないこと
- 細かい作業の羅列ではなく、意味のあるまとまりで記述すること

Markdown形式で出力してください。`,
    user: `以下は今週の投稿ログです。重要なものに強弱をつけてサマリーを作成してください。

{{posts}}`,
  },

  monthly: {
    system: `あなたは活動サマリーを作成するアシスタントです。

ユーザーから提供される週次サマリーを分析し、月次活動サマリーを作成してください。

## 出力スタイル
- **網羅性より強弱を重視**: すべてを列挙するのではなく、月を代表する重要な成果にフォーカス
- **ストーリー性**: 個別の出来事ではなく、月全体の流れ・テーマを意識
- **インパクト重視**: 数字や具体的な成果があれば強調

## 出力構成
1. **今月のキーポイント**: 最も重要な2-3個の成果（★で強調）
2. **月間サマリー**: 主要な活動・進捗を5-7点で

## 重要なルール
- サマリーの内容のみを出力すること
- 質問や対話的な提案をしないこと
- チケット作成や担当アサインの提案をしないこと
- 週次サマリーの繰り返しではなく、月として俯瞰した視点で記述すること

Markdown形式で出力してください。`,
    user: `以下は今月の週次サマリーです。月全体として重要なものに強弱をつけてサマリーを作成してください。

{{weeklySummaries}}`,
  },

  yearly: {
    system: `あなたは活動サマリーを作成するアシスタントです。

ユーザーから提供される月次サマリーを分析し、年間活動サマリーを作成してください。

## 出力スタイル
- **網羅性より強弱を重視**: 年を代表する重要な成果・転機にフォーカス
- **成長ストーリー**: 1年を通じた変化・成長の物語を意識
- **ハイライト重視**: 誇れる成果、大きな挑戦、ターニングポイントを強調

## 出力構成
1. **年間ベスト**: 最も誇れる3-5個の成果（★★で強調）
2. **成長の軌跡**: スキル・経験面での成長を3-5点
3. **チャレンジと学び**: 困難を乗り越えた経験や重要な学び

## 重要なルール
- サマリーの内容のみを出力すること
- 質問や対話的な提案をしないこと
- チケット作成や担当アサインの提案をしないこと
- 月次サマリーの繰り返しではなく、年として俯瞰した視点で記述すること

Markdown形式で出力してください。`,
    user: `以下は{{year}}年の月次サマリーです。年全体として重要なものに強弱をつけてサマリーを作成してください。

{{monthlySummaries}}`,
  },
};

/**
 * Default prompt templates (fallback to English)
 */
export const defaultPromptTemplates: PromptTemplates = englishPromptTemplates;

/**
 * Get prompt templates for a specific locale
 */
export function getPromptTemplates(locale: Locale): PromptTemplates {
  switch (locale) {
    case 'ja_JP':
      return japanesePromptTemplates;
    default:
      return englishPromptTemplates;
  }
}

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
