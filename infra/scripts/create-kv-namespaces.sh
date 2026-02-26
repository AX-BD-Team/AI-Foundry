#!/bin/bash
# create-kv-namespaces.sh — Create KV namespaces for AI Foundry
#
# Prerequisites:
#   - wrangler must be installed: npm install -g wrangler
#   - wrangler must be authenticated: wrangler login
#
# KV namespaces:
#   AI_FOUNDRY_PROMPTS  — prompt template caching for svc-llm-router
#                         and svc-governance (active prompt versions)
#   AI_FOUNDRY_CACHE    — general-purpose cache (LLM response cache,
#                         session state, rate-limit counters)
#
# After running, copy the returned namespace IDs into each service's
# wrangler.toml under the [[kv_namespaces]] binding.

set -euo pipefail

echo "=== AI Foundry: Creating KV Namespaces ==="
echo ""
echo "NOTE: Copy each id printed below into the corresponding"
echo "      service's wrangler.toml [[kv_namespaces]] section."
echo ""

echo "--- Creating AI_FOUNDRY_PROMPTS ---"
echo "    Used by: svc-llm-router, svc-governance"
echo "    Purpose: Cache active prompt versions; key = prompt_name:version"
wrangler kv namespace create AI_FOUNDRY_PROMPTS

echo ""
echo "--- Creating AI_FOUNDRY_CACHE ---"
echo "    Used by: all services (general cache)"
echo "    Purpose: LLM response cache, rate-limit counters, ephemeral state"
wrangler kv namespace create AI_FOUNDRY_CACHE

echo ""
echo "=== All KV namespaces created successfully ==="
echo ""
echo "Namespace binding guide:"
echo ""
echo "  svc-llm-router — add to wrangler.toml:"
echo "    [[kv_namespaces]]"
echo "    binding = \"PROMPTS_KV\""
echo "    id = \"<AI_FOUNDRY_PROMPTS id from above>\""
echo ""
echo "    [[kv_namespaces]]"
echo "    binding = \"CACHE_KV\""
echo "    id = \"<AI_FOUNDRY_CACHE id from above>\""
echo ""
echo "  svc-governance — add to wrangler.toml:"
echo "    [[kv_namespaces]]"
echo "    binding = \"PROMPTS_KV\""
echo "    id = \"<AI_FOUNDRY_PROMPTS id from above>\""
echo ""
echo "NOTE: For local development, wrangler will auto-create a local KV"
echo "      store when running 'wrangler dev'. No extra setup needed."
