#!/bin/bash
# create-d1-dbs.sh — Create all 10 D1 databases for AI Foundry
#
# Prerequisites:
#   - wrangler must be installed: npm install -g wrangler
#   - wrangler must be authenticated: wrangler login
#
# After running this script, copy the returned database_id values into
# each service's wrangler.toml under the [[d1_databases]] binding.

set -euo pipefail

echo "=== AI Foundry: Creating D1 Databases ==="
echo ""
echo "NOTE: Copy each database_id printed below into the corresponding"
echo "      service's wrangler.toml [[d1_databases]] section."
echo ""

echo "--- Creating db-ingestion (SVC-01: svc-ingestion) ---"
wrangler d1 create db-ingestion

echo ""
echo "--- Creating db-structure (SVC-02: svc-extraction) ---"
wrangler d1 create db-structure

echo ""
echo "--- Creating db-policy (SVC-03: svc-policy) ---"
wrangler d1 create db-policy

echo ""
echo "--- Creating db-ontology (SVC-04: svc-ontology) ---"
wrangler d1 create db-ontology

echo ""
echo "--- Creating db-skill (SVC-05: svc-skill) ---"
wrangler d1 create db-skill

echo ""
echo "--- Creating db-llm (SVC-06: svc-llm-router) ---"
wrangler d1 create db-llm

echo ""
echo "--- Creating db-security (SVC-07: svc-security) ---"
wrangler d1 create db-security

echo ""
echo "--- Creating db-governance (SVC-08: svc-governance) ---"
wrangler d1 create db-governance

echo ""
echo "--- Creating db-notification (SVC-09: svc-notification) ---"
wrangler d1 create db-notification

echo ""
echo "--- Creating db-analytics (SVC-10: svc-analytics) ---"
wrangler d1 create db-analytics

echo ""
echo "=== All 10 D1 databases created successfully ==="
echo ""
echo "Next steps:"
echo "  1. Copy each database_id above into the matching service's wrangler.toml"
echo "  2. Apply migrations per database, e.g.:"
echo "       wrangler d1 migrations apply db-ingestion --remote"
echo "     (repeat for each of the 10 databases)"
