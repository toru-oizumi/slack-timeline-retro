#!/bin/bash
set -euo pipefail

# ============================================
# Cloud Run Deployment Script
# ============================================

# Load .env if present (set -a exports all variables to subprocesses)
if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$(dirname "$0")/../.env"
  set +a
fi

# Configuration (override with environment variables)
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${SERVICE_NAME:-slack-timeline-retro}"
REPOSITORY_NAME="${REPOSITORY_NAME:-slack-timeline-retro}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1" >&2
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check required tools
check_prerequisites() {
  log_info "Checking prerequisites..."

  if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
  fi

  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker Desktop."
    exit 1
  fi

  if [ -z "$PROJECT_ID" ]; then
    log_error "GCP_PROJECT_ID is not set. Please set it with: export GCP_PROJECT_ID=your-project-id"
    exit 1
  fi

  log_info "Prerequisites check passed"
}

# Configure gcloud
configure_gcloud() {
  log_info "Configuring gcloud for project: $PROJECT_ID"
  gcloud config set project "$PROJECT_ID"

  # Enable required APIs
  log_info "Enabling required APIs..."
  gcloud services enable run.googleapis.com --quiet
  gcloud services enable artifactregistry.googleapis.com --quiet
  gcloud services enable cloudbuild.googleapis.com --quiet
  gcloud services enable pubsub.googleapis.com --quiet
  gcloud services enable firestore.googleapis.com --quiet
}

# Create Artifact Registry repository if it doesn't exist
create_repository() {
  log_info "Checking Artifact Registry repository..."

  if ! gcloud artifacts repositories describe "$REPOSITORY_NAME" --location="$REGION" &> /dev/null; then
    log_info "Creating Artifact Registry repository: $REPOSITORY_NAME"
    gcloud artifacts repositories create "$REPOSITORY_NAME" \
      --repository-format=docker \
      --location="$REGION" \
      --description="Docker images for Slack Timeline Retro"
  else
    log_info "Repository already exists: $REPOSITORY_NAME"
  fi
}

# Configure Docker for Artifact Registry
configure_docker() {
  log_info "Configuring Docker authentication for Artifact Registry..."
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
}

# Build and push Docker image
build_and_push() {
  local IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY_NAME}/${SERVICE_NAME}:latest"

  log_info "Building Docker image..."
  if ! docker build --platform linux/amd64 -t "$IMAGE_URI" . >&2; then
    log_error "Docker build failed"
    exit 1
  fi

  log_info "Pushing Docker image to Artifact Registry..."
  if ! docker push "$IMAGE_URI" >&2; then
    log_error "Docker push failed"
    exit 1
  fi

  echo "$IMAGE_URI"
}

