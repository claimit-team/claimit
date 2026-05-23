"""Tests for startup Mode B model warm-up."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from src.mode_b import warm_up_mode_b_model


class _FakeEvent:
    pass


@pytest.mark.asyncio
async def test_warm_up_mode_b_model_swallows_runner_failure() -> None:
    class _FailingRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            raise RuntimeError("cold start failed")
            yield  # pragma: no cover

    with patch("src.mode_b.Runner", _FailingRunner):
        await warm_up_mode_b_model()


@pytest.mark.asyncio
async def test_warm_up_mode_b_model_completes_on_success() -> None:
    class _SuccessRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            yield _FakeEvent()

    with patch("src.mode_b.Runner", _SuccessRunner):
        await warm_up_mode_b_model()
