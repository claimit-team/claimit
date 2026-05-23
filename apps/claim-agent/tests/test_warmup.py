"""Tests for startup draft model warm-up."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from src.draft._shared import DRAFT_TIMEOUT_SECONDS, warm_up_draft_model


class _FakeEvent:
    pass


@pytest.mark.asyncio
async def test_warm_up_draft_model_swallows_runner_failure() -> None:
    class _FailingRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            raise RuntimeError("cold start failed")
            yield  # pragma: no cover

    with patch("src.draft._shared.Runner", _FailingRunner):
        await warm_up_draft_model()


@pytest.mark.asyncio
async def test_warm_up_draft_model_completes_on_success() -> None:
    class _SuccessRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            yield _FakeEvent()

    with patch("src.draft._shared.Runner", _SuccessRunner):
        await warm_up_draft_model()


def test_draft_timeout_seconds_is_90() -> None:
    assert DRAFT_TIMEOUT_SECONDS == 90
