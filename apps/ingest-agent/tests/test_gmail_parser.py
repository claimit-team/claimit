"""Tests for src/gmail_parser.py — MIME walker + EmailForExtraction adapter.

Exercises the shapes Gmail actually returns from messages.get:
- multipart/alternative with both text/plain + text/html (prefer plain)
- text/html only (fall back to html2text)
- multipart/mixed with attachment (log + skip the attachment)
- single-part text/plain (no `parts` array)
- structurally malformed envelopes (raise GmailParseError)

Inputs are built as Python dicts that mirror the real Gmail response
shape — base64url-encoded body data with no padding, header lists,
nested parts arrays. Helpers below keep the test bodies focused on
the case under test.
"""

from __future__ import annotations

import base64
import uuid
from typing import Any

import pytest
from src.gmail_parser import GmailParseError, parse_gmail_message

_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000123")


def _b64url(s: str) -> str:
    """Base64url-encode without padding — what Gmail emits."""
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode("ascii").rstrip("=")


def _msg(
    *,
    msg_id: str = "msg-test",
    headers: list[dict[str, str]] | None = None,
    payload_extras: dict[str, Any] | None = None,
    snippet: str = "snippet",
) -> dict[str, Any]:
    """Build a minimal Gmail messages.get envelope, with caller-supplied
    payload extras (mimeType, parts, body, etc.)."""
    default_headers = [
        {"name": "From", "value": "Amazon <orders@amazon.com>"},
        {"name": "Subject", "value": "Your order"},
    ]
    return {
        "id": msg_id,
        "snippet": snippet,
        "payload": {
            "headers": headers if headers is not None else default_headers,
            **(payload_extras or {}),
        },
    }


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


def test_multipart_alternative_prefers_text_plain() -> None:
    """multipart/alternative with both text/plain and text/html → plain
    wins. RFC 2046 §5.1.4 says clients should pick text/plain when both
    are present; we follow that, partly because plain is cheaper input
    for the extractor."""
    msg = _msg(
        payload_extras={
            "mimeType": "multipart/alternative",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": _b64url("Plain body: Total $24.99")},
                },
                {
                    "mimeType": "text/html",
                    "body": {"data": _b64url("<p>HTML body: Total $24.99</p>")},
                },
            ],
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    assert email.body_text == "Plain body: Total $24.99"
    assert email.sender == "Amazon <orders@amazon.com>"
    assert email.subject == "Your order"
    assert email.snippet == "snippet"
    assert email.ingestion_source == "gmail"


