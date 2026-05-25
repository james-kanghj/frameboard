#!/usr/bin/env bash
# /apps/api/scripts/seed_demo.sh
#
# Idempotent-ish seed for the Q2 Roadmap / Mobile / Platform demo data
# used in screenshots and the README. Usage:
#
#   API_URL=http://localhost:8001 ./seed_demo.sh           # full seed
#   API_URL=https://frameboard-api.onrender.com TAGS_ONLY=1 \
#       ./seed_demo.sh                                     # only patch tags
#
# - Without TAGS_ONLY, creates workspaces (matching by name → skip if
#   already present for the same owner), adds items (skip if title
#   exists in workspace), scores them, then tags them.
# - With TAGS_ONLY=1, only walks existing items in the three named
#   workspaces and PATCHes tags by title match.
#
# OWNER_EMAIL defaults to the dev user; override via env.

set -euo pipefail
API="${API_URL:-http://localhost:8001}"
EMAIL="${OWNER_EMAIL:-61649060+james-kanghj@users.noreply.github.com}"
TAGS_ONLY="${TAGS_ONLY:-0}"

# warm up free-plan hosting so the first POST doesn't hit a cold start
curl -s -o /dev/null "$API/healthz" || true

# ───────────────────────────────────────────────────────── helpers ──

py_jq() { python3 -c "$1"; }

get_workspace_id_by_name() {
  local name="$1"
  curl -s "$API/v1/workspaces" --data-urlencode "owner_email=$EMAIL" -G \
    | python3 -c "
import json,sys
name=sys.argv[1]
for w in json.load(sys.stdin):
    if w['name']==name:
        print(w['id']); break
" "$name"
}

create_workspace() {
  local name="$1"
  curl -s -X POST "$API/v1/workspaces" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"owner_email\":\"$EMAIL\"}" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])"
}

ensure_workspace() {
  local name="$1"
  local id
  id=$(get_workspace_id_by_name "$name")
  if [[ -z "$id" ]]; then
    id=$(create_workspace "$name")
    echo "  + created workspace '$name' → $id" >&2
  else
    echo "  · existing workspace '$name' → $id" >&2
  fi
  echo "$id"
}

# Returns: <title>\t<id> for every item in the workspace.
list_items_tsv() {
  local ws="$1"
  curl -s "$API/v1/workspaces/$ws/items" | python3 -c "
import json,sys
for it in json.load(sys.stdin):
    print(f\"{it['title']}\t{it['id']}\")
"
}

# Find an item id by title; empty if not found.
item_id_by_title() {
  local ws="$1" title="$2"
  list_items_tsv "$ws" | awk -F '\t' -v t="$title" '$1==t{print $2; exit}'
}

create_item() {
  local ws="$1" title="$2"
  curl -s -X POST "$API/v1/workspaces/$ws/items" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"$title\"}" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])"
}

ensure_item() {
  local ws="$1" title="$2"
  local id
  id=$(item_id_by_title "$ws" "$title")
  if [[ -z "$id" ]]; then
    id=$(create_item "$ws" "$title")
  fi
  echo "$id"
}

score_item() {
  local id="$1" reach="$2" impact="$3" conf="$4" effort="$5"
  curl -s -o /dev/null -X POST "$API/v1/score/rice" \
    -H 'Content-Type: application/json' \
    -d "{\"item_id\":\"$id\",\"reach\":$reach,\"impact\":$impact,\"confidence\":$conf,\"effort\":$effort}"
}

patch_tags() {
  local id="$1" tags_json="$2"
  curl -s -o /dev/null -X PATCH "$API/v1/items/$id" \
    -H 'Content-Type: application/json' \
    -d "{\"tags\":$tags_json}"
}

# title | reach | impact | conf | effort | tags_json
process_item() {
  local ws="$1" line="$2"
  IFS='|' read -r title reach impact conf effort tags <<< "$line"
  local id
  id=$(ensure_item "$ws" "$title")
  if [[ "$TAGS_ONLY" != "1" ]] && [[ -n "$reach" ]]; then
    score_item "$id" "$reach" "$impact" "$conf" "$effort"
  fi
  patch_tags "$id" "$tags"
  echo "  ✓ $title"
}

# ─────────────────────────────────────────────────────────── data ──

