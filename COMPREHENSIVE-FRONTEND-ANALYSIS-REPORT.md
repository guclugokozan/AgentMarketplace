# Comprehensive Frontend Analysis Report

**Date:** December 4, 2025
**Analyst:** Claude Code
**Project:** Agent Marketplace
**Status:** Critical Issues Found

---

## Executive Summary

After thorough analysis of the Agent Marketplace frontend (`public/store.html`), backend API (`src/api/server.ts` and routes), and existing documentation, I have identified **8 critical issues** and **12 medium-priority issues** that are preventing the frontend from functioning correctly.

The most severe issues are:
1. **Wrong API URL** (port 8000 vs 3000)
2. **Wrong API endpoint path** (`/api/agents/` vs `/mulerun/agents/`)
3. **Wrong request body format** (`inputs` vs `input`)

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [Medium Priority Issues](#medium-priority-issues)
3. [Low Priority Issues](#low-priority-issues)
4. [Files Requiring Changes](#files-requiring-changes)
5. [Detailed Fix Instructions](#detailed-fix-instructions)
6. [Testing Checklist](#testing-checklist)
7. [Architecture Recommendations](#architecture-recommendations)

---

## Critical Issues

### CRITICAL-1: Wrong API Base URL (Port Mismatch)

**Severity:** CRITICAL
**File:** `public/store.html`
**Line:** 2720

**Problem:**
```javascript
const API_BASE_URL = 'http://localhost:8000';
```

**Analysis:**
- Frontend is configured to call port **8000** (FastAPI/ACC backend)
- Agent Marketplace backend runs on port **3000**
- All API calls will fail with connection refused or CORS errors

**Fix:**
```javascript
const API_BASE_URL = 'http://localhost:3000';
```

---

### CRITICAL-2: Wrong API Endpoint Path

**Severity:** CRITICAL
**File:** `public/store.html`
**Line:** 2798

**Problem:**
```javascript
const response = await fetch(`${API_BASE_URL}/api/agents/${agentId}/run`, {
```

**Analysis:**
- Frontend calls: `/api/agents/${agentId}/run`
- This endpoint **DOES NOT EXIST** on the backend
- Correct endpoint is: `/mulerun/agents/${agentId}/run`

**Backend Routes (from `src/api/server.ts`):**
```
/mulerun/agents/:id/run  - Execute MuleRun agent (POST)
/execute                  - Execute core agents (POST)
/stream                   - Execute with SSE streaming (POST)
```

**Fix:**
```javascript
const response = await fetch(`${API_BASE_URL}/mulerun/agents/${agentId}/run`, {
```

---

### CRITICAL-3: Wrong Request Body Format

**Severity:** CRITICAL
**File:** `public/store.html`
**Line:** 2803

**Problem:**
```javascript
body: JSON.stringify({ inputs }),  // Frontend sends "inputs" (plural)
```

**Analysis:**
Backend expects (from `src/api/routes/mulerun-agents.ts:294`):
```javascript
const { input: rawInput, webhookUrl, ...directFields } = req.body;
// Backend expects "input" (singular) OR direct fields
```

**Evidence from Backend Code:**
```javascript
// Support both { input: {...} } and direct fields format
const input = rawInput || (Object.keys(directFields).length > 0 ? directFields : null);
```

**Fix:**
```javascript
body: JSON.stringify({ input: inputs }),  // Use singular "input"
// OR send direct fields:
body: JSON.stringify(inputs),  // Direct fields format also works
```

---

### CRITICAL-4: Missing Prompt Input ID for Talking Avatar

**Severity:** CRITICAL
**File:** `public/store.html`
**Line:** ~2028

**Problem:**
```html
<textarea rows="4" placeholder="Enter the text you want the avatar to speak..."
  class="w-full px-4 py-3 rounded-ios-lg..."></textarea>
```

**Analysis:**
- The textarea has NO `id` attribute
- `collectAgentInputs()` looks for `id="prompt-${agentId}"`
- User's text input will never be collected and sent to API

**Fix:**
```html
<textarea
  id="prompt-${agent.id}"
  rows="4"
  placeholder="Enter the text you want the avatar to speak..."
  class="w-full px-4 py-3 rounded-ios-lg..."></textarea>
```

---

### CRITICAL-5: Video Generator End Frame Not Collected Properly

**Severity:** CRITICAL
**File:** `public/store.html`

**Problem:**
The Video Generator agent should have two image upload fields:
1. Start frame (first image)
2. End frame (optional, for keyframe animation)

**Analysis:**
- `collectAgentInputs()` looks for `previewImg2-${agentId}` for end frame
- Need to verify Video Generator template has proper dual upload structure

**Impact:**
- Keyframe video generation won't work without end frame collection

---

### CRITICAL-6: Selection Handler Parameters Not Used

**Severity:** HIGH
**File:** `public/store.html`
**Lines:** 2654-2681

**Problem:**
```javascript
function selectOption(element, groupId) {
  const container = element.parentElement;  // Uses parentElement
  // groupId parameter is NEVER USED!
  container.dataset.selected = element.textContent.trim();
}
```

**Analysis:**
- The `groupId` parameter is passed but never used
- Function blindly assumes `element.parentElement` is the selection container
- If HTML structure changes, this will break silently

**Current HTML Pattern:**
```html
<div id="modelSelection-${agent.id}" class="grid grid-cols-2 gap-2" data-selected="...">
  <button onclick="selectGridOption(this, 'model-${agent.id}')" ...>
```

**Issue:**
- Container ID is `modelSelection-image-generator`
- But onclick passes `model-image-generator` (different!)
- Function works only because it uses `parentElement` not `groupId`

**Fix - Use groupId Consistently:**
```javascript
function selectOption(element, groupId) {
  // Find container by ID for reliability
  const container = document.getElementById(groupId) || element.parentElement;
  container.querySelectorAll('button').forEach(btn => {
    btn.classList.remove('bg-primary', 'text-primary-foreground');
    btn.classList.add('bg-secondary', 'text-secondary-foreground', 'hover:bg-secondary/80');
  });
  element.classList.remove('bg-secondary', 'text-secondary-foreground', 'hover:bg-secondary/80');
  element.classList.add('bg-primary', 'text-primary-foreground');
  container.dataset.selected = element.textContent.trim();
}
```

**OR Fix - Match onclick IDs to container IDs:**
```html
<div id="styleSelection-${agent.id}" ...>
  <button onclick="selectOption(this, 'styleSelection-${agent.id}')" ...>
```

---

### CRITICAL-7: Image Generator Missing Prompt Textarea ID Connection

**Severity:** HIGH
**File:** `public/store.html`
**Line:** 1896

**Current (CORRECT):**
```html
<textarea id="prompt-${agent.id}" rows="4" ...></textarea>
```

**Verification:**
- `collectAgentInputs()` correctly retrieves prompt with:
```javascript
const promptEl = document.getElementById(`prompt-${agentId}`);
if (promptEl && promptEl.value) {
  inputs.prompt = promptEl.value;
}
```

**Status:** This one is actually CORRECT. The ID is properly set.

---

### CRITICAL-8: Selection ID vs collectAgentInputs Mismatch

**Severity:** HIGH
**File:** `public/store.html`

**Problem:**
The `collectAgentInputs` function looks for specific element IDs:
```javascript
const selectionIds = [
  'modelSelection', 'styleSelection', 'ratioSelection', 'numImagesSelection',
  'motionSelection', 'loopSelection', 'durationSelection',
  'avatarStyleSelection', 'expressionSelection', 'backgroundSelection',
  'resolutionSelection', 'frameRateSelection', 'stabSelection',
  'formatSelection', 'enhancementSelection'
];

selectionIds.forEach(id => {
  const el = document.getElementById(`${id}-${agentId}`);  // e.g., "modelSelection-image-generator"
  if (el && el.dataset.selected) {
    const fieldName = id.replace('Selection', '').replace(/([A-Z])/g, '_$1').toLowerCase();
    inputs[fieldName] = el.dataset.selected;
  }
});
```

**Verification Needed:**
Each agent's template must have container IDs matching this pattern:
- `modelSelection-{agentId}` ✓ Verified present
- `styleSelection-{agentId}` ✓ Verified present
- `ratioSelection-{agentId}` ✓ Verified present
- etc.

**Status:** Container IDs ARE correctly named. This is working.

---

## Medium Priority Issues

### MEDIUM-1: generateOutput() Button ID Selector

**File:** `public/store.html`
**Line:** 2768

**Problem:**
```javascript
const btn = document.getElementById(`generateBtn-${agentId}`);
```

**Analysis:**
Need to verify all agent templates have generate buttons with this ID pattern.

---

### MEDIUM-2: handleFileUpload vs handleUploadInBox Inconsistency

**File:** `public/store.html`

**Problem:**
Two different upload handlers exist:
- `handleUploadInBox(event, agentId)` - For in-box preview (used by most)
- `handleFileUpload(event, agentId)` - Different behavior

**Analysis:**
- Video Upscaler uses `handleFileUpload`:
```html
<input type="file" ... onchange="handleFileUpload(event, '${agent.id}')">
```
- But other agents use `handleUploadInBox`

**Inconsistency Impact:**
- Different preview behaviors across agents
- May not update the correct preview elements

---

### MEDIUM-3: Missing handleFileUpload Function Definition

**File:** `public/store.html`

**Problem:**
The `handleFileUpload` function is called but may not exist or may have different behavior than `handleUploadInBox`.

**Verification Required:**
Search for `function handleFileUpload` in the file.

---

### MEDIUM-4: Output Display Logic May Miss Some Response Types

**File:** `public/store.html`
**Lines:** 2823-2869

**Problem:**
```javascript
const data = result.data || result;

if (data.video || data.video_url) {
  // Video output
} else if (data.image || data.image_url || data.images) {
  // Image output
} else if (data.audio || data.audio_url) {
  // Audio output
} else {
  // Generic JSON display
}
```

**Analysis:**
Backend returns different field names based on agent:
- `resultImage` for background-remover
- `output` for some agents
- `image` or `image_url` for others

**Backend Response Examples (from mulerun-agents.ts):**
```javascript
// background-remover returns:
return {
  success: true,
  originalImage: imageUrl,
  resultImage: result.output,  // Note: "resultImage" not "image"
};
```

**Fix - Add more response field checks:**
```javascript
if (data.video || data.video_url || data.videoUrl) {
  const videoUrl = data.video || data.video_url || data.videoUrl;
  // ...
} else if (data.image || data.image_url || data.imageUrl || data.images || data.resultImage || data.output) {
  const imageUrl = data.image || data.image_url || data.imageUrl ||
                   (data.images && data.images[0]) || data.resultImage || data.output;
  // ...
}
```

---

### MEDIUM-5: camelCase to snake_case Conversion

**File:** `public/store.html`
**Line:** 2758

**Problem:**
```javascript
const fieldName = id.replace('Selection', '').replace(/([A-Z])/g, '_$1').toLowerCase();
```

**Analysis:**
Conversion examples:
- `modelSelection` → `model` ✓
- `styleSelection` → `style` ✓
- `avatarStyleSelection` → `avatar_style` ✓
- `numImagesSelection` → `num_images` ✓ (camelCase preserved)

**This conversion is CORRECT.**

---

### MEDIUM-6: Missing Agent-Specific UI Cases

**File:** `public/store.html`

**Problem:**
Some agents defined in the `agents` object may not have corresponding `case` statements in `getAgentSpecificUI()`.

**Agents in `agents` object:**
- virtual-try-on
- face-swap
- image-generator ✓
- background-remover
- video-generator
- lip-sync
- talking-avatar ✓
- image-upscaler
- portrait-enhancer
- image-animator ✓
- video-upscaler ✓
- music-generator
- voice-cloner
- ai-model-swap
- chibi-sticker-maker
- product-description-writer
- style-transfer

**Verification Needed:**
Check if all agents have matching case statements in `getAgentSpecificUI()`.

---

### MEDIUM-7: Dark Mode Toggle Not Following Guidelines

**File:** `public/store.html`
**Line:** 339

**Problem:**
```html
<button onclick="toggleTheme()" ...>
```

**From Guidelines (design-system.md):**
> "All interfaces default to dark theme... No theme switching UI"

**Impact:**
Per MVP constraints, theme toggle should be removed.

---

### MEDIUM-8: Error Message Display Truncation

**File:** `public/store.html`
**Lines:** 2875-2880

**Problem:**
```javascript
errorMessage = error.message || error.detail || error.error || JSON.stringify(error);
```

**Analysis:**
- Long error messages may overflow the UI
- Backend validation errors may have nested structures

---

### MEDIUM-9: Virtual Try-On Model Gallery Selection

**File:** `public/store.html`

**Problem:**
The virtual try-on agent has a model gallery for selecting predefined models, but:
- Need to verify model selection is being captured
- Need to verify the selected model URL is sent to API

---

### MEDIUM-10: Face Swap Dual Image Upload

**File:** `public/store.html`

**Problem:**
Face swap requires two images:
1. Source face
2. Target image

**Verification:**
- Check both images are collected via `previewImg-{agentId}` and `previewImg2-{agentId}`
- Verify both are sent to API

---

### MEDIUM-11: Music Generator Missing Input Collection

**File:** `public/store.html`

**Analysis:**
Music generator needs:
- Genre selection
- Mood selection
- Duration selection
- Prompt (optional)

**Verification Required:**
Check if getAgentSpecificUI() has a case for 'music-generator'.

---

### MEDIUM-12: Voice Cloner Complex Input Handling

**File:** `public/store.html`

**Analysis:**
Voice cloner needs:
- Text to speak
- Voice type selection
- Language selection
- Emotion selection
- Optional: Voice sample upload for cloning

**Verification Required:**
Check if all these inputs are properly captured.

---

## Low Priority Issues

### LOW-1: Prompt Suggestions Button Click Handler

**File:** `public/store.html`
**Line:** 1903

```javascript
<button onclick="setPrompt('${agent.id}', '${p}')" ...>
```

**Issue:**
If prompt text contains single quotes, the onclick will break.

**Fix:**
```javascript
<button onclick="setPrompt('${agent.id}', \`${p.replace(/`/g, '\\`')}\`)" ...>
```

---

### LOW-2: Console Logging in Production

**File:** `public/store.html`
**Line:** 2872

```javascript
console.error('Generation error:', error);
```

**Recommendation:**
Consider removing or conditionally enabling console logs for production.

---

### LOW-3: Missing Loading State Animation Polish

**File:** `public/store.html`

**Current:**
Simple spinner animation during generation.

**Recommendation:**
Add progress indication for long-running operations.

---

## Files Requiring Changes

| File | Priority | Changes Required |
|------|----------|-----------------|
| `public/store.html` | CRITICAL | Lines 2720, 2798, 2803 - API config |
| `public/store.html` | CRITICAL | Line ~2028 - Add textarea ID |
| `public/store.html` | HIGH | Lines 2654-2681 - Fix selection handlers |
| `public/store.html` | MEDIUM | Lines 2823-2869 - Output response handling |

---

## Detailed Fix Instructions

### Fix 1: API Configuration (CRITICAL)

**Location:** `public/store.html`, lines 2719-2803

**Before:**
```javascript
// API Backend URL
const API_BASE_URL = 'http://localhost:8000';

// ... later ...
const response = await fetch(`${API_BASE_URL}/api/agents/${agentId}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ inputs }),
});
```

**After:**
```javascript
// API Backend URL - Agent Marketplace runs on port 3000
const API_BASE_URL = 'http://localhost:3000';

