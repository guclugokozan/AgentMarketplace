# Agent Marketplace: Complete Implementation Plan V2

## Gap Analysis from Codex Review

### Issues Identified in Original Plan:
1. **Provider type mismatch** - Plan introduced `video-generation`, `audio-generation` types not in `ProviderType` union
2. **Category expansion needed** - New categories like `entertainment`, `vfx` not in `AgentCategory`
3. **Missing execution configs** - No prompt templates, size/ratio options, model selection
4. **Speculative providers** - Some APIs (Sora 2 public, Veo 3.1) not generally available
5. **No test strategy** - Missing test plans for async jobs, consent, schemas

---

## Part 1: CODEBASE ALIGNMENT

### 1.1 ProviderType Extension (src/config/providers.ts)

```typescript
// ADD these new provider types
export type ProviderType =
  | 'llm'
  | 'image-generation'
  | 'image-editing'
  | 'virtual-tryon'
  | 'face-processing'
  | 'transcription'
  | 'translation'
  | 'ocr'
  | 'tts'
  | 'storage'
  // NEW TYPES
  | 'video-generation'    // Runway, Kling, Minimax
  | 'audio-generation'    // Suno, MusicGen
  | 'model-aggregator';   // fal.ai, Replicate multi-model
```

### 1.2 AgentCategory Extension (src/agents/mulerun-registry.ts)

```typescript
// ADD these new categories
export type AgentCategory =
  | 'analytics'
  | 'ecommerce'
  | 'creative'
  | 'productivity'
  | 'marketing'
  | 'translation'
  | 'content'
  | 'business'
  | 'higgsfield-image'
  | 'higgsfield-video'
  | 'higgsfield-audio'
  | 'higgsfield-ai'
  // NEW CATEGORIES
  | 'higgsfield-swap'      // Face/character swaps
  | 'higgsfield-vfx'       // VFX effects
  | 'higgsfield-ads'       // Advertising templates
  | 'higgsfield-style'     // Style transfer/art
  | 'higgsfield-3d'        // 3D rendering
  | 'mulerun-creative'     // Mulerun creative agents
  | 'mulerun-pet'          // Pet-related agents
  | 'mulerun-lifestyle';   // Lifestyle/decor agents
```

### 1.3 REALISTIC Provider Implementation Priority

**Phase 1: Use EXISTING providers via Replicate/fal.ai**
```typescript
// These work TODAY via Replicate:
- Kling: replicate.com/kuaishou/kling-video
- Minimax: fal.ai/models/fal-ai/minimax/hailuo-02
- Wan: fal.ai/models/fal-ai/wan-2.5
- Flux: replicate.com/black-forest-labs/flux-schnell
- MusicGen: replicate.com/meta/musicgen

// These require NEW provider implementations:
- Runway (already implemented ✓)
- ElevenLabs (already implemented ✓)
```

---

## Part 2: COMPLETE HIGGSFIELD APPS CATALOG (75 Apps)

### Category: Nano Bananas Collection (14 apps)

#### App 1: Urban Cuts
```typescript
{
  id: 'urban-cuts',
  name: 'Urban Cuts',
  description: 'Next-gen beat-synced AI outfit videos',
  category: 'higgsfield-video',
  inputs: {
    images: { count: 1, types: ['image/png', 'image/jpeg'] },
    prompt: { required: false },
    audio: { required: true, type: 'beat-selection' }
  },
  aspectRatios: ['9:16', '1:1'],
  styleTypes: ['street-fashion', 'casual', 'formal'],
  model: 'nano-banana-pro',
  provider: 'higgsfield',
  tier: 'pro',
  cost: '$0.30-0.60'
}
```

#### App 2: Sticker Match Cut
```typescript
{
  id: 'sticker-match-cut',
  name: 'Sticker Match Cut',
  description: 'Turn any clip into a sparkling sticker animation',
  inputs: {
    video: { count: 1, types: ['video/mp4'], maxDuration: 30 },
    prompt: { required: false }
  },
  aspectRatios: ['9:16', '1:1'],
  styleTypes: ['sparkle', 'glitter', 'holographic'],
  model: 'nano-banana-pro',
  tier: 'starter',
  cost: '$0.20-0.40'
}
```

#### App 3: Style Snap
```typescript
{
  id: 'style-snap',
  name: 'Style Snap',
  description: 'Transform your look with instant style variations',
  inputs: {
    images: { count: 1, types: ['image/png', 'image/jpeg'] },
    prompt: { required: false }
  },
  aspectRatios: ['1:1', '4:5'],
  styleTypes: ['casual', 'elegant', 'streetwear', 'vintage', 'minimalist'],
  outputCount: 4, // Multiple variations
  model: 'nano-banana-pro',
  tier: 'starter',
  cost: '$0.25-0.50'
}
```

