/**
 * Test YAML-Driven Deployment System
 * Run with: npx ts-node scripts/test-yaml-deployment.ts
 */

async function testPipelinePreview() {
  console.log('\n=== TEST 1: Pipeline Preview ===\n');

  const testCases = [
    {
      name: 'Next.js App',
      repoUrl: 'https://github.com/vercel/next.js',
      repoFullName: 'vercel/next.js',
    },
    {
      name: 'Flask Python App',
      repoUrl: 'https://github.com/pallets/flask',
      repoFullName: 'pallets/flask',
    },
    {
      name: 'Rust Actix Web',
      repoUrl: 'https://github.com/actix/actix-web',
      repoFullName: 'actix/actix-web',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📦 Testing: ${testCase.name}`);
    console.log(`   Repository: ${testCase.repoFullName}\n`);

    try {
      const response = await fetch('http://localhost:3000/api/pipelines/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: testCase.repoUrl,
          repoFullName: testCase.repoFullName,
        }),
      });

      if (!response.ok) {
        console.error(`   ❌ Failed: ${response.status} ${response.statusText}`);
        const error = await response.json();
        console.error(`   Error: ${error.error}`);
        continue;
      }

      const result = await response.json();

      console.log(`   ✅ Success!`);
      console.log(`   Language: ${result.detection.language}`);
      console.log(`   Framework: ${result.detection.framework}`);
      console.log(`   Package Manager: ${result.detection.packageManager}`);
      console.log(`   Build Tool: ${result.detection.buildTool || 'N/A'}`);
      console.log(`   Stages: ${result.pipeline.stages.join(' → ')}`);
      console.log(`\n   Generated YAML Preview (first 500 chars):`);
      console.log(`   ${'─'.repeat(60)}`);
      console.log(
        result.pipeline.yaml
          .substring(0, 500)
          .split('\n')
          .map((line: string) => `   ${line}`)
          .join('\n')
      );
      console.log(`   ${'─'.repeat(60)}\n`);
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

async function testLanguageDetection() {
  console.log('\n=== TEST 2: Language Detection ===\n');

  const testCases = [
    { repo: 'facebook/react', expected: 'JavaScript/TypeScript' },
    { repo: 'django/django', expected: 'Python' },
    { repo: 'rust-lang/cargo', expected: 'Rust' },
    { repo: 'golang/go', expected: 'Go' },
    { repo: 'spring-projects/spring-boot', expected: 'Java' },
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.repo}`);

    try {
      const response = await fetch('http://localhost:3000/api/pipelines/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: `https://github.com/${testCase.repo}`,
          repoFullName: testCase.repo,
        }),
      });

      if (!response.ok) {
        console.log(`  ❌ Failed: ${response.status}`);
        continue;
      }

      const result = await response.json();
      const detected = result.detection.language;
      const match = detected === testCase.expected;

      console.log(`  ${match ? '✅' : '⚠️'} Detected: ${detected} (Expected: ${testCase.expected})`);
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

async function testYamlValidation() {
  console.log('\n=== TEST 3: YAML Validation ===\n');

  console.log('Testing YAML parser with sample pipeline...\n');

  const sampleYaml = `stages:
  - install
  - build

install_dependencies:
  stage: install
  script:
    - npm install

build_application:
  stage: build
  script:
    - npm run build`;

  console.log('Sample YAML:');
  console.log('─'.repeat(60));
  console.log(sampleYaml);
  console.log('─'.repeat(60));

  try {
    // Note: This would require exposing a validation endpoint
    // For now, just show that we can parse it client-side
    const yaml = await import('yaml');
    const parsed = yaml.parse(sampleYaml);

    console.log('\n✅ YAML is valid!');
    console.log('\nParsed structure:');
    console.log(`  Stages: ${parsed.stages.join(', ')}`);
    console.log(`  Jobs: ${Object.keys(parsed).filter((k) => !['stages'].includes(k)).join(', ')}`);
  } catch (error: any) {
    console.log(`\n❌ YAML validation failed: ${error.message}`);
  }
}

async function displaySystemInfo() {
  console.log('╔═════════════════════════════════════════════════════════════╗');
  console.log('║     YAML-Driven Deployment System - Test Suite             ║');
  console.log('╚═════════════════════════════════════════════════════════════╝');
  console.log('\n📊 System Information:\n');
  console.log(`   API Base URL: http://localhost:3000`);
  console.log(`   Endpoints:`);
  console.log(`     - POST /api/pipelines/generate-preview`);
  console.log(`     - POST /api/deploy/yaml-driven`);
  console.log(`\n   Supported Languages:`);
  console.log(`     ✅ Node.js / JavaScript / TypeScript`);
  console.log(`     ✅ Python`);
  console.log(`     ✅ Rust`);
  console.log(`     ✅ Go`);
  console.log(`     ✅ Java`);
  console.log(`     ✅ Ruby`);
  console.log(`     ✅ PHP`);
  console.log(`     ✅ Docker`);
  console.log('\n' + '═'.repeat(65) + '\n');
}

async function runAllTests() {
  await displaySystemInfo();

  try {
    await testPipelinePreview();
    await testLanguageDetection();
    await testYamlValidation();

    console.log('\n╔═════════════════════════════════════════════════════════════╗');
    console.log('║                   Test Suite Complete                       ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();
