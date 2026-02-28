import { Hono } from 'hono';
import { DateRange, SlackChannel, Summary } from '@/domain';
import { AIService } from '@/infrastructure/ai';
import { defaultAIConfig, type Locale } from '@/infrastructure/config';
import { DateService } from '@/infrastructure/date';
import { JobRepository } from '@/infrastructure/firestore';
import {
  decodePubSubMessage,
  type PostingTaskMessage,
  PubSubClient,
  type PubSubPushMessage,
  type SummaryJobMessage,
  type WeekTaskMessage,
} from '@/infrastructure/pubsub';
import { SlackRepository } from '@/infrastructure/slack';
import { loadConfig, loadWorkspaceConfig } from '@/shared/config';
import type { Env } from '@/shared/types';
import { GenerateWeeklySummary } from '@/usecases';

const pubsubRoutes = new Hono<{ Bindings: Env }>();

/**
 * Verify Pub/Sub push request
 * In production, this should verify the JWT token from Pub/Sub
 */
function verifyPubSubRequest(_authHeader: string | undefined): boolean {
  // For now, accept all requests from Cloud Run internal traffic
  // In production, implement JWT verification from Pub/Sub
  // See: https://cloud.google.com/pubsub/docs/push#authentication
  return true;
}

/**
 * Job orchestrator endpoint
 * Receives job from Pub/Sub and creates week tasks for yearly summaries
 */
