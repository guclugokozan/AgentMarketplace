#!/bin/bash
# Comprehensive test script for all 42 Python backend agents at localhost:8000
# Tests each agent with appropriate inputs and reports pass/fail status

API_URL="http://localhost:8000/api/agents"
PASSED=0
FAILED=0
FAILED_AGENTS=""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_agent() {
    local agent_id=$1
    local payload=$2
    local timeout=${3:-60}

    echo -n "Testing $agent_id... "

    response=$(curl -s -X POST "$API_URL/$agent_id/run" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --max-time $timeout 2>&1)

    # Check for success patterns
    if echo "$response" | grep -q '"type": "result"' || echo "$response" | grep -q '"type": "job_queued"'; then
        echo -e "${GREEN}PASS${NC}"
        ((PASSED++))
        return 0
    elif echo "$response" | grep -q '"type": "error"'; then
        error_msg=$(echo "$response" | grep -o '"message": "[^"]*"' | head -1 | cut -d'"' -f4)
        echo -e "${RED}FAIL${NC} - $error_msg"
        ((FAILED++))
        FAILED_AGENTS="$FAILED_AGENTS $agent_id"
        return 1
    else
        echo -e "${YELLOW}UNKNOWN${NC} - $response"
        ((FAILED++))
        FAILED_AGENTS="$FAILED_AGENTS $agent_id"
        return 1
    fi
}

echo "============================================"
echo "Testing All Python Backend Agents"
echo "============================================"
echo ""

# Test image for agents that need images
TEST_IMAGE="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"
TEST_FACE="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"
TEST_VIDEO="https://replicate.delivery/pbxt/test-video.mp4"
TEST_AUDIO="https://replicate.delivery/pbxt/test-audio.mp3"

# ============================================
# IMAGE AGENTS
# ============================================
echo "--- IMAGE AGENTS ---"

test_agent "image-generator" '{"inputs": {"prompt": "a beautiful sunset over mountains", "aspect_ratio": "16:9"}}'

test_agent "face-swap" "{\"inputs\": {\"source_image\": \"$TEST_IMAGE\", \"target_image\": \"$TEST_IMAGE\"}}"

test_agent "style-transfer" "{\"inputs\": {\"image\": \"$TEST_IMAGE\", \"style\": \"anime\"}}"

test_agent "age-transform" "{\"inputs\": {\"image\": \"$TEST_IMAGE\", \"target_age\": \"old\"}}"

test_agent "expression-editor" "{\"inputs\": {\"image\": \"$TEST_IMAGE\", \"expression\": \"smile\"}}"

test_agent "character-swap" "{\"inputs\": {\"source_image\": \"$TEST_IMAGE\", \"target_image\": \"$TEST_IMAGE\"}}"

test_agent "character-consistent" '{"inputs": {"prompt": "a wizard in a forest", "character_reference": "'$TEST_IMAGE'"}}'

test_agent "multi-angle" "{\"inputs\": {\"image\": \"$TEST_IMAGE\", \"angles\": [\"front\", \"side\"]}}"

echo ""
echo "--- VIDEO AGENTS ---"

test_agent "text-to-video" '{"inputs": {"prompt": "a cat walking in a garden"}}' 120

test_agent "image-to-video" "{\"inputs\": {\"image\": \"$TEST_IMAGE\", \"prompt\": \"person smiling\"}}" 120

test_agent "lip-sync" '{"inputs": {"face_video": "'$TEST_VIDEO'", "audio": "'$TEST_AUDIO'"}}' 120

test_agent "video-upscaler" '{"inputs": {"video": "'$TEST_VIDEO'"}}' 120

test_agent "video-editor" '{"inputs": {"video": "'$TEST_VIDEO'", "instructions": "add blur effect"}}' 120

test_agent "video-vfx" '{"inputs": {"video": "'$TEST_VIDEO'", "effect": "fire"}}' 120

