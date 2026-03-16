// Job Queue and Scheduler System

import { Job, Runner } from '@/types/pipeline';
import { EventEmitter } from 'events';

export interface QueuedJob {
  job: Job;
  pipelineId: string;
  priority: number;
  queuedAt: Date;
  attempts: number;
}

export class JobQueue extends EventEmitter {
  private queue: QueuedJob[] = [];
  private runners: Map<string, Runner> = new Map();
  private runningJobs: Map<string, { job: QueuedJob; runner: Runner }> = new Map();
  private maxRetries = 3;

  constructor() {
    super();
  }

  /**
   * Add a job to the queue
   */
  enqueue(job: Job, pipelineId: string, priority: number = 0): void {
    const queuedJob: QueuedJob = {
      job,
      pipelineId,
      priority,
      queuedAt: new Date(),
      attempts: 0,
    };

    this.queue.push(queuedJob);
    this.queue.sort((a, b) => b.priority - a.priority);

    this.emit('job:queued', queuedJob);
    console.log(`Job ${job.name} queued for pipeline ${pipelineId}`);

    // Try to assign to a runner
    this.assignJobs();
  }

  /**
   * Register a runner
   */
  registerRunner(runner: Runner): void {
    this.runners.set(runner.id, runner);
    this.emit('runner:registered', runner);
    console.log(`Runner ${runner.name} registered`);

    // Try to assign queued jobs
    this.assignJobs();
  }

  /**
   * Unregister a runner
   */
  unregisterRunner(runnerId: string): void {
    const runner = this.runners.get(runnerId);
    if (runner) {
      this.runners.delete(runnerId);
      this.emit('runner:unregistered', runner);
      console.log(`Runner ${runner.name} unregistered`);

      // Requeue jobs that were running on this runner
      const jobsToRequeue: string[] = [];
      this.runningJobs.forEach((value, jobId) => {
        if (value.runner.id === runnerId) {
          jobsToRequeue.push(jobId);
        }
      });

      jobsToRequeue.forEach(jobId => {
        const runningJob = this.runningJobs.get(jobId);
        if (runningJob) {
          this.runningJobs.delete(jobId);
          runningJob.job.attempts++;

          if (runningJob.job.attempts < this.maxRetries) {
            this.queue.unshift(runningJob.job);
            this.emit('job:requeued', runningJob.job);
          } else {
            this.emit('job:failed', runningJob.job, 'Max retries exceeded');
          }
        }
      });
    }
  }

  /**
   * Assign jobs to available runners
   */
  private assignJobs(): void {
    if (this.queue.length === 0) return;

    // Find available runners
    for (const runner of this.runners.values()) {
      if (runner.status !== 'online') continue;
      if (runner.current_jobs >= runner.concurrent_jobs) continue;

      // Find a job that matches runner tags
      const jobIndex = this.queue.findIndex(queuedJob =>
        this.matchesRunnerTags(queuedJob.job, runner)
      );

      if (jobIndex === -1) continue;

      // Assign job to runner
      const queuedJob = this.queue.splice(jobIndex, 1)[0];
      this.assignJobToRunner(queuedJob, runner);
    }
  }

  /**
   * Check if job tags match runner tags
   */
  private matchesRunnerTags(job: Job, runner: Runner): boolean {
    if (!job.tags || job.tags.length === 0) return true;
    return job.tags.every(tag => runner.tags.includes(tag));
  }

  /**
   * Assign a specific job to a runner
   */
  private assignJobToRunner(queuedJob: QueuedJob, runner: Runner): void {
    const jobId = queuedJob.job.id;

    this.runningJobs.set(jobId, { job: queuedJob, runner });
    runner.current_jobs++;
    runner.last_contact = new Date();

    this.emit('job:assigned', queuedJob, runner);
    console.log(`Job ${queuedJob.job.name} assigned to runner ${runner.name}`);
  }

  /**
   * Mark a job as completed
   */
  completeJob(jobId: string, success: boolean): void {
    const runningJob = this.runningJobs.get(jobId);
    if (!runningJob) {
      console.warn(`Job ${jobId} not found in running jobs`);
      return;
    }

    const { job, runner } = runningJob;

    this.runningJobs.delete(jobId);
    runner.current_jobs--;

    if (success) {
      this.emit('job:completed', job);
      console.log(`Job ${job.job.name} completed successfully`);
    } else {
      job.attempts++;

      if (job.attempts < this.maxRetries) {
        // Requeue job
        this.queue.unshift(job);
        this.emit('job:requeued', job);
        console.log(`Job ${job.job.name} requeued (attempt ${job.attempts})`);
      } else {
        this.emit('job:failed', job, 'Max retries exceeded');
        console.log(`Job ${job.job.name} failed after ${job.attempts} attempts`);
      }
    }

    // Try to assign more jobs
    this.assignJobs();
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queuedJobs: this.queue.length,
      runningJobs: this.runningJobs.size,
      availableRunners: Array.from(this.runners.values()).filter(
        r => r.status === 'online' && r.current_jobs < r.concurrent_jobs
      ).length,
      totalRunners: this.runners.size,
    };
  }

  /**
   * Get all queued jobs
   */
  getQueuedJobs(): QueuedJob[] {
    return [...this.queue];
  }

  /**
   * Get all running jobs
   */
  getRunningJobs(): Array<{ job: QueuedJob; runner: Runner }> {
    return Array.from(this.runningJobs.values());
  }

  /**
   * Get all registered runners
   */
  getRunners(): Runner[] {
    return Array.from(this.runners.values());
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    // Check if job is queued
    const queueIndex = this.queue.findIndex(q => q.job.id === jobId);
    if (queueIndex !== -1) {
      const queuedJob = this.queue.splice(queueIndex, 1)[0];
      this.emit('job:cancelled', queuedJob);
      return true;
    }

    // Check if job is running
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob) {
      this.runningJobs.delete(jobId);
      runningJob.runner.current_jobs--;
      this.emit('job:cancelled', runningJob.job);
      return true;
    }

    return false;
  }

  /**
   * Clear the entire queue
   */
  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];
    this.emit('queue:cleared', count);
    console.log(`Queue cleared: ${count} jobs removed`);
  }

  /**
   * Update runner status
   */
  updateRunnerStatus(runnerId: string, status: 'online' | 'offline' | 'paused'): void {
    const runner = this.runners.get(runnerId);
    if (runner) {
      runner.status = status;
      runner.last_contact = new Date();
      this.emit('runner:updated', runner);

      if (status === 'online') {
        this.assignJobs();
      }
    }
  }
}

// Global job queue instance
export const jobQueue = new JobQueue();
