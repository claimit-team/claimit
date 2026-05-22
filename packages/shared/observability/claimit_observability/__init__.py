"""ClaimIt observability — shared OTel/Phoenix setup for all agents."""

from .phoenix import get_tracer, init_phoenix, span_with_attributes
from .phoenix_client import QueryResult, QueryStatus, SpanRecord, query_claim_spans

__all__ = [
    "QueryResult",
    "QueryStatus",
    "SpanRecord",
    "get_tracer",
    "init_phoenix",
    "query_claim_spans",
    "span_with_attributes",
]