test_agent "video-face-swap" '{"inputs": {"video": "'$TEST_VIDEO'", "face_image": "'$TEST_IMAGE'"}}' 120

test_agent "social-video" '{"inputs": {"script": "Hello world", "template": "tiktok"}}' 120

test_agent "sketch-to-video" "{\"inputs\": {\"sketch\": \"$TEST_IMAGE\", \"prompt\": \"animate this sketch\"}}" 120

test_agent "product-video-ad" "{\"inputs\": {\"product_image\": \"$TEST_IMAGE\", \"product_name\": \"Cool Product\"}}" 120

echo ""
echo "--- AUDIO AGENTS ---"

test_agent "voice-clone" '{"inputs": {"text": "Hello world, this is a test.", "voice_sample": "'$TEST_AUDIO'"}}' 90

test_agent "music-generator" '{"inputs": {"prompt": "upbeat electronic music", "duration": 10}}' 90

test_agent "sound-effects" '{"inputs": {"prompt": "thunder and rain"}}' 60

test_agent "transcription" '{"inputs": {"audio": "'$TEST_AUDIO'"}}' 90

echo ""
echo "--- TEXT/DOCUMENT AGENTS ---"

test_agent "email-writer" '{"inputs": {"topic": "meeting follow up", "tone": "professional"}}'

test_agent "blog-generator" '{"inputs": {"topic": "AI in healthcare", "length": "short"}}'

test_agent "social-post-generator" '{"inputs": {"topic": "new product launch", "platform": "twitter"}}'

test_agent "resume-generator" '{"inputs": {"name": "John Doe", "experience": "5 years in software"}}'

test_agent "pdf-summarizer" '{"inputs": {"text": "This is a long document about technology..."}}'

test_agent "document-translator" '{"inputs": {"text": "Hello world", "target_language": "Spanish"}}'

test_agent "contract-analyzer" '{"inputs": {"text": "This agreement is made between Party A and Party B..."}}'

test_agent "code-reviewer" '{"inputs": {"code": "function add(a, b) { return a + b; }", "language": "javascript"}}'

test_agent "seo-analyzer" '{"inputs": {"url": "https://example.com", "keywords": ["test", "demo"]}}'

test_agent "competitor-analysis" '{"inputs": {"company": "Apple", "industry": "technology"}}'

test_agent "social-analyzer" '{"inputs": {"username": "test_user", "platform": "twitter"}}'

test_agent "paper-finder" '{"inputs": {"topic": "machine learning", "limit": 5}}'

test_agent "deep-research" '{"inputs": {"topic": "quantum computing trends"}}'

echo ""
echo "--- DEVELOPMENT AGENTS ---"

test_agent "db-schema" '{"inputs": {"description": "user management system with roles"}}'

test_agent "ui-component" '{"inputs": {"description": "a login form with email and password", "framework": "react"}}'

test_agent "api-builder" '{"inputs": {"description": "REST API for blog posts CRUD", "framework": "fastapi"}}'

test_agent "data-visualizer" '{"inputs": {"data": [{"x": 1, "y": 2}, {"x": 2, "y": 4}], "chart_type": "line"}}'

test_agent "storyboard-creator" '{"inputs": {"script": "A hero walks into a dark forest"}}'

echo ""
echo "--- E-COMMERCE AGENTS ---"

test_agent "virtual-try-on" "{\"inputs\": {\"person_image\": \"$TEST_IMAGE\", \"garment_image\": \"$TEST_IMAGE\"}}" 120

test_agent "ecommerce-model-swap" "{\"inputs\": {\"product_image\": \"$TEST_IMAGE\", \"model_image\": \"$TEST_IMAGE\"}}" 120

echo ""
echo "============================================"
echo "RESULTS SUMMARY"
echo "============================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
if [ -n "$FAILED_AGENTS" ]; then
    echo -e "Failed agents:${RED}$FAILED_AGENTS${NC}"
fi
echo "============================================"

# Exit with error code if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi
exit 0
