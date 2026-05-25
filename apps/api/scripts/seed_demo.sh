#!/usr/bin/env bash
# /apps/api/scripts/seed_demo.sh
#
# Demo seed for the four frameworks Frameboard supports. Creates a
# RICE / ICE / MoSCoW / ValueEffort workspace each, populated with
# items, scores, and tags; marks a few RICE items completed so the
# completion checkbox UI has something to show.
#
# Usage:
#   API_URL=http://localhost:8001 ./seed_demo.sh                # local, AUTH_DISABLED
#   API_URL=https://frameboard-api.onrender.com \
#       BEARER_TOKEN=<jwt> ./seed_demo.sh                       # auth-enabled (prod)
#   API_URL=… BEARER_TOKEN=<jwt> TAGS_ONLY=1 ./seed_demo.sh     # only patch tags on existing items
#
# - Workspaces are matched by name → idempotent (re-running won't
#   duplicate them).
# - Items are matched by title within a workspace → also idempotent.
# - When BEARER_TOKEN is set, every request carries
#   `Authorization: Bearer <token>`. Otherwise no auth header is sent
#   (works against an AUTH_DISABLED=1 backend).

set -euo pipefail
API="${API_URL:-http://localhost:8001}"
TAGS_ONLY="${TAGS_ONLY:-0}"
BEARER_TOKEN="${BEARER_TOKEN:-}"

# Warm up free-plan hosting so the first POST doesn't hit a cold start.
curl -s -o /dev/null "$API/healthz" || true

# ───────────────────────────────────────────────────── helpers ──

# Single curl wrapper so the Authorization header is applied uniformly.
api() {
  if [[ -n "$BEARER_TOKEN" ]]; then
    curl -s -H "Authorization: Bearer $BEARER_TOKEN" "$@"
  else
    curl -s "$@"
  fi
}

get_workspace_id_by_name() {
  local name="$1"
  api "$API/v1/workspaces" \
    | python3 -c "
import json,sys
name=sys.argv[1]
for w in json.load(sys.stdin):
    if w['name']==name:
        print(w['id']); break
" "$name"
}

create_workspace() {
  local name="$1" framework="$2"
  api -X POST "$API/v1/workspaces" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"framework\":\"$framework\"}" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])"
}

ensure_workspace() {
  local name="$1" framework="$2"
  local id
  id=$(get_workspace_id_by_name "$name")
  if [[ -z "$id" ]]; then
    id=$(create_workspace "$name" "$framework")
    echo "  + created [$framework] '$name' → $id" >&2
  else
    echo "  · existing [$framework] '$name' → $id" >&2
  fi
  echo "$id"
}