# Deploy to Cloud Run
# Sensitive values are loaded from Secret Manager (--set-secrets).
# Non-sensitive config is passed as plain env vars (--set-env-vars).
deploy_cloud_run() {
  local IMAGE_URI="$1"

  log_info "Deploying to Cloud Run..."

  # Secrets stored in Secret Manager (name=SECRET_NAME:latest)
  local SECRETS="SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest"
  SECRETS="${SECRETS},SLACK_SIGNING_SECRET=SLACK_SIGNING_SECRET:latest"
  SECRETS="${SECRETS},SLACK_CLIENT_ID=SLACK_CLIENT_ID:latest"
  SECRETS="${SECRETS},SLACK_CLIENT_SECRET=SLACK_CLIENT_SECRET:latest"

  if gcloud secrets describe "ANTHROPIC_API_KEY" --project="$PROJECT_ID" &>/dev/null; then
    SECRETS="${SECRETS},ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"
  fi

  if gcloud secrets describe "OPENAI_API_KEY" --project="$PROJECT_ID" &>/dev/null; then
    SECRETS="${SECRETS},OPENAI_API_KEY=OPENAI_API_KEY:latest"
  fi

  # Non-sensitive config as plain env vars.
  # Use ';' as separator (not ',') so that values containing commas
  # (e.g. CULTURE_ANALYSIS_CHANNEL_IDS=id1,id2) are passed correctly.
  # gcloud supports custom delimiters via the "^DELIM^" prefix syntax.
  local ENV_VARS=""
  if [ -n "${TARGET_YEAR:-}" ]; then
    ENV_VARS="${ENV_VARS}TARGET_YEAR=${TARGET_YEAR};"
  fi
  if [ -n "${LOCALE:-}" ]; then
    ENV_VARS="${ENV_VARS}LOCALE=${LOCALE};"
  fi
  if [ -n "${INCLUDE_PRIVATE_CHANNELS:-}" ]; then
    ENV_VARS="${ENV_VARS}INCLUDE_PRIVATE_CHANNELS=${INCLUDE_PRIVATE_CHANNELS};"
  fi
  if [ -n "${AI_MODEL:-}" ]; then
    ENV_VARS="${ENV_VARS}AI_MODEL=${AI_MODEL};"
  fi
  if [ -n "${AI_MAX_TOKENS:-}" ]; then
    ENV_VARS="${ENV_VARS}AI_MAX_TOKENS=${AI_MAX_TOKENS};"
  fi
  if [ -n "${INCLUDE_CHANNELS:-}" ]; then
    ENV_VARS="${ENV_VARS}INCLUDE_CHANNELS=${INCLUDE_CHANNELS};"
  fi
  if [ -n "${EXCLUDE_CHANNELS:-}" ]; then
    ENV_VARS="${ENV_VARS}EXCLUDE_CHANNELS=${EXCLUDE_CHANNELS};"
  fi
  if [ -n "${INCLUDE_DIRECT_MESSAGES:-}" ]; then
    ENV_VARS="${ENV_VARS}INCLUDE_DIRECT_MESSAGES=${INCLUDE_DIRECT_MESSAGES};"
  fi
  if [ -n "${INCLUDE_GROUP_MESSAGES:-}" ]; then
    ENV_VARS="${ENV_VARS}INCLUDE_GROUP_MESSAGES=${INCLUDE_GROUP_MESSAGES};"
  fi
  if [ -n "${PIPELINE_IDS:-}" ]; then
    ENV_VARS="${ENV_VARS}PIPELINE_IDS=${PIPELINE_IDS};"
  fi
  # Pipeline-specific channel ID overrides (e.g. CULTURE_ANALYSIS_CHANNEL_IDS=id1,id2)
  # Values may contain commas; the '^;^' prefix below handles this correctly.
  if [ -n "${CULTURE_ANALYSIS_CHANNEL_IDS:-}" ]; then
    ENV_VARS="${ENV_VARS}CULTURE_ANALYSIS_CHANNEL_IDS=${CULTURE_ANALYSIS_CHANNEL_IDS};"
  fi
  # Strip trailing semicolon
  ENV_VARS="${ENV_VARS%;}"

  local DEPLOY_CMD=(
    gcloud run deploy "$SERVICE_NAME"
    --image "$IMAGE_URI"
    --region "$REGION"
    --platform managed
    --allow-unauthenticated
    --port 8080
    --memory 512Mi
    --cpu 1
    --min-instances 0
    --max-instances 10
    --timeout 3600
    --no-cpu-throttling
    --set-secrets "$SECRETS"
  )

  if [ -n "$ENV_VARS" ]; then
    # Prefix with '^;^' to tell gcloud to use ';' as the key=value separator,
    # allowing values that contain commas (e.g. CULTURE_ANALYSIS_CHANNEL_IDS=id1,id2).
    DEPLOY_CMD+=(--set-env-vars "^;^${ENV_VARS}")
  fi

  "${DEPLOY_CMD[@]}"
}

# Get service URL
get_service_url() {
  local URL
  URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
  echo "$URL"
}

# Main execution
main() {
  log_info "Starting deployment to Google Cloud Run"
  log_info "Project: $PROJECT_ID"
  log_info "Region: $REGION"
  log_info "Service: $SERVICE_NAME"
  echo "" >&2

  check_prerequisites
  configure_gcloud
  create_repository
  configure_docker

  local IMAGE_URI
  IMAGE_URI=$(build_and_push)

  deploy_cloud_run "$IMAGE_URI"

  local SERVICE_URL
  SERVICE_URL=$(get_service_url)

  echo "" >&2
  log_info "Deployment completed successfully!"
  echo "" >&2
  echo "================================================" >&2
  echo -e "${GREEN}Service URL:${NC} $SERVICE_URL" >&2
  echo "" >&2
  echo "Slack App Configuration:" >&2
  echo "  Slash Command URL: ${SERVICE_URL}/slack/command" >&2
  echo "  Health Check URL:  ${SERVICE_URL}/health" >&2
  echo "" >&2
  echo "Pub/Sub Endpoints:" >&2
  echo "  Orchestrator:  ${SERVICE_URL}/pubsub/orchestrate" >&2
  echo "  Week Worker:   ${SERVICE_URL}/pubsub/week-worker" >&2
  echo "  Posting:       ${SERVICE_URL}/pubsub/posting" >&2
  echo "================================================" >&2
  echo "" >&2

  log_info "Next step: Run Pub/Sub setup script to configure push subscriptions:"
  echo "  ./scripts/setup-pubsub.sh" >&2
  echo "" >&2

  if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
    log_warn "Don't forget to set environment variables in Cloud Run console:"
    echo "  - SLACK_BOT_TOKEN" >&2
    echo "  - SLACK_SIGNING_SECRET" >&2
    echo "  - ANTHROPIC_API_KEY (or OPENAI_API_KEY)" >&2
    echo "" >&2
    echo "Command to update environment variables:" >&2
    echo "  gcloud run services update $SERVICE_NAME --region $REGION --set-env-vars \"SLACK_BOT_TOKEN=xxx,SLACK_SIGNING_SECRET=xxx,ANTHROPIC_API_KEY=xxx\"" >&2
  fi
}

main "$@"
