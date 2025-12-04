# Agent Marketplace: Mulerun & Higgsfield Complete Implementation Plan

## Executive Summary

This plan covers the complete implementation of **50+ new agents** and **15+ new model providers** inspired by Mulerun and Higgsfield platforms. The implementation builds on the existing codebase infrastructure.

---

## Part 1: NEW MODEL PROVIDERS (Required First)

### 1.1 Video Generation Providers

#### A. Sora 2 Provider (OpenAI)
**File:** `src/providers/sora.ts`
```
Models: sora-2
Features:
- Text-to-video (up to 60 seconds)
- Image-to-video
- Video editing
- Sketch-to-video conversion
API: OpenAI API endpoint
Cost: ~$0.20-0.50 per 10s video
```

#### B. Google Veo Provider
**File:** `src/providers/veo.ts`
```
Models: veo-3.1
Features:
- Text-to-video with audio
- 4K video generation
- Music/sound integration
API: Google Cloud AI
Cost: ~$0.15-0.40 per video
```

#### C. Kling Provider (Kuaishou)
**File:** `src/providers/kling.ts`
```
Models: kling-2.6, kling-o1, kling-o1-edit, kling-speak
Features:
- Cinematic video with audio
- Video editing
- Talking avatar generation
- Photorealistic images
API: via Replicate or direct API
Cost: ~$0.10-0.30 per generation
```

#### D. Minimax Hailuo Provider
**File:** `src/providers/minimax.ts`
```
Models: minimax-hailuo-02
Features:
- High-dynamic video
- Fast generation
- Multi-shot support
API: Minimax API
Cost: ~$0.08-0.25 per video
```

#### E. Wan Provider (Alibaba)
**File:** `src/providers/wan.ts`
```
Models: wan-2.5, wan-2.2-image
Features:
- Video generation with sound
- Realistic image generation
API: Alibaba Cloud / Replicate
Cost: ~$0.05-0.20 per generation
```

#### F. Seedream/Seedance Provider
**File:** `src/providers/seedream.ts`
```
Models: seedream-4.5, seedream-4.0, seedance-pro
Features:
- 4K image generation
- Multi-shot video
- Advanced image editing
API: Via Replicate
Cost: ~$0.05-0.15 per image
```

### 1.2 Image Generation Providers

#### G. Flux 2.0 Provider (Black Forest Labs)
**File:** `src/providers/flux.ts`
```
Models: flux-2, flux-schnell, flux-kontext
Features:
- Ultra-fast image generation
- Visual edits via text prompts
- High-detail output
API: Replicate / BFL direct
Cost: ~$0.02-0.08 per image
```

#### H. Nano Banana Pro Provider
**File:** `src/providers/nano-banana.ts`
```
Models: nano-banana-pro, nano-banana-edit
Features:
- Best 4K image quality
- Advanced editing
- Product placement
API: Higgsfield API / Replicate
Cost: ~$0.05-0.15 per image
```

#### I. Z-Image Provider
**File:** `src/providers/z-image.ts`
```
Models: z-image
Features:
- Ultra-fast photorealistic images
- Low latency
API: Via API
Cost: ~$0.03-0.10 per image
```

#### J. Topaz Upscaler Provider
**File:** `src/providers/topaz.ts`
```
Models: topaz-upscale
Features:
- High-resolution upscaling
- Video frame enhancement
- Noise reduction
API: Topaz Labs API
Cost: ~$0.05-0.15 per upscale
```

### 1.3 Audio Providers

#### K. Suno Music Provider (Enhancement)
**File:** `src/providers/suno.ts`
```
Models: suno-v4
Features:
- Full song generation
- Lyrics + vocals
- Multiple genres
API: Suno API
Cost: ~$0.10-0.25 per song
```

---

## Part 2: PROVIDER CONFIGURATION UPDATE

### Update: `src/config/providers.ts`

```typescript
// Add new providers
export const PROVIDERS: Record<string, ProviderConfig> = {
  // ... existing providers ...

  // Video Generation
  sora: {
    id: 'sora',
    name: 'OpenAI Sora',
    type: 'video-generation',
    envKey: 'OPENAI_API_KEY', // Uses same key
    models: ['sora-2'],
    rateLimit: { requests: 50, windowMs: 60000 },
    timeout: 900000, // 15 minutes
  },

  veo: {
    id: 'veo',
    name: 'Google Veo',
    type: 'video-generation',
    envKey: 'GOOGLE_VEO_API_KEY',
    models: ['veo-3.1'],
    rateLimit: { requests: 50, windowMs: 60000 },
    timeout: 600000,
  },

  kling: {
    id: 'kling',
    name: 'Kling AI',
    type: 'video-generation',
    envKey: 'KLING_API_KEY',
    models: ['kling-2.6', 'kling-o1', 'kling-o1-edit', 'kling-speak'],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 600000,
  },

  minimax: {
    id: 'minimax',
    name: 'Minimax Hailuo',
    type: 'video-generation',
    envKey: 'MINIMAX_API_KEY',
    models: ['minimax-hailuo-02'],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 300000,
  },

  wan: {
    id: 'wan',
    name: 'Wan AI',
    type: 'video-generation',
    envKey: 'WAN_API_KEY',
    models: ['wan-2.5', 'wan-2.2-image'],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 600000,
  },

  seedream: {
    id: 'seedream',
    name: 'Seedream',
    type: 'image-generation',
    envKey: 'SEEDREAM_API_KEY',
    models: ['seedream-4.5', 'seedream-4.0', 'seedance-pro'],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 180000,
  },

  flux: {
    id: 'flux',
    name: 'Flux (BFL)',
    type: 'image-generation',
    envKey: 'BFL_API_KEY',
    models: ['flux-2', 'flux-schnell', 'flux-kontext'],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 60000,
  },

  'nano-banana': {
    id: 'nano-banana',
    name: 'Nano Banana Pro',
    type: 'image-generation',
    envKey: 'HIGGSFIELD_API_KEY',
    models: ['nano-banana-pro', 'nano-banana-edit'],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 120000,
  },

  topaz: {
    id: 'topaz',
    name: 'Topaz Labs',
    type: 'image-editing',
    envKey: 'TOPAZ_API_KEY',
    models: ['topaz-upscale'],
    rateLimit: { requests: 50, windowMs: 60000 },
    timeout: 300000,
  },

  suno: {
    id: 'suno',
    name: 'Suno Music',
    type: 'audio-generation',
    envKey: 'SUNO_API_KEY',
    models: ['suno-v4'],
    rateLimit: { requests: 50, windowMs: 60000 },
    timeout: 300000,
  },
};
```

