// Pipeline Configuration Parser (YAML-based like GitLab CI)

import { Pipeline, Stage, Job, PipelineConfig } from '@/types/pipeline';
import { nanoid } from 'nanoid';

export class PipelineParser {
  /**
   * Parse YAML config and convert to Pipeline object
   */
  static parseConfig(yamlContent: string, metadata: {
    project: string;
    branch: string;
    commit: {
      sha: string;
      message: string;
      author: string;
    };
    triggeredBy: 'push' | 'merge_request' | 'schedule' | 'manual' | 'webhook';
    user: string;
  }): Pipeline {
    // In a real implementation, use a YAML parser library like 'yaml' or 'js-yaml'
    // For now, we'll simulate parsing
    const config = this.parseYAML(yamlContent);

    const stages = this.extractStages(config);
    const jobs = this.extractJobs(config, stages);

    const pipeline: Pipeline = {
      id: nanoid(),
      name: `Pipeline #${Date.now()}`,
      project: metadata.project,
      branch: metadata.branch,
      commit: {
        ...metadata.commit,
        timestamp: new Date(),
      },
      stages: this.buildStages(stages, jobs),
      status: 'pending',
      variables: this.extractVariables(config),
      createdAt: new Date(),
      triggeredBy: metadata.triggeredBy,
      user: metadata.user,
    };

    return pipeline;
  }

