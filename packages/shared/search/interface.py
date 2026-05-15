"""SearchClient protocol for ClaimIt agents.

Agents import from here — they never import elastic.adapter directly.
"""

from typing import Any, Protocol


class SearchClient(Protocol):
    """Protocol matching SearchAdapter — used for type hints in agent code."""

    async def search_policies(self, query: str, limit: int = 5) -> list[dict[str, Any]]: ...
    async def search_purchases(
        self, user_id: str, query: str, limit: int = 10
    ) -> list[dict[str, Any]]: ...
    async def aggregate_claims(self, platform: str | None = None) -> dict[str, Any]: ...
    async def close(self) -> None: ...
