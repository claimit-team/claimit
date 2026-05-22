"""Gmail message → EmailForExtraction adapter for the 4.17 ingest pipeline.

Walks the deeply-nested MIME-like JSON returned by `users.messages.get?format=full`
and produces a normalized `EmailForExtraction` the existing
`extractor.extract_from_email` accepts.

Key shape considerations:

- Gmail returns `payload.parts` recursively (`multipart/alternative >
  multipart/related > {text/plain, text/html, attachments}`). The
  walker is depth-first; text/plain wins over text/html when both are
  present (preferred per RFC 2046 §5.1.4).
- Body data is base64url-encoded with no padding (Gmail's choice;
  RFC 4648 §5). Python's `base64.urlsafe_b64decode` requires padding,
  so we pad manually before decoding.
- HTML-only emails (Amazon, Best Buy, most modern retailers) are
  converted to plain text via `html2text` — feeding raw HTML to the
  Gemini extractor would work but cost ~3x the tokens and risk the
  model attending to layout markup instead of facts.
- Attachments (PDF receipts from Apple, hotel folios, etc.) are NOT
  fetched in this first cut. The walker detects their presence and
  logs `gmail.attachment_present_not_extracted message_id=... mime=...
  filename=...` so a follow-up ticket can quantify which retailers
  we're missing before deciding whether to add `messages.attachments.get`.

The `EmailForExtraction` it produces has `ingestion_source="gmail"`
hard-coded; callers don't get to override.
"""

from __future__ import annotations

import base64
import logging
from typing import Any
from uuid import UUID

import html2text
from pydantic import ValidationError

from .extractor import EmailForExtraction

_log = logging.getLogger(__name__)


class GmailParseError(ValueError):
    """Raised when the Gmail message envelope is missing required fields.

    The 4.17 handler treats this as a per-message skip — log + ack the
    Pub/Sub message and move on. A retry against the same message_id
    would produce the same parse error, so 5xx-ing back to Pub/Sub for
    redelivery doesn't help.
    """


# Mime types we recognize as the message body. Order matters: text/plain
# is preferred when both are present (RFC 2046 §5.1.4 — text/plain is
# the most universally readable variant). text/html is the fallback we
# run through html2text. Anything else is ignored.
_BODY_MIME_PLAIN = "text/plain"
_BODY_MIME_HTML = "text/html"

# Container mime types we recurse into. text/plain + text/html can live
# directly under `multipart/alternative` (the simple case) or nested
# inside `multipart/related` / `multipart/mixed` (when there are
# inline images or attachments). The walker recurses into anything
# starting with `multipart/`.
_MULTIPART_PREFIX = "multipart/"

# html2text is stateful per-instance; constructing one per-call would
# be wasteful but safe. A module-level instance with our preferred
# config is fine for the demo scale (single-process per Cloud Run
# instance, single-flight per request thanks to the asyncio loop).
_HTML2TEXT = html2text.HTML2Text()
_HTML2TEXT.ignore_links = True  # Reduces token count noise; extractor doesn't need URLs.
_HTML2TEXT.ignore_images = True
_HTML2TEXT.body_width = 0  # Don't hard-wrap lines — the extractor reads as a stream.


def _base64url_decode(data: str) -> bytes:
    """Decode Gmail's base64url body data, padding as needed.

    Gmail emits the data without `=` padding (RFC 4648 §5 allows this).
    Python's `urlsafe_b64decode` requires padding — pad with `=` to a
    length divisible by 4 before decoding. Empty string is valid input
    (some empty body parts come back this way) and returns empty bytes.
    """
    if not data:
        return b""
    padding_needed = (-len(data)) % 4
    padded = data + ("=" * padding_needed)
    return base64.urlsafe_b64decode(padded)


def _decode_body_text(part: dict[str, Any]) -> str:
    """Pull and UTF-8 decode the body bytes of one MIME part.

    Returns empty string when the part has no `body.data` (the part is
    a container) — caller filters those out. UTF-8 decode uses
    `errors="replace"` so a single bad byte (mid-multibyte truncation,
    rare but possible on long forwarded chains) doesn't crash the
    whole pipeline; the replacement chars degrade extractor quality
    slightly but don't take the request down.
    """
    body = part.get("body") or {}
    data = body.get("data")
    if not data:
        return ""
    raw = _base64url_decode(data)
    return raw.decode("utf-8", errors="replace")


def _walk_parts(
    parts: list[dict[str, Any]],
    message_id: str,
) -> tuple[str, str, list[tuple[str, str | None]]]:
    """Depth-first walk over MIME parts.

    Returns:
        (plain_body, html_body, attachments)
        - plain_body: concatenated text/plain content (preferred over html)
        - html_body: concatenated text/html content (used as fallback)
        - attachments: list of (mime_type, filename) tuples — logged
          but not extracted in this first cut

    Concatenation matters for forwarded / threaded emails where the
    original receipt and the forward wrapper land in separate parts;
    extractor's MAX_BODY_CHARS truncates the result so excessive
    concatenation is bounded.
    """
    plain_chunks: list[str] = []
    html_chunks: list[str] = []
    attachments: list[tuple[str, str | None]] = []

    for part in parts:
        mime_type = (part.get("mimeType") or "").lower()
        filename = part.get("filename") or None

        # Recurse into container types.
        if mime_type.startswith(_MULTIPART_PREFIX):
            sub_parts = part.get("parts") or []
            sub_plain, sub_html, sub_attachments = _walk_parts(sub_parts, message_id)
            if sub_plain:
                plain_chunks.append(sub_plain)
            if sub_html:
                html_chunks.append(sub_html)
            attachments.extend(sub_attachments)
            continue

        # Attachments — Gmail signals these with a non-empty `filename`,
        # OR an attachmentId in body (no inline data). Detect both;
        # log + skip.
        body = part.get("body") or {}
        if filename or body.get("attachmentId"):
            attachments.append((mime_type, filename))
            continue

        # Body parts.
        if mime_type == _BODY_MIME_PLAIN:
            text = _decode_body_text(part)
            if text:
                plain_chunks.append(text)
        elif mime_type == _BODY_MIME_HTML:
            text = _decode_body_text(part)
            if text:
                html_chunks.append(text)
        # Anything else (image/*, application/octet-stream that isn't
        # tagged as an attachment, etc.) is silently ignored. These
        # aren't load-bearing for extractor input.

    return ("\n\n".join(plain_chunks), "\n\n".join(html_chunks), attachments)