#### App 4: Game Dump
```typescript
{
  id: 'game-dump',
  name: 'Game Dump',
  description: 'Transform yourself into 12 iconic video game styles',
  inputs: {
    images: { count: 1, types: ['image/png', 'image/jpeg'] }
  },
  aspectRatios: ['1:1'],
  styleTypes: ['GTA', 'Fortnite', 'Minecraft', 'FIFA', 'COD', 'Tekken', 'StreetFighter', 'MortalKombat', 'Assassins', 'Cyberpunk', 'Elden', 'Zelda'],
  outputCount: 12,
  model: 'nano-banana-pro',
  tier: 'starter',
  cost: '$0.50-0.80'
}
```

#### App 5-9: Banana Boutique
```typescript
const bananaBoutiqueApps = [
  { id: 'breakdown', name: 'Breakdown', desc: 'Split image into individual components', images: 1, prompt: false, output: 'grid' },
  { id: 'signboard', name: 'Signboard', desc: 'See yourself on a stylish mural', images: 1, prompt: false, style: 'street-art' },
  { id: 'outfit-vending', name: 'Outfit Vending', desc: 'Display outfit in vending machine', images: 1, prompt: false },
  { id: 'glitter-sticker', name: 'Glitter Sticker', desc: 'Create sparkling sticker version', images: 1, prompt: false, animated: true },
  { id: 'paint-app', name: 'Paint App', desc: 'Transform into retro paint app art', images: 1, prompt: false, style: 'ms-paint' },
];
```

#### App 10-14: Banana Arcade
```typescript
const bananaArcadeApps = [
  { id: 'behind-scenes', name: 'Behind the Scenes', desc: 'Turn photos into BTS videos', images: 1, output: 'video' },
  { id: 'simlife', name: 'Simlife', desc: 'Life simulation character style', images: 1, style: 'sims' },
  { id: 'nano-theft', name: 'Nano Theft', desc: 'Open-world game style (GTA)', images: 1, style: 'gta' },
  { id: 'nano-strike', name: 'Nano Strike', desc: 'Tactical shooter aesthetic', images: 1, style: 'cs2' },
  { id: 'japanese-show', name: 'Japanese Show', desc: 'Retro 4-panel TV show scene', images: 1, layout: '4-panel' },
];
```

### Category: Popular/Trending (15 apps)

#### App 15: Angles
```typescript
{
  id: 'angles',
  name: 'Angles',
  description: 'Generate any angle view for any image in seconds',
  inputs: {
    images: { count: 1, types: ['image/png', 'image/jpeg'] },
    prompt: { required: true, placeholder: 'Enter angle specification (e.g., "45 degrees right", "from above")' }
  },
  aspectRatios: ['1:1', '4:3', '16:9'],
  outputCount: 'variable',
  model: 'higgsfield-angles',
  provider: 'higgsfield',
  tier: 'pro',
  cost: '$0.30-0.50'
}
```

#### App 16: Face Swap (Photo)
```typescript
{
  id: 'face-swap-photo',
  name: 'Face Swap',
  description: 'Best instant AI face swap for photos',
  inputs: {
    images: { count: 2, types: ['image/png', 'image/jpeg'], labels: ['Source Face', 'Target Image'] }
  },
  aspectRatios: ['preserve-original'],
  requiresConsent: true,
  model: 'replicate/face-swap',
  provider: 'replicate',
  tier: 'pro',
  cost: '$0.10-0.25'
}
```

#### App 17: Video Face Swap
```typescript
{
  id: 'face-swap-video',
  name: 'Video Face Swap',
  description: 'Best-in-class face swapping for video',
  inputs: {
    video: { count: 1, types: ['video/mp4'], maxDuration: 60 },
    images: { count: 1, types: ['image/png', 'image/jpeg'], label: 'Source Face' }
  },
  aspectRatios: ['preserve-original'],
  requiresConsent: true,
  async: true,
  model: 'replicate/roop',
  tier: 'enterprise',
  cost: '$0.50-2.00'
}
```

#### App 18: Character Swap
```typescript
{
  id: 'character-swap',
  name: 'Character Swap',
  description: 'Swap characters in your image with a single click',
  inputs: {
    images: { count: 2, types: ['image/png', 'image/jpeg'], labels: ['Character Image', 'Target Scene'] }
  },
  aspectRatios: ['preserve-original'],
  model: 'replicate/character-swap',
  tier: 'pro',
  cost: '$0.20-0.40'
}
```

