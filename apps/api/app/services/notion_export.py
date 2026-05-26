# /apps/api/app/services/notion_export.py
#
# Thin client for Notion's REST API focused on the one shape we need:
# create a page inside a database with a Title property and an optional
# rich-text description body. Other property mapping is intentionally
# skipped for the MVP — users get title + body, and can extend in Notion
# directly if they want richer rows.

from __future__ import annotations

from typing import Any

import httpx

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_API_VERSION = "2022-06-28"


class NotionExportError(Exception):
    """Raised when a single page create fails. The router catches and
    converts to a partial-success response so a bad row doesn't sink
    the whole export."""


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
    }


def _title_property(title: str) -> dict[str, Any]:
    # The schema requires the title property to live under whatever
    # key the user named it in Notion. The default name for a new DB is
    # "Name"; we send under that key. If the user's DB uses a different
    # title key the API responds with a "validation error" — which the
    # frontend surfaces as the failed row count.
    return {
        "Name": {
            "title": [{"type": "text", "text": {"content": title[:2000]}}],
        }
    }


def _description_block(description: str) -> dict[str, Any]:
    # Single paragraph block with the description. Notion truncates rich
    # text at 2000 chars per node, so chunk on that boundary.
    chunks = [
        description[i : i + 2000] for i in range(0, len(description), 2000)
    ]
    return [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [
                    {"type": "text", "text": {"content": chunk}}
                    for chunk in chunks
                ],
            },
        }
    ]


def create_page(
    *,
    token: str,
    database_id: str,
    title: str,
    description: str | None,
) -> dict[str, Any]:
    """POST /v1/pages with a title and (optionally) a paragraph body.
    Returns the parsed JSON on 200, raises NotionExportError otherwise.
    """
    body: dict[str, Any] = {
        "parent": {"database_id": database_id},
        "properties": _title_property(title or "Untitled"),
    }
    if description and description.strip():
        body["children"] = _description_block(description)

    try:
        response = httpx.post(
            f"{NOTION_API_BASE}/pages",
            headers=_headers(token),
            json=body,
            timeout=30.0,
        )
    except httpx.HTTPError as e:
        raise NotionExportError(f"network error: {e}") from e

    if response.status_code >= 400:
        # Notion returns {"object": "error", "code": ..., "message": ...}
        try:
            detail = response.json().get("message", response.text)
        except ValueError:
            detail = response.text
        raise NotionExportError(
            f"notion {response.status_code}: {detail}"
        )
    return response.json()
