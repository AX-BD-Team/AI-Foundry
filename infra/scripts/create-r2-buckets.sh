#!/bin/bash
# create-r2-buckets.sh — Create R2 buckets for AI Foundry
#
# Prerequisites:
#   - wrangler must be installed: npm install -g wrangler
#   - wrangler must be authenticated: wrangler login
#   - R2 must be enabled on the Cloudflare account
#
# After running this script, add the bucket names to each service's
# wrangler.toml under the [[r2_buckets]] binding.

set -euo pipefail

echo "=== AI Foundry: Creating R2 Buckets ==="
echo ""
echo "NOTE: After creation, add the bucket name to the corresponding"
echo "      service's wrangler.toml [[r2_buckets]] section."
echo ""

echo "--- Creating ai-foundry-documents (SVC-01: svc-ingestion) ---"
echo "    Stores raw uploaded documents (PDF, PPT, DOCX, Excel, images)"
wrangler r2 bucket create ai-foundry-documents

echo ""
echo "--- Creating ai-foundry-skill-packages (SVC-05: svc-skill) ---"
echo "    Stores published .skill.json packages under skill-packages/ prefix"
wrangler r2 bucket create ai-foundry-skill-packages

echo ""
echo "=== All R2 buckets created successfully ==="
echo ""
echo "Bucket summary:"
echo "  ai-foundry-documents       -> bind as DOCUMENTS_BUCKET in svc-ingestion"
echo "  ai-foundry-skill-packages  -> bind as SKILL_PACKAGES_BUCKET in svc-skill"
echo ""
echo "Next steps:"
echo "  1. Update services/svc-ingestion/wrangler.toml:"
echo "       [[r2_buckets]]"
echo "       binding = \"DOCUMENTS_BUCKET\""
echo "       bucket_name = \"ai-foundry-documents\""
echo ""
echo "  2. Update services/svc-skill/wrangler.toml:"
echo "       [[r2_buckets]]"
echo "       binding = \"SKILL_PACKAGES_BUCKET\""
echo "       bucket_name = \"ai-foundry-skill-packages\""