---

## Part 3: NEW HIGGSFIELD AGENTS (25 Agents)

### Category: Image Generation

#### 21. Soul ID Character Agent
**File:** `src/agents/higgsfield/21-soul-id-character/index.ts`
```
Description: Create unique, consistent AI characters with persistent identity
Providers: [higgsfield, replicate, flux]
Features:
- Character trait definition (personality, appearance, style)
- Pose/expression library generation
- Cross-scene consistency
- Character database persistence
Input: { characterDescription, traits, style, numVariations }
Output: { characterId, images[], characterProfile }
Tier: pro
Cost: $0.20-0.50/character
```

#### 22. Instadump Agent
**File:** `src/agents/higgsfield/22-instadump/index.ts`
```
Description: Convert selfies into a content library of different styles/scenes
Providers: [flux, replicate, nano-banana]
Features:
- Multiple style variations from single selfie
- Background replacement
- Outfit changes
- Lighting adjustments
Input: { selfieImage, styles[], numOutputs }
Output: { images[], styles[] }
Tier: starter
Cost: $0.15-0.30/batch
```

#### 23. Photodump Studio Agent
**File:** `src/agents/higgsfield/23-photodump-studio/index.ts`
```
Description: Generate aesthetic photo collections with consistent style
Providers: [flux, seedream, stability]
Features:
- Curated aesthetic themes
- Batch generation
- Style consistency
- Social media optimization
Input: { theme, mood, numPhotos, aspectRatio }
Output: { photos[], collageUrl }
Tier: starter
Cost: $0.10-0.25/batch
```

#### 24. Fashion Factory Agent
**File:** `src/agents/higgsfield/24-fashion-factory/index.ts`
```
Description: Create complete fashion outfit sets with AI
Providers: [higgsfield-soul, flux, replicate]
Features:
- Full outfit generation
- Style matching
- Color coordination
- Multiple angles
Input: { style, season, occasion, colors }
Output: { outfitImages[], itemDescriptions[] }
Tier: pro
Cost: $0.25-0.50/outfit
```

#### 25. Flux Kontext Editor Agent
**File:** `src/agents/higgsfield/25-flux-kontext/index.ts`
```
Description: Make visual edits to images using text prompts
Providers: [flux-kontext, anthropic]
Features:
- Natural language editing
- Object manipulation
- Style transfer via text
- Non-destructive edits
Input: { image, editPrompt, strength }
Output: { editedImage, changes[] }
Tier: starter
Cost: $0.05-0.15/edit
```

#### 26. Higgsfield Angles Agent
**File:** `src/agents/higgsfield/26-angles/index.ts`
```
Description: Generate different viewing angles of a product/subject
Providers: [replicate, stability, flux]
Features:
- 360-degree view generation
- Consistent lighting
- Shadow matching
- E-commerce optimization
Input: { productImage, angles[], style }
Output: { angleImages[], turnaroundGif }
Tier: pro
Cost: $0.20-0.40/set
```

#### 27. Product Placement Agent
**File:** `src/agents/higgsfield/27-product-placement/index.ts`
```
Description: Place products into lifestyle scenes naturally
Providers: [nano-banana, flux, stability]
Features:
- Scene matching
- Lighting integration
- Shadow generation
- Multiple scene options
Input: { productImage, sceneType, style }
Output: { compositeImages[], scenes[] }
Tier: pro
Cost: $0.15-0.35/placement
```

### Category: Video Generation

#### 28. Click to Ad Agent
**File:** `src/agents/higgsfield/28-click-to-ad/index.ts`
```
Description: Transform product URLs into video advertisements
Providers: [sora, kling, runway, anthropic]
Features:
- URL scraping for product info
- Auto script generation
- Video creation
- Platform optimization (TikTok, Instagram, YouTube)
Input: { productUrl, platform, duration, style }
Output: { videoUrl, script, thumbnails[] }
Tier: enterprise
Cost: $1.00-3.00/ad
```

#### 29. Draw to Video Agent
**File:** `src/agents/higgsfield/29-draw-to-video/index.ts`
```
Description: Convert sketches and drawings into cinematic videos
Providers: [sora, kling, runway]
Features:
- Sketch-to-scene conversion
- Motion inference
- Style enhancement
- Multi-frame animation
Input: { sketchImage, motionPrompt, style, duration }
Output: { videoUrl, thumbnailUrl }
Tier: pro
Cost: $0.40-1.00/video
```

#### 30. UGC Factory Agent
**File:** `src/agents/higgsfield/30-ugc-factory/index.ts`
```
Description: Build user-generated content with AI avatars
Providers: [kling-speak, elevenlabs, sora]
Features:
- Avatar creation
- Script-to-video
- Voice synthesis
- Authentic UGC style
Input: { script, avatarStyle, platform, voiceId }
Output: { videoUrl, avatarId }
Tier: pro
Cost: $0.50-1.50/video
```

#### 31. Recast Studio Agent
**File:** `src/agents/higgsfield/31-recast-studio/index.ts`
```
Description: Transform clips with stylistic effects and filters
Providers: [runway, kling-o1-edit, replicate]
Features:
- Style transfer for video
- Color grading presets
- Transition effects
- Audio preservation
Input: { videoUrl, style, effects[], preserveAudio }
Output: { transformedVideoUrl, beforeAfter }
Tier: starter
Cost: $0.20-0.60/video
```

#### 32. Higgsfield Animate Agent
**File:** `src/agents/higgsfield/32-animate/index.ts`
```
Description: Smart replacement and animation in videos
Providers: [runway, kling, replicate]
Features:
- Object replacement
- Character animation
- Background swapping
- Seamless blending
Input: { videoUrl, replacementType, targetObject, replacement }
Output: { animatedVideoUrl }
Tier: pro
Cost: $0.30-0.80/video
```

