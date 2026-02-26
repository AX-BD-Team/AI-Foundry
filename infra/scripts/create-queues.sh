#!/bin/bash
# create-queues.sh — Create Cloudflare Queues for AI Foundry pipeline
#
# Prerequisites:
#   - wrangler must be installed: npm install -g wrangler
#   - wrangler must be authenticated: wrangler login
#   - Cloudflare Queues must be enabled on the account
#
# Queue topology:
#   ai-foundry-pipeline     — main pipeline event bus
#     Producers: svc-ingestion (document.ingested, extraction.completed,
#                               policy.candidate_ready, policy.reviewed,
#                               ontology.completed, skill.packaged)
#     Consumers: svc-policy (policy.candidate_ready),
#                svc-notification (policy.reviewed, skill.packaged)
#
#   ai-foundry-pipeline-dlq — dead letter queue for failed messages
#
# After running, add queue bindings to each service's wrangler.toml.

set -euo pipefail

echo "=== AI Foundry: Creating Cloudflare Queues ==="
echo ""

echo "--- Creating ai-foundry-pipeline (main pipeline event bus) ---"
wrangler queues create ai-foundry-pipeline

echo ""
echo "--- Creating ai-foundry-pipeline-dlq (dead letter queue) ---"
wrangler queues create ai-foundry-pipeline-dlq

echo ""
echo "=== All queues created successfully ==="
echo ""
echo "Queue binding guide:"
echo ""
echo "  svc-ingestion (producer) — add to wrangler.toml:"
echo "    [[queues.producers]]"
echo "    binding = \"PIPELINE_QUEUE\""
echo "    queue = \"ai-foundry-pipeline\""
echo ""
echo "  svc-policy (consumer) — add to wrangler.toml:"
echo "    [[queues.consumers]]"
echo "    queue = \"ai-foundry-pipeline\""
echo "    max_batch_size = 10"
echo "    max_batch_timeout = 30"
echo "    dead_letter_queue = \"ai-foundry-pipeline-dlq\""
echo ""
echo "  svc-notification (consumer) — add to wrangler.toml:"
echo "    [[queues.consumers]]"
echo "    queue = \"ai-foundry-pipeline\""
echo "    max_batch_size = 20"
echo "    max_batch_timeout = 10"
echo "    dead_letter_queue = \"ai-foundry-pipeline-dlq\""
echo ""
echo "NOTE: Multiple consumers on the same queue require Cloudflare Queue"
echo "      consumer filtering (filter by message type in handler code)."
