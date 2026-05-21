"""Unit tests for the purchases service-layer helpers that don't need a router.

Route-level scenarios live in `test_routes_purchases.py`; this file keeps
small pure helpers + service-level branches (gs:// parsing, future
policy lookup branches) close to the code they exercise.
"""

from __future__ import annotations

import pytest
from src.services.purchases import _parse_gs_uri


@pytest.mark.parametrize(
    ("uri", "expected"),
    [
        ("gs://bucket/path", ("bucket", "path")),
        ("gs://bucket/nested/path/file.pdf", ("bucket", "nested/path/file.pdf")),
        ("gs://b/p/spaces in name.jpg", ("b", "p/spaces in name.jpg")),
    ],
)
def test_parse_gs_uri_happy_paths(uri: str, expected: tuple[str, str]) -> None:
    assert _parse_gs_uri(uri) == expected


@pytest.mark.parametrize(
    "malformed",
    [
        "",
        "not-a-gs-uri",
        "https://bucket/path",
        "gs:/bucket/path",
        "gs://",
        "gs://bucketonly",
        "gs:///pathonly",
    ],
)
def test_parse_gs_uri_rejects_malformed(malformed: str) -> None:
    with pytest.raises(ValueError):
        _parse_gs_uri(malformed)