#### 33. Sora Trends Agent
**File:** `src/agents/higgsfield/33-sora-trends/index.ts`
```
Description: AI TikTok video generator for viral content
Providers: [sora, anthropic, elevenlabs]
Features:
- Trending topic analysis
- Hook optimization
- Viral format templates
- Sound selection
Input: { topic, trendStyle, duration, platform }
Output: { videoUrl, caption, hashtags[] }
Tier: pro
Cost: $0.40-1.00/video
```

### Category: Audio Generation

#### 34. Advanced Music Generator Agent
**File:** `src/agents/higgsfield/34-advanced-music/index.ts`
```
Description: Full song generation with vocals using Suno v4
Providers: [suno, replicate]
Features:
- Lyrics generation
- Vocal synthesis
- Genre selection
- Instrumental + vocal tracks
Input: { prompt, genre, duration, withVocals, lyrics }
Output: { audioUrl, lyrics, stems[] }
Tier: pro
Cost: $0.20-0.50/song
```

#### 35. Sound Effects Generator Agent
**File:** `src/agents/higgsfield/35-sfx-generator/index.ts`
```
Description: Generate custom sound effects for videos/games
Providers: [replicate, elevenlabs]
Features:
- Text-to-SFX
- Category presets
- Layering support
- Game-ready formats
Input: { description, category, duration, format }
Output: { audioUrl, waveform }
Tier: starter
Cost: $0.05-0.15/effect
```

---

## Part 4: NEW MULERUN AGENTS (25 Agents)

### Category: Creative & Entertainment

#### 36. Pet Star Agent
**File:** `src/agents/mulerun/36-pet-star/index.ts`
```
Description: Transform pet photos into themed artistic images
Providers: [flux, stability, replicate]
Features:
- 9-grid layout generation
- Red carpet themes
- Mecha pet transformation
- Fantasy companion styles
Input: { petImage, theme, gridSize, style }
Output: { images[], collageUrl }
Tier: starter
Cost: $0.30-0.50/batch
```

#### 37. Cosplay Generator Agent
**File:** `src/agents/mulerun/37-cosplay-generator/index.ts`
```
Description: Transform photos into anime/game character cosplay
Providers: [flux, replicate, stability]
Features:
- Character matching
- Costume generation
- Style preservation
- Multiple characters
Input: { userImage, character, style }
Output: { cosplayImage, characterMatch }
Tier: starter
Cost: $0.25-0.50/image
```

#### 38. 3D Desk Figure Agent
**File:** `src/agents/mulerun/38-3d-desk-figure/index.ts`
```
Description: Transform photos into collectible toy-style renders
Providers: [stability, replicate, flux]
Features:
- Action figure box design
- Multiple poses
- Collectible packaging
- 3D-style rendering
Input: { image, figureStyle, boxText, accessories }
Output: { figureImage, boxImage, variants[] }
Tier: pro
Cost: $0.40-0.80/figure
```

#### 39. Cover Star Maker Agent
**File:** `src/agents/mulerun/39-cover-star/index.ts`
```
Description: Create magazine cover style photos
Providers: [flux, stability, anthropic]
Features:
- Magazine template library
- Headline generation
- Professional styling
- Multiple publications
Input: { image, magazineStyle, headline, subheadlines }
Output: { coverImage, variants[] }
Tier: starter
Cost: $0.20-0.40/cover
```

#### 40. Mini-Me Generator Agent
**File:** `src/agents/mulerun/40-mini-me/index.ts`
```
Description: Create chibi/mini versions of people
Providers: [flux, stability, replicate]
Features:
- Chibi art style
- Sticker generation
- Multiple expressions
- Transparent backgrounds
Input: { image, style, expressions[], outputFormat }
Output: { miniMeImages[], stickerPack }
Tier: starter
Cost: $0.15-0.35/batch
```

#### 41. Hairstyle AI Agent
**File:** `src/agents/mulerun/41-hairstyle-ai/index.ts`
```
Description: Virtual hairstyle try-on and transformation
Providers: [replicate, flux, stability]
Features:
- 9 hairstyle variations
- Color changes
- Length adjustments
- Style recommendations
Input: { image, hairstyles[], colors[] }
Output: { images[], recommendations[] }
Tier: starter
Cost: $0.25-0.50/batch
```

#### 42. AI Photo Restorer Agent
**File:** `src/agents/mulerun/42-photo-restorer/index.ts`
```
Description: Restore and colorize old/damaged photos
Providers: [replicate, stability, anthropic]
Features:
- Damage repair
- Colorization
- Face enhancement
- Resolution upscaling
Input: { image, colorize, enhanceFaces, upscale }
Output: { restoredImage, originalComparison }
Tier: starter
Cost: $0.30-0.60/restoration
```

#### 43. Exploded View Generator Agent
**File:** `src/agents/mulerun/43-exploded-view/index.ts`
```
Description: Create exploded view diagrams of products
Providers: [stability, flux, anthropic]
Features:
- Component separation
- Technical illustration style
- Labeling
- Assembly animation
Input: { productImage, components, style, animate }
Output: { explodedImage, componentLabels[], animationUrl }
Tier: pro
Cost: $0.40-0.80/view
```

### Category: E-Commerce & Business

#### 44. Virtual Try-On Pro Agent
**File:** `src/agents/mulerun/44-virtual-tryon-pro/index.ts`
```
Description: Advanced clothing try-on with model diversity
Providers: [replicate, stability, anthropic]
Features:
- 40+ country model library
- Size visualization
- Multiple angles
- Batch processing
Input: { garmentImage, modelType, sizes[], angles }
Output: { tryOnImages[], sizeChart }
Tier: pro
Cost: $0.25-0.60/item
```

#### 45. AI Model Swap Pro Agent
**File:** `src/agents/mulerun/45-model-swap-pro/index.ts`
```
Description: Replace models in product photos with AI-generated diverse models
Providers: [replicate, stability, flux]
Features:
- Demographic diversity
- Garment preservation
- Pose matching
- Lighting consistency
Input: { productImage, modelDemographic, pose, count }
Output: { swappedImages[], modelProfiles[] }
Tier: pro
Cost: $0.20-0.50/swap
```