pubsubRoutes.post('/pubsub/orchestrate', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!verifyPubSubRequest(authHeader)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = (await c.req.json()) as PubSubPushMessage<SummaryJobMessage>;
    const message = decodePubSubMessage<SummaryJobMessage>(body.message.data);

    console.log(`Orchestrator received job: ${message.jobId}`);

    const jobRepository = new JobRepository();
    const job = await jobRepository.getJob(message.jobId);

    if (!job) {
      console.error(`Job not found: ${message.jobId}`);
      return c.json({ error: 'Job not found' }, 404);
    }

    // Update job status to processing
    await jobRepository.updateJobStatus(job.id, 'processing');

    const pubsubClient = new PubSubClient();
    const dateService = new DateService();

    switch (job.type) {
      case 'weekly': {
        // For weekly, just process directly (single task)
        const weeks = [dateService.getWeekRange(new Date())];
        const weekTask: WeekTaskMessage = {
          jobId: job.id,
          weekNumber: dateService.getWeekNumber(weeks[0].start),
          year: job.year,
          dateRange: {
            start: weeks[0].start.toISOString(),
            end: weeks[0].end.toISOString(),
          },
        };
        await pubsubClient.publishWeekTask(weekTask);
        console.log(`Published 1 week task for weekly job ${job.id}`);
        break;
      }

      case 'monthly': {
        // For monthly, create tasks for each week in the month
        const weeks = dateService.getWeeksOverlappingMonth(job.year, job.month ?? 1);
        const weekTasks: WeekTaskMessage[] = weeks.map((week, index) => ({
          jobId: job.id,
          weekNumber: index + 1, // Month-relative week number
          year: job.year,
          dateRange: {
            start: week.start.toISOString(),
            end: week.end.toISOString(),
          },
        }));

        // Update total tasks
        await jobRepository.updateJobStatus(job.id, 'processing');

        // Create week tasks in Firestore
        await jobRepository.createWeekTasksBatch(weekTasks);

        // Publish all week tasks
        await pubsubClient.publishWeekTasksBatch(weekTasks);
        console.log(`Published ${weekTasks.length} week tasks for monthly job ${job.id}`);
        break;
      }

      case 'yearly': {
        // For yearly, create tasks for all weeks in the year
        const weeks = dateService.getAllWeeksInYear(job.year);
        const weekTasks: WeekTaskMessage[] = weeks.map((week, index) => ({
          jobId: job.id,
          weekNumber: index + 1,
          year: job.year,
          dateRange: {
            start: week.start.toISOString(),
            end: week.end.toISOString(),
          },
        }));

        // Create week tasks in Firestore
        await jobRepository.createWeekTasksBatch(weekTasks);

        // Publish all week tasks
        await pubsubClient.publishWeekTasksBatch(weekTasks);
        console.log(`Published ${weekTasks.length} week tasks for yearly job ${job.id}`);
        break;
      }
    }

    return c.json({ success: true, jobId: job.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Orchestrator error:', errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * Week worker endpoint
 * Processes a single week's summary
 */
pubsubRoutes.post('/pubsub/week-worker', async (c) => {
  const env = c.env;
  const authHeader = c.req.header('Authorization');

  if (!verifyPubSubRequest(authHeader)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = (await c.req.json()) as PubSubPushMessage<WeekTaskMessage>;
    const message = decodePubSubMessage<WeekTaskMessage>(body.message.data);

    console.log(`Week worker received task: job=${message.jobId}, week=${message.weekNumber}`);

    const jobRepository = new JobRepository();
    const job = await jobRepository.getJob(message.jobId);

    if (!job) {
      console.error(`Job not found: ${message.jobId}`);
      return c.json({ error: 'Job not found' }, 404);
    }

    // Skip if job is already completed or errored
    if (job.status === 'completed' || job.status === 'error') {
      console.log(`Job ${job.id} already ${job.status}, skipping week ${message.weekNumber}`);
      return c.json({ success: true, skipped: true });
    }

    // Load configuration
    const envRecord = env as unknown as Record<string, string | undefined>;
    const config = loadConfig(envRecord);
    const workspaceConfig = loadWorkspaceConfig(envRecord);
    const locale = config.app.locale as Locale;

    // Create services
    const aiService = new AIService({
      apiKey: config.ai.apiKey,
      config: {
        model: {
          provider: config.ai.provider,
          id: config.ai.model,
        },
        generation: {
          ...defaultAIConfig.generation,
          maxTokens: config.ai.maxTokens,
        },
      },
      locale,
    });

    // Apply job options to workspace config
    const finalWorkspaceConfig = {
      ...workspaceConfig,
      includePrivateChannels: job.options.includePrivate,
      includeDirectMessages: job.options.includeDM,
      includeGroupMessages: job.options.includeGroup,
    };

    const slackRepository = new SlackRepository(
      env.SLACK_BOT_TOKEN,
      finalWorkspaceConfig,
      locale,
      job.userToken
    );

    // Create channel for posting (but we won't post individual weeks)
    const channel = SlackChannel.create(job.channelId, job.threadTs);

    // Parse date range
    const startDate = new Date(message.dateRange.start);

    // Generate weekly summary
    const usecase = new GenerateWeeklySummary(slackRepository, aiService);
    const result = await usecase.execute({
      userId: job.userId,
      targetDate: startDate,
      year: job.year,
      channel, // Not used for posting in batch mode
    });

    let content: string | undefined;
    let error: string | undefined;

    if (result.ok) {
      content = result.value.content;
      console.log(`Week ${message.weekNumber} summary generated for job ${job.id}`);
    } else {
      // For "no posts found", treat as empty content rather than error
      if (result.error.message.includes('No posts found')) {
        content = ''; // Empty content for weeks with no posts
        console.log(`Week ${message.weekNumber}: No posts found for job ${job.id}`);
      } else {
        error = result.error.message;
        console.error(`Week ${message.weekNumber} error: ${error}`);
      }
    }

    // Update week task in Firestore
    await jobRepository.updateWeekTask(job.id, message.weekNumber, {
      status: error ? 'error' : 'completed',
      content,
      error,
    });

    // Increment completed tasks counter
    const completedCount = await jobRepository.incrementCompletedTasks(job.id);

    // Check if all tasks are complete
    if (completedCount >= job.totalTasks) {
      console.log(`All ${job.totalTasks} tasks complete for job ${job.id}, triggering posting`);

      // Publish posting task
      const pubsubClient = new PubSubClient();
      await pubsubClient.publishPostingTask({ jobId: job.id });
    }

    return c.json({ success: true, weekNumber: message.weekNumber });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Week worker error:', errorMessage);
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * Posting endpoint
 * Posts all results to Slack after all week tasks complete
 */
pubsubRoutes.post('/pubsub/posting', async (c) => {
  const env = c.env;
  const authHeader = c.req.header('Authorization');

  if (!verifyPubSubRequest(authHeader)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = (await c.req.json()) as PubSubPushMessage<PostingTaskMessage>;
    const message = decodePubSubMessage<PostingTaskMessage>(body.message.data);

    console.log(`Posting worker received job: ${message.jobId}`);

    const jobRepository = new JobRepository();
    const job = await jobRepository.getJob(message.jobId);

    if (!job) {
      console.error(`Job not found: ${message.jobId}`);
      return c.json({ error: 'Job not found' }, 404);
    }

    // Update job status to posting
    await jobRepository.updateJobStatus(job.id, 'posting');

    // Load configuration
    const envRecord = env as unknown as Record<string, string | undefined>;
    const config = loadConfig(envRecord);
    const workspaceConfig = loadWorkspaceConfig(envRecord);
    const locale = config.app.locale as Locale;

    // Create services
    const aiService = new AIService({
      apiKey: config.ai.apiKey,
      config: {
        model: {
          provider: config.ai.provider,
          id: config.ai.model,
        },
        generation: {
          ...defaultAIConfig.generation,
          maxTokens: config.ai.maxTokens,
        },
      },
      locale,
    });

    const slackRepository = new SlackRepository(
      env.SLACK_BOT_TOKEN,
      workspaceConfig,
      locale,
      job.userToken
    );

    // Get all week tasks
    const weekTasks = await jobRepository.getWeekTasks(job.id);

    // Filter tasks with content (non-empty)
    const tasksWithContent = weekTasks.filter((task) => task.content && task.content.length > 0);

    if (tasksWithContent.length === 0) {
      // No content found, post error message
      await slackRepository.postToSelfDM({
        channelId: job.channelId,
        text: `❌ No posts found for ${job.type} summary.`,
        threadTs: job.threadTs,
      });

      await jobRepository.updateJobStatus(job.id, 'completed');
      return c.json({ success: true, noContent: true });
    }

    switch (job.type) {
      case 'weekly': {
        // For weekly, post the single week's content directly
        const weekTask = tasksWithContent[0];
        if (weekTask?.content) {
          await slackRepository.postToSelfDM({
            channelId: job.channelId,
            text: weekTask.content,
            threadTs: job.threadTs,
          });
        }
        break;
      }

      case 'monthly': {
        // For monthly, aggregate weeks and generate monthly summary
        const weeklySummaries = tasksWithContent.map((task, index) => {
          const start = new Date(task.dateRange.start);
          const end = new Date(task.dateRange.end);
          return Summary.createWeekly({
            content: task.content ?? '',
            dateRange: DateRange.create(start, end),
            year: job.year,
            weekNumber: index + 1,
          });
        });
        const monthlySummary = await aiService.generateMonthlySummary(weeklySummaries);

        await slackRepository.postToSelfDM({
          channelId: job.channelId,
          text: monthlySummary.content,
          threadTs: job.threadTs,
        });
        break;
      }

      case 'yearly': {
        // For yearly, we need to:
        // 1. Group weeks by month
        // 2. Generate monthly summaries in parallel
        // 3. Post monthly summaries to Slack sequentially (preserve order + rate limiting)
        // 4. Generate and post yearly summary

        const groupedByMonth = groupWeeksByMonth(tasksWithContent);

        // Sort month entries to preserve chronological order
        const monthEntries = Object.entries(groupedByMonth)
          .map(([month, weeks]) => ({ monthNum: Number(month), weeks }))
          .sort((a, b) => a.monthNum - b.monthNum);

        // Generate all monthly summaries in parallel
        const monthlyResults = await Promise.all(
          monthEntries.map(async ({ monthNum, weeks }) => {
            const weeklySummaries = weeks
              .map((w, index) => {
                if (!w.content || w.content.length === 0) return null;
                const start = new Date(w.dateRange.start);
                const end = new Date(w.dateRange.end);
                return Summary.createWeekly({
                  content: w.content,
                  dateRange: DateRange.create(start, end),
                  year: job.year,
                  weekNumber: index + 1,
                });
              })
              .filter((s): s is Summary => s !== null);

            if (weeklySummaries.length === 0) return null;

            const monthly = await aiService.generateMonthlySummary(weeklySummaries);
            const monthStart = new Date(job.year, monthNum - 1, 1);
            const monthEnd = new Date(job.year, monthNum, 0); // Last day of month

            return {
              monthNum,
              content: monthly.content,
              summary: Summary.createMonthly({
                content: monthly.content,
                dateRange: DateRange.create(monthStart, monthEnd),
                year: job.year,
                month: monthNum,
              }),
            };
          })
        );

        // Filter out months with no posts
        const validMonths = monthlyResults.filter(
          (r): r is NonNullable<typeof r> => r !== null
        );

        // Post monthly summaries to Slack sequentially (preserve order + rate limiting)
        const monthlySummaries: Summary[] = [];
        for (const { monthNum, content, summary } of validMonths) {
          await slackRepository.postToSelfDM({
            channelId: job.channelId,
            text: `📅 *${getMonthName(monthNum, locale)}*\n\n${content}`,
            threadTs: job.threadTs,
          });
          monthlySummaries.push(summary);
          await sleep(1000);
        }

        // Generate and post yearly summary
        if (monthlySummaries.length > 0) {
          const yearly = await aiService.generateYearlySummary(monthlySummaries);

          await slackRepository.postToSelfDM({
            channelId: job.channelId,
            text: `🎉 *${job.year} Year Summary*\n\n${yearly.content}`,
            threadTs: job.threadTs,
          });
        }
        break;
      }
    }

    // Post completion message
    await slackRepository.postToSelfDM({
      channelId: job.channelId,
      text: `✅ ${job.type.charAt(0).toUpperCase() + job.type.slice(1)} summary completed!`,
      threadTs: job.threadTs,
    });

    // Update job status
    await jobRepository.updateJobStatus(job.id, 'completed');

    console.log(`Job ${job.id} completed successfully`);

    return c.json({ success: true, jobId: job.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Posting worker error:', errorMessage);

    // Try to update job status to error
    try {
      const body = (await c.req.json()) as PubSubPushMessage<PostingTaskMessage>;
      const message = decodePubSubMessage<PostingTaskMessage>(body.message.data);
      const jobRepository = new JobRepository();
      await jobRepository.updateJobStatus(message.jobId, 'error', errorMessage);
    } catch {
      // Ignore error updating status
    }

    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * Group week tasks by month
 */
function groupWeeksByMonth(
  tasks: Array<{ weekNumber: number; dateRange: { start: string; end: string }; content?: string }>
): Record<
  string,
  Array<{ weekNumber: number; dateRange: { start: string; end: string }; content?: string }>
> {
  const grouped: Record<
    string,
    Array<{ weekNumber: number; dateRange: { start: string; end: string }; content?: string }>
  > = {};

  for (const task of tasks) {
    const date = new Date(task.dateRange.start);
    const month = date.getMonth() + 1;

    if (!grouped[month]) {
      grouped[month] = [];
    }

    grouped[month].push({
      weekNumber: task.weekNumber,
      dateRange: task.dateRange,
      content: task.content,
    });
  }

  return grouped;
}

/**
 * Get month name
 */
function getMonthName(month: number, locale: Locale): string {
  const date = new Date(2025, month - 1, 1);
  return date.toLocaleDateString(locale === 'ja_JP' ? 'ja-JP' : 'en-US', { month: 'long' });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { pubsubRoutes };
