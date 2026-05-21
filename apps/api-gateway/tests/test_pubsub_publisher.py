"""Unit tests for the api-gateway Pub/Sub publisher project-ID resolver.

The publisher resolves the GCP project ID via a 3-step fallback:

  1. `GOOGLE_CLOUD_PROJECT` env var (historical name this publisher checked).
  2. `GCP_PROJECT_ID` env var (the name Terraform already sets — matches the
     shared `claimit_pubsub` package convention).
  3. `google.auth.default()` ambient project (Cloud Run / ADC fallback).

Pre-5.14 verification this only read GOOGLE_CLOUD_PROJECT and raised when
unset, which produced a 503 on every POST /purchases/upload until a manual
`gcloud run services update` patched the env var in. Terraform now sets
GOOGLE_CLOUD_PROJECT codified (see infra/terraform/main.tf), AND this code
gained the GCP_PROJECT_ID / ADC fallbacks as defense-in-depth so the same
class of misconfiguration cannot silently 503 again on a future deploy.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from src.services import pubsub_publisher
from src.services.pubsub_publisher import _resolve_project_id


@pytest.fixture(autouse=True)
def _clear_resolver_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset the module-level cache between tests so each call re-resolves.

    The resolver caches the first successful lookup to keep the publish hot
    path branch-free — but that caching would cross-contaminate test cases
    if not torn down. monkeypatch.setattr restores the original value
    automatically when the test exits.
    """
    monkeypatch.setattr(pubsub_publisher, "_project_id_cache", None)
    # `GOOGLE_CLOUD_PROJECT` is set in the developer's shell on some
    # workstations; clear both env names so every test starts from a clean
    # slate and the precedence order is what's exercised, not the shell.
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)


def test_resolves_google_cloud_project_env_first(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "from-google-cloud-project")
    monkeypatch.setenv("GCP_PROJECT_ID", "from-gcp-project-id")
    # When both are set, GOOGLE_CLOUD_PROJECT wins — preserves the historical
    # precedence and the env name the original publish() check used.
    assert _resolve_project_id() == "from-google-cloud-project"


def test_resolves_gcp_project_id_env_when_google_cloud_project_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GCP_PROJECT_ID", "from-gcp-project-id")
    # Mirrors how Terraform already exposes the project to all Cloud Run
    # agents; this branch is the one that closes the original misconfig.
    assert _resolve_project_id() == "from-gcp-project-id"


def test_falls_back_to_application_default_credentials() -> None:
    # Both env vars cleared by the autouse fixture. Patch google.auth.default
    # because we don't want this test to hit ADC for real (CI has no creds).
    with patch("google.auth.default", return_value=(None, "from-adc")):
        assert _resolve_project_id() == "from-adc"


def test_raises_when_all_three_paths_fail() -> None:
    # Both env vars cleared; ADC returns no project (the realistic "no GCP
    # context at all" shape google.auth gives back on a laptop with no
    # default service account configured).
    with (
        patch("google.auth.default", return_value=(None, None)),
        pytest.raises(RuntimeError, match="GCP project ID is not configured"),
    ):
        _resolve_project_id()


def test_default_credentials_error_surfaces_as_runtime_error() -> None:
    """google.auth.default() raises DefaultCredentialsError on missing/invalid ADC.

    Per the google-auth contract, "no ADC available" doesn't return
    `(None, None)` — it raises `DefaultCredentialsError`. Before this
    branch existed, that bare exception would propagate up and confuse
    callers (the FastAPI error handler would see a DefaultCredentialsError
    rather than the explicit RuntimeError naming every fix path). Pin
    the conversion so the user always gets the actionable message.
    """
    from google.auth.exceptions import DefaultCredentialsError

    with (
        patch("google.auth.default", side_effect=DefaultCredentialsError("no ADC")),
        pytest.raises(RuntimeError, match="GCP project ID is not configured"),
    ):
        _resolve_project_id()


def test_resolver_caches_first_successful_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    # First call populates the cache via env var ...
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "cached-value")
    assert _resolve_project_id() == "cached-value"

    # ... then env vars disappear and ADC would raise. The cached value
    # must still be returned on the next call without re-consulting either
    # the env or google.auth, otherwise a transient env change between the
    # FastAPI lifespan startup and a later publish() would crash a healthy
    # service. This is the property the hot path depends on.
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    with patch("google.auth.default", side_effect=AssertionError("must not be called")):
        assert _resolve_project_id() == "cached-value"
