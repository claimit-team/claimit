"""Per-user Gmail refresh-token persistence in GCP Secret Manager (ticket 4.14).

One secret per user, named `gmail-refresh-token-{user_id}` where user_id is
the str form of `derive_user_id(firebase_uid)` (uuid5, not firebase_uid —
the latter cannot be recovered from User._id).

The api-gateway SA has project-level `secretmanager.admin` (see
infra/terraform/iam.tf), which covers CREATE + ADD_VERSION + ACCESS.

Each connection adds a new secret version; we never overwrite older versions
(Secret Manager keeps history, useful for diagnosing failed re-auths). Old
versions can be expired/destroyed via a separate housekeeping pass; not
managed here.
"""

from __future__ import annotations

import contextlib

from google.api_core import exceptions as google_exceptions
from google.cloud import secretmanager


def _secret_path(project_id: str, user_id: str) -> tuple[str, str]:
    """Return (parent, secret_id) for the gmail-refresh-token-{user_id} secret."""
    secret_id = f"gmail-refresh-token-{user_id}"
    parent = f"projects/{project_id}"
    return parent, secret_id


def store_refresh_token(
    client: secretmanager.SecretManagerServiceClient,
    project_id: str,
    user_id: str,
    refresh_token: str,
) -> str:
    """Add a new version of the user's refresh-token secret; create the secret on first use.

    Returns the full version resource name
    (`projects/{p}/secrets/{s}/versions/{n}`) suitable for storing in
    User.gmail_integration.refresh_token_ref.
    """
    parent, secret_id = _secret_path(project_id, user_id)
    secret_name = f"{parent}/secrets/{secret_id}"
    payload = {"data": refresh_token.encode("utf-8")}

    try:
        version = client.add_secret_version(parent=secret_name, payload=payload)
    except google_exceptions.NotFound:
        # Concurrent first-connect race: another request may create the secret
        # in the gap between our NotFound and create_secret. Suppress the
        # AlreadyExists and proceed to add_secret_version on the now-existing secret.
        with contextlib.suppress(google_exceptions.AlreadyExists):
            client.create_secret(
                parent=parent,
                secret_id=secret_id,
                secret={"replication": {"automatic": {}}},
            )
        version = client.add_secret_version(parent=secret_name, payload=payload)

    return version.name


def get_refresh_token(
    client: secretmanager.SecretManagerServiceClient,
    secret_ref: str,
) -> str:
    """Read the refresh token at the given version resource name."""
    response = client.access_secret_version(name=secret_ref)
    return response.payload.data.decode("utf-8")
