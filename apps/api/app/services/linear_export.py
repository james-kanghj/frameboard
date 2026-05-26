# /apps/api/app/services/linear_export.py
#
# Tiny GraphQL client for the one Linear mutation we need: create an
# issue inside the user's chosen team. Mirrors notion_export.py's
# shape (sync httpx, no SDK, no retries) so the export router can
# delegate without caring which integration it's hitting.

from __future__ import annotations

from typing import Any

import httpx

LINEAR_API_URL = "https://api.linear.app/graphql"

ISSUE_CREATE_MUTATION = """
mutation IssueCreate($teamId: String!, $title: String!, $description: String) {
  issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
    success
    issue {
      id
      identifier
      url
    }
  }
}
"""


class LinearExportError(Exception):
    """Raised when a single Linear issue create fails. Router catches
    per-row and tallies failures alongside successes so a bad title or
    a stale team id doesn't sink the whole export."""


def _headers(api_key: str) -> dict[str, str]:
    # Linear's docs accept both `Bearer <token>` (OAuth) and the raw
    # personal API key in the Authorization header. The raw form is
    # what `lin_api_*` keys use, which is what we expect here.
    return {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }


def create_issue(
    *,
    api_key: str,
    team_id: str,
    title: str,
    description: str | None,
) -> dict[str, Any]:
    """POST the issueCreate mutation; raises LinearExportError on
    transport failure, a non-200 status, or a `success: false` payload
    (which Linear returns for validation issues like a bad team id)."""
    payload = {
        "query": ISSUE_CREATE_MUTATION,
        "variables": {
            "teamId": team_id,
            "title": (title or "Untitled")[:255],
            "description": description,
        },
    }

    try:
        response = httpx.post(
            LINEAR_API_URL,
            headers=_headers(api_key),
            json=payload,
            timeout=30.0,
        )
    except httpx.HTTPError as e:
        raise LinearExportError(f"network error: {e}") from e

    if response.status_code >= 400:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise LinearExportError(f"linear {response.status_code}: {detail}")

    body = response.json()
    if body.get("errors"):
        # GraphQL-level errors come back inside a 200 with `errors`.
        msgs = "; ".join(e.get("message", "") for e in body["errors"])
        raise LinearExportError(f"graphql error: {msgs}")
    data = body.get("data", {}).get("issueCreate")
    if not data or not data.get("success"):
        raise LinearExportError("issueCreate returned success=false")
    return data["issue"]
