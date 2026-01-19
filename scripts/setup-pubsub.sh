#!/bin/bash
set -euo pipefail

# ============================================
# Pub/Sub Infrastructure Setup Script
# ============================================
# Creates Pub/Sub topics, subscriptions, and configures IAM
# for event-driven summary job processing

# Configuration (override with environment variables)
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${SERVICE_NAME:-slack-timeline-retro}"

# Pub/Sub configuration
TOPICS=(
  "summary-jobs"     # Job orchestration
  "weekly-tasks"     # Parallel week processing
  "posting-tasks"    # Result posting trigger
  "summary-dlq"      # Dead letter queue
)

# ACK deadline in seconds (10 minutes for long-running tasks)
ACK_DEADLINE=600

# Retry configuration
MIN_BACKOFF=10s
MAX_BACKOFF=600s

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
  echo ""
  echo -e "${BLUE}=== $1 ===${NC}"
}

# Check required tools
check_prerequisites() {
  log_section "Checking Prerequisites"

  if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
  fi

  if [ -z "$PROJECT_ID" ]; then
    log_error "GCP_PROJECT_ID is not set. Please set it with: export GCP_PROJECT_ID=your-project-id"
    exit 1
  fi

  log_info "Prerequisites check passed"
}

# Configure gcloud and enable APIs
configure_gcloud() {
  log_section "Configuring Google Cloud"

  log_info "Setting project: $PROJECT_ID"
  gcloud config set project "$PROJECT_ID"

  log_info "Enabling required APIs..."
  gcloud services enable pubsub.googleapis.com --quiet
  gcloud services enable run.googleapis.com --quiet

  log_info "APIs enabled successfully"
}

# Create Pub/Sub topics
create_topics() {
  log_section "Creating Pub/Sub Topics"

  for topic in "${TOPICS[@]}"; do
    if gcloud pubsub topics describe "$topic" &> /dev/null; then
      log_info "Topic already exists: $topic"
    else
      log_info "Creating topic: $topic"
      gcloud pubsub topics create "$topic"
    fi
  done

  log_info "All topics created"
}

# Get Cloud Run service URL
get_service_url() {
  local url
  url=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)' 2>/dev/null || echo "")
  echo "$url"
}

# Create push subscriptions
create_subscriptions() {
  log_section "Creating Pub/Sub Subscriptions"

  local SERVICE_URL
  SERVICE_URL=$(get_service_url)

  if [ -z "$SERVICE_URL" ]; then
    log_warn "Cloud Run service not deployed yet."
    log_warn "Subscriptions will be created without push endpoints."
    log_warn "Run this script again after deploying the service to configure push endpoints."
    echo ""

    # Create pull subscriptions as placeholder
    create_pull_subscription "summary-jobs" "summary-jobs-push"
    create_pull_subscription "weekly-tasks" "weekly-tasks-push"
    create_pull_subscription "posting-tasks" "posting-tasks-push"
  else
    log_info "Service URL: $SERVICE_URL"

    # Create push subscriptions with endpoints
    create_push_subscription "summary-jobs" "summary-jobs-push" "${SERVICE_URL}/pubsub/orchestrate"
    create_push_subscription "weekly-tasks" "weekly-tasks-push" "${SERVICE_URL}/pubsub/week-worker"
    create_push_subscription "posting-tasks" "posting-tasks-push" "${SERVICE_URL}/pubsub/posting"
  fi

  log_info "All subscriptions created"
}

# Create a pull subscription (placeholder)
create_pull_subscription() {
  local topic=$1
  local subscription=$2

  if gcloud pubsub subscriptions describe "$subscription" &> /dev/null; then
    log_info "Subscription already exists: $subscription"
  else
    log_info "Creating pull subscription: $subscription (placeholder)"
    gcloud pubsub subscriptions create "$subscription" \
      --topic="$topic" \
      --ack-deadline="$ACK_DEADLINE" \
      --min-retry-delay="$MIN_BACKOFF" \
      --max-retry-delay="$MAX_BACKOFF"
  fi
}