#### 46. Smart Data Analyzer Pro Agent
**File:** `src/agents/mulerun/46-smart-data-pro/index.ts`
```
Description: Advanced AI-powered data analysis with visualization
Providers: [anthropic, openai]
Features:
- Natural language queries
- Auto-visualization
- Trend detection
- Anomaly alerts
- Export to dashboards
Input: { dataSource, query, visualizationType }
Output: { analysis, charts[], insights[], recommendations }
Tier: pro
Cost: $0.10-0.30/analysis
```

#### 47. Investment Research Agent
**File:** `src/agents/mulerun/47-investment-research/index.ts`
```
Description: AI-powered equity research and analysis
Providers: [anthropic, openai]
Features:
- Company analysis
- Financial modeling
- Risk assessment
- Market comparison
Input: { ticker, analysisType, timeframe }
Output: { report, metrics, recommendation, riskScore }
Tier: enterprise
Cost: $0.50-1.50/report
```

#### 48. Crypto Alpha Hunt Agent
**File:** `src/agents/mulerun/48-crypto-alpha/index.ts`
```
Description: Cryptocurrency analysis and opportunity detection
Providers: [anthropic, openai]
Features:
- On-chain analysis
- Sentiment tracking
- Technical indicators
- Risk scoring
Input: { tokens[], analysisType, riskTolerance }
Output: { opportunities[], analysis, signals[] }
Tier: pro
Cost: $0.20-0.60/analysis
```

### Category: Productivity

#### 49. Resume Pro Agent
**File:** `src/agents/mulerun/49-resume-pro/index.ts`
```
Description: AI-assisted resume building with 1000+ templates
Providers: [anthropic]
Features:
- Template library (1000+)
- ATS optimization
- Industry-specific formatting
- LinkedIn optimization
- ResumePic generation
Input: { resumeData, targetRole, industry, template }
Output: { resumeHtml, resumePdf, atsScore, suggestions[] }
Tier: starter
Cost: $0.15-0.40/resume
```

#### 50. Paper Review Agent
**File:** `src/agents/mulerun/50-paper-review/index.ts`
```
Description: Academic paper analysis and review
Providers: [anthropic, openai]
Features:
- Citation analysis
- Methodology critique
- Statistical validation
- Literature comparison
Input: { paperUrl, reviewType, focusAreas[] }
Output: { review, score, citations[], improvements[] }
Tier: pro
Cost: $0.20-0.50/review
```

#### 51. General Browser Operator Agent
**File:** `src/agents/mulerun/51-browser-operator/index.ts`
```
Description: AI-powered web automation and data collection
Providers: [anthropic, playwright]
Features:
- Web scraping
- Form filling
- Data extraction
- Screenshot capture
Input: { url, task, extractFields[] }
Output: { data, screenshots[], logs[] }
Tier: pro
Cost: $0.10-0.30/task
```

### Category: Content & Marketing

#### 52. YouTube Thumbnail Generator Agent
**File:** `src/agents/mulerun/52-thumbnail-generator/index.ts`
```
Description: Create high-CTR YouTube thumbnails
Providers: [flux, stability, anthropic]
Features:
- Click-bait detection
- A/B variants
- Text overlay optimization
- Face expression enhancement
Input: { videoFrame, title, style, variants }
Output: { thumbnails[], ctrPrediction }
Tier: starter
Cost: $0.15-0.35/batch
```

#### 53. Food to Recipe Agent
**File:** `src/agents/mulerun/53-food-to-recipe/index.ts`
```
Description: Convert food images to detailed recipes
Providers: [anthropic, openai]
Features:
- Ingredient detection
- Cooking instructions
- Nutrition estimation
- Dietary adaptations
Input: { foodImage, dietaryPreferences[], servings }
Output: { recipe, ingredients[], nutrition, substitutions[] }
Tier: free
Cost: $0.05-0.15/recipe
```

#### 54. Caption AI Agent
**File:** `src/agents/mulerun/54-caption-ai/index.ts`
```
Description: Generate captions for any image/video content
Providers: [anthropic, openai]
Features:
- Multi-platform optimization
- Hashtag generation
- Accessibility descriptions
- Multilingual support
Input: { media, platforms[], tone, language }
Output: { captions{}, hashtags[], accessibility }
Tier: free
Cost: $0.05-0.10/caption
```

#### 55. Decorate A Room Agent
**File:** `src/agents/mulerun/55-room-decorator/index.ts`
```
Description: AI interior design and room decoration
Providers: [flux, stability, anthropic]
Features:
- Style transformation
- Furniture placement
- Color scheme generation
- Before/after comparison
Input: { roomImage, style, furniture[], colorScheme }
Output: { decoratedImage, itemSuggestions[], shoppingList }
Tier: starter
Cost: $0.30-0.60/room
```

#### 56. Mechanical Image Generator Agent
**File:** `src/agents/mulerun/56-mechanical-image/index.ts`
```
Description: Generate mechanical/technical illustrations
Providers: [flux, stability]
Features:
- Technical drawing styles
- Blueprint aesthetics
- Steampunk themes
- Industrial design
Input: { prompt, style, technicalDetails }
Output: { image, technicalSpec }
Tier: starter
Cost: $0.20-0.40/image
```

#### 57. 3D Building Illustrator Agent
**File:** `src/agents/mulerun/57-3d-building/index.ts`
```
Description: Create 3D architectural illustrations
Providers: [flux, stability, replicate]
Features:
- Architectural rendering
- Interior/exterior views
- Day/night lighting
- Multiple styles
Input: { buildingDescription, viewType, style, lighting }
Output: { rendering, views[], floorplan }
Tier: pro
Cost: $0.50-1.00/building
```

#### 58. Film Filter Agent
**File:** `src/agents/mulerun/58-film-filter/index.ts`
```
Description: Apply vintage film aesthetics to photos
Providers: [replicate, stability]
Features:
- Film stock emulation (Fuji 400H, Portra, etc.)
- Grain simulation
- Color grading
- Light leak effects
Input: { image, filmStock, grainIntensity, lightLeaks }
Output: { filteredImage, beforeAfter }
Tier: free
Cost: $0.10-0.25/image
```

