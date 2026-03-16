// Unit tests for Pipeline Parser

import { describe, it, expect } from '@jest/globals';
import { PipelineParser } from '@/lib/cicd/pipeline-parser';

describe('PipelineParser', () => {
  describe('validateConfig', () => {
    it('should validate a correct pipeline configuration', () => {
      const yamlConfig = `
stages:
  - build
  - test

build_job:
  stage: build
  script:
    - npm install
    - npm run build

test_job:
  stage: test
  script:
    - npm test
`;

      const result = PipelineParser.validateConfig(yamlConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing stages', () => {
      const yamlConfig = `
build_job:
  script:
    - npm run build
`;

      const result = PipelineParser.validateConfig(yamlConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No stages defined in pipeline');
    });

    it('should detect jobs without scripts', () => {
      const yamlConfig = `
stages:
  - build

build_job:
  stage: build
`;

      const result = PipelineParser.validateConfig(yamlConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('has no script defined'))).toBe(true);
    });

    it('should detect invalid stage references', () => {
      const yamlConfig = `
stages:
  - build

test_job:
  stage: test
  script:
    - npm test
`;

      const result = PipelineParser.validateConfig(yamlConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('references undefined stage'))).toBe(true);
    });
  });

  describe('parseConfig', () => {
    it('should parse a basic pipeline configuration', () => {
      const yamlConfig = `
stages:
  - build
  - test

variables:
  NODE_ENV: production

build_job:
  stage: build
  script:
    - npm run build
`;

      const metadata = {
        project: 'test-project',
        branch: 'main',
        commit: {
          sha: 'abc123',
          message: 'Test commit',
          author: 'Test Author',
        },
        triggeredBy: 'push' as const,
        user: 'testuser',
      };

      const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);

      expect(pipeline.project).toBe('test-project');
      expect(pipeline.branch).toBe('main');
      expect(pipeline.commit.sha).toBe('abc123');
      expect(pipeline.status).toBe('pending');
      expect(pipeline.stages).toBeDefined();
      expect(pipeline.stages.length).toBeGreaterThan(0);
    });

    it('should extract variables from config', () => {
      const yamlConfig = `
stages:
  - build

variables:
  NODE_ENV: production
  API_URL: https://api.example.com

build_job:
  stage: build
  script:
    - npm run build
`;

      const metadata = {
        project: 'test-project',
        branch: 'main',
        commit: { sha: 'abc123', message: 'Test', author: 'Author' },
        triggeredBy: 'push' as const,
        user: 'testuser',
      };

      const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);

      expect(pipeline.variables).toBeDefined();
      expect(pipeline.variables!.length).toBeGreaterThan(0);
    });
  });

  describe('generateYAML', () => {
    it('should generate valid YAML from pipeline object', () => {
      const yamlConfig = `
stages:
  - build
  - test

build_job:
  stage: build
  script:
    - npm run build

test_job:
  stage: test
  script:
    - npm test
`;

      const metadata = {
        project: 'test-project',
        branch: 'main',
        commit: { sha: 'abc123', message: 'Test', author: 'Author' },
        triggeredBy: 'push' as const,
        user: 'testuser',
      };

      const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);
      const generated = PipelineParser.generateYAML(pipeline);

      expect(generated).toContain('stages:');
      expect(generated).toContain('script:');
      expect(typeof generated).toBe('string');
    });
  });
});
