"""ClaimIt observability — shared OTel/Phoenix setup for all agents.

Write side only. The *read* side (querying spans back out of Phoenix) moved to
`claimit_mcp.phoenix` (`read_claim_reasoning_spans`), which goes through a real
Phoenix MCP call instead of the hand-rolled `phoenix.client` reader.
"""

from .phoenix import get_tracer, init_phoenix, span_with_attributes

__all__ = [
    "get_tracer",
    "init_phoenix",
    "span_with_attributes",
]