#### App 19: Recast
```typescript
{
  id: 'recast',
  name: 'Recast',
  description: 'Industry-leading character swap for video',
  inputs: {
    video: { count: 1, types: ['video/mp4'] },
    images: { count: 1, types: ['image/png', 'image/jpeg'], label: 'Character Reference' }
  },
  async: true,
  model: 'recast-studio',
  tier: 'enterprise',
  cost: '$1.00-3.00'
}
```

#### App 20: Transitions
```typescript
{
  id: 'transitions',
  name: 'Transitions',
  description: 'Create seamless transitions between shots',
  inputs: {
    video: { count: 2, types: ['video/mp4'], labels: ['Clip A', 'Clip B'] }
  },
  transitionTypes: ['morph', 'zoom', 'swipe', 'dissolve', 'whip'],
  model: 'runway',
  tier: 'pro',
  cost: '$0.30-0.60'
}
```

#### App 21: Click to Ad
```typescript
{
  id: 'click-to-ad',
  name: 'Click to Ad',
  description: 'Turn product links into UGC and professional video ads',
  inputs: {
    url: { required: true, type: 'product-url' },
    prompt: { required: false, placeholder: 'Brand guidelines or style preferences' }
  },
  aspectRatios: ['9:16', '16:9', '1:1'],
  outputTypes: ['ugc-style', 'professional', 'testimonial'],
  async: true,
  model: 'multi-model',
  tier: 'enterprise',
  cost: '$1.00-5.00'
}
```

#### Apps 22-29: Trending Now
```typescript
const trendingApps = [
  { id: 'micro-beasts', name: 'Micro-Beasts', desc: 'Surround yourself with cute animals', images: 1, style: 'cute-animals' },
  { id: '3d-figure', name: '3D Figure', desc: 'Transform into detailed 3D figure', images: 1, output: '3d-model' },
  { id: 'plushies', name: 'Plushies', desc: 'Transform into adorable plushie animation', images: 1, animated: true },
  { id: 'billboard-ad', name: 'Billboard Ad', desc: 'Turn photo into massive billboard takeover', images: 1 },
  { id: 'mascot', name: 'Mascot', desc: 'Transform into football mascot character', images: 1 },
  { id: 'cloud-surf', name: 'Cloud Surf', desc: 'Dreamy pink cloud surfing scene', images: 1 },
  { id: 'rap-god', name: 'Rap God', desc: 'Transform into rap video clip', images: 1 },
  { id: 'gtai', name: 'GTAI', desc: 'Open-world game character', images: 1, style: 'gta' },
];
```

### Category: VFX (5 apps)
```typescript
const vfxApps = [
  {
    id: 'on-fire',
    name: 'On Fire',
    description: 'Turn your photo into the iconic "This is Fine" meme',
    inputs: { images: { count: 1 } },
    effects: ['fire', 'flames', 'burning'],
    tier: 'free',
    cost: '$0.10-0.20'
  },
  {
    id: 'storm-creature',
    name: 'Storm Creature',
    description: 'Turn into an epic storm creature scene',
    inputs: { images: { count: 1 } },
    effects: ['lightning', 'thunder', 'storm'],
    tier: 'starter'
  },
  {
    id: 'burning-sunset',
    name: 'Burning Sunset',
    description: 'Epic burning sunset scene',
    inputs: { images: { count: 1 } },
    tier: 'starter'
  },
  {
    id: 'sand-worm',
    name: 'Sand Worm',
    description: 'Desert fantasy character scene (Dune style)',
    inputs: { images: { count: 1 } },
    tier: 'pro'
  },
  {
    id: 'latex',
    name: 'Latex',
    description: 'Sleek black latex style transformation',
    inputs: { images: { count: 1 } },
    tier: 'starter'
  },
];
```

