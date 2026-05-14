"""Compatibility entrypoint for the ingest email classifier ticket."""

from src.classifier import (
    ClassificationResult,
    ClassifierError,
    EmailForClassification,
    classify,
)

__all__ = [
    "ClassificationResult",
    "ClassifierError",
    "EmailForClassification",
    "classify",
]