def _extract_top_level_body(
    payload: dict[str, Any],
) -> tuple[str, str, list[tuple[str, str | None]]]:
    """Handle the single-part case where `payload.parts` doesn't exist.

    Plaintext-only senders (rare but real — automated scripts, some
    older retailer systems) send a single text/plain message with no
    parts array; the body lives directly on `payload.body.data`. The
    walker assumes a parts list, so we synthesize a one-element list
    from the top-level payload before recursing.
    """
    parts = payload.get("parts")
    if parts:
        return _walk_parts(parts, message_id="<top-level>")

    # Single-part: treat the payload itself as one part.
    mime_type = (payload.get("mimeType") or "").lower()
    if mime_type in (_BODY_MIME_PLAIN, _BODY_MIME_HTML):
        return _walk_parts([payload], message_id="<top-level>")

    # Truly empty / unknown mime — return empties; the caller's parse
    # will raise GmailParseError when both bodies come back empty.
    return ("", "", [])


def _header(headers: list[dict[str, str]], name: str) -> str:
    """Case-insensitive header lookup. Returns "" when missing."""
    target = name.lower()
    for h in headers:
        if (h.get("name") or "").lower() == target:
            return h.get("value") or ""
    return ""


def parse_gmail_message(msg: dict[str, Any], *, user_id: UUID) -> EmailForExtraction:
    """Convert a Gmail `users.messages.get?format=full` response into
    an `EmailForExtraction` ready for `classifier.classify` and
    `extractor.extract_from_email`.

    Args:
        msg: the raw JSON envelope from `gmail_api.messages_get`.
        user_id: the User UUID this message belongs to. The Gmail API
            doesn't return our user id; the caller resolves it from
            `gmail_integration.connected_email` upstream.

    Returns: a validated `EmailForExtraction` with `ingestion_source="gmail"`.
        Body content prefers text/plain; falls back to html2text-converted
        text/html when only HTML is present.

    Side effects: emits one `gmail.attachment_present_not_extracted`
    INFO log per attachment found. We don't fetch attachment bodies in
    this first cut — those need a follow-up ticket (messages.attachments.
    get + the magic-byte sniffer already in main.py).

    Raises:
        GmailParseError: when the envelope is missing required fields
            (no payload, no headers, both body chunks empty). The
            handler logs + acks; a redelivery would parse the same
            envelope and produce the same error.
    """
    message_id = msg.get("id") or "<unknown>"
    payload = msg.get("payload")
    if not payload:
        raise GmailParseError(f"Gmail message {message_id} has no payload")

    headers = payload.get("headers") or []
    if not headers:
        raise GmailParseError(f"Gmail message {message_id} has no headers")

    sender = _header(headers, "From")
    subject = _header(headers, "Subject")
    if not sender:
        raise GmailParseError(f"Gmail message {message_id} has no From header")
    if not subject:
        # Subject is occasionally truly empty on automated mailers.
        # The EmailForExtraction model requires min_length=1, so we
        # synthesize a sentinel — the classifier will probably reject
        # but at least we don't crash on parse.
        subject = "(no subject)"

    snippet = msg.get("snippet") or ""

    plain_body, html_body, attachments = _extract_top_level_body(payload)

    # Log every attachment so a follow-up ticket can quantify which
    # retailers send PDFs. Format chosen to be greppable in Cloud
    # Logging: filter on `gmail.attachment_present_not_extracted` to
    # get the full list.
    for mime, filename in attachments:
        _log.info(
            "gmail.attachment_present_not_extracted message_id=%s mime=%s filename=%s",
            message_id,
            mime,
            filename,
        )

    # Pick body: text/plain wins. Fall back to html2text-converted HTML
    # only when plain is empty. Don't concatenate both — that would
    # duplicate every line in alternative-mode emails (the whole point
    # of multipart/alternative is "pick one").
    if plain_body:
        body_text = plain_body
    elif html_body:
        body_text = _HTML2TEXT.handle(html_body)
    else:
        raise GmailParseError(f"Gmail message {message_id} has no text/plain or text/html body")

    try:
        return EmailForExtraction.model_validate(
            {
                "user_id": user_id,
                "sender": sender,
                "subject": subject,
                "snippet": snippet,
                "body_text": body_text,
                "ingestion_source": "gmail",
            }
        )
    except ValidationError as err:
        # Surface as GmailParseError so the handler has a single
        # exception class to catch for "envelope is structurally bad".
        raise GmailParseError(
            f"Gmail message {message_id} failed EmailForExtraction validation: {err}"
        ) from err
