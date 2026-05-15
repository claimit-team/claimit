"""Phoenix OTel setup for ClaimIt agents.

`init_phoenix` wires up the OpenTelemetry SDK (TracerProvider + OTLP HTTP
exporter targeted at Arize Phoenix) and auto-instruments libraries used across
the agents (pymongo — which Motor wraps — and httpx).

Behaviour:
- Reads PHOENIX_API_KEY and PHOENIX_COLLECTOR_ENDPOINT from the env.
- Default endpoint is the Arize-hosted Phoenix collector.
- If PHOENIX_API_KEY is missing the function logs a warning and returns
  without configuring OTel — agents boot fine in dev/CI environments that
  don't have observability wired up.
- Calling `init_phoenix` more than once in the same process is a no-op.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Span, Tracer

logger = logging.getLogger(__name__)

DEFAULT_ENDPOINT = "https://app.phoenix.arize.com/v1/traces"

_initialized = False


def init_phoenix(service_name: str) -> None:
    """Configure OTel tracing for one ClaimIt agent.

    Idempotent. If PHOENIX_API_KEY is unset, returns without configuring the
    pipeline so the agent process still boots — `get_tracer` will then return
    a no-op tracer from the OTel default provider.
    """
    global _initialized
    if _initialized:
        return

    api_key = os.environ.get("PHOENIX_API_KEY")
    endpoint = os.environ.get("PHOENIX_COLLECTOR_ENDPOINT", DEFAULT_ENDPOINT)

    if not api_key:
        logger.warning(
            "PHOENIX_API_KEY not set; OTel traces will not be exported. "
            "Set the env var to enable Phoenix observability."
        )
        return

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(
        endpoint=endpoint,
        headers={"Authorization": f"Bearer {api_key}"},
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    _auto_instrument()

    _initialized = True
    logger.info(
        "Phoenix OTel pipeline initialized: service=%s endpoint=%s",
        service_name,
        endpoint,
    )


def _auto_instrument() -> None:
    """Install auto-instrumentation for common ClaimIt libraries.

    Each instrumentor is imported lazily so a missing optional dep doesn't
    abort init for an agent that doesn't use that library.
    """
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except ImportError:
        logger.debug(
            "opentelemetry-instrumentation-httpx not installed; skipping httpx auto-instrument."
        )

    # Motor wraps pymongo, so pymongo instrumentation captures Motor calls too.
    try:
        from opentelemetry.instrumentation.pymongo import PymongoInstrumentor

        PymongoInstrumentor().instrument()
    except ImportError:
        logger.debug(
            "opentelemetry-instrumentation-pymongo not installed; skipping Mongo auto-instrument."
        )


def get_tracer(name: str) -> Tracer:
    """Return an OTel Tracer. Use `__name__` of the calling module as the name."""
    return trace.get_tracer(name)


@contextmanager
def span_with_attributes(
    tracer: Tracer,
    name: str,
    attributes: dict[str, Any] | None = None,
) -> Iterator[Span]:
    """Start a span and apply attributes upfront.

    Example:
        tracer = get_tracer(__name__)
        with span_with_attributes(
            tracer, "ingest.parse_email", {"purchase.platform": "best_buy"}
        ) as span:
            ...
            span.set_attribute("purchase.amount", 349.99)
    """
    with tracer.start_as_current_span(name) as span:
        if attributes:
            for key, value in attributes.items():
                span.set_attribute(key, value)
        yield span