  /**
   * Parse YAML content to JSON
   * In production, use js-yaml library
   */
  private static parseYAML(yamlContent: string): PipelineConfig {
    try {
      // Simple YAML parsing simulation
      // In production: use import('js-yaml').load(yamlContent)

      // For demo purposes, return a default config
      const lines = yamlContent.split('\n');
      const config: any = {
        stages: [],
        variables: {},
      };

      let currentJob: any = null;
      let indent = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (trimmed.startsWith('stages:')) {
          // Parse stages
          continue;
        } else if (trimmed.startsWith('- ')) {
          // Stage item
          config.stages.push(trimmed.substring(2));
        } else if (trimmed.includes(':') && !trimmed.startsWith(' ')) {
          // Job definition
          const jobName = trimmed.replace(':', '');
          if (!['variables', 'before_script', 'after_script', 'image', 'services', 'cache', 'artifacts'].includes(jobName)) {
            currentJob = { name: jobName };
            config[jobName] = currentJob;
          }
        }
      }

      return config;
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error}`);
    }
  }

  /**
   * Extract stages from config
   */
  private static extractStages(config: PipelineConfig): string[] {
    return config.stages || ['build', 'test', 'deploy'];
  }

  /**
   * Extract jobs from config
   */
  private static extractJobs(config: PipelineConfig, stages: string[]): Job[] {
    const jobs: Job[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (['stages', 'variables', 'before_script', 'after_script', 'image', 'services', 'cache', 'artifacts'].includes(key)) {
        continue;
      }

      if (typeof value === 'object' && value !== null) {
        const jobConfig: any = value;

        const job: Job = {
          id: nanoid(),
          name: key,
          stage: jobConfig.stage || stages[0],
          script: jobConfig.script || [],
          before_script: jobConfig.before_script || config.before_script,
          after_script: jobConfig.after_script || config.after_script,
          image: jobConfig.image || config.image,
          services: jobConfig.services || config.services,
          variables: { ...config.variables, ...jobConfig.variables },
          artifacts: jobConfig.artifacts || config.artifacts,
          cache: jobConfig.cache || config.cache,
          only: jobConfig.only,
          except: jobConfig.except,
          when: jobConfig.when || 'on_success',
          allow_failure: jobConfig.allow_failure || false,
          timeout: jobConfig.timeout,
          retry: jobConfig.retry,
          tags: jobConfig.tags || [],
          dependencies: jobConfig.dependencies || [],
          needs: jobConfig.needs || [],
          status: 'pending',
          logs: [],
        };

        jobs.push(job);
      }
    }

    return jobs;
  }

  /**
   * Build stage objects with their jobs
   */
  private static buildStages(stageNames: string[], jobs: Job[]): Stage[] {
    return stageNames.map(stageName => {
      const stageJobs = jobs.filter(job => job.stage === stageName);

      return {
        id: nanoid(),
        name: stageName,
        jobs: stageJobs,
        status: 'pending' as StageStatus,
      };
    });
  }

  /**
   * Extract variables from config
   */
  private static extractVariables(config: PipelineConfig) {
    if (!config.variables) return [];

    return Object.entries(config.variables).map(([key, value]) => ({
      key,
      value: String(value),
      protected: false,
      masked: false,
    }));
  }

  /**
   * Validate pipeline config
   */
  static validateConfig(yamlContent: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.parseYAML(yamlContent);

      // Check if stages are defined
      if (!config.stages || config.stages.length === 0) {
        errors.push('No stages defined in pipeline');
      }

      // Check if there are jobs
      const jobCount = Object.keys(config).filter(key =>
        !['stages', 'variables', 'before_script', 'after_script', 'image', 'services', 'cache', 'artifacts'].includes(key)
      ).length;

      if (jobCount === 0) {
        errors.push('No jobs defined in pipeline');
      }

      // Validate each job
      for (const [key, value] of Object.entries(config)) {
        if (['stages', 'variables', 'before_script', 'after_script', 'image', 'services', 'cache', 'artifacts'].includes(key)) {
          continue;
        }

        if (typeof value === 'object' && value !== null) {
          const jobConfig: any = value;

          if (!jobConfig.script || jobConfig.script.length === 0) {
            errors.push(`Job '${key}' has no script defined`);
          }

          if (jobConfig.stage && !config.stages?.includes(jobConfig.stage)) {
            errors.push(`Job '${key}' references undefined stage '${jobConfig.stage}'`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to parse config: ${error}`],
      };
    }
  }

  /**
   * Generate YAML from Pipeline object
   */
  static generateYAML(pipeline: Pipeline): string {
    const lines: string[] = [];

    // Add stages
    lines.push('stages:');
    pipeline.stages.forEach(stage => {
      lines.push(`  - ${stage.name}`);
    });
    lines.push('');

    // Add variables if any
    if (pipeline.variables && pipeline.variables.length > 0) {
      lines.push('variables:');
      pipeline.variables.forEach(variable => {
        lines.push(`  ${variable.key}: "${variable.value}"`);
      });
      lines.push('');
    }

    // Add jobs
    pipeline.stages.forEach(stage => {
      stage.jobs.forEach(job => {
        lines.push(`${job.name}:`);
        lines.push(`  stage: ${job.stage}`);

        if (job.image) {
          lines.push(`  image: ${job.image}`);
        }

        if (job.before_script && job.before_script.length > 0) {
          lines.push('  before_script:');
          job.before_script.forEach(script => {
            lines.push(`    - ${script}`);
          });
        }

        lines.push('  script:');
        job.script.forEach(script => {
          lines.push(`    - ${script}`);
        });

        if (job.after_script && job.after_script.length > 0) {
          lines.push('  after_script:');
          job.after_script.forEach(script => {
            lines.push(`    - ${script}`);
          });
        }

        if (job.artifacts) {
          lines.push('  artifacts:');
          lines.push(`    name: "${job.artifacts.name}"`);
          lines.push(`    path: ${job.artifacts.path}`);
          if (job.artifacts.expire_in) {
            lines.push(`    expire_in: ${job.artifacts.expire_in}`);
          }
        }

        if (job.when && job.when !== 'on_success') {
          lines.push(`  when: ${job.when}`);
        }

        if (job.allow_failure) {
          lines.push(`  allow_failure: true`);
        }

        lines.push('');
      });
    });

    return lines.join('\n');
  }
}