#### 59. Portrait Elevate Agent
**File:** `src/agents/mulerun/59-portrait-elevate/index.ts`
```
Description: Professional portrait enhancement and styling
Providers: [replicate, flux, stability]
Features:
- Skin retouching
- Lighting enhancement
- Background upgrade
- Professional styling
Input: { portrait, enhancements[], style }
Output: { elevatedPortrait, comparison }
Tier: starter
Cost: $0.25-0.50/portrait
```

#### 60. Video Background Remover Agent
**File:** `src/agents/mulerun/60-video-bg-remover/index.ts`
```
Description: Remove and replace video backgrounds
Providers: [replicate, runway]
Features:
- Real-time processing
- Green screen replacement
- Virtual backgrounds
- Edge refinement
Input: { videoUrl, background, edgeRefinement }
Output: { processedVideoUrl, maskVideoUrl }
Tier: pro
Cost: $0.80-2.50/video
```

---

## Part 5: REGISTRY UPDATES

### Update: `src/agents/mulerun-registry.ts`

Add new agent metadata for all 25 new Mulerun agents with:
- Categories: creative, entertainment, ecommerce, productivity, marketing, content
- Tiers: free, starter, pro, enterprise
- Provider requirements
- Cost estimates
- Feature lists

### Update: `src/agents/higgsfield/index.ts`

Export all 15 new Higgsfield agents (21-35) with proper categorization.

---

## Part 6: ENVIRONMENT VARIABLES

### Update: `.env.example`

```bash
# Existing
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
STABILITY_API_KEY=
RUNWAY_API_KEY=

# NEW Video Providers
GOOGLE_VEO_API_KEY=
KLING_API_KEY=
MINIMAX_API_KEY=
WAN_API_KEY=

# NEW Image Providers
SEEDREAM_API_KEY=
BFL_API_KEY=
HIGGSFIELD_API_KEY=
TOPAZ_API_KEY=

# NEW Audio Providers
SUNO_API_KEY=
```

---

## Part 7: IMPLEMENTATION ORDER

### Phase 1: Core Providers (Week 1-2)
1. Sora 2 Provider
2. Kling Provider
3. Flux 2.0 Provider
4. Suno Music Provider

### Phase 2: Additional Providers (Week 2-3)
5. Google Veo Provider
6. Minimax Hailuo Provider
7. Wan Provider
8. Seedream Provider
9. Nano Banana Provider
10. Topaz Provider

### Phase 3: Higgsfield Agents (Week 3-4)
11. Soul ID Character Agent
12. Click to Ad Agent
13. UGC Factory Agent
14. Draw to Video Agent
15. Sora Trends Agent
16. Fashion Factory Agent
17. Instadump Agent
18. Photodump Studio Agent
19. Recast Studio Agent
20. Higgsfield Animate Agent
21-25. Remaining Higgsfield agents

### Phase 4: Mulerun Agents (Week 4-6)
26-35. Creative/Entertainment agents
36-40. E-Commerce agents
41-45. Productivity agents
46-50. Content/Marketing agents
51-60. Remaining Mulerun agents

### Phase 5: Testing & Integration (Week 6-7)
- Unit tests for all providers
- Integration tests for agents
- API documentation
- Performance optimization

---

## Part 8: COST ESTIMATION

### Per-Provider API Costs
| Provider | Cost Range | Use Case |
|----------|-----------|----------|
| Sora 2 | $0.20-0.50/video | Premium video gen |
| Kling | $0.10-0.30/gen | Video/image/avatar |
| Veo | $0.15-0.40/video | Video with audio |
| Minimax | $0.08-0.25/video | Fast video |
| Flux 2 | $0.02-0.08/image | Fast images |
| Seedream | $0.05-0.15/image | 4K images |
| Suno | $0.10-0.25/song | Music gen |
| Runway | $0.10-0.50/video | Existing |

---

## Summary

**Total New Agents:** 50
- Higgsfield: 25 new agents (21-45)
- Mulerun: 25 new agents (46-70)

**Total New Providers:** 11
- Video: Sora, Veo, Kling, Minimax, Wan
- Image: Flux 2, Seedream, Nano Banana, Topaz
- Audio: Suno

**Categories Covered:**
- Image Generation & Editing
- Video Generation & Effects
- Audio & Music
- E-Commerce & Product
- Content & Marketing
- Productivity & Business
- Creative & Entertainment

This implementation brings the Agent Marketplace to feature parity with Higgsfield and Mulerun platforms while leveraging all major AI model providers.

---

## Part 9: DETAILED MODEL SPECIFICATIONS

### 9.1 Video Generation Models

#### Sora 2 (OpenAI)
```typescript
interface Sora2Config {
  models: ['sora-2', 'sora-2-pro', 'sora-2-i2v', 'sora-2-pro-i2v'];

  resolution: {
    'sora-2': '720p',        // 1280x720
    'sora-2-pro': '1080p',   // 1920x1080
  };

  aspectRatios: ['16:9', '9:16', '1:1'];

  duration: {
    min: 4,    // seconds
    max: 20,   // up to 20s per generation
    default: 8,
  };

  modes: ['text-to-video', 'image-to-video', 'video-to-video'];

  features: {
    audioGeneration: true,   // Native audio in output
    videoRemix: true,        // Targeted adjustments to existing videos
    sketchToVideo: true,
  };

  pricing: {
    'sora-2': '$0.20-0.30 per 10s video',
    'sora-2-pro': '$0.40-0.60 per 10s video',
  };

  api: {
    endpoint: 'https://api.openai.com/v1/video/generations',
    authentication: 'Bearer token (OPENAI_API_KEY)',
    timeout: 900000,  // 15 minutes
  };
}
```

