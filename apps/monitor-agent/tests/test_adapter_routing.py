"""Tests for PriceSourceAdapter feature flag routing."""

from __future__ import annotations

import pytest
from src.adapters.base import PriceSourceAdapter
from src.adapters.config import get_adapter, should_use_live
from src.adapters.seeded import SeededAdapter


class TestShouldUseLive:
    """Test feature flag routing logic."""

    def test_seeded_mode_always_returns_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PRICE_SOURCE_MODE", "seeded")
        monkeypatch.delenv("PRICE_SOURCE_OVERRIDES", raising=False)
        # Reset cache
        import src.adapters.config as cfg

        cfg._override_cache = None

        assert should_use_live("best_buy") is False
        assert should_use_live("target") is False

    def test_live_mode_always_returns_true(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PRICE_SOURCE_MODE", "live")
        monkeypatch.delenv("PRICE_SOURCE_OVERRIDES", raising=False)
        import src.adapters.config as cfg

        cfg._override_cache = None

        assert should_use_live("best_buy") is True
        assert should_use_live("target") is True

    def test_mixed_mode_hero_platforms_live(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PRICE_SOURCE_MODE", "mixed")
        monkeypatch.delenv("PRICE_SOURCE_OVERRIDES", raising=False)
        import src.adapters.config as cfg

        cfg._override_cache = None

        assert should_use_live("best_buy") is True
        assert should_use_live("southwest") is True
        assert should_use_live("hilton") is True
        assert should_use_live("target") is False
        assert should_use_live("amazon") is False

    def test_per_platform_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PRICE_SOURCE_MODE", "mixed")
        monkeypatch.setenv("PRICE_SOURCE_OVERRIDES", "target=live,best_buy=seeded")
        import src.adapters.config as cfg

        cfg._override_cache = None

        assert should_use_live("target") is True
        assert should_use_live("best_buy") is False
        assert should_use_live("hilton") is True  # not overridden, falls to mixed

    def test_default_mode_is_mixed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("PRICE_SOURCE_MODE", raising=False)
        monkeypatch.delenv("PRICE_SOURCE_OVERRIDES", raising=False)
        import src.adapters.config as cfg

        cfg._override_cache = None

        assert should_use_live("best_buy") is True
        assert should_use_live("target") is False


class TestGetAdapter:
    """Test adapter factory."""

    def test_seeded_mode_returns_seeded_adapter(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PRICE_SOURCE_MODE", "seeded")
        monkeypatch.delenv("PRICE_SOURCE_OVERRIDES", raising=False)
        import src.adapters.config as cfg

        cfg._override_cache = None

        adapter = get_adapter("best_buy")
        assert isinstance(adapter, SeededAdapter)

    def test_mixed_mode_hero_returns_seeded_until_live_wired(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Until live adapters are implemented, even hero platforms get SeededAdapter."""
        monkeypatch.setenv("PRICE_SOURCE_MODE", "mixed")
        monkeypatch.delenv("PRICE_SOURCE_OVERRIDES", raising=False)
        import src.adapters.config as cfg

        cfg._override_cache = None

        adapter = get_adapter("best_buy")
        # Currently returns SeededAdapter as fallback; will change when BestBuyAdapter is wired
        assert isinstance(adapter, SeededAdapter)


class TestPriceSourceAdapterInterface:
    """Verify the ABC contract."""

    def test_cannot_instantiate_abc(self) -> None:
        with pytest.raises(TypeError):
            PriceSourceAdapter()

    def test_seeded_adapter_is_subclass(self) -> None:
        assert issubclass(SeededAdapter, PriceSourceAdapter)