### Category: ASMR (4 apps)
```typescript
const asmrApps = [
  {
    id: 'asmr-add-on',
    name: 'ASMR Add-On',
    description: 'Seamlessly insert your product into an ASMR video',
    inputs: {
      images: { count: 1, label: 'Product Image' },
      video: { count: 1, label: 'ASMR Template', optional: true }
    },
    outputFormat: 'video/mp4',
    audioBed: 'asmr-whisper',
    tier: 'pro'
  },
  {
    id: 'asmr-classic',
    name: 'ASMR Classic',
    description: 'Generate traditional ASMR with whispering ambiance',
    inputs: {
      images: { count: 1, label: 'Subject/Product' },
      prompt: { required: true, placeholder: 'Describe the ASMR content' }
    },
    tier: 'pro'
  },
  {
    id: 'asmr-host',
    name: 'ASMR Host',
    description: 'Turn photo into immersive ASMR studio scene',
    inputs: { images: { count: 1 } },
    tier: 'starter'
  },
  {
    id: 'asmr-promo',
    name: 'ASMR Promo',
    description: 'Create scripted ASMR video featuring your product',
    inputs: {
      images: { count: 1, label: 'Product' },
      prompt: { required: true, label: 'Script/Description' }
    },
    tier: 'pro'
  },
];
```

### Category: Art Styles (5 apps)
```typescript
const artStyleApps = [
  {
    id: 'sketch-to-real',
    name: 'Sketch-to-Real',
    description: 'Turn your sketch into a realistic video scene',
    inputs: {
      images: { count: 1, label: 'Sketch/Drawing' },
      prompt: { required: false, placeholder: 'Motion description' }
    },
    outputFormat: 'video/mp4',
    model: 'runway-sketch',
    tier: 'pro'
  },
  {
    id: 'comic-book',
    name: 'Comic Book',
    description: 'Transform into comic book art style',
    inputs: { images: { count: 1 } },
    styleVariants: ['marvel', 'manga', 'indie', 'classic'],
    tier: 'starter'
  },
  {
    id: 'renaissance',
    name: 'Renaissance',
    description: 'Turn into a classical gallery painting',
    inputs: { images: { count: 1 } },
    styleVariants: ['da-vinci', 'michelangelo', 'vermeer', 'rembrandt'],
    tier: 'starter'
  },
  {
    id: '60s-cafe',
    name: '60s Cafe',
    description: 'Vintage 60s cafe scene transformation',
    inputs: { images: { count: 1 } },
    tier: 'starter'
  },
  {
    id: 'pixel-game',
    name: 'Pixel Game',
    description: 'Retro pixel game graphics style',
    inputs: { images: { count: 1 } },
    resolutions: ['8-bit', '16-bit', '32-bit'],
    tier: 'free'
  },
];
```

### Category: Styled Ads (5 apps)
```typescript
const styledAdsApps = [
  {
    id: 'bullet-time-scene',
    name: 'Bullet Time Scene',
    description: 'Spin around product with dynamic adaptive backgrounds',
    inputs: { images: { count: 1, label: 'Product' } },
    rotationSpeed: ['slow', 'medium', 'fast'],
    backgrounds: ['dynamic', 'studio', 'outdoor'],
    outputFormat: 'video/mp4',
    tier: 'pro'
  },
  {
    id: 'poster',
    name: 'Poster',
    description: 'Transform product into bold poster design',
    inputs: {
      images: { count: 1 },
      prompt: { required: false, placeholder: 'Headline text' }
    },
    aspectRatios: ['2:3', '3:4', '1:1'],
    tier: 'starter'
  },
  {
    id: 'bullet-time-splash',
    name: 'Bullet Time Splash',
    description: 'Explode product in cinematic bullet time action',
    inputs: { images: { count: 1, label: 'Product' } },
    explosionTypes: ['water', 'particles', 'glass', 'smoke'],
    outputFormat: 'video/mp4',
    tier: 'pro'
  },
  {
    id: 'magic-button',
    name: 'Magic Button',
    description: 'Place product in whimsical magical scene',
    inputs: { images: { count: 1 } },
    tier: 'starter'
  },
  {
    id: 'bullet-time-white',
    name: 'Bullet Time White',
    description: 'Spin product on clean white background',
    inputs: { images: { count: 1, label: 'Product' } },
    outputFormat: 'video/mp4',
    tier: 'starter'
  },
];
```

### Category: Japanese (5 apps)
```typescript
const japaneseApps = [
  { id: 'idol', name: 'Idol', desc: 'Transform into K-pop idol moment', images: 1, tier: 'starter' },
  { id: 'j-magazine', name: 'J-Magazine', desc: 'Japanese magazine cover style', images: 1, tier: 'starter' },
  { id: 'j-poster', name: 'J-Poster', desc: 'Japanese style poster', images: 1, tier: 'starter' },
  { id: 'cosplay-ahegao', name: 'Cosplay Ahegao', desc: 'Cosplay expression transformation', images: 1, tier: 'starter' },
  { id: 'ghoulgao', name: 'Ghoulgao', desc: 'Ghoul horror scene transformation', images: 1, tier: 'starter' },
];
```

