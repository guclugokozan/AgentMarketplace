import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Get all image URLs and their load status
const imageStatus = await page.evaluate(() => {
  const images = document.querySelectorAll('#popularAgents img, #allAgents img');
  return Array.from(images).slice(0, 10).map(img => ({
    src: img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete,
    loaded: img.naturalWidth > 0
  }));
});

console.log('Image status (first 10):');
imageStatus.forEach((img, i) => {
  console.log(`${i + 1}. ${img.loaded ? 'OK' : 'FAILED'} - ${img.src.substring(0, 80)}...`);
});

// Check specific agent icons
const agentIcons = await page.evaluate(() => {
  return Object.entries(window.agents || {}).slice(0, 5).map(([id, agent]) => ({
    id,
    name: agent.name,
    icon: agent.icon
  }));
});

console.log('\nAgent icons:');
agentIcons.forEach(a => console.log(`${a.id}: ${a.icon?.substring(0, 60)}...`));

// Try to fetch one icon directly
const testUrl = 'https://agent-assets-prod.muleusercontent.com/agents/agent-assets/20251111/54e2dc15-d602-40aa-9b09-0983f7a4f8b3/虚拟试衣.png';
const response = await page.request.get(testUrl).catch(e => ({ status: () => 'error', statusText: () => e.message }));
console.log('\nTest icon fetch status:', response.status(), response.statusText?.() || '');

await browser.close();
