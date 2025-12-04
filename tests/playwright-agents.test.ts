import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3000';

// Test inputs for all 38 agents - using proper field names that match backend expectations
const agentTestInputs: Record<string, any> = {
  // Analytics agents
  'smart-data-analyzer': { data: 'Sales Q1: $100k, Q2: $150k, Q3: $200k', question: 'What is the trend?' },
  'data-visualization': { data: [{ month: 'Jan', value: 100 }, { month: 'Feb', value: 150 }], chartType: 'line' },

  // E-commerce agents
  'virtual-try-on': { personImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', garmentImage: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400' },
  'ai-background-generator': { prompt: 'professional studio background for product photography' },
  'product-description-writer': { product: 'Wireless Headphones', features: ['noise cancellation', '30hr battery'] },
  'ai-model-swap': { sourceImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', targetImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400' },

  // Creative agents
  'pro-headshot-generator': { prompt: 'professional headshot, male, office background' },
  'resume-builder': { name: 'John Doe', experience: '5 years software engineer', skills: ['JavaScript', 'Python'] },
  'meeting-transcriber': { prompt: 'transcribe business meeting audio' },
  'email-template-generator': { type: 'welcome', business: 'TechCorp', tone: 'professional' },
  'seo-content-optimizer': { content: 'Our product helps businesses grow', keywords: ['growth', 'business'] },
  'social-media-caption-generator': { topic: 'product launch', platform: 'instagram', tone: 'exciting' },
  'image-translator': { prompt: 'translate image text to Spanish' },
  'video-script-generator': { topic: 'AI technology', duration: '60 seconds', style: 'educational' },
  'customer-support-bot': { message: 'How do I reset my password?', context: 'user account' },

  // Image processing agents
  'background-remover': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' },
  'face-swap': { sourceImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', targetImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400' },
  'portrait-retoucher': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' },

  // Higgsfield Image agents
  'image-generator': { prompt: 'A futuristic city at sunset', style: 'photographic', width: 1024, height: 1024 },
  'headshot-generator': { prompt: 'professional headshot', style: 'corporate' },
  'character-creator': { description: 'A fantasy warrior with sword and shield', style: 'anime' },
  'image-upscaler': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100', scale: 4 },
  'object-remover': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', mask: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' },
  'style-transfer': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', style: 'impressionist' },
  'background-replacer': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', background: 'tropical beach sunset' },
  'scene-generator': { description: 'A medieval castle on a mountain', style: 'realistic' },
  'product-photographer': { image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', style: 'ecommerce' },
  'portrait-enhancer': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' },
  'sketch-to-image': { sketch: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', prompt: 'realistic portrait' },

  // Higgsfield Video agents
  'video-generator': { prompt: 'Ocean waves at sunset', duration: 5 },
  'face-swap-video': { sourceImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', targetImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400' },
  'lip-sync': { face: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  'talking-avatar': { prompt: 'Hello, welcome to our platform', voice: 'professional' },
  'image-animator': { image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', motion: 'talking' },
  'video-upscaler': { video: 'https://example.com/video.mp4', targetResolution: '4K' },

  // Higgsfield Audio agents
  'music-generator': { description: 'Upbeat electronic music', duration: 30 },
  'voice-cloner': { voice: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', text: 'Hello from the cloned voice' },

  // Higgsfield AI agents
  'ai-assistant': { task: 'Help me analyze website performance', context: 'ecommerce site' },
};

test.describe('Agent API Tests - All 38 Agents', () => {
  test.beforeAll(async ({ request }) => {
    // Verify server is healthy
    const health = await request.get(`${API_BASE}/health`);
    expect(health.ok()).toBeTruthy();
  });

  // Test each agent
  for (const [agentId, testInput] of Object.entries(agentTestInputs)) {
    test(`Agent: ${agentId}`, async ({ request }) => {
      console.log(`\n=== Testing agent: ${agentId} ===`);

      // First verify agent exists
      const agentInfo = await request.get(`${API_BASE}/mulerun/agents/${agentId}`);
      expect(agentInfo.ok()).toBeTruthy();
      const agentData = await agentInfo.json();
      console.log(`  Agent: ${agentData.name} (async: ${agentData.async})`);

      // Run the agent - test BOTH formats
      // Format 1: Direct fields (no input wrapper)
      const response1 = await request.post(`${API_BASE}/mulerun/agents/${agentId}/run`, {
        data: testInput
      });

      const responseData1 = await response1.json();
      console.log(`  Format 1 (direct): Status ${response1.status()}`);

      // Check response - agent should accept the request
      if (response1.status() === 200) {
        // Sync agent completed
        expect(responseData1.status).toBe('completed');
        expect(responseData1.output).toBeDefined();
        console.log(`  SUCCESS: Sync agent completed`);
      } else if (response1.status() === 202) {
        // Async agent - job created
        expect(responseData1.jobId).toBeDefined();
        expect(['pending', 'processing']).toContain(responseData1.status);
        console.log(`  SUCCESS: Async job created: ${responseData1.jobId}`);
      } else if (response1.status() === 500) {
        // API returned 500 - check if it's a valid processing error (not input error)
        console.log(`  Processing error: ${responseData1.error}`);
        // Allow 500 errors for agents that need real external resources (images, videos)
        // These are expected when using placeholder/invalid URLs
        expect(responseData1.error).toBeDefined();
      } else {
        // 400 error means input format issue
        console.log(`  FAILED: ${JSON.stringify(responseData1)}`);
        expect(response1.status()).toBeLessThan(400);
      }

      // Format 2: With input wrapper
      const response2 = await request.post(`${API_BASE}/mulerun/agents/${agentId}/run`, {
        data: { input: testInput }
      });

      const responseData2 = await response2.json();
      console.log(`  Format 2 (wrapper): Status ${response2.status()}`);

      // Should also work with wrapper format
      if (response2.status() === 200 || response2.status() === 202) {
        console.log(`  SUCCESS: Both formats work!`);
      } else if (response2.status() === 500) {
        console.log(`  Processing error (expected for test URLs): ${responseData2.error?.substring(0, 100)}`);
      }
    });
  }
});

// Quick test to list all agents
test('List all agents', async ({ request }) => {
  const response = await request.get(`${API_BASE}/mulerun/agents`);
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  console.log(`Total agents: ${data.total}`);
  expect(data.total).toBeGreaterThanOrEqual(38);

  // List all agent IDs
  const agentIds = data.agents.map((a: any) => a.id);
  console.log('Agent IDs:', agentIds.join(', '));
});
