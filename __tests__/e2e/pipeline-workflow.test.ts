// E2E tests for complete pipeline workflows

import { test, expect } from '@playwright/test';

test.describe('CI/CD Pipeline Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should create and execute a new pipeline', async ({ page }) => {
    // Navigate to pipeline creation
    await page.click('text=New Pipeline');

    // Select template
    await page.click('text=Node.js');

    // Fill in pipeline details
    await page.fill('[name="project"]', 'test-project');
    await page.fill('[name="branch"]', 'main');

    // Create pipeline
    await page.click('text=Create Pipeline');

    // Wait for pipeline to be created
    await page.waitForSelector('text=Pipeline created successfully');

    // Verify pipeline appears in dashboard
    await page.click('text=Pipelines');
    await expect(page.locator('text=test-project')).toBeVisible();
  });

  test('should display pipeline execution logs in real-time', async ({ page }) => {
    // Start a pipeline
    await page.click('[data-testid="pipeline-1"]');
    await page.click('text=Run Pipeline');

    // Wait for execution to start
    await page.waitForSelector('[data-testid="pipeline-status-running"]');

    // Verify logs appear
    await expect(page.locator('[data-testid="pipeline-logs"]')).toBeVisible();

    // Check for log entries
    await page.waitForSelector('text=Installing dependencies', { timeout: 10000 });
    await page.waitForSelector('text=Running tests');
    await page.waitForSelector('text=Building project');
  });

  test('should filter pipelines by status', async ({ page }) => {
    await page.goto('http://localhost:3000/pipelines');

    // Click status filter
    await page.click('[data-testid="filter-status"]');
    await page.click('text=Running');

    // Verify only running pipelines are shown
    const pipelines = page.locator('[data-testid^="pipeline-"]');
    await expect(pipelines).toBeVisible();

    // Check all visible pipelines have "running" status
    const statuses = await pipelines.locator('[data-testid="status-badge"]').allTextContents();
    statuses.forEach(status => {
      expect(status.toLowerCase()).toContain('running');
    });
  });

  test('should cancel a running pipeline', async ({ page }) => {
    // Start a pipeline
    await page.click('[data-testid="pipeline-1"]');
    await page.click('text=Run Pipeline');

    // Wait for execution to start
    await page.waitForSelector('[data-testid="pipeline-status-running"]');

    // Cancel pipeline
    await page.click('[data-testid="cancel-pipeline"]');

    // Confirm cancellation
    await page.click('text=Confirm');

    // Verify pipeline is cancelled
    await page.waitForSelector('[data-testid="pipeline-status-cancelled"]');
    await expect(page.locator('text=Pipeline cancelled')).toBeVisible();
  });

  test('should download pipeline artifacts', async ({ page }) => {
    // Navigate to completed pipeline
    await page.click('[data-testid="pipeline-completed-1"]');

    // Click artifacts tab
    await page.click('text=Artifacts');

    // Verify artifacts are listed
    await expect(page.locator('[data-testid="artifact-build"]')).toBeVisible();

    // Download artifact
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-artifact-build"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('build');
  });

  test('should retry a failed job', async ({ page }) => {
    // Navigate to failed pipeline
    await page.click('[data-testid="pipeline-failed-1"]');

    // Find failed job
    await page.click('[data-testid="job-failed-test"]');

    // Retry job
    await page.click('text=Retry Job');

    // Verify job is restarted
    await page.waitForSelector('[data-testid="job-status-running"]');
    await expect(page.locator('text=Job retrying')).toBeVisible();
  });

  test('should view pipeline graph visualization', async ({ page }) => {
    await page.click('[data-testid="pipeline-1"]');

    // Click graph view
    await page.click('text=Graph');

    // Verify graph is displayed
    await expect(page.locator('[data-testid="pipeline-graph"]')).toBeVisible();

    // Check stages are visible
    await expect(page.locator('[data-testid="stage-build"]')).toBeVisible();
    await expect(page.locator('[data-testid="stage-test"]')).toBeVisible();
    await expect(page.locator('[data-testid="stage-deploy"]')).toBeVisible();

    // Verify job connections
    await expect(page.locator('[data-testid="edge-build-test"]')).toBeVisible();
  });

  test('should create scheduled pipeline', async ({ page }) => {
    // Navigate to schedules
    await page.click('text=Schedules');
    await page.click('text=New Schedule');

    // Fill in schedule details
    await page.fill('[name="description"]', 'Nightly build');
    await page.fill('[name="cron"]', '0 0 * * *');
    await page.selectOption('[name="timezone"]', 'UTC');

    // Save schedule
    await page.click('text=Create Schedule');

    // Verify schedule is created
    await expect(page.locator('text=Nightly build')).toBeVisible();
    await expect(page.locator('text=0 0 * * *')).toBeVisible();
  });

  test('should configure webhook integration', async ({ page }) => {
    // Navigate to settings
    await page.click('text=Settings');
    await page.click('text=Webhooks');

    // Add new webhook
    await page.click('text=Add Webhook');

    // Fill webhook details
    await page.fill('[name="url"]', 'https://github.com/user/repo');
    await page.check('[name="trigger-push"]');
    await page.check('[name="trigger-pr"]');

    // Save webhook
    await page.click('text=Save Webhook');

    // Verify webhook is created
    await expect(page.locator('text=github.com/user/repo')).toBeVisible();
  });

  test('should manage environment variables', async ({ page }) => {
    // Navigate to project settings
    await page.click('[data-testid="project-1"]');
    await page.click('text=Settings');
    await page.click('text=Variables');

    // Add new variable
    await page.click('text=Add Variable');
    await page.fill('[name="key"]', 'API_KEY');
    await page.fill('[name="value"]', 'secret-key-123');
    await page.check('[name="masked"]');

    // Save variable
    await page.click('text=Save Variable');

    // Verify variable is added
    await expect(page.locator('text=API_KEY')).toBeVisible();
    await expect(page.locator('text=********')).toBeVisible(); // Masked value
  });

  test('should display pipeline metrics dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/metrics');

    // Verify metrics are displayed
    await expect(page.locator('[data-testid="metric-total-pipelines"]')).toBeVisible();
    await expect(page.locator('[data-testid="metric-success-rate"]')).toBeVisible();
    await expect(page.locator('[data-testid="metric-avg-duration"]')).toBeVisible();

    // Check charts
    await expect(page.locator('[data-testid="chart-pipeline-trends"]')).toBeVisible();
    await expect(page.locator('[data-testid="chart-success-rate"]')).toBeVisible();
  });

  test('should search and filter pipelines', async ({ page }) => {
    await page.goto('http://localhost:3000/pipelines');

    // Search for specific pipeline
    await page.fill('[data-testid="search-pipelines"]', 'test-project');
    await page.press('[data-testid="search-pipelines"]', 'Enter');

    // Verify filtered results
    const results = page.locator('[data-testid^="pipeline-"]');
    const count = await results.count();
    expect(count).toBeGreaterThan(0);

    // Check all results match search term
    const names = await results.locator('[data-testid="pipeline-name"]').allTextContents();
    names.forEach(name => {
      expect(name.toLowerCase()).toContain('test-project');
    });
  });
});
