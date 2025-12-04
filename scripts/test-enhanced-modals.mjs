import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

console.log('=== TESTING ENHANCED AGENT MODALS ===\n');

const agentsToTest = [
  { id: 'virtual-try-on', expectedElements: ['Select Model', 'Upload clothing image', 'All Genders'] },
  { id: 'video-generator', expectedElements: ['Start frame', 'End frame', 'Model', 'Duration', 'Resolution'] },
  { id: 'lip-sync', expectedElements: ['Upload Portrait', 'Audio Input', 'Language', 'Voice Style'] },
  { id: 'music-generator', expectedElements: ['Describe your music', 'Genre', 'Mood', 'Duration'] },
  { id: 'voice-cloner', expectedElements: ['Voice Type', 'Upload Voice Sample', 'Text to Speak', 'Language', 'Emotion'] },
  { id: 'chibi-sticker-maker', expectedElements: ['Upload Your Photo', 'Sticker Style', 'Pack Size', 'Expressions'] },
  { id: 'product-description-writer', expectedElements: ['Product Name', 'Key Features', 'Target Platform', 'Tone'] },
  { id: 'face-swap', expectedElements: ['Source Face', 'Target Image', 'Swap Mode'] },
  { id: 'image-upscaler', expectedElements: ['Upload Image', 'Scale'] }
];

let passed = 0;
let failed = 0;

for (const agent of agentsToTest) {
  try {
    // Open modal
    await page.evaluate((agentId) => openDetail(agentId), agent.id);
    await page.waitForTimeout(500);

    // Get modal content
    const modalHTML = await page.locator('#modalContent').innerHTML();

    // Check for expected elements
    let allFound = true;
    const missing = [];

    for (const expected of agent.expectedElements) {
      if (!modalHTML.includes(expected)) {
        allFound = false;
        missing.push(expected);
      }
    }

    if (allFound) {
      console.log(`✅ ${agent.id}: All expected elements found`);
      passed++;
    } else {
      console.log(`❌ ${agent.id}: Missing elements: ${missing.join(', ')}`);
      failed++;
    }

    // Close modal
    await page.evaluate(() => closeDetail());
    await page.waitForTimeout(300);
  } catch (err) {
    console.log(`❌ ${agent.id}: Error - ${err.message}`);
    failed++;
  }
}

// Take screenshot of one modal
await page.evaluate(() => openDetail('virtual-try-on'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'virtual-try-on-modal.png' });
console.log('\nScreenshot saved: virtual-try-on-modal.png');

await page.evaluate(() => closeDetail());
await page.waitForTimeout(300);

await page.evaluate(() => openDetail('video-generator'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'video-generator-modal.png' });
console.log('Screenshot saved: video-generator-modal.png');

await browser.close();

console.log(`\n=== RESULTS ===`);
console.log(`Passed: ${passed}/${agentsToTest.length}`);
console.log(`Failed: ${failed}/${agentsToTest.length}`);
console.log(`${failed === 0 ? '✅ ALL MODALS ENHANCED!' : '❌ SOME MODALS NEED FIXES'}`);
