"""ClaimIt observability — shared OTel/Phoenix setup for all agents."""

from .phoenix import get_tracer, init_phoenix, span_with_attributes

__all__ = ["get_tracer", "init_phoenix", "span_with_attributes"]