### Category: 3D Rendering (3 apps)
```typescript
const threeDApps = [
  {
    id: '3d-render',
    name: '3D Render',
    description: 'Turn any photo into stunning 3D rendered object',
    inputs: { images: { count: 1 } },
    outputFormats: ['image/png', 'glb', 'obj'],
    tier: 'pro'
  },
  {
    id: '3d-rotation',
    name: '3D Rotation',
    description: 'Rotate photo in smooth 3D motion',
    inputs: { images: { count: 1 } },
    rotationAxis: ['x', 'y', 'z'],
    outputFormat: 'video/mp4',
    tier: 'pro'
  },
  {
    id: '3d-figure-box',
    name: '3D Figure Box',
    description: 'Transform into collectible figure with box',
    inputs: {
      images: { count: 1 },
      prompt: { required: false, placeholder: 'Box text/title' }
    },
    tier: 'pro'
  },
];
```

### Category: Realistic Ads (3 apps)
```typescript
const realisticAdsApps = [
  {
    id: 'commercial-faces',
    name: 'Commercial Faces',
    description: 'Professional face transformations for commercial use',
    inputs: { images: { count: 1 } },
    styleVariants: ['corporate', 'lifestyle', 'luxury'],
    tier: 'pro'
  },
  {
    id: 'packshot',
    name: 'Packshot',
    description: 'Create polished closing frame for product ad',
    inputs: { images: { count: 1, label: 'Product' } },
    aspectRatios: ['1:1', '4:3', '16:9'],
    tier: 'starter'
  },
  {
    id: 'macro-scene',
    name: 'Macro Scene',
    description: 'Showcase product in adaptive macro environment',
    inputs: { images: { count: 1, label: 'Product Detail' } },
    tier: 'pro'
  },
];
```

### Category: Viral (5 apps)
```typescript
const viralApps = [
  { id: 'mascot', name: 'Mascot', desc: 'Football mascot character', images: 1 },
  { id: 'cloud-surf', name: 'Cloud Surf', desc: 'Dreamy pink cloud surfing scene', images: 1 },
  { id: 'rap-god', name: 'Rap God', desc: 'Rap video clip transformation', images: 1 },
  { id: 'gtai', name: 'GTAI', desc: 'Open-world game character', images: 1 },
  { id: 'victory-card', name: 'Victory Card', desc: 'Poker winning card design', images: 1 },
];
```

---

## Part 3: COMPLETE MULERUN AGENTS CATALOG (25+ Agents)

### Category: Film & Photo Filters

#### Agent 1: Zootopia 2 Aesthetic Fuji 400H Film Look
```typescript
{
  id: 'zootopia-film-look',
  name: 'Zootopia 2 Aesthetic Fuji 400H Film Look',
  creator: 'Lucas',
  description: 'Soft Fuji Pro 400H film tone; face, hair, pose and outfit stay unchanged',
  inputs: {
    images: { count: 1, type: 'portrait', requirements: 'Clear, well-lit with full face visible' },
    prompt: { required: false }
  },
  model: 'gemini-2.5-flash-image',
  aspectRatios: ['preserve-original'],
  stylePreset: 'fuji-400h',
  features: ['Film grain', 'Soft greens', 'Warm neutrals', 'Pink-toned skin'],
  pricing: { fixed: 0.49, currency: 'USD' },
  tier: 'starter'
}
```

#### Agent 2-3: Cosplay Filters
```typescript
const cosplayFilters = [
  {
    id: 'nick-wilde-cosplay',
    name: 'Nick Wilde Cosplay Filter',
    description: 'ZPD police uniform and fox character features while maintaining identity',
    character: 'Nick Wilde (Zootopia)',
    pricing: { fixed: 0.49 }
  },
  {
    id: 'judy-hopps-cosplay',
    name: 'Judy Hopps Cosplay Filter',
    description: 'Photorealistic Judy Hopps with ZPD uniform',
    character: 'Judy Hopps (Zootopia)',
    pricing: { fixed: 0.49 }
  }
];
```

### Category: Creative Transforms

#### Agent 4: 3D Desk Figure Creation
```typescript
{
  id: '3d-desk-figure',
  name: '3D Desk Figure Creation',
  creator: 'laughing_code',
  description: 'Ultra-realistic collectible toy with desktop setting and custom box',
  inputs: {
    images: { count: 1, type: 'front-facing', requirements: 'Clear portrait or character image' },
    prompt: { required: false, placeholder: 'Pose/base specifications' }
  },
  model: 'gemini-2.5-flash-image',
  styleOptions: ['glossy-pvc', 'matte', 'anime', 'chibi'],
  outputs: ['figure-image', 'box-image', 'variants'],
  pricing: { range: { min: 0.20, max: 0.50 } },
  tier: 'pro'
}
```