#### Google Veo 3.1
```typescript
interface Veo31Config {
  models: ['veo-3', 'veo-3-fast', 'veo-3.1'];

  resolution: {
    options: ['720p', '1080p'],
    default: '720p',
    note: '1080p available with resolution parameter',
  };

  aspectRatios: ['16:9', '9:16'];

  duration: {
    options: [4, 6, 8],  // seconds
    default: 8,
    extension: 'Scene extension allows minute+ videos via chaining',
  };

  frameRate: 24;  // fps

  audio: {
    native: true,  // Generates dialogue, effects, and music
    lipSync: true, // Speaking characters with synchronized dialogue
  };

  parameters: {
    negativePrompt: 'string',  // Content to avoid
    personGeneration: 'allow_adult',  // Safety setting
    seed: 'uint32 (0-4294967295)',  // Deterministic generation
    sampleCount: '1-4',  // Number of videos to generate
  };

  pricing: {
    audioOff: '$0.20/second',
    audioOn: '$0.40/second',
    example: '5s video with audio = $2.00',
  };

  api: {
    endpoint: 'Gemini API / Vertex AI',
    authentication: 'GOOGLE_VEO_API_KEY',
  };

  watermark: 'SynthID watermarks applied';
}
```

#### Kling AI (Kuaishou)
```typescript
interface KlingConfig {
  models: [
    'kling-2.6',      // Latest cinematic video
    'kling-2.5-turbo-pro',
    'kling-o1',       // Photorealistic images
    'kling-o1-edit',  // Video editing
    'kling-speak',    // Talking avatars
  ];

  resolution: {
    video: '1080p',  // 1920x1080
    frameRate: 30,   // fps
    note: '4K in testing phase',
  };

  aspectRatios: ['16:9', '9:16', '1:1'];

  duration: {
    options: [5, 10],  // seconds
    extension: '+4.5s per continuation',
    max: '2 minutes (Pro users)',
  };

  modes: ['text-to-video', 'image-to-video', 'elements'];

  elements: {
    mode: 'std',
    maxImages: 4,
    version: '1.6',
  };

  cameraEffects: ['tilt', 'pan', 'zoom', 'tracking'];
  negativePrompt: true;

  pricing: {
    perSecond: '$0.07 (audio off) / $0.14 (audio on)',
    example: '5s with audio = $0.70',
    turbo: '$0.35 for 5s + $0.07/additional second',
  };

  generationTime: '30-90 seconds depending on complexity';

  api: {
    endpoints: {
      fal: 'fal.ai/models/kling-v2.6',
      piapi: 'piapi.ai/docs/kling-api',
      direct: 'app.klingai.com/global/dev',
    };
  };
}
```

#### Minimax Hailuo
```typescript
interface MinimaxHailuoConfig {
  models: ['hailuo-02', 'hailuo-2.3', 'video-01'];

  resolution: {
    'hailuo-02': ['512p', '768p'],
    'hailuo-2.3': ['720p', '1080p'],
    'video-01': '720p (1280x720)',
  };

  frameRate: {
    'hailuo-02': 24,
    'hailuo-2.3': 30,
    'video-01': 25,
  };

  duration: {
    'hailuo-02': { max: 10, default: 6 },
    'hailuo-2.3': { max: 10, default: 6 },
    'video-01': { max: 6, note: 'Extending to 10s' },
  };

  modes: ['text-to-video', 'image-to-video'];

  pricing: {
    '768p': '$0.045/second',
    '512p': '$0.017/second',
    example: '6s 768p = $0.27',
  };

  generationTime: {
    '6s': '4-5 minutes',
    '10s': '8-9 minutes',
    'i2v': 'Under 1 minute',
  };

  ranking: '#2 on Artificial Analysis benchmark (above Veo 3)';

  api: {
    endpoint: 'platform.minimax.io/docs/api-reference/video-generation-t2v',
    fal: 'fal.ai/models/fal-ai/minimax/hailuo-02',
  };
}
```

#### Wan 2.5 (Alibaba)
```typescript
interface WanConfig {
  models: ['wan-2.5', 'wan-2.2-image'];

  resolution: {
    video: ['480p', '720p', '1080p'],
    default: '720p',
  };

  audio: {
    native: true,
    description: 'Best open source video model with sound',
  };

  pricing: {
    '480p': '$0.05/second',
    '720p': '$0.10/second',
    '1080p': '$0.15/second',
  };

  api: {
    provider: 'fal.ai',
  };
}
```

### 9.2 Image Generation Models

#### Flux 2.0 (Black Forest Labs)
```typescript
interface FluxConfig {
  models: ['flux-2', 'flux-2-flex', 'flux-schnell', 'flux-kontext'];

  resolution: {
    megapixel: 'Variable',
    note: 'Adjustable inference steps and guidance scale',
  };

  features: {
    'flux-2-flex': 'Fine-tuned control with adjustable parameters',
    'flux-kontext': 'Visual edits via text prompts',
    'flux-schnell': 'Ultra-fast generation',
  };

  tags: ['stylized', 'transform', 'realism'];

  pricing: {
    perMegapixel: '$0.06 (input + output)',
  };

  api: {
    fal: 'fal.ai/models/flux-2-flex',
    replicate: 'black-forest-labs/flux',
    direct: 'api.bfl.ml',
  };
}
```

#### Nano Banana Pro (Higgsfield)
```typescript
interface NanaBananaConfig {
  models: ['nano-banana-pro', 'nano-banana-edit'];

  resolution: '4K';

  features: {
    typography: 'Enhanced text rendering',
    editing: 'Advanced image editing',
    productPlacement: true,
  };

  description: 'Best 4K image model (state-of-the-art from Google)';

  pricing: '$0.15 per image';

  apps: [
    'Urban Cuts',
    'Sticker Match Cut',
    'Style Snap',
    'Game Dump',
    'Breakdown',
    'Signboard',
    'Outfit Vending',
    'Glitter Sticker',
    'Paint App',
    'Behind the Scenes',
    'Simlife',
    'Nano Theft',
    'Nano Strike',
    'Japanese Show',
  ];
}
```

#### Seedream (ByteDance)
```typescript
interface SeedreamConfig {
  models: ['seedream-4.5', 'seedream-4.0', 'seedance-pro'];

  resolution: {
    'seedream-4.5': '4K',
    'seedream-4.0': '4K',
  };

  features: {
    'seedream-4.5': 'Next-gen 4K image model',
    'seedream-4.0': 'Advanced image editing',
    'seedance-pro': 'Multi-shot video generation',
  };
}
```

