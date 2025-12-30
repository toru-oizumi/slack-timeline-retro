#!/bin/bash
set -euo pipefail

# ============================================
# Update Cloud Run Environment Variables
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${SERVICE_NAME:-slack-timeline-retro}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}[ERROR]${NC} GCP_PROJECT_ID is not set"
  exit 1
fi

# Required variables
SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET:-}"
SLACK_CLIENT_ID="${SLACK_CLIENT_ID:-}"
SLACK_CLIENT_SECRET="${SLACK_CLIENT_SECRET:-}"

if [ -z "$SLACK_BOT_TOKEN" ] || [ -z "$SLACK_SIGNING_SECRET" ] || [ -z "$SLACK_CLIENT_ID" ] || [ -z "$SLACK_CLIENT_SECRET" ]; then
  echo -e "${RED}[ERROR]${NC} Required Slack variables are missing"
  echo ""
  echo "Usage:"
  echo "  export SLACK_BOT_TOKEN=xoxb-..."
  echo "  export SLACK_SIGNING_SECRET=..."
  echo "  export SLACK_CLIENT_ID=..."
  echo "  export SLACK_CLIENT_SECRET=..."
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  echo "  ./scripts/update-env.sh"
  exit 1
fi

# Build environment variables
ENV_VARS="SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN},SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET},SLACK_CLIENT_ID=${SLACK_CLIENT_ID},SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET}"

# Optional variables
[ -n "${ANTHROPIC_API_KEY:-}" ] && ENV_VARS="${ENV_VARS},ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
[ -n "${OPENAI_API_KEY:-}" ] && ENV_VARS="${ENV_VARS},OPENAI_API_KEY=${OPENAI_API_KEY}"
[ -n "${TARGET_YEAR:-}" ] && ENV_VARS="${ENV_VARS},TARGET_YEAR=${TARGET_YEAR}"
[ -n "${LOCALE:-}" ] && ENV_VARS="${ENV_VARS},LOCALE=${LOCALE}"
[ -n "${INCLUDE_PRIVATE_CHANNELS:-}" ] && ENV_VARS="${ENV_VARS},INCLUDE_PRIVATE_CHANNELS=${INCLUDE_PRIVATE_CHANNELS}"
[ -n "${AI_MODEL:-}" ] && ENV_VARS="${ENV_VARS},AI_MODEL=${AI_MODEL}"
[ -n "${AI_MAX_TOKENS:-}" ] && ENV_VARS="${ENV_VARS},AI_MAX_TOKENS=${AI_MAX_TOKENS}"
[ -n "${INCLUDE_CHANNELS:-}" ] && ENV_VARS="${ENV_VARS},INCLUDE_CHANNELS=${INCLUDE_CHANNELS}"
[ -n "${EXCLUDE_CHANNELS:-}" ] && ENV_VARS="${ENV_VARS},EXCLUDE_CHANNELS=${EXCLUDE_CHANNELS}"
[ -n "${INCLUDE_DIRECT_MESSAGES:-}" ] && ENV_VARS="${ENV_VARS},INCLUDE_DIRECT_MESSAGES=${INCLUDE_DIRECT_MESSAGES}"
[ -n "${INCLUDE_GROUP_MESSAGES:-}" ] && ENV_VARS="${ENV_VARS},INCLUDE_GROUP_MESSAGES=${INCLUDE_GROUP_MESSAGES}"

echo -e "${GREEN}[INFO]${NC} Updating environment variables for $SERVICE_NAME..."

gcloud run services update "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --set-env-vars "$ENV_VARS"

echo -e "${GREEN}[INFO]${NC} Environment variables updated successfully!"