Q2_ITEMS=(
  "Ship dark mode toggle|8000|1|0.9|2|[\"feature\",\"polish\"]"
  "AI summary for long threads|6000|2|0.7|5|[\"feature\",\"growth\"]"
  "Onboarding wizard redesign|5000|2|0.8|8|[\"growth\",\"polish\"]"
  "@mention notifications|4000|1|0.9|4|[\"feature\"]"
  "Saved filters and views|3500|1|0.8|4|[\"feature\"]"
  "Inline image previews|5000|0.5|0.8|3|[\"feature\"]"
  "Two-factor authentication (TOTP)|2200|1|0.9|3|[\"security\"]"
  "Slack integration (Phase 1)|3000|2|0.7|6|[\"integration\"]"
  "Empty state illustrations|3000|0.25|0.9|2|[\"polish\"]"
  "Markdown support in comments|4500|0.5|0.9|3|[\"feature\"]"
  "Improve search relevance|10000|1|0.6|12|[\"feature\"]"
  "Better 404 page|1000|0.25|1|0.5|[\"polish\"]"
  "Add Sentry error tracking|200|3|1|1|[\"infra\"]"
  "Custom keyboard shortcuts|1500|0.5|0.8|2|[\"feature\"]"
  "Referral program v2|2500|2|0.5|8|[\"growth\"]"
  "Workspace settings page redesign|3000|1|0.7|6|[\"feature\"]"
  "CSV export for reports|1800|0.5|1|3|[\"feature\",\"integration\"]"
  "Mobile push notifications|4000|0.5|0.5|4|[\"feature\",\"mobile\"]"
  "Loading skeletons|8000|0.25|0.9|8|[\"polish\"]"
  "Rate limiting on auth endpoints|200|2|1|1|[\"security\",\"infra\"]"
  "Reduce JS bundle size by 30%|6000|0.25|0.7|8|[\"infra\"]"
  "Migrate from Postgres 13 to 16|300|0.5|0.7|5|[\"infra\"]"
  "Switch from REST to GraphQL|||||[\"infra\"]"
  "Bulk user permissions UI|||||[\"feature\",\"security\"]"
  "User profile customization|||||[\"feature\"]"
)

MOBILE_ITEMS=(
  "iOS biometric login|4000|2|0.9|3|[\"mobile\",\"security\"]"
  "Offline mode|3000|2|0.6|10|[\"mobile\",\"feature\"]"
  "Deep linking from emails|2500|1|0.8|3|[\"mobile\",\"integration\"]"
  "Push notification settings UI|3000|0.5|0.9|2|[\"mobile\",\"feature\"]"
  "Tablet layout (iPad)|1500|1|0.5|12|[\"mobile\",\"polish\"]"
  "Reduce app cold start time|8000|0.5|0.8|5|[\"mobile\",\"infra\"]"
  "Crash reporting integration|500|2|1|1|[\"mobile\",\"infra\"]"
  "App Store optimization assets|||||[\"mobile\",\"growth\"]"
)

INFRA_ITEMS=(
  "GDPR data export endpoint|2000|2|0.8|5|[\"infra\",\"security\"]"
  "Reduce API p95 latency|10000|0.5|0.7|8|[\"infra\"]"
  "Set up read replicas|200|2|0.9|4|[\"infra\"]"
  "Audit log retention|50|3|1|2|[\"infra\",\"security\"]"
  "Backup encryption at rest|100|2|1|3|[\"infra\",\"security\"]"
  "Migrate to Kubernetes|500|0.5|0.5|20|[\"infra\"]"
)

# ────────────────────────────────────────────────────────── run ──

echo "API:        $API"
echo "Owner:      $EMAIL"
echo "Tags-only:  $TAGS_ONLY"
echo

echo "=== Q2 2026 Roadmap ==="
WS=$(ensure_workspace "Q2 2026 Roadmap")
for line in "${Q2_ITEMS[@]}"; do process_item "$WS" "$line"; done

echo
echo "=== Mobile App Backlog ==="
WS=$(ensure_workspace "Mobile App Backlog")
for line in "${MOBILE_ITEMS[@]}"; do process_item "$WS" "$line"; done

echo
echo "=== Platform & Infrastructure ==="
WS=$(ensure_workspace "Platform & Infrastructure")
for line in "${INFRA_ITEMS[@]}"; do process_item "$WS" "$line"; done

echo
echo "✓ done"