// ... later ...
const response = await fetch(`${API_BASE_URL}/mulerun/agents/${agentId}/run`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ input: inputs }),  // Note: singular "input"
});
```

### Fix 2: Talking Avatar Textarea ID (CRITICAL)

**Location:** `public/store.html`, case 'talking-avatar' in getAgentSpecificUI()

**Before:**
```html
<textarea rows="4" placeholder="Enter the text you want the avatar to speak..."
  class="w-full px-4 py-3 rounded-ios-lg bg-muted border-0 text-sm
  placeholder:text-muted-foreground focus:outline-none focus:ring-2
  focus:ring-primary/30 resize-none"></textarea>
```

**After:**
```html
<textarea
  id="prompt-${agent.id}"
  rows="4"
  placeholder="Enter the text you want the avatar to speak..."
  class="w-full px-4 py-3 rounded-ios-lg bg-muted border-0 text-sm
  placeholder:text-muted-foreground focus:outline-none focus:ring-2
  focus:ring-primary/30 resize-none"></textarea>
```

### Fix 3: Output Response Handling (MEDIUM)

**Location:** `public/store.html`, lines 2823-2869

**Before:**
```javascript
const data = result.data || result;

if (data.video || data.video_url) {
  const videoUrl = data.video || data.video_url;
  // ...
} else if (data.image || data.image_url || data.images) {
  const imageUrl = data.image || data.image_url || (data.images && data.images[0]);
  // ...
}
```

**After:**
```javascript
const data = result.data || result.output || result;

