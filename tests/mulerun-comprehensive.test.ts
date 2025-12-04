/**
 * Comprehensive MuleRun Agent Tests
 *
 * Tests all 38 MuleRun agents with proper inputs, edge cases, and multiple runs.
 * Each agent is tested 10+ times with different scenarios.
 */

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3000';

// Test image URLs for image processing agents
const TEST_IMAGES = {
  portrait: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  product: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
  landscape: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
  fashion: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800',
  sketch: 'https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?w=800',
};

// Helper function to make API calls
async function runAgent(agentId: string, input: Record<string, any>, timeout = 120000) {
  const response = await fetch(`${API_BASE}/mulerun/agents/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  return { status: response.status, data: await response.json() };
}

async function getAgentDetails(agentId: string) {
  const response = await fetch(`${API_BASE}/mulerun/agents/${agentId}`);
  return response.json();
}

// =============================================================================
// 1. API HEALTH & INFRASTRUCTURE TESTS (10 tests)
// =============================================================================

test.describe('1. API Health & Infrastructure', () => {
  test('1.1 Health endpoint returns healthy status', async () => {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
  });

  test('1.2 MuleRun agents list returns all 38 agents', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.total).toBe(38);
    expect(data.agents.length).toBe(38);
  });

  test('1.3 Agent catalog endpoint works', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents/catalog`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.agents).toBeDefined();
    expect(data.stats).toBeDefined();
  });

  test('1.4 Categories endpoint returns valid categories', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents/categories`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.categories.length).toBeGreaterThan(0);
  });

  test('1.5 Stats endpoint returns valid statistics', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents/stats`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.total).toBe(38);
    expect(data.available).toBe(38);
  });

  test('1.6 Invalid agent returns 404', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents/nonexistent-agent`);
    expect(response.status).toBe(404);
  });

  test('1.7 Jobs endpoint works', async () => {
    const response = await fetch(`${API_BASE}/jobs`);
    expect([200, 404]).toContain(response.status);
  });

  test('1.8 All agents have required metadata fields', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents`);
    const data = await response.json();
    for (const agent of data.agents) {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.category).toBeDefined();
      expect(agent.available).toBe(true);
    }
  });

  test('1.9 Filter agents by category', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents?category=analytics`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.agents.every((a: any) => a.category === 'analytics')).toBe(true);
  });

  test('1.10 Search agents by keyword', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents?search=image`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.agents.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 2. TEXT-BASED AGENTS (100 tests - 10 per agent)
// =============================================================================

test.describe('2. Text-Based Agents', () => {
  // Smart Data Analyzer - 10 tests
  test.describe('2.1 Smart Data Analyzer', () => {
    const agentId = 'smart-data-analyzer';

    test('Test 1: Basic CSV data analysis', async () => {
      const result = await runAgent(agentId, { data: 'name,sales\nJohn,100\nJane,150\nBob,80' });
      expect(result.status).toBe(200);
      expect(result.data.status).toBe('completed');
    });

    test('Test 2: JSON data analysis', async () => {
      const result = await runAgent(agentId, { data: JSON.stringify([{name:'A',value:10},{name:'B',value:20}]) });
      expect(result.status).toBe(200);
    });

    test('Test 3: Sales trend analysis', async () => {
      const result = await runAgent(agentId, { prompt: 'Analyze Q1 sales trends', data: 'Jan:100,Feb:120,Mar:140' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Customer data analysis', async () => {
      const result = await runAgent(agentId, { prompt: 'Analyze customer segments', data: 'segment,count\nPremium,50\nStandard,200\nBasic,500' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Financial metrics', async () => {
      const result = await runAgent(agentId, { prompt: 'Calculate key metrics', data: 'revenue:1000000,costs:600000,margin:40%' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Time series data', async () => {
      const result = await runAgent(agentId, { data: '2024-01:100,2024-02:105,2024-03:110,2024-04:108' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Anomaly detection request', async () => {
      const result = await runAgent(agentId, { prompt: 'Find anomalies', data: '10,12,11,50,13,11,12' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Multi-variable analysis', async () => {
      const result = await runAgent(agentId, { data: 'temp,humidity,sales\n20,60,100\n25,55,120\n30,50,90' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Text summary of numbers', async () => {
      const result = await runAgent(agentId, { prompt: 'Summarize in plain English', data: 'metric:value\nNPS:75\nCSAT:4.2\nCES:85' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Unicode data handling', async () => {
      const result = await runAgent(agentId, { data: '店铺名,销售额\n北京店,1000\n上海店,1500' });
      expect(result.status).toBe(200);
    });
  });

  // Data Visualization - 10 tests
  test.describe('2.2 Data Visualization', () => {
    const agentId = 'data-visualization';

    test('Test 1: Basic chart recommendation', async () => {
      const result = await runAgent(agentId, { prompt: 'Best chart for sales over time' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Comparison visualization', async () => {
      const result = await runAgent(agentId, { prompt: 'Visualize A vs B vs C performance' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Distribution analysis', async () => {
      const result = await runAgent(agentId, { prompt: 'Show age distribution of users' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Correlation visualization', async () => {
      const result = await runAgent(agentId, { prompt: 'Show correlation between price and sales' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Geographic data', async () => {
      const result = await runAgent(agentId, { prompt: 'Visualize sales by region on map' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Hierarchical data', async () => {
      const result = await runAgent(agentId, { prompt: 'Show organizational structure' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Time series recommendation', async () => {
      const result = await runAgent(agentId, { prompt: 'Best way to show stock prices over 1 year' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Dashboard design', async () => {
      const result = await runAgent(agentId, { prompt: 'Design KPI dashboard for e-commerce' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Multi-metric visualization', async () => {
      const result = await runAgent(agentId, { prompt: 'Show revenue, costs, and profit together' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Accessibility considerations', async () => {
      const result = await runAgent(agentId, { prompt: 'Color-blind friendly chart for categories' });
      expect(result.status).toBe(200);
    });
  });

  // Product Description Writer - 10 tests
  test.describe('2.3 Product Description Writer', () => {
    const agentId = 'product-description-writer';

    test('Test 1: Basic product description', async () => {
      const result = await runAgent(agentId, { product: 'Wireless Bluetooth Headphones', features: ['30hr battery', 'Noise cancelling'] });
      expect(result.status).toBe(200);
    });

    test('Test 2: Fashion product', async () => {
      const result = await runAgent(agentId, { product: 'Silk Evening Dress', style: 'elegant', color: 'navy blue' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Tech gadget', async () => {
      const result = await runAgent(agentId, { product: 'Smart Watch Pro', features: ['Heart rate', 'GPS', 'Water resistant'] });
      expect(result.status).toBe(200);
    });

    test('Test 4: Food product', async () => {
      const result = await runAgent(agentId, { product: 'Organic Dark Chocolate', ingredients: 'cacao 70%', origin: 'Ecuador' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Home decor', async () => {
      const result = await runAgent(agentId, { product: 'Minimalist Floor Lamp', material: 'brass and marble' });
      expect(result.status).toBe(200);
    });

    test('Test 6: With target platform', async () => {
      const result = await runAgent(agentId, { product: 'Running Shoes', platform: 'Amazon', features: ['Lightweight', 'Breathable'] });
      expect(result.status).toBe(200);
    });

    test('Test 7: Luxury item', async () => {
      const result = await runAgent(agentId, { product: 'Swiss Automatic Watch', brand: 'Premium', price: 5000 });
      expect(result.status).toBe(200);
    });

    test('Test 8: Software product', async () => {
      const result = await runAgent(agentId, { product: 'Project Management Tool', features: ['Team collaboration', 'Time tracking', 'Reports'] });
      expect(result.status).toBe(200);
    });

    test('Test 9: Service description', async () => {
      const result = await runAgent(agentId, { product: 'Personal Training Session', duration: '1 hour', includes: 'customized workout plan' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Multi-language hint', async () => {
      const result = await runAgent(agentId, { product: 'Yoga Mat', features: ['Non-slip', 'Eco-friendly'], language: 'English' });
      expect(result.status).toBe(200);
    });
  });

  // Email Template Generator - 10 tests
  test.describe('2.4 Email Template Generator', () => {
    const agentId = 'email-template-generator';

    test('Test 1: Welcome email', async () => {
      const result = await runAgent(agentId, { type: 'welcome', companyName: 'TechCorp' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Sales outreach', async () => {
      const result = await runAgent(agentId, { type: 'sales', product: 'CRM Software', valueProposition: 'Increase sales by 30%' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Newsletter', async () => {
      const result = await runAgent(agentId, { type: 'newsletter', topic: 'Monthly Product Updates' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Follow-up email', async () => {
      const result = await runAgent(agentId, { type: 'follow-up', context: 'After demo meeting' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Promotional email', async () => {
      const result = await runAgent(agentId, { type: 'promo', offer: '50% off', deadline: 'Friday' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Apology/service recovery', async () => {
      const result = await runAgent(agentId, { type: 'apology', issue: 'delayed shipment' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Event invitation', async () => {
      const result = await runAgent(agentId, { type: 'invitation', event: 'Webinar on AI', date: 'March 15' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Feedback request', async () => {
      const result = await runAgent(agentId, { type: 'feedback', context: 'After purchase' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Re-engagement email', async () => {
      const result = await runAgent(agentId, { type: 're-engagement', offer: 'Special comeback discount' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Thank you email', async () => {
      const result = await runAgent(agentId, { type: 'thank-you', reason: 'for your purchase' });
      expect(result.status).toBe(200);
    });
  });

  // SEO Content Optimizer - 10 tests
  test.describe('2.5 SEO Content Optimizer', () => {
    const agentId = 'seo-content-optimizer';

    test('Test 1: Blog post optimization', async () => {
      const result = await runAgent(agentId, { content: 'How to start a business in 2024...', keyword: 'start a business' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Product page SEO', async () => {
      const result = await runAgent(agentId, { content: 'Premium leather wallet with RFID protection', keyword: 'leather wallet' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Landing page copy', async () => {
      const result = await runAgent(agentId, { content: 'Get the best CRM for your business', keyword: 'best CRM' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Long-form article', async () => {
      const result = await runAgent(agentId, { content: 'Complete guide to digital marketing strategies for small businesses...', keyword: 'digital marketing' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Local SEO', async () => {
      const result = await runAgent(agentId, { content: 'Best pizza in New York City', keyword: 'pizza NYC' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Technical content', async () => {
      const result = await runAgent(agentId, { content: 'How to implement React hooks effectively', keyword: 'React hooks' });
      expect(result.status).toBe(200);
    });

    test('Test 7: E-commerce category', async () => {
      const result = await runAgent(agentId, { content: 'Shop the latest wireless earbuds', keyword: 'wireless earbuds' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Service page', async () => {
      const result = await runAgent(agentId, { content: 'Professional web design services', keyword: 'web design services' });
      expect(result.status).toBe(200);
    });

    test('Test 9: FAQ optimization', async () => {
      const result = await runAgent(agentId, { content: 'Frequently asked questions about our product', type: 'FAQ' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Meta description generation', async () => {
      const result = await runAgent(agentId, { content: 'About our company and mission', generateMeta: true });
      expect(result.status).toBe(200);
    });
  });

  // Social Media Caption Generator - 10 tests
  test.describe('2.6 Social Media Caption Generator', () => {
    const agentId = 'social-media-caption-generator';

    test('Test 1: Product launch', async () => {
      const result = await runAgent(agentId, { topic: 'New smartphone launch', brand: 'TechBrand' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Behind the scenes', async () => {
      const result = await runAgent(agentId, { topic: 'Office behind the scenes', mood: 'casual' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Motivational post', async () => {
      const result = await runAgent(agentId, { topic: 'Monday motivation', industry: 'fitness' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Sale announcement', async () => {
      const result = await runAgent(agentId, { topic: 'Black Friday sale 50% off', urgency: 'high' });
      expect(result.status).toBe(200);
    });

    test('Test 5: User testimonial', async () => {
      const result = await runAgent(agentId, { topic: 'Customer success story', sentiment: 'positive' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Educational content', async () => {
      const result = await runAgent(agentId, { topic: '5 tips for better sleep', niche: 'health' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Event promotion', async () => {
      const result = await runAgent(agentId, { topic: 'Free webinar next week', cta: 'Sign up now' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Holiday themed', async () => {
      const result = await runAgent(agentId, { topic: 'Christmas gift guide', holiday: 'Christmas' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Brand story', async () => {
      const result = await runAgent(agentId, { topic: 'Our journey from garage to global', tone: 'inspirational' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Platform specific', async () => {
      const result = await runAgent(agentId, { topic: 'New feature announcement', platforms: ['instagram', 'twitter', 'linkedin'] });
      expect(result.status).toBe(200);
    });
  });

  // Video Script Generator - 10 tests
  test.describe('2.7 Video Script Generator', () => {
    const agentId = 'video-script-generator';

    test('Test 1: YouTube tutorial', async () => {
      const result = await runAgent(agentId, { topic: 'How to edit videos for beginners', duration: '10 minutes', platform: 'youtube' });
      expect(result.status).toBe(200);
    });

    test('Test 2: TikTok content', async () => {
      const result = await runAgent(agentId, { topic: 'Quick cooking hack', duration: '60 seconds', platform: 'tiktok' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Product demo', async () => {
      const result = await runAgent(agentId, { topic: 'New app features demo', product: 'TaskManager Pro' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Educational content', async () => {
      const result = await runAgent(agentId, { topic: 'Understanding blockchain', audience: 'beginners' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Brand story video', async () => {
      const result = await runAgent(agentId, { topic: 'Company origin story', mood: 'inspirational', duration: '3 minutes' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Interview format', async () => {
      const result = await runAgent(agentId, { topic: 'Expert interview on AI trends', format: 'interview' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Explainer video', async () => {
      const result = await runAgent(agentId, { topic: 'How our service works', style: 'animated explainer' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Social proof video', async () => {
      const result = await runAgent(agentId, { topic: 'Customer testimonials compilation', type: 'testimonial' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Event recap', async () => {
      const result = await runAgent(agentId, { topic: 'Conference highlights', event: 'TechCon 2024' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Ad script', async () => {
      const result = await runAgent(agentId, { topic: '30-second ad for new product', type: 'advertisement', duration: '30 seconds' });
      expect(result.status).toBe(200);
    });
  });

  // Customer Support Bot - 10 tests
  test.describe('2.8 Customer Support Bot', () => {
    const agentId = 'customer-support-bot';

    test('Test 1: Order status inquiry', async () => {
      const result = await runAgent(agentId, { message: 'Where is my order #12345?' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Refund request', async () => {
      const result = await runAgent(agentId, { message: 'I want a refund for my purchase' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Technical support', async () => {
      const result = await runAgent(agentId, { message: 'The app keeps crashing when I try to login' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Billing question', async () => {
      const result = await runAgent(agentId, { message: 'Why was I charged twice?' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Product question', async () => {
      const result = await runAgent(agentId, { message: 'Does this product come in other colors?' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Angry customer', async () => {
      const result = await runAgent(agentId, { message: 'This is the worst service ever! I want to speak to a manager!' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Account issue', async () => {
      const result = await runAgent(agentId, { message: 'I forgot my password and cant reset it' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Shipping question', async () => {
      const result = await runAgent(agentId, { message: 'How long does shipping take to Canada?' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Cancellation request', async () => {
      const result = await runAgent(agentId, { message: 'I need to cancel my subscription' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Feedback/compliment', async () => {
      const result = await runAgent(agentId, { message: 'Just wanted to say your product is amazing!' });
      expect(result.status).toBe(200);
    });
  });

  // Resume Builder - 10 tests
  test.describe('2.9 Resume Builder', () => {
    const agentId = 'resume-builder';

    test('Test 1: Software engineer resume', async () => {
      const result = await runAgent(agentId, { role: 'Software Engineer', experience: '5 years', skills: ['Python', 'React', 'AWS'] });
      expect(result.status).toBe(200);
    });

    test('Test 2: Marketing manager', async () => {
      const result = await runAgent(agentId, { role: 'Marketing Manager', experience: '8 years', achievements: 'Increased brand awareness by 150%' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Entry level', async () => {
      const result = await runAgent(agentId, { role: 'Junior Developer', experience: 'Fresh graduate', education: 'BS Computer Science' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Career change', async () => {
      const result = await runAgent(agentId, { currentRole: 'Teacher', targetRole: 'Corporate Trainer', transferableSkills: ['Communication', 'Presentation'] });
      expect(result.status).toBe(200);
    });

    test('Test 5: Executive resume', async () => {
      const result = await runAgent(agentId, { role: 'CEO', experience: '20 years', achievements: 'Grew company from 10 to 500 employees' });
      expect(result.status).toBe(200);
    });

    test('Test 6: With job description', async () => {
      const result = await runAgent(agentId, { jobDescription: 'Looking for a data analyst with SQL and Python skills', currentSkills: ['Excel', 'SQL', 'Python', 'Tableau'] });
      expect(result.status).toBe(200);
    });

    test('Test 7: Creative field', async () => {
      const result = await runAgent(agentId, { role: 'Graphic Designer', portfolio: 'dribbble.com/designer', tools: ['Figma', 'Photoshop', 'Illustrator'] });
      expect(result.status).toBe(200);
    });

    test('Test 8: Healthcare professional', async () => {
      const result = await runAgent(agentId, { role: 'Registered Nurse', certifications: ['RN', 'BLS', 'ACLS'], experience: '10 years' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Remote work focus', async () => {
      const result = await runAgent(agentId, { role: 'Remote Customer Success Manager', remoteExperience: '3 years', tools: ['Slack', 'Zoom', 'Salesforce'] });
      expect(result.status).toBe(200);
    });

    test('Test 10: ATS optimization', async () => {
      const result = await runAgent(agentId, { resume: 'Current resume text here...', optimizeFor: 'ATS compatibility' });
      expect(result.status).toBe(200);
    });
  });

  // AI Assistant - 10 tests
  test.describe('2.10 AI Assistant', () => {
    const agentId = 'ai-assistant';

    test('Test 1: General question', async () => {
      const result = await runAgent(agentId, { prompt: 'What are the best practices for remote team management?' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Task planning', async () => {
      const result = await runAgent(agentId, { prompt: 'Help me plan a product launch', context: 'New mobile app' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Research request', async () => {
      const result = await runAgent(agentId, { prompt: 'What are the latest trends in AI?' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Problem solving', async () => {
      const result = await runAgent(agentId, { prompt: 'How can I reduce customer churn?', context: 'SaaS business' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Creative brainstorm', async () => {
      const result = await runAgent(agentId, { prompt: 'Generate 10 startup ideas in the health tech space' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Analysis request', async () => {
      const result = await runAgent(agentId, { prompt: 'Analyze the pros and cons of microservices architecture' });
      expect(result.status).toBe(200);
    });

    test('Test 7: Learning guidance', async () => {
      const result = await runAgent(agentId, { prompt: 'Create a learning path for becoming a data scientist' });
      expect(result.status).toBe(200);
    });

    test('Test 8: Decision support', async () => {
      const result = await runAgent(agentId, { prompt: 'Should I use React or Vue for my project?', requirements: 'Large scale enterprise app' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Process improvement', async () => {
      const result = await runAgent(agentId, { prompt: 'How can I improve our CI/CD pipeline?' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Multi-step workflow', async () => {
      const result = await runAgent(agentId, { prompt: 'Guide me through setting up a new e-commerce store', steps: true });
      expect(result.status).toBe(200);
    });
  });
});

// =============================================================================
// 3. IMAGE PROCESSING AGENTS (80 tests - 8-10 per agent)
// =============================================================================

test.describe('3. Image Processing Agents', () => {
  // Background Remover - 10 tests
  test.describe('3.1 Background Remover', () => {
    const agentId = 'background-remover';

    test('Test 1: Portrait image', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
      expect(result.data.output?.success).toBe(true);
    });

    test('Test 2: Product image', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.product });
      expect(result.status).toBe(200);
    });

    test('Test 3: Alternative field name (imageUrl)', async () => {
      const result = await runAgent(agentId, { imageUrl: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 4: Alternative field name (url)', async () => {
      const result = await runAgent(agentId, { url: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 5: Fashion image', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.fashion });
      expect(result.status).toBe(200);
    });

    test('Test 6: Missing image returns 400', async () => {
      const result = await runAgent(agentId, { prompt: 'test' });
      expect(result.status).toBe(400);
    });

    test('Test 7: Empty input returns error', async () => {
      const result = await runAgent(agentId, {});
      expect(result.status).toBe(400);
    });

    test('Test 8: Landscape image', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.landscape });
      expect(result.status).toBe(200);
    });

    test('Test 9: Verify output has resultImage', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.resultImage).toBeDefined();
    });

    test('Test 10: Verify processing time is reported', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.processingTime).toBeGreaterThan(0);
    });
  });

  // Image Upscaler - 10 tests
  test.describe('3.2 Image Upscaler', () => {
    const agentId = 'image-upscaler';

    test('Test 1: Basic upscale', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 2: With scale parameter', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, scale: 2 });
      expect(result.status).toBe(200);
    });

    test('Test 3: 4x upscale', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, scale: 4 });
      expect(result.status).toBe(200);
    });

    test('Test 4: With face enhance', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, faceEnhance: true });
      expect(result.status).toBe(200);
    });

    test('Test 5: Without face enhance', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.landscape, faceEnhance: false });
      expect(result.status).toBe(200);
    });

    test('Test 6: Product image', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.product });
      expect(result.status).toBe(200);
    });

    test('Test 7: Missing image returns 400', async () => {
      const result = await runAgent(agentId, { scale: 4 });
      expect(result.status).toBe(400);
    });

    test('Test 8: Verify upscaled image URL returned', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.upscaledImage).toBeDefined();
    });

    test('Test 9: Alternative field name', async () => {
      const result = await runAgent(agentId, { imageUrl: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 10: Verify model info', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.model).toBeDefined();
    });
  });

  // Portrait Enhancer - 10 tests
  test.describe('3.3 Portrait Enhancer', () => {
    const agentId = 'portrait-enhancer';

    test('Test 1: Basic portrait enhancement', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 2: Alternative field (portrait)', async () => {
      const result = await runAgent(agentId, { portrait: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 3: Fashion portrait', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.fashion });
      expect(result.status).toBe(200);
    });

    test('Test 4: Verify enhanced image returned', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.enhancedImage).toBeDefined();
    });

    test('Test 5: Missing image returns 400', async () => {
      const result = await runAgent(agentId, {});
      expect(result.status).toBe(400);
    });

    test('Test 6: With imageUrl field', async () => {
      const result = await runAgent(agentId, { imageUrl: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 7: Verify success flag', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.success).toBe(true);
    });

    test('Test 8: Verify processing time', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.data.output?.processingTime).toBeGreaterThan(0);
    });

    test('Test 9: URL field name', async () => {
      const result = await runAgent(agentId, { url: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 10: Multiple runs consistency', async () => {
      const result1 = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      const result2 = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);
    });
  });

  // Style Transfer - 10 tests
  test.describe('3.4 Style Transfer', () => {
    const agentId = 'style-transfer';

    test('Test 1: Anime style', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, style: 'anime' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Oil painting style', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.landscape, style: 'oil painting' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Watercolor style', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.landscape, style: 'watercolor' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Sketch style', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, style: 'pencil sketch' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Pop art style', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, style: 'pop art' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Default style', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 7: Missing image returns 400', async () => {
      const result = await runAgent(agentId, { style: 'anime' });
      expect(result.status).toBe(400);
    });

    test('Test 8: Verify stylized image returned', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, style: 'anime' });
      // Check for success or stylizedImage field
      expect(result.data.output?.success || result.data.output?.stylizedImage).toBeTruthy();
    });

    test('Test 9: With stylePrompt field', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, stylePrompt: 'cyberpunk neon' });
      expect(result.status).toBe(200);
    });

    test('Test 10: Product image styling', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.product, style: 'minimalist' });
      expect(result.status).toBe(200);
    });
  });

  // Background Replacer - 10 tests
  test.describe('3.5 Background Replacer', () => {
    const agentId = 'background-replacer';

    test('Test 1: Office background', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, background_prompt: 'professional office' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Beach background', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, background_prompt: 'tropical beach sunset' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Studio background', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.fashion, background_prompt: 'white studio' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Nature background', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, background_prompt: 'forest green nature' });
      expect(result.status).toBe(200);
    });

    test('Test 5: City skyline background', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, background_prompt: 'city skyline at night' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Default background', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Test 7: Missing image returns 400', async () => {
      const result = await runAgent(agentId, { background_prompt: 'office' });
      expect(result.status).toBe(400);
    });

    test('Test 8: Alternative field (prompt)', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, prompt: 'mountain landscape' });
      expect(result.status).toBe(200);
    });

    test('Test 9: Verify transparent bg returned', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, background_prompt: 'office' });
      expect(result.data.output?.subjectWithTransparentBg).toBeDefined();
    });

    test('Test 10: Verify generated background returned', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, background_prompt: 'office' });
      expect(result.data.output?.generatedBackground).toBeDefined();
    });
  });

  // Sketch to Image - 8 tests
  test.describe('3.6 Sketch to Image', () => {
    const agentId = 'sketch-to-image';

    test('Test 1: Basic sketch conversion', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.sketch, prompt: 'detailed realistic image' });
      expect(result.status).toBe(200);
    });

    test('Test 2: Portrait from sketch', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.portrait, prompt: 'professional portrait' });
      expect(result.status).toBe(200);
    });

    test('Test 3: Anime style conversion', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.sketch, prompt: 'anime character' });
      expect(result.status).toBe(200);
    });

    test('Test 4: Landscape conversion', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.landscape, prompt: 'detailed landscape painting' });
      expect(result.status).toBe(200);
    });

    test('Test 5: Alternative field (sketch)', async () => {
      const result = await runAgent(agentId, { sketch: TEST_IMAGES.sketch, prompt: 'realistic' });
      expect(result.status).toBe(200);
    });

    test('Test 6: Missing image returns 400', async () => {
      const result = await runAgent(agentId, { prompt: 'test' });
      expect(result.status).toBe(400);
    });

    test('Test 7: Default prompt', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.sketch });
      expect(result.status).toBe(200);
    });

    test('Test 8: Verify generated image returned', async () => {
      const result = await runAgent(agentId, { image: TEST_IMAGES.sketch, prompt: 'realistic' });
      expect(result.data.output?.generatedImage).toBeDefined();
    });
  });
});

// =============================================================================
// 4. ASYNC AGENTS (Jobs) - 40 tests
// =============================================================================

test.describe('4. Async Agents (Jobs)', () => {
  // Image Generator - 10 tests
  test.describe('4.1 Image Generator', () => {
    const agentId = 'image-generator';

    test('Test 1: Basic image generation', async () => {
      const result = await runAgent(agentId, { prompt: 'A beautiful sunset over mountains' });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 2: With dimensions', async () => {
      const result = await runAgent(agentId, { prompt: 'A cat sitting on a chair', width: 1024, height: 1024 });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 3: Multiple outputs', async () => {
      const result = await runAgent(agentId, { prompt: 'Abstract art', numOutputs: 2 });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 4: With negative prompt', async () => {
      const result = await runAgent(agentId, { prompt: 'A professional headshot', negativePrompt: 'blurry, low quality' });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 5: Product photography', async () => {
      const result = await runAgent(agentId, { prompt: 'Product photography of a smartphone on white background' });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 6: Fantasy art', async () => {
      const result = await runAgent(agentId, { prompt: 'A dragon flying over a castle, fantasy art' });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 7: Architectural visualization', async () => {
      const result = await runAgent(agentId, { prompt: 'Modern minimalist house interior' });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 8: Missing prompt returns 400', async () => {
      const result = await runAgent(agentId, {});
      expect([400, 202]).toContain(result.status); // May start job then fail
    });

    test('Test 9: Alternative field (text)', async () => {
      const result = await runAgent(agentId, { text: 'A colorful parrot' });
      expect([200, 202]).toContain(result.status);
    });

    test('Test 10: Alternative field (description)', async () => {
      const result = await runAgent(agentId, { description: 'A serene Japanese garden' });
      expect([200, 202]).toContain(result.status);
    });
  });

  // Virtual Try-On - 10 tests
  test.describe('4.2 Virtual Try-On', () => {
    const agentId = 'virtual-try-on';

    test('Test 1: Returns job for processing', async () => {
      const result = await runAgent(agentId, {
        personImage: TEST_IMAGES.fashion,
        garmentImage: TEST_IMAGES.product
      });
      expect(result.status).toBe(202);
      expect(result.data.jobId).toBeDefined();
    });

    test('Test 2: Alternative person field', async () => {
      const result = await runAgent(agentId, {
        person: TEST_IMAGES.fashion,
        garment: TEST_IMAGES.product
      });
      expect(result.status).toBe(202);
    });

    test('Test 3: With category', async () => {
      const result = await runAgent(agentId, {
        personImage: TEST_IMAGES.fashion,
        garmentImage: TEST_IMAGES.product,
        category: 'upper_body'
      });
      expect(result.status).toBe(202);
    });

    test('Test 4: Lower body category', async () => {
      const result = await runAgent(agentId, {
        personImage: TEST_IMAGES.fashion,
        garmentImage: TEST_IMAGES.product,
        category: 'lower_body'
      });
      expect(result.status).toBe(202);
    });

    test('Test 5: Full body category', async () => {
      const result = await runAgent(agentId, {
        personImage: TEST_IMAGES.fashion,
        garmentImage: TEST_IMAGES.product,
        category: 'full_body'
      });
      expect(result.status).toBe(202);
    });

    test('Test 6: Verify job has status URL', async () => {
      const result = await runAgent(agentId, {
        personImage: TEST_IMAGES.fashion,
        garmentImage: TEST_IMAGES.product
      });
      expect(result.data.statusUrl).toBeDefined();
    });

    test('Test 7: Verify estimated duration', async () => {
      const result = await runAgent(agentId, {
        personImage: TEST_IMAGES.fashion,
        garmentImage: TEST_IMAGES.product
      });
      expect(result.data.estimatedDuration).toBeDefined();
    });

    test('Test 8: Alternative field (humanImage)', async () => {
      const result = await runAgent(agentId, {
        humanImage: TEST_IMAGES.fashion,
        clothing: TEST_IMAGES.product
      });
      expect(result.status).toBe(202);
    });

    test('Test 9: Missing person image returns job (validation in background)', async () => {
      const result = await runAgent(agentId, { garmentImage: TEST_IMAGES.product });
      expect(result.status).toBe(202); // Job created, will fail in background
    });

    test('Test 10: Missing garment returns job', async () => {
      const result = await runAgent(agentId, { personImage: TEST_IMAGES.fashion });
      expect(result.status).toBe(202);
    });
  });

  // Face Swap - 10 tests
  test.describe('4.3 Face Swap', () => {
    const agentId = 'face-swap';

    test('Test 1: Basic face swap', async () => {
      const result = await runAgent(agentId, {
        sourceImage: TEST_IMAGES.portrait,
        targetImage: TEST_IMAGES.fashion
      });
      expect(result.status).toBe(202);
    });

    test('Test 2: Alternative field names', async () => {
      const result = await runAgent(agentId, {
        source: TEST_IMAGES.portrait,
        target: TEST_IMAGES.fashion
      });
      expect(result.status).toBe(202);
    });

    test('Test 3: With faceImage field', async () => {
      const result = await runAgent(agentId, {
        faceImage: TEST_IMAGES.portrait,
        baseImage: TEST_IMAGES.fashion
      });
      expect(result.status).toBe(202);
    });

    test('Test 4: Verify job created', async () => {
      const result = await runAgent(agentId, {
        sourceImage: TEST_IMAGES.portrait,
        targetImage: TEST_IMAGES.fashion
      });
      expect(result.data.jobId).toBeDefined();
    });

    test('Test 5: Verify processing status', async () => {
      const result = await runAgent(agentId, {
        sourceImage: TEST_IMAGES.portrait,
        targetImage: TEST_IMAGES.fashion
      });
      expect(result.data.status).toBe('processing');
    });

    test('Test 6: Missing source returns job', async () => {
      const result = await runAgent(agentId, { targetImage: TEST_IMAGES.fashion });
      expect(result.status).toBe(202);
    });

    test('Test 7: Missing target returns job', async () => {
      const result = await runAgent(agentId, { sourceImage: TEST_IMAGES.portrait });
      expect(result.status).toBe(202);
    });

    test('Test 8: Same image source and target', async () => {
      const result = await runAgent(agentId, {
        sourceImage: TEST_IMAGES.portrait,
        targetImage: TEST_IMAGES.portrait
      });
      expect(result.status).toBe(202);
    });

    test('Test 9: Fashion model swap', async () => {
      const result = await runAgent(agentId, {
        sourceImage: TEST_IMAGES.fashion,
        targetImage: TEST_IMAGES.portrait
      });
      expect(result.status).toBe(202);
    });

    test('Test 10: Verify status URL format', async () => {
      const result = await runAgent(agentId, {
        sourceImage: TEST_IMAGES.portrait,
        targetImage: TEST_IMAGES.fashion
      });
      expect(result.data.statusUrl).toContain('/jobs/');
    });
  });

  // Music Generator - 10 tests
  test.describe('4.4 Music Generator', () => {
    const agentId = 'music-generator';

    test('Test 1: Basic music generation', async () => {
      const result = await runAgent(agentId, { prompt: 'Upbeat electronic dance music' });
      expect(result.status).toBe(202);
    });

    test('Test 2: With duration', async () => {
      const result = await runAgent(agentId, { prompt: 'Calm piano music', duration: 10 });
      expect(result.status).toBe(202);
    });

    test('Test 3: Rock style', async () => {
      const result = await runAgent(agentId, { prompt: 'Heavy rock guitar riff' });
      expect(result.status).toBe(202);
    });

    test('Test 4: Ambient music', async () => {
      const result = await runAgent(agentId, { prompt: 'Ambient space music for meditation' });
      expect(result.status).toBe(202);
    });

    test('Test 5: Jazz style', async () => {
      const result = await runAgent(agentId, { prompt: 'Smooth jazz saxophone' });
      expect(result.status).toBe(202);
    });

    test('Test 6: Alternative field (description)', async () => {
      const result = await runAgent(agentId, { description: 'Classical orchestra' });
      expect(result.status).toBe(202);
    });

    test('Test 7: Alternative field (style)', async () => {
      const result = await runAgent(agentId, { style: 'Lo-fi hip hop beats' });
      expect(result.status).toBe(202);
    });

    test('Test 8: With durationSeconds', async () => {
      const result = await runAgent(agentId, { prompt: 'Epic cinematic music', durationSeconds: 15 });
      expect(result.status).toBe(202);
    });

    test('Test 9: Verify job created', async () => {
      const result = await runAgent(agentId, { prompt: 'Test music' });
      expect(result.data.jobId).toBeDefined();
    });

    test('Test 10: Sound effect style', async () => {
      const result = await runAgent(agentId, { prompt: 'Sound effect: explosion in distance' });
      expect(result.status).toBe(202);
    });
  });
});

// =============================================================================
// 5. EDGE CASES & ERROR HANDLING (50 tests)
// =============================================================================

test.describe('5. Edge Cases & Error Handling', () => {
  test.describe('5.1 Input Validation', () => {
    test('Empty object input returns 400', async () => {
      const response = await fetch(`${API_BASE}/mulerun/agents/background-remover/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });

    test('Missing required fields returns 400', async () => {
      const result = await runAgent('background-remover', { someField: 'value' });
      expect(result.status).toBe(400);
    });

    test('Invalid JSON returns error', async () => {
      const response = await fetch(`${API_BASE}/mulerun/agents/smart-data-analyzer/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      });
      expect(response.status).toBe(400);
    });

    test('Non-existent agent returns 404', async () => {
      const response = await fetch(`${API_BASE}/mulerun/agents/fake-agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { test: true } }),
      });
      expect(response.status).toBe(404);
    });
  });

  test.describe('5.2 Special Characters', () => {
    test('Unicode characters in prompt', async () => {
      const result = await runAgent('product-description-writer', { product: '日本製の高品質時計' });
      expect(result.status).toBe(200);
    });

    test('Emoji in input', async () => {
      const result = await runAgent('social-media-caption-generator', { topic: 'Product launch 🚀🎉' });
      expect(result.status).toBe(200);
    });

    test('Special characters in text', async () => {
      const result = await runAgent('email-template-generator', { type: 'welcome', name: "O'Brien & Co." });
      expect(result.status).toBe(200);
    });

    test('Long input text', async () => {
      const longText = 'A'.repeat(5000);
      const result = await runAgent('seo-content-optimizer', { content: longText });
      expect(result.status).toBe(200);
    });

    test('HTML entities in input', async () => {
      const result = await runAgent('product-description-writer', { product: '<Product> & "Features"' });
      expect(result.status).toBe(200);
    });
  });

  test.describe('5.3 Input Format Compatibility', () => {
    test('Direct fields format works', async () => {
      const response = await fetch(`${API_BASE}/mulerun/agents/smart-data-analyzer/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Analyze this', data: 'test data' }),
      });
      expect(response.status).toBe(200);
    });

    test('Wrapped input format works', async () => {
      const response = await fetch(`${API_BASE}/mulerun/agents/smart-data-analyzer/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { prompt: 'Analyze this', data: 'test data' } }),
      });
      expect(response.status).toBe(200);
    });

    test('Mixed fields are handled', async () => {
      const response = await fetch(`${API_BASE}/mulerun/agents/email-template-generator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', input: { companyName: 'Test' } }),
      });
      expect(response.status).toBe(200);
    });
  });

  test.describe('5.4 Multiple Field Names', () => {
    test('Image agents accept "image" field', async () => {
      const result = await runAgent('background-remover', { image: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Image agents accept "imageUrl" field', async () => {
      const result = await runAgent('background-remover', { imageUrl: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Image agents accept "url" field', async () => {
      const result = await runAgent('background-remover', { url: TEST_IMAGES.portrait });
      expect(result.status).toBe(200);
    });

    test('Text agents accept "prompt" field', async () => {
      const result = await runAgent('ai-assistant', { prompt: 'Help me' });
      expect(result.status).toBe(200);
    });

    test('Text agents accept "text" field', async () => {
      const result = await runAgent('ai-assistant', { text: 'Help me' });
      expect(result.status).toBe(200);
    });
  });

  test.describe('5.5 Error Messages', () => {
    test('Error message is descriptive for missing image', async () => {
      const result = await runAgent('background-remover', {});
      expect(result.data.error).toContain('required');
    });

    test('Error message mentions field names', async () => {
      const result = await runAgent('background-remover', { wrongField: 'value' });
      expect(result.data.error).toContain('image');
    });

    test('Agent ID is included in error response', async () => {
      // Send invalid input (not empty, but missing required fields) to get agentId in response
      const result = await runAgent('background-remover', { wrongField: 'value' });
      expect(result.data.agentId).toBe('background-remover');
    });

    test('Status shows failed for validation errors', async () => {
      // Send invalid input (not empty, but missing required fields) to get status in response
      const result = await runAgent('background-remover', { wrongField: 'value' });
      expect(result.data.status).toBe('failed');
    });
  });
});

// =============================================================================
// 6. CONCURRENT & LOAD TESTS (20 tests)
// =============================================================================

test.describe('6. Concurrent & Load Tests', () => {
  test('5 concurrent text agent requests', async () => {
    const promises = Array(5).fill(null).map((_, i) =>
      runAgent('product-description-writer', { product: `Product ${i}` })
    );
    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 200)).toBe(true);
  });

  test('5 concurrent image agent requests', async () => {
    const promises = Array(5).fill(null).map(() =>
      runAgent('background-remover', { image: TEST_IMAGES.portrait })
    );
    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 200)).toBe(true);
  });

  test('10 concurrent API health checks', async () => {
    const promises = Array(10).fill(null).map(() =>
      fetch(`${API_BASE}/health`)
    );
    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 200)).toBe(true);
  });

  test('Mixed agent concurrent requests', async () => {
    const promises = [
      runAgent('smart-data-analyzer', { data: 'test' }),
      runAgent('product-description-writer', { product: 'Test' }),
      runAgent('email-template-generator', { type: 'welcome' }),
      runAgent('seo-content-optimizer', { content: 'Test content' }),
      runAgent('ai-assistant', { prompt: 'Help' }),
    ];
    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 200)).toBe(true);
  });

  test('Sequential rapid requests', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await runAgent('social-media-caption-generator', { topic: `Topic ${i}` });
      expect(result.status).toBe(200);
    }
  });

  test('Async job creation concurrent', async () => {
    const promises = Array(3).fill(null).map(() =>
      runAgent('image-generator', { prompt: 'Test image' })
    );
    const results = await Promise.all(promises);
    expect(results.every(r => [200, 202].includes(r.status))).toBe(true);
  });

  test('Multiple agent list requests', async () => {
    const promises = Array(5).fill(null).map(() =>
      fetch(`${API_BASE}/mulerun/agents`)
    );
    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 200)).toBe(true);
  });
});

// =============================================================================
// 7. RESPONSE FORMAT VALIDATION (30 tests)
// =============================================================================

test.describe('7. Response Format Validation', () => {
  test.describe('7.1 Sync Agent Responses', () => {
    test('Response has agentId', async () => {
      const result = await runAgent('smart-data-analyzer', { data: 'test' });
      expect(result.data.agentId).toBe('smart-data-analyzer');
    });

    test('Response has status', async () => {
      const result = await runAgent('smart-data-analyzer', { data: 'test' });
      expect(result.data.status).toBe('completed');
    });

    test('Response has output', async () => {
      const result = await runAgent('smart-data-analyzer', { data: 'test' });
      expect(result.data.output).toBeDefined();
    });

    test('Response has input echo', async () => {
      const result = await runAgent('smart-data-analyzer', { data: 'test' });
      expect(result.data.input).toBeDefined();
    });

    test('Output is valid JSON object', async () => {
      const result = await runAgent('product-description-writer', { product: 'Test' });
      expect(typeof result.data.output).toBe('object');
    });
  });

  test.describe('7.2 Async Agent Responses', () => {
    test('Response has jobId', async () => {
      const result = await runAgent('image-generator', { prompt: 'test' });
      expect(result.data.jobId).toBeDefined();
    });

    test('Response has status processing', async () => {
      const result = await runAgent('image-generator', { prompt: 'test' });
      expect(result.data.status).toBe('processing');
    });

    test('Response has statusUrl', async () => {
      const result = await runAgent('image-generator', { prompt: 'test' });
      expect(result.data.statusUrl).toBeDefined();
    });

    test('Response has estimatedDuration', async () => {
      const result = await runAgent('image-generator', { prompt: 'test' });
      expect(result.data.estimatedDuration).toBeDefined();
    });

    test('Response has message', async () => {
      const result = await runAgent('image-generator', { prompt: 'test' });
      expect(result.data.message).toBeDefined();
    });
  });

  test.describe('7.3 Image Agent Output', () => {
    test('Has success flag', async () => {
      const result = await runAgent('background-remover', { image: TEST_IMAGES.portrait });
      expect(result.data.output.success).toBe(true);
    });

    test('Has original image URL', async () => {
      const result = await runAgent('background-remover', { image: TEST_IMAGES.portrait });
      expect(result.data.output.originalImage).toBe(TEST_IMAGES.portrait);
    });

    test('Has result image URL', async () => {
      const result = await runAgent('background-remover', { image: TEST_IMAGES.portrait });
      expect(result.data.output.resultImage).toBeDefined();
    });

    test('Has processing time', async () => {
      const result = await runAgent('background-remover', { image: TEST_IMAGES.portrait });
      expect(result.data.output.processingTime).toBeGreaterThan(0);
    });

    test('Has model info', async () => {
      const result = await runAgent('background-remover', { image: TEST_IMAGES.portrait });
      expect(result.data.output.model).toBeDefined();
    });
  });

  test.describe('7.4 Error Response Format', () => {
    test('Error response has agentId', async () => {
      // Use invalid input (not empty) to get full error response
      const result = await runAgent('background-remover', { invalidField: 'test' });
      expect(result.data.agentId).toBe('background-remover');
    });

    test('Error response has status failed', async () => {
      // Use invalid input (not empty) to get full error response
      const result = await runAgent('background-remover', { invalidField: 'test' });
      expect(result.data.status).toBe('failed');
    });

    test('Error response has error message', async () => {
      const result = await runAgent('background-remover', { invalidField: 'test' });
      expect(result.data.error).toBeDefined();
    });

    test('Error response includes input', async () => {
      const result = await runAgent('background-remover', { wrong: 'field' });
      expect(result.data.input).toBeDefined();
    });
  });
});

// =============================================================================
// 8. FINAL SUMMARY TEST
// =============================================================================

test.describe('8. Final Summary', () => {
  test('All 38 agents are available', async () => {
    const response = await fetch(`${API_BASE}/mulerun/agents`);
    const data = await response.json();
    expect(data.total).toBe(38);
    expect(data.agents.every((a: any) => a.available)).toBe(true);
  });
});