#### Z-Image
```typescript
interface ZImageConfig {
  models: ['z-image', 'z-image-turbo'];

  parameters: {
    modelSize: '6B parameters',
  };

  features: 'Ultra-fast photorealistic images';

  pricing: {
    training: '$2.26 per 1000-step run',
  };
}
```

### 9.3 Higgsfield Apps Complete Catalog

#### Nano Bananas Collection
```typescript
const nanaBananasApps = [
  {
    name: 'Urban Cuts',
    description: 'Next-gen beat-synced AI outfit videos',
    input: ['video/image', 'beat sync params'],
    output: 'Synchronized video clips',
    model: 'Nano Banana Pro',
  },
  {
    name: 'Sticker Match Cut',
    description: 'Turn any clip into sparkling sticker animation',
    input: ['video clip', 'sticker style'],
    output: 'Enhanced video with sticker animations',
    model: 'Nano Banana Pro',
  },
  {
    name: 'Style Snap',
    description: 'Transform your look with instant style variations',
    input: ['photo/selfie', 'style preference'],
    output: 'Multiple style variations',
    model: 'Nano Banana Pro',
  },
  {
    name: 'Game Dump',
    description: 'Transform yourself into 12 iconic video game styles',
    input: ['single photo'],
    output: '12 distinct video game aesthetic variations',
    model: 'Nano Banana Pro',
  },
];
```

#### Banana Boutique Collection
```typescript
const bananaBoutiqueApps = [
  {
    name: 'Breakdown',
    description: 'Split any image into individual components',
    input: ['image'],
    output: 'Component-separated breakdown',
  },
  {
    name: 'Signboard',
    description: 'See yourself on a stylish mural',
    input: ['photo'],
    output: 'Mural-style artistic rendering',
  },
  {
    name: 'Outfit Vending',
    description: 'Display outfit breakdown in illuminated vending machine',
    input: ['photo/outfit'],
    output: 'Vending machine display composition',
  },
  {
    name: 'Glitter Sticker',
    description: 'Create sparkling sticker version of yourself',
    input: ['photo'],
    output: 'Animated sparkle-enhanced sticker',
  },
  {
    name: 'Paint App',
    description: 'Transform photo into retro paint app art',
    input: ['photo'],
    output: 'Retro digital art style image',
  },
];
```

#### Popular Apps
```typescript
const popularApps = [
  {
    name: 'Angles',
    description: 'Generate any angle view for any image in seconds',
    input: ['photo', 'angle specifications'],
    output: 'Multiple perspective variations',
    model: 'Higgsfield Angles',
  },
  {
    name: 'Face Swap',
    description: 'Best instant AI face swap for photos',
    input: ['source face', 'target image'],
    output: 'Seamlessly swapped composition',
  },
  {
    name: 'Recast',
    description: 'Industry-leading character swap for video',
    input: ['video', 'character reference'],
    output: 'Full character replacement video',
    model: 'Recast Studio',
  },
  {
    name: 'Transitions',
    description: 'Create seamless transitions between shots',
    input: ['multiple video clips'],
    output: 'Smoothly transitioned video',
  },
  {
    name: 'Click to Ad',
    description: 'Turn product links into UGC and professional video ads',
    input: ['product URL', 'brand guidelines'],
    output: 'Commercial-ready video advertisement',
  },
];
```

#### VFX Category
```typescript
const vfxApps = [
  { name: 'On Fire', description: 'This is Fine meme with fire effects' },
  { name: 'Storm Creature', description: 'Epic storm creature scene' },
  { name: 'Burning Sunset', description: 'Epic burning sunset scene' },
  { name: 'Sand Worm', description: 'Desert fantasy character scene' },
  { name: 'Latex', description: 'Sleek black latex style transformation' },
];
```

#### ASMR Category
```typescript
const asmrApps = [
  { name: 'ASMR Add-On', description: 'Insert product into ASMR video' },
  { name: 'ASMR Classic', description: 'Traditional ASMR with whispering' },
  { name: 'ASMR Host', description: 'Immersive ASMR studio scene' },
  { name: 'ASMR Promo', description: 'Scripted ASMR product video' },
];
```

#### Art Styles Category
```typescript
const artStyleApps = [
  { name: 'Sketch-to-Real', description: 'Sketch to realistic video scene' },
  { name: 'Comic Book', description: 'Comic book art style' },
  { name: 'Renaissance', description: 'Classical gallery painting' },
  { name: '60s Cafe', description: 'Vintage 60s cafe scene' },
  { name: 'Pixel Game', description: 'Retro pixel game graphics' },
];
```

#### Styled Ads Category
```typescript
const styledAdsApps = [
  { name: 'Bullet Time Scene', description: 'Spin with dynamic backgrounds' },
  { name: 'Poster', description: 'Bold poster design' },
  { name: 'Bullet Time Splash', description: 'Cinematic explosion effect' },
  { name: 'Magic Button', description: 'Whimsical magical scene' },
  { name: 'Bullet Time White', description: 'Clean white background rotation' },
];
```

### 9.4 Mulerun Agents Complete Catalog