def test_html_only_falls_back_to_html2text() -> None:
    """text/html with no text/plain part → html2text conversion. The
    output is markdown-ish (headers as `#`, etc.) which is fine for the
    extractor — Gemini reads it as a stream."""
    msg = _msg(
        payload_extras={
            "mimeType": "multipart/alternative",
            "parts": [
                {
                    "mimeType": "text/html",
                    "body": {
                        "data": _b64url("<h1>Order confirmed</h1><p>Total: <b>$99.00</b></p>")
                    },
                },
            ],
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    # html2text produces "# Order confirmed\n\nTotal: **$99.00**\n"
    assert "Order confirmed" in email.body_text
    assert "$99.00" in email.body_text


def test_single_part_text_plain_without_parts_array() -> None:
    """Some automated senders return a single text/plain payload with
    no `parts` array — body lives directly on `payload.body.data`."""
    msg = _msg(
        payload_extras={
            "mimeType": "text/plain",
            "body": {"data": _b64url("Receipt: $5.00")},
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    assert email.body_text == "Receipt: $5.00"


def test_nested_multipart_walked_recursively() -> None:
    """Real Gmail emails often nest multipart/related inside multipart/
    mixed (HTML body + inline images + attachment). Walker must
    recurse into both."""
    msg = _msg(
        payload_extras={
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "multipart/related",
                    "parts": [
                        {
                            "mimeType": "multipart/alternative",
                            "parts": [
                                {
                                    "mimeType": "text/plain",
                                    "body": {"data": _b64url("Deeply nested body")},
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    assert email.body_text == "Deeply nested body"


# ---------------------------------------------------------------------------
# Attachment detection (logged but not extracted)
# ---------------------------------------------------------------------------


def test_attachment_logged_and_body_still_extracted(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """multipart/mixed with text/plain + a PDF attachment → body is
    extracted normally, attachment is logged as
    `gmail.attachment_present_not_extracted` for the follow-up ticket
    that adds messages.attachments.get."""
    import logging

    caplog.set_level(logging.INFO, logger="src.gmail_parser")
    msg = _msg(
        msg_id="msg-with-pdf",
        payload_extras={
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": _b64url("Receipt attached.")},
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "receipt.pdf",
                    "body": {"attachmentId": "att-1", "size": 12345},
                },
            ],
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    assert email.body_text == "Receipt attached."

    # The log line is greppable from Cloud Logging.
    attachment_logs = [
        record
        for record in caplog.records
        if "gmail.attachment_present_not_extracted" in record.getMessage()
    ]
    assert len(attachment_logs) == 1
    assert "msg-with-pdf" in attachment_logs[0].getMessage()
    assert "application/pdf" in attachment_logs[0].getMessage()
    assert "receipt.pdf" in attachment_logs[0].getMessage()


def test_attachment_without_filename_detected_via_attachment_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Some attachments come back without a `filename` field but still
    have a `body.attachmentId`. Walker must detect both signals."""
    import logging

    caplog.set_level(logging.INFO, logger="src.gmail_parser")
    msg = _msg(
        payload_extras={
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": _b64url("Body")},
                },
                {
                    "mimeType": "image/png",
                    "body": {"attachmentId": "att-2"},
                },
            ],
        },
    )
    parse_gmail_message(msg, user_id=_USER_ID)
    assert any("gmail.attachment_present_not_extracted" in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------------------
# Malformed envelope → GmailParseError
# ---------------------------------------------------------------------------


def test_missing_payload_raises() -> None:
    msg = {"id": "msg-no-payload", "snippet": ""}
    with pytest.raises(GmailParseError) as exc:
        parse_gmail_message(msg, user_id=_USER_ID)
    assert "no payload" in str(exc.value).lower()


def test_missing_headers_raises() -> None:
    msg = {"id": "msg-no-hdr", "payload": {"mimeType": "text/plain"}}
    with pytest.raises(GmailParseError) as exc:
        parse_gmail_message(msg, user_id=_USER_ID)
    assert "no headers" in str(exc.value).lower()


def test_missing_from_header_raises() -> None:
    msg = _msg(
        headers=[{"name": "Subject", "value": "X"}],
        payload_extras={"body": {"data": _b64url("hi")}, "mimeType": "text/plain"},
    )
    with pytest.raises(GmailParseError) as exc:
        parse_gmail_message(msg, user_id=_USER_ID)
    assert "no from header" in str(exc.value).lower()


def test_empty_body_raises() -> None:
    """Neither text/plain nor text/html anywhere in the part tree →
    GmailParseError. The extractor would have nothing to work with."""
    msg = _msg(
        payload_extras={
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "application/pdf",
                    "filename": "x.pdf",
                    "body": {"attachmentId": "att-3"},
                },
            ],
        },
    )
    with pytest.raises(GmailParseError) as exc:
        parse_gmail_message(msg, user_id=_USER_ID)
    assert "text/plain or text/html" in str(exc.value)


def test_empty_subject_synthesizes_sentinel() -> None:
    """Some automated mailers send an empty Subject. EmailForExtraction
    has min_length=1 — synthesize "(no subject)" rather than crash."""
    msg = _msg(
        headers=[
            {"name": "From", "value": "auto@example.com"},
            {"name": "Subject", "value": ""},
        ],
        payload_extras={
            "mimeType": "text/plain",
            "body": {"data": _b64url("body")},
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    assert email.subject == "(no subject)"


def test_base64url_unpadded_input_decoded_correctly() -> None:
    """Gmail emits base64url without `=` padding. Walker must pad before
    decoding. This text has a non-zero-mod-4 length to exercise the
    padding code path."""
    body = "abcde"  # 5 chars → base64 needs padding to round to 4
    msg = _msg(
        payload_extras={
            "mimeType": "text/plain",
            "body": {"data": _b64url(body)},
        },
    )
    email = parse_gmail_message(msg, user_id=_USER_ID)
    assert email.body_text == body