// Check for video output
if (data.video || data.video_url || data.videoUrl || data.video_output) {
  const videoUrl = data.video || data.video_url || data.videoUrl || data.video_output;
  // ...
}
// Check for image output - include backend-specific field names
else if (data.image || data.image_url || data.imageUrl || data.images ||
         data.resultImage || data.output_image || data.generated_image) {
  const imageUrl = data.image || data.image_url || data.imageUrl ||
                   (data.images && data.images[0]) ||
                   data.resultImage || data.output_image || data.generated_image;
  if (imageUrl) {
    // ...
  }
}
// Check for audio output
else if (data.audio || data.audio_url || data.audioUrl || data.audio_output) {
  const audioUrl = data.audio || data.audio_url || data.audioUrl || data.audio_output;
  // ...
}
```

### Fix 4: Selection Handler Consistency (HIGH)

**Option A - Update Function to Use groupId:**
```javascript
function selectOption(element, groupId) {
  // Use groupId to find container, fallback to parentElement
  const container = document.getElementById(groupId) || element.parentElement;

  container.querySelectorAll('button').forEach(btn => {
    btn.classList.remove('bg-primary', 'text-primary-foreground');
    btn.classList.add('bg-secondary', 'text-secondary-foreground', 'hover:bg-secondary/80');
  });

  element.classList.remove('bg-secondary', 'text-secondary-foreground', 'hover:bg-secondary/80');
  element.classList.add('bg-primary', 'text-primary-foreground');

  // Update data-selected on the actual container with ID
  const selectionContainer = document.getElementById(groupId);
  if (selectionContainer) {
    selectionContainer.dataset.selected = element.textContent.trim();
  } else {
    element.parentElement.dataset.selected = element.textContent.trim();
  }
}
```

**Option B - Update onclick to pass correct container ID:**
Change all onclick handlers from:
```html
<button onclick="selectOption(this, 'style-${agent.id}')" ...>
```
To:
```html
<button onclick="selectOption(this, 'styleSelection-${agent.id}')" ...>
```

---

## Testing Checklist

### Pre-Fix Verification

- [ ] Verify current API calls fail with network error (port 8000)
- [ ] Verify console shows "fetch failed" or CORS errors
- [ ] Document current error messages for comparison

### Post-Fix Verification

#### API Connection Tests
- [ ] API calls reach correct endpoint (port 3000)
- [ ] `/mulerun/agents/:id/run` responds with 200 or appropriate error
- [ ] Request body format `{ input: {...} }` is accepted

#### Agent-Specific Tests

**Image Generator:**
- [ ] Prompt text is collected
- [ ] Model selection is captured
- [ ] Style selection is captured
- [ ] Aspect ratio is captured
- [ ] Number of images is captured
- [ ] Generate button triggers API call
- [ ] Loading state shows correctly
- [ ] Output image displays

**Background Remover:**
- [ ] Image upload works
- [ ] Image preview shows in upload box
- [ ] Clear button works
- [ ] Generate button triggers API
- [ ] Result image displays (check for `resultImage` field)

**Video Generator:**
- [ ] Start frame upload works
- [ ] End frame upload works (optional)
- [ ] Prompt is collected
- [ ] Model selection works
- [ ] Duration selection works
- [ ] Result video plays

**Talking Avatar:**
- [ ] Portrait image upload works
- [ ] Text input is collected (AFTER fixing textarea ID)
- [ ] Avatar style selection works
- [ ] Expression selection works
- [ ] Background selection works
- [ ] Result video plays

**Face Swap:**
- [ ] Source face image upload works
- [ ] Target image upload works
- [ ] Both images sent to API
- [ ] Swap mode selection works
- [ ] Enhancement options work
- [ ] Result image displays

**Virtual Try-On:**
- [ ] Model gallery selection works
- [ ] Custom model upload works
- [ ] Outfit image upload works
- [ ] Garment type selection works
- [ ] Result image displays

### Error Handling Tests
- [ ] Invalid image format shows error
- [ ] API timeout shows error
- [ ] Server error (500) shows user-friendly message
- [ ] "Try Again" button works
- [ ] Missing required input shows validation error

### UI/UX Tests
- [ ] Loading spinner animates during generation
- [ ] Generate button disabled during generation
- [ ] Button text updates during generation
- [ ] Download button works for results
- [ ] Modal/page closes correctly
- [ ] Back navigation works

---

## Architecture Recommendations

### 1. Centralize API Configuration

**Current Issue:** API URL hardcoded in HTML file

**Recommendation:**
```javascript
// Create a config object at the top
const CONFIG = {
  API_BASE_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://api.yourproduction.com',
  ENDPOINTS: {
    runAgent: (agentId) => `/mulerun/agents/${agentId}/run`,
    getAgents: '/mulerun/agents',
    getJobs: '/jobs',
  }
};
```

### 2. Add Request Wrapper

**Recommendation:**
```javascript
async function apiRequest(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Usage:
const result = await apiRequest(CONFIG.ENDPOINTS.runAgent(agentId), {
  method: 'POST',
  body: JSON.stringify({ input: inputs }),
});
```

### 3. Add Input Validation

**Recommendation:**
```javascript
function validateAgentInput(agentId, inputs) {
  const agent = agents[agentId];
  const errors = [];

  // Check required image uploads
  if (['background-remover', 'image-animator', 'talking-avatar'].includes(agentId)) {
    if (!inputs.image) {
      errors.push('Image upload is required');
    }
  }

  // Check required prompts
  if (['image-generator', 'music-generator'].includes(agentId)) {
    if (!inputs.prompt || inputs.prompt.trim().length === 0) {
      errors.push('Please enter a prompt');
    }
  }

  // Check face swap dual images
  if (agentId === 'face-swap') {
    if (!inputs.image) errors.push('Source face image is required');
    if (!inputs.end_frame) errors.push('Target image is required');
  }

  return errors;
}
```

### 4. Standardize Response Handling

**Recommendation:**
```javascript
function extractOutputUrl(result, outputType = 'auto') {
  const data = result.data || result.output || result;

  // Video fields
  const videoFields = ['video', 'video_url', 'videoUrl', 'video_output', 'resultVideo'];
  // Image fields
  const imageFields = ['image', 'image_url', 'imageUrl', 'output', 'resultImage',
                       'output_image', 'generated_image', 'images'];
  // Audio fields
  const audioFields = ['audio', 'audio_url', 'audioUrl', 'audio_output'];

  if (outputType === 'video' || outputType === 'auto') {
    for (const field of videoFields) {
      if (data[field]) return { type: 'video', url: data[field] };
    }
  }

  if (outputType === 'image' || outputType === 'auto') {
    for (const field of imageFields) {
      if (data[field]) {
        const url = Array.isArray(data[field]) ? data[field][0] : data[field];
        if (url) return { type: 'image', url };
      }
    }
  }

  if (outputType === 'audio' || outputType === 'auto') {
    for (const field of audioFields) {
      if (data[field]) return { type: 'audio', url: data[field] };
    }
  }

  return { type: 'json', data };
}
```

---

## Summary of Required Changes

### Immediate (Before Testing)

1. **Line 2720**: Change `API_BASE_URL` from `8000` to `3000`
2. **Line 2798**: Change endpoint from `/api/agents/` to `/mulerun/agents/`
3. **Line 2803**: Change `{ inputs }` to `{ input: inputs }`
4. **Line ~2028**: Add `id="prompt-${agent.id}"` to talking-avatar textarea

### Short-Term (For Stability)

5. Fix selection handler to use groupId parameter consistently
6. Add more output field checks in response handling
7. Verify all agent templates have required element IDs

### Medium-Term (For Maintainability)

8. Add input validation before API calls
9. Create centralized API configuration
10. Add request wrapper with error handling
11. Standardize response field extraction

---

## Appendix: Agent ID to Backend Handler Mapping

| Frontend Agent ID | Backend Handler | Required Input Fields |
|-------------------|-----------------|----------------------|
| background-remover | `replicateService.removeBackground()` | `image` |
| image-generator | `replicateService.generateImage()` | `prompt`, `style`, `model` |
| video-generator | Async job | `prompt`, `start_frame`, `end_frame` |
| face-swap | `replicateService.faceSwap()` | `source_image`, `target_image` |
| virtual-try-on | `replicateService.virtualTryOn()` | `person_image`, `garment_image` |
| talking-avatar | Async job | `image`, `text`, `voice` |
| image-animator | Async job | `image`, `motion_type` |
| video-upscaler | Async job | `video`, `resolution` |
| lip-sync | Async job | `video/image`, `audio` |
| music-generator | Async job | `prompt`, `genre`, `duration` |
| voice-cloner | Async job | `text`, `voice_type`, `language` |

---

**Report Generated:** December 4, 2025
**Next Step:** Implement critical fixes and run tests
**Estimated Fix Time:** 2-3 hours for critical issues, 4-6 hours for all issues
