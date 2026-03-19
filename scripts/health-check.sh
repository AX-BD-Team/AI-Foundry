#!/usr/bin/env bash
#
# health-check.sh — Check health of all AI Foundry services
#
# Usage:
#   ./scripts/health-check.sh                    # Check production (default domain)
#   ./scripts/health-check.sh --env staging      # Check staging environment
#   ./scripts/health-check.sh --json             # Output results as JSON
#   ./scripts/health-check.sh --alert            # Send alert on failure (via svc-notification)
#
set -euo pipefail

# Default to production domain
DOMAIN="ktds-axbd.workers.dev"
ENVIRONMENT="production"
JSON_OUTPUT=false
ALERT_ON_FAILURE=false

SERVICES=(
  svc-ingestion
  svc-extraction
  svc-policy
  svc-ontology
  svc-skill
  svc-llm-router
  svc-security
  svc-governance
  svc-notification
  svc-analytics
  svc-queue-router
)

# Pages URL
PAGES_URL="https://ai-foundry-web.pages.dev"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --alert)
      ALERT_ON_FAILURE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--env staging|production] [--json] [--alert]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Adjust for staging environment
WORKER_SUFFIX=""
if [[ "$ENVIRONMENT" == "staging" ]]; then
  WORKER_SUFFIX="-staging"
  PAGES_URL="https://staging.ai-foundry-web.pages.dev"
fi

HEALTHY=()
UNHEALTHY=()
RESULTS=()
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

check_service() {
  local svc="$1"
  local url="https://${svc}${WORKER_SUFFIX}.${DOMAIN}/health"
  local start_ms
  start_ms=$(date +%s%N)

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")

  local end_ms
  end_ms=$(date +%s%N)
  local duration_ms=$(( (end_ms - start_ms) / 1000000 ))

  if [[ "$http_code" == "200" ]]; then
    HEALTHY+=("$svc")
    local status="healthy"
  else
    UNHEALTHY+=("$svc")
    local status="unhealthy"
  fi

  RESULTS+=("{\"service\":\"${svc}\",\"status\":\"${status}\",\"http_code\":${http_code},\"latency_ms\":${duration_ms},\"url\":\"${url}\"}")

  if [[ "$JSON_OUTPUT" == "false" ]]; then
    if [[ "$status" == "healthy" ]]; then
      printf "  [OK]   %-22s  HTTP %s  %4dms\n" "$svc" "$http_code" "$duration_ms"
    else
      printf "  [FAIL] %-22s  HTTP %s  %4dms\n" "$svc" "$http_code" "$duration_ms"
    fi
  fi
}

check_pages() {
  local start_ms
  start_ms=$(date +%s%N)

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$PAGES_URL" 2>/dev/null || echo "000")

  local end_ms
  end_ms=$(date +%s%N)
  local duration_ms=$(( (end_ms - start_ms) / 1000000 ))

  if [[ "$http_code" == "200" ]]; then
    HEALTHY+=("app-web")
    local status="healthy"
  else
    UNHEALTHY+=("app-web")
    local status="unhealthy"
  fi

  RESULTS+=("{\"service\":\"app-web\",\"status\":\"${status}\",\"http_code\":${http_code},\"latency_ms\":${duration_ms},\"url\":\"${PAGES_URL}\"}")

  if [[ "$JSON_OUTPUT" == "false" ]]; then
    if [[ "$status" == "healthy" ]]; then
      printf "  [OK]   %-22s  HTTP %s  %4dms\n" "app-web (Pages)" "$http_code" "$duration_ms"
    else
      printf "  [FAIL] %-22s  HTTP %s  %4dms\n" "app-web (Pages)" "$http_code" "$duration_ms"
    fi
  fi
}

# Header
if [[ "$JSON_OUTPUT" == "false" ]]; then
  echo "=========================================="
  echo "  AI Foundry Health Check — ${ENVIRONMENT}"
  echo "  ${TIMESTAMP}"
  echo "=========================================="
  echo ""
fi

# Check all services
for svc in "${SERVICES[@]}"; do
  check_service "$svc"
done

# Check Pages
check_pages

# JSON output
if [[ "$JSON_OUTPUT" == "true" ]]; then
  JOINED=$(IFS=,; echo "${RESULTS[*]}")
  echo "{\"timestamp\":\"${TIMESTAMP}\",\"environment\":\"${ENVIRONMENT}\",\"total\":$((${#HEALTHY[@]}+${#UNHEALTHY[@]})),\"healthy\":${#HEALTHY[@]},\"unhealthy\":${#UNHEALTHY[@]},\"results\":[${JOINED}]}"
  exit 0
fi

# Summary
echo ""
echo "------------------------------------------"
echo "  Healthy: ${#HEALTHY[@]}  |  Unhealthy: ${#UNHEALTHY[@]}  |  Total: $((${#HEALTHY[@]}+${#UNHEALTHY[@]}))"
echo "------------------------------------------"

if [[ ${#UNHEALTHY[@]} -gt 0 ]]; then
  echo ""
  echo "  Unhealthy services:"
  for u in "${UNHEALTHY[@]}"; do
    echo "    - ${u}"
  done

  # Alert via svc-notification (if --alert and INTERNAL_API_SECRET is set)
  if [[ "$ALERT_ON_FAILURE" == "true" ]] && [[ -n "${INTERNAL_API_SECRET:-}" ]]; then
    NOTIFICATION_URL="https://svc-notification.${DOMAIN}/notifications"
    UNHEALTHY_LIST=$(IFS=', '; echo "${UNHEALTHY[*]}")
    curl -s -X POST "$NOTIFICATION_URL" \
      -H "Content-Type: application/json" \
      -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
      -o /dev/null \
      --json "{
        \"recipient_id\": \"system\",
        \"type\": \"health_check_failure\",
        \"title\": \"Health Check Alert: ${#UNHEALTHY[@]} service(s) down\",
        \"body\": \"Unhealthy: ${UNHEALTHY_LIST} (env: ${ENVIRONMENT}, time: ${TIMESTAMP})\",
        \"channel\": \"internal\"
      }" 2>/dev/null || true
    echo ""
    echo "  Alert sent to svc-notification."
  fi

  exit 1
fi

echo ""
echo "  All services healthy."