# Create a push subscription
create_push_subscription() {
  local topic=$1
  local subscription=$2
  local endpoint=$3

  if gcloud pubsub subscriptions describe "$subscription" &> /dev/null; then
    log_info "Updating subscription: $subscription"
    gcloud pubsub subscriptions update "$subscription" \
      --push-endpoint="$endpoint" \
      --ack-deadline="$ACK_DEADLINE" \
      --min-retry-delay="$MIN_BACKOFF" \
      --max-retry-delay="$MAX_BACKOFF"
  else
    log_info "Creating push subscription: $subscription -> $endpoint"
    gcloud pubsub subscriptions create "$subscription" \
      --topic="$topic" \
      --push-endpoint="$endpoint" \
      --ack-deadline="$ACK_DEADLINE" \
      --min-retry-delay="$MIN_BACKOFF" \
      --max-retry-delay="$MAX_BACKOFF"
  fi
}

# Configure IAM for Pub/Sub to invoke Cloud Run
configure_iam() {
  log_section "Configuring IAM Permissions"

  local SERVICE_URL
  SERVICE_URL=$(get_service_url)

  if [ -z "$SERVICE_URL" ]; then
    log_warn "Skipping IAM configuration (service not deployed)"
    return
  fi

  # Get the Pub/Sub service agent
  local PROJECT_NUMBER
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  local PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

  log_info "Granting Cloud Run Invoker role to Pub/Sub service agent..."
  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --region="$REGION" \
    --member="serviceAccount:${PUBSUB_SA}" \
    --role="roles/run.invoker" \
    --quiet || log_warn "IAM binding may already exist"

  log_info "IAM permissions configured"
}

# Configure dead letter topic
configure_dead_letter() {
  log_section "Configuring Dead Letter Queue"

  # Create dead letter subscription for monitoring
  if ! gcloud pubsub subscriptions describe "summary-dlq-sub" &> /dev/null; then
    log_info "Creating dead letter subscription"
    gcloud pubsub subscriptions create "summary-dlq-sub" \
      --topic="summary-dlq" \
      --ack-deadline=60
  else
    log_info "Dead letter subscription already exists"
  fi

  # Update main subscriptions with dead letter policy (optional)
  for sub in "summary-jobs-push" "weekly-tasks-push" "posting-tasks-push"; do
    if gcloud pubsub subscriptions describe "$sub" &> /dev/null; then
      log_info "Configuring dead letter for: $sub"
      gcloud pubsub subscriptions update "$sub" \
        --dead-letter-topic="summary-dlq" \
        --max-delivery-attempts=5 \
        --quiet || log_warn "Dead letter config may already exist for $sub"
    fi
  done

  log_info "Dead letter queue configured"
}

# Display summary
display_summary() {
  log_section "Setup Summary"

  local SERVICE_URL
  SERVICE_URL=$(get_service_url)

  echo ""
  echo "================================================"
  echo "Pub/Sub Infrastructure Setup Complete"
  echo "================================================"
  echo ""
  echo "Topics created:"
  for topic in "${TOPICS[@]}"; do
    echo "  - $topic"
  done
  echo ""
  echo "Subscriptions created:"
  echo "  - summary-jobs-push -> /pubsub/orchestrate"
  echo "  - weekly-tasks-push -> /pubsub/week-worker"
  echo "  - posting-tasks-push -> /pubsub/posting"
  echo ""

  if [ -n "$SERVICE_URL" ]; then
    echo "Push endpoints configured for: $SERVICE_URL"
  else
    echo -e "${YELLOW}Note:${NC} Push endpoints not configured (service not deployed)"
    echo "Run this script again after deploying the Cloud Run service."
  fi

  echo ""
  echo "Next steps:"
  echo "  1. Deploy the Cloud Run service with: ./scripts/deploy.sh"
  echo "  2. Re-run this script to configure push endpoints"
  echo "  3. Test with: /summarize-2025 weekly"
  echo ""
}

# Main execution
main() {
  echo ""
  log_info "Starting Pub/Sub infrastructure setup"
  log_info "Project: $PROJECT_ID"
  log_info "Region: $REGION"
  log_info "Service: $SERVICE_NAME"

  check_prerequisites
  configure_gcloud
  create_topics
  create_subscriptions
  configure_iam
  configure_dead_letter
  display_summary
}

main "$@"