#### Agent 5: Chibi Sticker Maker
```typescript
{
  id: 'chibi-sticker-maker',
  name: 'Chibi Sticker Maker',
  creator: 'laughing_code',
  description: 'Chibi-style sticker sets with multiple expressions for messaging platforms',
  inputs: {
    images: { count: 1, type: 'portrait/pet', requirements: 'Clear, front-facing with plain background' }
  },
  outputCount: '8-12 stickers',
  outputFormat: 'PNG with transparency',
  expressions: ['happy', 'sad', 'angry', 'surprised', 'love', 'cool', 'sleepy', 'excited'],
  pricing: { fixed: 0.50 },
  tier: 'starter'
}
```

#### Agent 6: AI Photo Restorer
```typescript
{
  id: 'ai-photo-restorer',
  name: 'AI Photo Restorer',
  creator: 'laughing_code',
  description: 'Restore and colorize old/damaged photos automatically',
  inputs: {
    images: { count: 1, type: 'damaged/old photo' }
  },
  features: [
    'Automatic colorization',
    'Scratch repair',
    'Contrast enhancement',
    'Face enhancement',
    'Resolution upscaling'
  ],
  pricing: { fixed: 0.50 },
  tier: 'starter'
}
```

### Category: Celebrity & Composite

#### Agent 7: StarSnap
```typescript
{
  id: 'starsnap',
  name: 'StarSnap',
  creator: 'YuTou_baby',
  description: 'Create realistic photos alongside celebrities/actors',
  inputs: {
    images: {
      count: 2,
      labels: ['Your Selfie', 'Celebrity Image'],
      requirements: ['Well-lit selfie', 'Celebrity from gallery or upload']
    }
  },
  features: ['Lighting alignment', 'Facial angle matching', 'Color tone matching'],
  pricing: { fixed: 0.80 },
  tier: 'pro'
}
```

#### Agent 8: Me And My Mini-Me
```typescript
{
  id: 'me-and-my-mini-me',
  name: 'Me And My Mini-Me',
  creator: 'YuTou_baby',
  description: 'Heartwarming snapshot merging current and childhood self',
  inputs: {
    images: { count: 1, requirements: 'Well-lit frontal portrait with minimal occlusion' }
  },
  features: ['Photorealistic composite', 'Pose matching', 'Expression matching'],
  pricing: { fixed: 0.50 },
  tier: 'starter'
}
```

### Category: Pet Transformations

#### Agents 9-11: Pet Star Collection
```typescript
const petAgents = [
  {
    id: 'pet-star-9-grid',
    name: 'Pet Star 9-Grid',
    creator: 'LinkAIBrain',
    description: '9-grid artistic transformation of pet photos',
    images: 1,
    outputLayout: '3x3 grid',
    pricing: { fixed: 0.50 }
  },
  {
    id: 'pet-red-carpet',
    name: 'Pet Red Carpet Photos',
    description: 'Transform pet into red carpet celebrity style',
    images: 1,
    themes: ['oscar', 'premiere', 'fashion-week'],
    pricing: { fixed: 0.30 }
  },
  {
    id: 'mecha-pet',
    name: 'Mecha Pet',
    description: 'Transform pet into mechanical/robot version',
    images: 1,
    styles: ['gundam', 'steampunk', 'cyberpunk'],
    pricing: { fixed: 0.30 }
  }
];
```

### Category: Lifestyle & Design

#### Agent 12: Decorate A Room
```typescript
{
  id: 'decorate-a-room',
  name: 'Decorate A Room',
  creator: 'laughing_code',
  description: 'AI interior design and room decoration',
  inputs: {
    images: { count: 1, type: 'room photo' },
    prompt: { required: false, placeholder: 'Style preferences (modern, rustic, minimalist)' }
  },
  styleOptions: ['modern', 'minimalist', 'rustic', 'scandinavian', 'industrial', 'bohemian'],
  outputs: ['decorated-image', 'furniture-suggestions', 'shopping-list'],
  pricing: { fixed: 0.50 },
  tier: 'starter'
}
```

