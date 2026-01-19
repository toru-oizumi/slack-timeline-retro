import { PubSub } from '@google-cloud/pubsub';
import {
  type PostingTaskMessage,
  PUBSUB_TOPICS,
  type SummaryJobMessage,
  type WeekTaskMessage,
} from './types';

/**
 * Pub/Sub client for publishing messages to topics
 * Uses Application Default Credentials in Cloud Run
 */
export class PubSubClient {
  private readonly client: PubSub;
  private readonly projectId: string;

  constructor(projectId?: string) {
    this.projectId = projectId ?? process.env.GCP_PROJECT ?? '';
    this.client = new PubSub({
      projectId: this.projectId || undefined, // undefined uses ADC project
    });
  }

  /**
   * Publish a message to start job processing (orchestrator)
   */
  async publishSummaryJob(message: SummaryJobMessage): Promise<string> {
    return this.publish(PUBSUB_TOPICS.SUMMARY_JOBS, message);
  }

  /**
   * Publish a message for week processing (parallel workers)
   */
  async publishWeekTask(message: WeekTaskMessage): Promise<string> {
    return this.publish(PUBSUB_TOPICS.WEEKLY_TASKS, message);
  }

  /**
   * Publish multiple week tasks in batch for efficiency
   */
  async publishWeekTasksBatch(messages: WeekTaskMessage[]): Promise<string[]> {
    const topic = this.client.topic(PUBSUB_TOPICS.WEEKLY_TASKS);
    const messageIds: string[] = [];

    // Batch publish for efficiency
    for (const message of messages) {
      const data = Buffer.from(JSON.stringify(message));
      const messageId = await topic.publishMessage({ data });
      messageIds.push(messageId);
    }

    console.log(
      `Published ${messages.length} week tasks to ${PUBSUB_TOPICS.WEEKLY_TASKS}, message IDs: ${messageIds.slice(0, 3).join(', ')}...`
    );
    return messageIds;
  }

  /**
   * Publish a message to trigger result posting
   */
  async publishPostingTask(message: PostingTaskMessage): Promise<string> {
    return this.publish(PUBSUB_TOPICS.POSTING_TASKS, message);
  }

  /**
   * Generic publish method
   */
  private async publish<T>(topicName: string, message: T): Promise<string> {
    const topic = this.client.topic(topicName);
    const data = Buffer.from(JSON.stringify(message));

    const messageId = await topic.publishMessage({ data });
    console.log(`Published to ${topicName}, message ID: ${messageId}`);
    return messageId;
  }

  /**
   * Check if Pub/Sub is available (for health checks)
   */
  async healthCheck(): Promise<boolean> {
    try {
      const [topics] = await this.client.getTopics();
      const topicNames = topics.map((t) => t.name);
      const hasRequiredTopic = topicNames.some((name) => name.includes(PUBSUB_TOPICS.SUMMARY_JOBS));
      return hasRequiredTopic;
    } catch (error) {
      console.error('Pub/Sub health check failed:', error);
      return false;
    }
  }
}
