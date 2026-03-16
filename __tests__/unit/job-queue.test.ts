// Unit tests for Job Queue

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { JobQueue } from '@/lib/cicd/job-queue';
import { Job, Runner } from '@/types/pipeline';

describe('JobQueue', () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue();
  });

  describe('enqueue', () => {
    it('should add job to queue', () => {
      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.enqueue(job, 'pipeline-1', 0);

      const queuedJobs = queue.getQueuedJobs();
      expect(queuedJobs).toHaveLength(1);
      expect(queuedJobs[0].job.id).toBe('job-1');
    });

    it('should prioritize jobs correctly', () => {
      const job1: Job = {
        id: 'job-1',
        name: 'low_priority',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      const job2: Job = {
        id: 'job-2',
        name: 'high_priority',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.enqueue(job1, 'pipeline-1', 0);
      queue.enqueue(job2, 'pipeline-1', 10);

      const queuedJobs = queue.getQueuedJobs();
      expect(queuedJobs[0].job.id).toBe('job-2'); // Higher priority first
    });

    it('should emit job:queued event', (done) => {
      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.on('job:queued', (queuedJob) => {
        expect(queuedJob.job.id).toBe('job-1');
        done();
      });

      queue.enqueue(job, 'pipeline-1', 0);
    });
  });

  describe('registerRunner', () => {
    it('should register a new runner', () => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner description',
        status: 'online',
        tags: ['docker'],
        concurrent_jobs: 2,
        current_jobs: 0,
      };

      queue.registerRunner(runner);

      const runners = queue.getRunners();
      expect(runners).toHaveLength(1);
      expect(runners[0].id).toBe('runner-1');
    });

    it('should emit runner:registered event', (done) => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner',
        status: 'online',
        tags: [],
        concurrent_jobs: 2,
        current_jobs: 0,
      };

      queue.on('runner:registered', (registeredRunner) => {
        expect(registeredRunner.id).toBe('runner-1');
        done();
      });

      queue.registerRunner(runner);
    });
  });

  describe('assignJobs', () => {
    it('should assign job to available runner', (done) => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner',
        status: 'online',
        tags: [],
        concurrent_jobs: 2,
        current_jobs: 0,
      };

      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.on('job:assigned', (queuedJob, assignedRunner) => {
        expect(queuedJob.job.id).toBe('job-1');
        expect(assignedRunner.id).toBe('runner-1');
        done();
      });

      queue.registerRunner(runner);
      queue.enqueue(job, 'pipeline-1', 0);
    });

    it('should match job tags with runner tags', (done) => {
      const dockerRunner: Runner = {
        id: 'runner-docker',
        name: 'Docker Runner',
        description: 'Docker runner',
        status: 'online',
        tags: ['docker'],
        concurrent_jobs: 1,
        current_jobs: 0,
      };

      const shellRunner: Runner = {
        id: 'runner-shell',
        name: 'Shell Runner',
        description: 'Shell runner',
        status: 'online',
        tags: ['shell'],
        concurrent_jobs: 1,
        current_jobs: 0,
      };

      const dockerJob: Job = {
        id: 'job-docker',
        name: 'docker_job',
        stage: 'build',
        script: ['docker build .'],
        tags: ['docker'],
        status: 'pending',
        logs: [],
      };

      queue.on('job:assigned', (queuedJob, runner) => {
        expect(queuedJob.job.id).toBe('job-docker');
        expect(runner.tags).toContain('docker');
        done();
      });

      queue.registerRunner(dockerRunner);
      queue.registerRunner(shellRunner);
      queue.enqueue(dockerJob, 'pipeline-1', 0);
    });

    it('should not assign job if runner is at capacity', () => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner',
        status: 'online',
        tags: [],
        concurrent_jobs: 1,
        current_jobs: 1, // Already at capacity
      };

      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.registerRunner(runner);
      queue.enqueue(job, 'pipeline-1', 0);

      const queuedJobs = queue.getQueuedJobs();
      expect(queuedJobs).toHaveLength(1); // Job should remain in queue
    });
  });

  describe('completeJob', () => {
    it('should mark job as completed and free runner', (done) => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner',
        status: 'online',
        tags: [],
        concurrent_jobs: 2,
        current_jobs: 0,
      };

      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.on('job:assigned', () => {
        queue.completeJob('job-1', true);
      });

      queue.on('job:completed', (completedJob) => {
        expect(completedJob.job.id).toBe('job-1');
        expect(runner.current_jobs).toBe(0);
        done();
      });

      queue.registerRunner(runner);
      queue.enqueue(job, 'pipeline-1', 0);
    });

    it('should retry failed job', (done) => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner',
        status: 'online',
        tags: [],
        concurrent_jobs: 1,
        current_jobs: 0,
      };

      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      let assigned = false;

      queue.on('job:assigned', () => {
        if (!assigned) {
          assigned = true;
          queue.completeJob('job-1', false); // Fail the job
        }
      });

      queue.on('job:requeued', (requeuedJob) => {
        expect(requeuedJob.attempts).toBeGreaterThan(0);
        done();
      });

      queue.registerRunner(runner);
      queue.enqueue(job, 'pipeline-1', 0);
    });
  });

  describe('cancelJob', () => {
    it('should cancel queued job', () => {
      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.enqueue(job, 'pipeline-1', 0);

      const cancelled = queue.cancelJob('job-1');

      expect(cancelled).toBe(true);
      expect(queue.getQueuedJobs()).toHaveLength(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct queue status', () => {
      const runner: Runner = {
        id: 'runner-1',
        name: 'Test Runner',
        description: 'Test runner',
        status: 'online',
        tags: [],
        concurrent_jobs: 2,
        current_jobs: 0,
      };

      const job: Job = {
        id: 'job-1',
        name: 'test_job',
        stage: 'test',
        script: ['npm test'],
        status: 'pending',
        logs: [],
      };

      queue.registerRunner(runner);
      queue.enqueue(job, 'pipeline-1', 0);

      const status = queue.getStatus();

      expect(status.totalRunners).toBe(1);
      expect(status.availableRunners).toBeGreaterThanOrEqual(0);
    });
  });
});
