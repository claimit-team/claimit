"""Compatibility entrypoint for the ingest purchase extractor ticket."""

from src.extractor import (
    EmailForExtraction,
    ExtractedFieldConfidence,
    ExtractedPurchaseFields,
    ExtractorError,
    extract,
)

__all__ = [
    "EmailForExtraction",
    "ExtractedFieldConfidence",
    "ExtractedPurchaseFields",
    "ExtractorError",
    "extract",
]