#### Agent 13: AI 3D Building Illustrator
```typescript
{
  id: 'ai-3d-building-illustrator',
  name: 'AI 3D Building Illustrator',
  creator: 'laughing_code',
  description: 'Create 3D architectural illustrations from descriptions',
  inputs: {
    prompt: { required: true, placeholder: 'Describe the building (e.g., modern office, Victorian house)' },
    images: { count: 0, optional: true, type: 'reference' }
  },
  viewTypes: ['exterior', 'interior', 'aerial', 'street-level'],
  lightingOptions: ['day', 'night', 'sunset', 'overcast'],
  styleOptions: ['photorealistic', 'sketch', 'blueprint', 'concept-art'],
  pricing: { fixed: 1.00 },
  tier: 'pro'
}
```

### Category: Portrait Enhancement

#### Agent 14: Portrait Elevate
```typescript
{
  id: 'portrait-elevate',
  name: 'Portrait Elevate',
  creator: 'jyvdzb224259haj',
  description: 'Professional portrait enhancement and styling',
  inputs: {
    images: { count: 1, type: 'portrait' }
  },
  enhancements: ['skin-retouching', 'lighting-enhancement', 'background-upgrade', 'professional-styling'],
  outputs: ['elevated-portrait', 'before-after-comparison'],
  pricing: { fixed: 0.50 },
  tier: 'starter'
}
```

#### Agent 15: Cover Star Maker
```typescript
{
  id: 'cover-star-maker',
  name: 'Cover Star Maker',
  creator: 'YuTou_baby',
  description: 'Create magazine cover style photos',
  inputs: {
    images: { count: 1 },
    prompt: { required: false, placeholder: 'Magazine name / headline' }
  },
  magazineTemplates: ['vogue', 'gq', 'time', 'rolling-stone', 'vanity-fair', 'cosmopolitan'],
  outputs: ['cover-image', 'variants'],
  pricing: { fixed: 0.50 },
  tier: 'starter'
}
```

### Category: Technical/Product

#### Agent 16: An Exploded VIEW
```typescript
{
  id: 'exploded-view',
  name: 'An Exploded VIEW',
  creator: 'Darren',
  description: 'Create exploded view diagrams of products',
  inputs: {
    images: { count: 1, type: 'product' },
    prompt: { required: false, placeholder: 'Component names/labels' }
  },
  styleOptions: ['technical', 'artistic', 'blueprint', 'isometric'],
  outputs: ['exploded-image', 'component-labels', 'optional-animation'],
  pricing: { fixed: 0.48 },
  tier: 'pro'
}
```

#### Agent 17: Mechanical Image Generator
```typescript
{
  id: 'mechanical-image-generator',
  name: 'Mechanical Image Generator',
  creator: 'Darren',
  description: 'Generate mechanical/technical illustrations',
  inputs: {
    prompt: { required: true, placeholder: 'Describe the mechanical design' }
  },
  styles: ['technical-drawing', 'blueprint', 'steampunk', 'industrial', 'sci-fi'],
  pricing: { fixed: 0.29 },
  tier: 'starter'
}
```

### Category: Video Processing

#### Agent 18: REMOVE Video Background
```typescript
{
  id: 'remove-video-background',
  name: 'REMOVE Video Background',
  creator: 'Darren',
  description: 'Remove and replace video backgrounds',
  inputs: {
    video: { count: 1, types: ['video/mp4'], maxDuration: 60 },
    images: { count: 0, optional: true, label: 'Replacement Background' }
  },
  features: ['Real-time processing', 'Green screen replacement', 'Virtual backgrounds', 'Edge refinement'],
  async: true,
  pricing: { fixed: 2.88 },
  tier: 'pro'
}
```

### Category: Text/Caption

#### Agent 19: Caption AI
```typescript
{
  id: 'caption-ai',
  name: 'Caption AI',
  creator: 'yrmrazvdd2108ay',
  description: 'Generate captions for any image/video content',
  inputs: {
    images: { count: 1, optional: true },
    video: { count: 1, optional: true },
    prompt: { required: false, placeholder: 'Context or style preference' }
  },
  platforms: ['instagram', 'tiktok', 'twitter', 'linkedin', 'facebook'],
  features: ['Hashtag generation', 'Accessibility descriptions', 'Multilingual'],
  pricing: { fixed: 0.09 },
  tier: 'free'
}
```

#### Agent 20: Explain it like I am 5
```typescript
{
  id: 'explain-like-5',
  name: 'Explain it like I am 5',
  creator: 'vktsbiy414205x1',
  description: 'Simplify complex topics into easy explanations',
  inputs: {
    prompt: { required: true, placeholder: 'Enter the concept to explain' }
  },
  outputFormat: 'text',
  features: ['Simple vocabulary', 'Analogies', 'Examples', 'Visual descriptions'],
  pricing: { fixed: 0.50 },
  tier: 'free'
}
```

