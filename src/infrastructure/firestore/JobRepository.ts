import { Firestore, Timestamp } from '@google-cloud/firestore';
import type { JobStatus, SummaryOptions, SummaryType, WeekTaskStatus } from '../pubsub/types';

/**
 * Job document stored in Firestore
 */
export interface JobDocument {
  id: string;
  type: SummaryType;
  year: number;
  /** All years for multi-year pipeline jobs (e.g. culture analysis with YoY comparison). */
  years?: number[];
  month?: number;
  /** Pipeline ID when using configurable pipelines. Absent for legacy jobs. */
  pipelineId?: string;
  userId: string;
  channelId: string;
  threadTs: string;
  userToken: string; // Encrypted in production, but stored as-is for now
  status: JobStatus;
  totalTasks: number;
  completedTasks: number;
  options: SummaryOptions;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Week task document stored in Firestore
 */
export interface WeekTaskDocument {
  jobId: string;
  weekNumber: number;
  year: number;
  dateRange: {
    start: string; // ISO date string
    end: string; // ISO date string
  };
  status: WeekTaskStatus;
  content?: string; // Generated summary content
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for creating a new job
 */
export interface CreateJobParams {
  type: SummaryType;
  year: number;
  /** All years for multi-year pipeline jobs. When provided, job covers all specified years. */
  years?: number[];
  month?: number;
  /** Pipeline ID when using configurable pipelines. Omit for legacy jobs. */
  pipelineId?: string;
  userId: string;
  channelId: string;
  threadTs: string;
  userToken: string;
  totalTasks: number;
  options: SummaryOptions;
}

/**
 * Parameters for creating a week task
 */
export interface CreateWeekTaskParams {
  jobId: string;
  weekNumber: number;
  year: number;
  dateRange: {
    start: string;
    end: string;
  };
}

/**
 * Repository for managing summary jobs in Firestore
 */
export class JobRepository {
  private readonly db: Firestore;
  private readonly jobsCollection = 'summary_jobs';
  private readonly weeksSubcollection = 'weeks';

  constructor() {
    this.db = new Firestore();
  }