#### Featured Agents with Full Specs
```typescript
const mulerunAgents = [
  {
    name: 'Zootopia 2 Aesthetic Fuji 400H Film Look',
    creator: 'Lucas',
    description: 'Soft Fuji 400H film tone; face, hair, pose unchanged',
    input: {
      type: 'Portrait image',
      requirements: 'Clear, well-lit with full face, gentle smile',
    },
    model: 'Gemini 2.5 Flash Image',
    pricing: '$0.49/run',
    output: 'Photorealistic portrait with film grain',
  },
  {
    name: 'Nick Wilde Cosplay Filter',
    creator: 'Lucas',
    description: 'ZPD police uniform and fox character features',
    input: {
      type: 'Portrait',
      requirements: 'Clear portrait, confident expression',
    },
    model: 'Gemini 2.5 Flash Image',
    pricing: '$0.49/run',
    output: 'Character cosplay portrait',
  },
  {
    name: 'Judy Hopps Cosplay Filter',
    creator: 'Lucas',
    description: 'Photorealistic Judy Hopps with ZPD uniform',
    input: {
      type: 'Portrait',
      requirements: 'Well-lit, close-up or waist-up',
    },
    model: 'Gemini 2.5 Flash Image',
    pricing: '$0.49/run',
    output: 'Character costume preview',
  },
  {
    name: '3D Desk Figure Creation',
    creator: 'laughing_code',
    description: 'Ultra-realistic collectible toy with custom box',
    input: {
      type: 'Front-facing image',
      optional: 'Pose/base specifications',
    },
    model: 'Gemini 2.5 Flash Image',
    pricing: '$0.50/run',
    output: '3D figurine render with packaging mockup',
  },
  {
    name: 'Chibi Sticker Maker',
    creator: 'laughing_code',
    description: 'Chibi-style sticker sets with multiple expressions',
    input: {
      type: 'Clear, front-facing photo',
      requirements: 'Plain background',
    },
    pricing: '$0.50/run',
    output: '8-12 transparent sticker packs',
  },
  {
    name: 'StarSnap',
    creator: 'YuTou_baby',
    description: 'Realistic photos with celebrities/actors',
    input: {
      type: 'Well-lit selfie',
      selection: 'Celebrity from gallery or upload',
    },
    model: 'AI blending technology',
    pricing: '$0.80/run',
    output: 'Blended celebrity composite',
  },
  {
    name: 'Me And My Mini-Me',
    creator: 'YuTou_baby',
    description: 'Heartwarming snapshot with childhood self',
    input: {
      type: 'Well-lit frontal portrait',
      requirements: 'Minimal facial occlusion',
    },
    pricing: '$0.50/run',
    output: 'Photorealistic composite image',
  },
  {
    name: 'Mechanical Image Generator',
    creator: 'Darren',
    pricing: '$0.29/run',
    output: 'Mechanical-style images',
  },
  {
    name: 'Caption AI',
    creator: 'yrmrazvdd2108ay',
    pricing: '$0.09/run',
    output: 'Image captions',
  },
  {
    name: 'Explain It Like I Am 5',
    creator: 'vktsbiy414205x1',
    pricing: '$0.50/run',
    output: 'Simplified explanations',
  },
];
```

#### E-Commerce Agents
```typescript
const ecommerceAgents = [
  {
    name: 'Virtual Try On',
    creator: 'PicCopilot',
    description: 'Transforms flat-lay clothing into photorealistic model shots',
    pricing: 'Creator metering ($20-30 estimated)',
    output: 'Model wearing uploaded apparel',
  },
  {
    name: 'AI Model Swap',
    creator: 'PicCopilot',
    description: 'Replace models with diverse virtual models (40+ countries)',
    pricing: 'Creator metering ($10-30 estimated)',
    output: 'Preserved clothing, new model',
  },
  {
    name: 'AI Backgrounds',
    creator: 'PicCopilot',
    description: 'Generate tailored, on-brand backgrounds',
    pricing: 'Creator metering ($10-20 estimated)',
    output: 'Product on AI-generated background',
  },
];
```

#### Life Assistant Agents
```typescript
const lifeAssistantAgents = [
  {
    name: 'UPCV Resume Gen',
    creator: 'upcv',
    description: 'AI resume building with 1,000+ templates',
    pricing: 'Fixed price ($50)',
    output: 'Optimized resume document',
  },
  {
    name: 'Smart Q',
    creator: 'QuickBI',
    description: 'AI-powered data analysis and visualization',
    input: 'Natural language queries',
    dataSupport: ['databases', 'Google Sheets', 'Excel'],
    pricing: 'Creator metering ($1-2 estimated)',
    output: 'Data analysis and visualizations',
  },
];
```

### 9.5 Common API Parameters

#### Aspect Ratios (All Video Models)
```typescript
type AspectRatio = '16:9' | '9:16' | '1:1';

const aspectRatioUses = {
  '16:9': 'YouTube, landscape, cinema',
  '9:16': 'TikTok, Reels, Shorts, mobile',
  '1:1': 'Instagram, square social',
};
```

#### Resolution Presets
```typescript
const resolutionPresets = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4K': { width: 3840, height: 2160 },
};
```

#### Duration Limits by Provider
```typescript
const durationLimits = {
  sora2: { min: 4, max: 20 },
  veo3: { min: 4, max: 8, extension: 'minute+' },
  kling: { min: 5, max: 10, extension: '+4.5s' },
  minimax: { min: 5, max: 10 },
  wan: { min: 4, max: 10 },
  runway: { min: 4, max: 16 },
};
```

---

## Part 10: API ENDPOINT STRUCTURE

### Provider Base URLs
```typescript
const providerEndpoints = {
  // OpenAI (Sora)
  sora: 'https://api.openai.com/v1/video/generations',

  // Google (Veo)
  veo: 'https://generativelanguage.googleapis.com/v1/video',
  veoVertexAI: 'https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/veo',

  // Kuaishou (Kling)
  kling: 'https://api.klingai.com/v1',
  klingFal: 'https://fal.run/fal-ai/kling-v2.6',

  // Minimax
  minimax: 'https://api.minimax.chat/v1/video',
  minimaxFal: 'https://fal.run/fal-ai/minimax/hailuo-02',

  // Alibaba (Wan)
  wan: 'https://fal.run/fal-ai/wan-2.5',

  // Black Forest Labs (Flux)
  flux: 'https://api.bfl.ml/v1',
  fluxReplicate: 'https://api.replicate.com/v1/predictions',
  fluxFal: 'https://fal.run/fal-ai/flux',

  // Higgsfield
  higgsfield: 'https://api.higgsfield.ai/v1',

  // Suno
  suno: 'https://api.suno.ai/v1',
};
```

---

## Sources

Research compiled from:
- [fal.ai Models](https://fal.ai/models) - Pricing and specifications
- [Kling O1 Developer Guide](https://fal.ai/learn/devs/kling-o1-developer-guide)
- [Google Veo Documentation](https://ai.google.dev/gemini-api/docs/video)
- [Minimax API Docs](https://platform.minimax.io/docs/api-reference/video-generation-t2v)
- [OpenAI Sora 2](https://openai.com/index/sora-2/)
- [Higgsfield.ai](https://higgsfield.ai)
- [Mulerun.com](https://mulerun.com)
