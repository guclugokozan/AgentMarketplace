import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

let allTestsPassed = true;
const results = [];

function log(testName, passed, details = '') {
  const status = passed ? '✅' : '❌';
  results.push({ test: testName, passed, details });
  console.log(`${status} ${testName}${details ? `: ${details}` : ''}`);
  if (!passed) allTestsPassed = false;
}

console.log('=== TWO-UPLOAD MODAL TESTS ===\n');

// Test 1: Virtual Try-On has two uploads
console.log('--- Virtual Try-On ---');
await page.click('[onclick="openDetail(\'virtual-try-on\')"]');
await page.waitForTimeout(500);

const vtoModelTab = await page.locator('#defaultModelTab').isVisible();
log('Virtual Try-On: Model gallery visible', vtoModelTab);

const vtoModelButtons = await page.locator('.model-tab-btn').count();
log('Virtual Try-On: Model tab buttons exist', vtoModelButtons === 2, `Found ${vtoModelButtons} buttons`);

const vtoModelSelect = await page.locator('.model-select').count();
log('Virtual Try-On: Model selection grid exists', vtoModelSelect >= 4, `Found ${vtoModelSelect} model options`);

const vtoOutfitUpload = await page.locator('#fileInput2-virtual-try-on').isVisible().catch(() => false);
const vtoOutfitSection = await page.locator('text=Step 2: Upload Outfit Reference').isVisible();
log('Virtual Try-On: Second upload (outfit) exists', vtoOutfitSection);

await page.click('#agentDetailPage button[onclick="closeDetail()"]');
await page.waitForTimeout(400);

// Test 2: Face Swap has two uploads (Source Face + Target Image)
console.log('\n--- Face Swap ---');
await page.click('[onclick="openDetail(\'face-swap\')"]');
await page.waitForTimeout(500);

const faceSwapSource = await page.locator('text=Source Face').isVisible();
log('Face Swap: Source Face section exists', faceSwapSource);

const faceSwapTarget = await page.locator('text=Target Image').isVisible();
log('Face Swap: Target Image section exists', faceSwapTarget);

const faceSwapInput1 = await page.locator('#fileInput-face-swap').count() > 0;
const faceSwapInput2 = await page.locator('#fileInput2-face-swap').count() > 0;
log('Face Swap: Two file inputs exist', faceSwapInput1 && faceSwapInput2);

const faceSwapModes = await page.locator('text=Swap Mode').isVisible();
log('Face Swap: Swap Mode options exist', faceSwapModes);

const faceSwapEnhancement = await page.locator('text=Enhancement Options').isVisible();
log('Face Swap: Enhancement options exist', faceSwapEnhancement);

await page.click('#agentDetailPage button[onclick="closeDetail()"]');
await page.waitForTimeout(400);

// Test 3: AI Model Swap has two uploads (Product Photo + New Model)
console.log('\n--- AI Model Swap ---');
await page.click('[onclick="openDetail(\'ai-model-swap\')"]');
await page.waitForTimeout(500);

const modelSwapProduct = await page.getByText('Product Photo', { exact: true }).isVisible();
log('AI Model Swap: Product Photo section exists', modelSwapProduct);

const modelSwapNew = await page.getByText('New Model', { exact: true }).isVisible();
log('AI Model Swap: New Model section exists', modelSwapNew);

const modelSwapInput1 = await page.locator('#fileInput-ai-model-swap').count() > 0;
const modelSwapInput2 = await page.locator('#fileInput2-ai-model-swap').count() > 0;
log('AI Model Swap: Two file inputs exist', modelSwapInput1 && modelSwapInput2);

const modelSwapPref = await page.locator('text=Model Preferences').isVisible();
log('AI Model Swap: Model Preferences options exist', modelSwapPref);

const modelSwapBody = await page.locator('text=Body Type').isVisible();
log('AI Model Swap: Body Type options exist', modelSwapBody);

const modelSwapPose = await page.locator('text=Pose Matching').isVisible();
log('AI Model Swap: Pose Matching options exist', modelSwapPose);

await page.click('#agentDetailPage button[onclick="closeDetail()"]');
await page.waitForTimeout(400);

await browser.close();

// Summary
console.log('\n=== TEST SUMMARY ===');
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`Passed: ${passed}/${results.length}`);
console.log(`Failed: ${failed}/${results.length}`);

if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.test}: ${r.details}`));
}

console.log(`\n${allTestsPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);