list_items_tsv() {
  local ws="$1"
  api "$API/v1/workspaces/$ws/items" | python3 -c "
import json,sys
for it in json.load(sys.stdin):
    print(f\"{it['title']}\t{it['id']}\")
"
}

item_id_by_title() {
  local ws="$1" title="$2"
  list_items_tsv "$ws" | awk -F '\t' -v t="$title" '$1==t{print $2; exit}'
}

create_item() {
  local ws="$1" title="$2"
  api -X POST "$API/v1/workspaces/$ws/items" \
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

score_rice() {
  local id="$1" reach="$2" impact="$3" conf="$4" effort="$5"
  api -o /dev/null -X POST "$API/v1/score/rice" \
    -H 'Content-Type: application/json' \
    -d "{\"item_id\":\"$id\",\"reach\":$reach,\"impact\":$impact,\"confidence\":$conf,\"effort\":$effort}"
}

# Unified scoring — `inputs` is a JSON object that varies by framework.
score_unified() {
  local id="$1" framework="$2" inputs="$3"
  api -o /dev/null -X POST "$API/v1/score" \
    -H 'Content-Type: application/json' \
    -d "{\"item_id\":\"$id\",\"framework\":\"$framework\",\"inputs\":$inputs}"
}

patch_tags() {
  local id="$1" tags_json="$2"
  api -o /dev/null -X PATCH "$API/v1/items/$id" \
    -H 'Content-Type: application/json' \
    -d "{\"tags\":$tags_json}"
}

mark_completed() {
  local id="$1" iso="$2"
  api -o /dev/null -X PATCH "$API/v1/items/$id" \
    -H 'Content-Type: application/json' \
    -d "{\"completed_at\":\"$iso\"}"
}

# RICE row format:
#   title | reach | impact | conf | effort | tags_json | completed_at|""
process_rice_item() {
  local ws="$1" line="$2"
  IFS='|' read -r title reach impact conf effort tags completed <<< "$line"
  local id
  id=$(ensure_item "$ws" "$title")
  if [[ "$TAGS_ONLY" != "1" ]] && [[ -n "$reach" ]]; then
    score_rice "$id" "$reach" "$impact" "$conf" "$effort"
  fi
  patch_tags "$id" "$tags"
  if [[ "$TAGS_ONLY" != "1" ]] && [[ -n "$completed" ]]; then
    mark_completed "$id" "$completed"
  fi
  echo "  ✓ $title"
}

# Polymorphic row format: title | framework | inputs_json | tags_json
process_polymorphic_item() {
  local ws="$1" line="$2"
  IFS='|' read -r title framework inputs tags <<< "$line"
  local id
  id=$(ensure_item "$ws" "$title")
  if [[ "$TAGS_ONLY" != "1" ]]; then
    score_unified "$id" "$framework" "$inputs"
  fi
  patch_tags "$id" "$tags"
  echo "  ✓ $title"
}

# ─────────────────────────────────────────────────────────── data ──

# RICE workspaces — proven content from the original demo plus a few
# items pre-marked completed so the new checkbox column has something
# to render on first load.
Q2_ITEMS=(
  "Ship dark mode toggle|8000|1|0.9|2|[\"feature\",\"polish\"]|2026-05-10T09:00:00Z"
  "AI summary for long threads|6000|2|0.7|5|[\"feature\",\"growth\"]|"
  "Onboarding wizard redesign|5000|2|0.8|8|[\"growth\",\"polish\"]|"
  "@mention notifications|4000|1|0.9|4|[\"feature\"]|"
  "Saved filters and views|3500|1|0.8|4|[\"feature\"]|"
  "Inline image previews|5000|0.5|0.8|3|[\"feature\"]|2026-05-15T14:00:00Z"
  "Two-factor authentication (TOTP)|2200|1|0.9|3|[\"security\"]|"
  "Slack integration (Phase 1)|3000|2|0.7|6|[\"integration\"]|"
  "Empty state illustrations|3000|0.25|0.9|2|[\"polish\"]|2026-05-18T11:00:00Z"
  "Markdown support in comments|4500|0.5|0.9|3|[\"feature\"]|"
  "Improve search relevance|10000|1|0.6|12|[\"feature\"]|"
  "Better 404 page|1000|0.25|1|0.5|[\"polish\"]|2026-05-12T16:00:00Z"
  "Add Sentry error tracking|200|3|1|1|[\"infra\"]|2026-05-08T10:00:00Z"
  "Custom keyboard shortcuts|1500|0.5|0.8|2|[\"feature\"]|"
  "Referral program v2|2500|2|0.5|8|[\"growth\"]|"
  "Workspace settings page redesign|3000|1|0.7|6|[\"feature\"]|"
  "CSV export for reports|1800|0.5|1|3|[\"feature\",\"integration\"]|"
  "Mobile push notifications|4000|0.5|0.5|4|[\"feature\",\"mobile\"]|"
  "Loading skeletons|8000|0.25|0.9|8|[\"polish\"]|"
  "Rate limiting on auth endpoints|200|2|1|1|[\"security\",\"infra\"]|2026-05-20T13:00:00Z"
  "Reduce JS bundle size by 30%|6000|0.25|0.7|8|[\"infra\"]|"
  "Migrate from Postgres 13 to 16|300|0.5|0.7|5|[\"infra\"]|"
)

MOBILE_ITEMS=(
  "iOS biometric login|4000|2|0.9|3|[\"mobile\",\"security\"]|"
  "Offline mode|3000|2|0.6|10|[\"mobile\",\"feature\"]|"
  "Deep linking from emails|2500|1|0.8|3|[\"mobile\",\"integration\"]|"
  "Push notification settings UI|3000|0.5|0.9|2|[\"mobile\",\"feature\"]|2026-05-14T08:00:00Z"
  "Tablet layout (iPad)|1500|1|0.5|12|[\"mobile\",\"polish\"]|"
  "Reduce app cold start time|8000|0.5|0.8|5|[\"mobile\",\"infra\"]|"
  "Crash reporting integration|500|2|1|1|[\"mobile\",\"infra\"]|2026-05-09T11:00:00Z"
  "App Store optimization assets|||||[\"mobile\",\"growth\"]|"
)

INFRA_ITEMS=(
  "GDPR data export endpoint|2000|2|0.8|5|[\"infra\",\"security\"]|"
  "Reduce API p95 latency|10000|0.5|0.7|8|[\"infra\"]|"
  "Set up read replicas|200|2|0.9|4|[\"infra\"]|"
  "Audit log retention|50|3|1|2|[\"infra\",\"security\"]|2026-05-11T12:00:00Z"
  "Backup encryption at rest|100|2|1|3|[\"infra\",\"security\"]|"
  "Migrate to Kubernetes|500|0.5|0.5|20|[\"infra\"]|"
)

# ICE — Impact / Confidence / Ease all on 1–10 scale.
ICE_ITEMS=(
  "A/B test pricing page copy|ICE|{\"impact\":8,\"confidence\":7,\"ease\":9}|[\"growth\",\"experiment\"]"
  "Add testimonials section|ICE|{\"impact\":6,\"confidence\":8,\"ease\":9}|[\"growth\",\"polish\"]"
  "Free trial → paid conversion email|ICE|{\"impact\":9,\"confidence\":6,\"ease\":7}|[\"growth\"]"
  "Onboarding video walkthrough|ICE|{\"impact\":7,\"confidence\":5,\"ease\":4}|[\"growth\",\"polish\"]"
  "Referral program v1|ICE|{\"impact\":8,\"confidence\":5,\"ease\":3}|[\"growth\"]"
  "Pricing FAQ section|ICE|{\"impact\":5,\"confidence\":9,\"ease\":9}|[\"polish\"]"
  "Live chat widget on pricing|ICE|{\"impact\":6,\"confidence\":6,\"ease\":7}|[\"growth\",\"integration\"]"
  "Social proof badges|ICE|{\"impact\":4,\"confidence\":7,\"ease\":9}|[\"polish\"]"
)

# Value × Effort — V/E with V free-scale, E in person-months.
VE_ITEMS=(
  "Self-serve billing portal|ValueEffort|{\"value\":9,\"effort\":4}|[\"feature\",\"integration\"]"
  "Multi-currency invoicing|ValueEffort|{\"value\":7,\"effort\":6}|[\"feature\",\"international\"]"
  "Invoice PDF templates|ValueEffort|{\"value\":5,\"effort\":2}|[\"feature\"]"
  "Failed-payment retry logic|ValueEffort|{\"value\":8,\"effort\":3}|[\"infra\"]"
  "Tax compliance (US states)|ValueEffort|{\"value\":6,\"effort\":8}|[\"infra\",\"international\"]"
  "Annual subscription discounts|ValueEffort|{\"value\":7,\"effort\":2}|[\"feature\",\"growth\"]"
  "Subscription pause feature|ValueEffort|{\"value\":4,\"effort\":3}|[\"feature\"]"
)

# MoSCoW — categorical priority for a release scope.
MOSCOW_ITEMS=(
  "User authentication|MoSCoW|{\"bucket\":\"Must\"}|[\"security\",\"feature\"]"
  "Password reset|MoSCoW|{\"bucket\":\"Must\"}|[\"security\"]"
  "Workspace creation|MoSCoW|{\"bucket\":\"Must\"}|[\"feature\"]"
  "Item create/edit/delete|MoSCoW|{\"bucket\":\"Must\"}|[\"feature\"]"
  "Score history timeline|MoSCoW|{\"bucket\":\"Should\"}|[\"feature\"]"
  "Email digests|MoSCoW|{\"bucket\":\"Should\"}|[\"feature\",\"growth\"]"
  "Custom themes|MoSCoW|{\"bucket\":\"Could\"}|[\"polish\"]"
  "Markdown in descriptions|MoSCoW|{\"bucket\":\"Could\"}|[\"feature\"]"
  "Slack notifications|MoSCoW|{\"bucket\":\"Could\"}|[\"integration\"]"
  "Native mobile apps|MoSCoW|{\"bucket\":\"Won't\"}|[\"mobile\"]"
  "AI-generated descriptions|MoSCoW|{\"bucket\":\"Won't\"}|[\"feature\"]"
)

# ────────────────────────────────────────────────────────── run ──

echo "API:        $API"
echo "Bearer:     $([[ -n "$BEARER_TOKEN" ]] && echo "yes" || echo "no")"
echo "Tags-only:  $TAGS_ONLY"
echo

echo "=== Q2 2026 Roadmap [RICE] ==="
WS=$(ensure_workspace "Q2 2026 Roadmap" "RICE")
for line in "${Q2_ITEMS[@]}"; do process_rice_item "$WS" "$line"; done

echo
echo "=== Mobile App Backlog [RICE] ==="
WS=$(ensure_workspace "Mobile App Backlog" "RICE")
for line in "${MOBILE_ITEMS[@]}"; do process_rice_item "$WS" "$line"; done

echo
echo "=== Platform & Infrastructure [RICE] ==="
WS=$(ensure_workspace "Platform & Infrastructure" "RICE")
for line in "${INFRA_ITEMS[@]}"; do process_rice_item "$WS" "$line"; done

echo
echo "=== Growth Experiments [ICE] ==="
WS=$(ensure_workspace "Growth Experiments" "ICE")
for line in "${ICE_ITEMS[@]}"; do process_polymorphic_item "$WS" "$line"; done

echo
echo "=== Billing & Payments [Value × Effort] ==="
WS=$(ensure_workspace "Billing & Payments" "ValueEffort")
for line in "${VE_ITEMS[@]}"; do process_polymorphic_item "$WS" "$line"; done

echo
echo "=== v1.0 Launch Scope [MoSCoW] ==="
WS=$(ensure_workspace "v1.0 Launch Scope" "MoSCoW")
for line in "${MOSCOW_ITEMS[@]}"; do process_polymorphic_item "$WS" "$line"; done

echo
echo "✓ done"