---

## Part 4: INPUT SPECIFICATION MATRIX

### Image Upload Requirements

| Agent Type | Images | Requirements |
|------------|--------|--------------|
| Face Swap | 2 | Source face + target image |
| Portrait Enhancement | 1 | Clear, well-lit face |
| Product Shot | 1 | Clean product image, neutral background |
| Style Transfer | 1 | Any image |
| Character Swap | 2 | Character + scene |
| Video Face Swap | 1 + video | Face image + video file |
| Pet Transform | 1 | Clear pet photo |
| Room Decorate | 1 | Room interior photo |

### Prompt Requirements

| Agent Type | Prompt Required | Example |
|------------|-----------------|---------|
| Text-to-Image | Yes | "A futuristic cityscape at sunset" |
| Style Transfer | No | - |
| Angle Generation | Yes | "45 degrees from above" |
| Caption AI | No | Context optional |
| Building Illustrator | Yes | "Modern glass office building" |
| Cosplay Filter | No | Preset character |

### Aspect Ratio Options

| Use Case | Ratios | Default |
|----------|--------|---------|
| Portrait/Story | 9:16 | 9:16 |
| Landscape/YouTube | 16:9 | 16:9 |
| Square/Instagram | 1:1 | 1:1 |
| Magazine/Print | 4:5, 2:3 | 4:5 |
| Product | 1:1, 4:3 | 1:1 |
| Preserve | original | original |

### Model Selection by Provider

| Provider | Models | Use Case |
|----------|--------|----------|
| Replicate | flux-schnell, sdxl | Fast image gen |
| Replicate | roop, face-swap | Face processing |
| Replicate | musicgen | Audio gen |
| Replicate | kling-video | Video gen |
| fal.ai | minimax/hailuo-02 | Fast video |
| fal.ai | wan-2.5 | Video with audio |
| Runway | gen-3-alpha | Premium video |
| Stability | sdxl | Image gen |
| ElevenLabs | voice-synthesis | TTS |

---

## Part 5: IMPLEMENTATION PHASES

### Phase 1: Provider Extensions (Priority)
1. Add `video-generation` type to ProviderType
2. Add fal.ai provider config (aggregates Kling, Minimax, Wan)
3. Add Kling video model via Replicate
4. Update AGENT_PROVIDERS with new mappings

### Phase 2: Registry Expansion
1. Add new AgentCategory values
2. Add 20 new Higgsfield app entries
3. Add 20 new Mulerun agent entries
4. Update import path mappings

### Phase 3: Agent Implementation (Grouped)
**Batch 1 - Face/Swap agents:**
- face-swap-photo, face-swap-video, character-swap, recast

**Batch 2 - Style/Art agents:**
- comic-book, renaissance, pixel-game, sketch-to-real

**Batch 3 - Product/Ad agents:**
- bullet-time-scene, packshot, click-to-ad, poster

**Batch 4 - Mulerun agents:**
- 3d-desk-figure, chibi-sticker-maker, pet-star, decorate-a-room

### Phase 4: Testing & Documentation
1. Unit tests for each agent schema
2. Integration tests for provider connections
3. Consent flow tests for biometric agents
4. API documentation with input/output examples

---

## Part 6: CONSENT & SAFETY REQUIREMENTS

### Biometric Consent Required
```typescript
const consentRequiredAgents = [
  'face-swap-photo',
  'face-swap-video',
  'video-face-swap',
  'character-swap',
  'recast',
  'voice-cloner',
  'lip-sync',
  'talking-avatar',
];
```

### Watermarking Required
```typescript
const watermarkRequiredAgents = [
  'face-swap-video',
  'video-face-swap',
  'recast',
  'voice-cloner',
];
```

---

## Summary

### Total Agents to Implement
- **Higgsfield Apps:** 75
- **Mulerun Agents:** 25+
- **Total:** 100+ agents

### Providers Needed
- Existing: Anthropic, OpenAI, Replicate, Stability, Runway, ElevenLabs
- New: fal.ai (aggregator for Kling, Minimax, Wan)

### Categories
- 12 existing + 8 new = 20 total categories

### Key Specifications
- All agents have defined input counts (1-2 images)
- Prompt requirements clearly specified
- Aspect ratios standardized per use case
- Model selection mapped to providers
- Pricing documented per agent

This plan aligns with existing codebase constraints while expanding capabilities through realistic, currently-available APIs.