  /**
   * Generate a unique job ID
   */
  generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create a new job
   */
  async createJob(params: CreateJobParams): Promise<JobDocument> {
    const jobId = this.generateJobId();
    const now = new Date();

    const job: JobDocument = {
      id: jobId,
      type: params.type,
      year: params.year,
      userId: params.userId,
      channelId: params.channelId,
      threadTs: params.threadTs,
      userToken: params.userToken,
      status: 'pending',
      totalTasks: params.totalTasks,
      completedTasks: 0,
      options: params.options,
      createdAt: now,
      updatedAt: now,
    };

    // Optional fields: omit undefined to satisfy Firestore's strict type requirements
    if (params.years !== undefined) job.years = params.years;
    if (params.month !== undefined) job.month = params.month;
    if (params.pipelineId !== undefined) job.pipelineId = params.pipelineId;

    await this.db
      .collection(this.jobsCollection)
      .doc(jobId)
      .set({
        ...job,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

    console.log(`Job created: ${jobId}, type: ${params.type}, totalTasks: ${params.totalTasks}`);
    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<JobDocument | null> {
    const doc = await this.db.collection(this.jobsCollection).doc(jobId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return {
      id: jobId,
      type: data.type,
      year: data.year,
      years: data.years as number[] | undefined,
      month: data.month,
      pipelineId: data.pipelineId,
      userId: data.userId,
      channelId: data.channelId,
      threadTs: data.threadTs,
      userToken: data.userToken,
      status: data.status,
      totalTasks: data.totalTasks,
      completedTasks: data.completedTasks,
      options: data.options,
      errorMessage: data.errorMessage,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
    };
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: Timestamp.now(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    await this.db.collection(this.jobsCollection).doc(jobId).update(updateData);
    console.log(`Job ${jobId} status updated to: ${status}`);
  }

  /**
   * Atomically transition job status from 'processing' to 'posting'.
   * Uses a Firestore transaction so only the first caller succeeds — subsequent
   * callers (Pub/Sub retries or race-condition duplicates) get false and should skip.
   *
   * @returns true if this caller acquired the posting lock, false if already taken.
   */
  async tryTransitionToPosting(jobId: string): Promise<boolean> {
    const jobRef = this.db.collection(this.jobsCollection).doc(jobId);

    return this.db.runTransaction(async (transaction) => {
      const jobDoc = await transaction.get(jobRef);
      const status = jobDoc.data()?.status as JobStatus | undefined;

      if (status !== 'processing') {
        return false;
      }

      transaction.update(jobRef, { status: 'posting', updatedAt: Timestamp.now() });
      return true;
    });
  }

  /**
   * Create a week task
   */
  async createWeekTask(params: CreateWeekTaskParams): Promise<WeekTaskDocument> {
    const now = new Date();
    const weekId = `week_${params.weekNumber.toString().padStart(2, '0')}`;

    const weekTask: WeekTaskDocument = {
      jobId: params.jobId,
      weekNumber: params.weekNumber,
      year: params.year,
      dateRange: params.dateRange,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await this.db
      .collection(this.jobsCollection)
      .doc(params.jobId)
      .collection(this.weeksSubcollection)
      .doc(weekId)
      .set({
        ...weekTask,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

    return weekTask;
  }

  /**
   * Create multiple week tasks in batch
   */
  async createWeekTasksBatch(tasks: CreateWeekTaskParams[]): Promise<void> {
    const batch = this.db.batch();
    const now = Timestamp.now();

    for (const task of tasks) {
      const weekId = `week_${task.weekNumber.toString().padStart(2, '0')}`;
      const ref = this.db
        .collection(this.jobsCollection)
        .doc(task.jobId)
        .collection(this.weeksSubcollection)
        .doc(weekId);

      batch.set(ref, {
        jobId: task.jobId,
        weekNumber: task.weekNumber,
        year: task.year,
        dateRange: task.dateRange,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    }

    await batch.commit();
    console.log(`Created ${tasks.length} week tasks for job ${tasks[0]?.jobId}`);
  }

  /**
   * Update week task with result
   */
  async updateWeekTask(
    jobId: string,
    weekNumber: number,
    update: {
      status: WeekTaskStatus;
      content?: string;
      error?: string;
    }
  ): Promise<void> {
    const weekId = `week_${weekNumber.toString().padStart(2, '0')}`;

    const updateData: Record<string, unknown> = {
      status: update.status,
      updatedAt: Timestamp.now(),
    };
    if (update.content !== undefined) updateData.content = update.content;
    if (update.error !== undefined) updateData.error = update.error;

    await this.db
      .collection(this.jobsCollection)
      .doc(jobId)
      .collection(this.weeksSubcollection)
      .doc(weekId)
      .update(updateData);

    console.log(`Week ${weekNumber} for job ${jobId} updated to: ${update.status}`);
  }

  /**
   * Get a week task
   */
  async getWeekTask(jobId: string, weekNumber: number): Promise<WeekTaskDocument | null> {
    const weekId = `week_${weekNumber.toString().padStart(2, '0')}`;
    const doc = await this.db
      .collection(this.jobsCollection)
      .doc(jobId)
      .collection(this.weeksSubcollection)
      .doc(weekId)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return {
      jobId,
      weekNumber: data.weekNumber,
      year: data.year,
      dateRange: data.dateRange,
      status: data.status,
      content: data.content,
      error: data.error,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
    };
  }

  /**
   * Get all week tasks for a job
   */
  async getWeekTasks(jobId: string): Promise<WeekTaskDocument[]> {
    const snapshot = await this.db
      .collection(this.jobsCollection)
      .doc(jobId)
      .collection(this.weeksSubcollection)
      .orderBy('weekNumber')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        jobId,
        weekNumber: data.weekNumber,
        year: data.year,
        dateRange: data.dateRange,
        status: data.status,
        content: data.content,
        error: data.error,
        createdAt: data.createdAt?.toDate() ?? new Date(),
        updatedAt: data.updatedAt?.toDate() ?? new Date(),
      };
    });
  }

  /**
   * Increment completed task count and return new count
   * Uses transaction for atomicity
   */
  async incrementCompletedTasks(jobId: string): Promise<number> {
    const jobRef = this.db.collection(this.jobsCollection).doc(jobId);

    const newCount = await this.db.runTransaction(async (transaction) => {
      const jobDoc = await transaction.get(jobRef);

      if (!jobDoc.exists) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const data = jobDoc.data();
      const currentCount = data?.completedTasks ?? 0;
      const newCompletedCount = currentCount + 1;

      transaction.update(jobRef, {
        completedTasks: newCompletedCount,
        updatedAt: Timestamp.now(),
      });

      return newCompletedCount;
    });

    console.log(`Job ${jobId} completed tasks: ${newCount}`);
    return newCount;
  }

  /**
   * Update the total task count for a job.
   * Call this in the orchestrate handler once the actual number of tasks is known.
   */
  async updateTotalTasks(jobId: string, totalTasks: number): Promise<void> {
    await this.db.collection(this.jobsCollection).doc(jobId).update({
      totalTasks,
      updatedAt: Timestamp.now(),
    });
    console.log(`Job ${jobId} totalTasks updated to: ${totalTasks}`);
  }

  /**
   * Check if all tasks are complete
   */
  async isJobComplete(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job) {
      return false;
    }
    return job.completedTasks >= job.totalTasks;
  }

  /**
   * Delete a job and all its week tasks
   */
  async deleteJob(jobId: string): Promise<void> {
    // Delete week tasks first
    const weeksSnapshot = await this.db
      .collection(this.jobsCollection)
      .doc(jobId)
      .collection(this.weeksSubcollection)
      .get();

    const batch = this.db.batch();
    for (const doc of weeksSnapshot.docs) {
      batch.delete(doc.ref);
    }

    // Delete job document
    batch.delete(this.db.collection(this.jobsCollection).doc(jobId));

    await batch.commit();
    console.log(`Job ${jobId} deleted with all week tasks`);
  }

  /**
   * Get jobs by user ID (for debugging/admin)
   */
  async getJobsByUserId(userId: string, limit = 10): Promise<JobDocument[]> {
    const snapshot = await this.db
      .collection(this.jobsCollection)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        year: data.year,
        month: data.month,
        pipelineId: data.pipelineId,
        userId: data.userId,
        channelId: data.channelId,
        threadTs: data.threadTs,
        userToken: data.userToken,
        status: data.status,
        totalTasks: data.totalTasks,
        completedTasks: data.completedTasks,
        options: data.options,
        errorMessage: data.errorMessage,
        createdAt: data.createdAt?.toDate() ?? new Date(),
        updatedAt: data.updatedAt?.toDate() ?? new Date(),
      };
    });
  }

  /**
   * Clean up old completed/error jobs (older than 24 hours)
   */
  async cleanupOldJobs(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cutoffTimestamp = Timestamp.fromDate(cutoff);

    const snapshot = await this.db
      .collection(this.jobsCollection)
      .where('status', 'in', ['completed', 'error'])
      .where('updatedAt', '<', cutoffTimestamp)
      .limit(100)
      .get();

    let deletedCount = 0;
    for (const doc of snapshot.docs) {
      await this.deleteJob(doc.id);
      deletedCount++;
    }

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} old jobs`);
    }

    return deletedCount;
  }
}
