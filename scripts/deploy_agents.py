#!/usr/bin/env python3
"""Deploy 4 ClaimIt ADK agents to GCP Agent Platform Runtime (Vertex AI Agent Engine).

Modes:
  default        Deploy all 4 agents (create or update via display_name match),
                 write resource_name to Secret Manager, then verify each.
  --dry-run      Print plan only. Resolves agent objects + checks existing state.
  --verify-only  Skip deploy; read agent IDs from Secret Manager and verify
                 each by sending "Say hello" via async_stream_query.

Environment:
  GOOGLE_CLOUD_PROJECT       GCP project ID (required in CI; falls back to
                             gcloud config in local mode)
  GOOGLE_CLOUD_LOCATION      Deploy region (default: us-east1)
  ADK_STAGING_BUCKET         GCS bucket for staged source (default:
                             gs://{project}-adk-staging)

Per ticket 1.29, master doc Attachment 4 §2.6, ADK_DOC (Will, May 14 2026).

All vertexai SDK API usage verified live against google-adk + google-cloud-aiplatform
on May 15, 2026. Key facts:
  - Agents must be wrapped in vertexai.agent_engines.AdkApp(agent=...) before create.
  - create() uses agent= (agent_engine= is deprecated).
  - update/get/delete use name= (not resource_name=).
  - find existing via api_resource.display_name.
  - Query a deployed agent via .async_stream_query(user_id=, message=).
  - Event dict shape: {"content": {"parts": [{"text": ...}]}, "finish_reason": ...}
                  or {"code": ..., "message": ...} on error.
"""

from __future__ import annotations

import argparse
import asyncio
import glob
import importlib.util
import os
import subprocess
import sys
import time
from dataclasses import dataclass

import vertexai
from google.api_core import exceptions as gcp_exc
from google.cloud import secretmanager
from vertexai.agent_engines import AdkApp

# (agent_top_level_name, dotted_module_path)
# Dotted path uses underscores for Python module rules; import_agent() translates
# the second segment to hyphens to find the actual file (apps/ingest-agent/...).
AGENT_MODULES = [
    ("ingest_agent", "apps.ingest_agent.src.agent"),
    ("monitor_agent", "apps.monitor_agent.src.agent"),
    ("claim_agent", "apps.claim_agent.src.agent"),
    ("assistant_agent", "apps.assistant_agent.src.agent"),
]

DEFAULT_LOCATION = "us-east1"
# cloudpickle and pydantic must be explicit — SDK does not auto-add them.
ADK_REQUIREMENTS = [
    "google-cloud-aiplatform[agent_engines,adk]",
    "cloudpickle",
    "pydantic",
]
AGENT_FRAMEWORK = "google-adk"
VERIFY_PROMPT = "Say hello"
VERIFY_USER_ID = "deploy-agents-verify-bot"


@dataclass
class DeployResult:
    agent_name: str
    resource_name: str
    action: str  # "created" or "updated"


def get_project_id() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if project:
        return project
    try:
        result = subprocess.run(
            ["gcloud", "config", "get-value", "project"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as err:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT not set and gcloud config not available") from err


def get_location() -> str:
    return os.environ.get("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)


def get_staging_bucket(project: str) -> str:
    explicit = os.environ.get("ADK_STAGING_BUCKET")
    if explicit:
        return explicit
    return f"gs://{project}-adk-staging"


def import_agent(module_path: str, agent_name: str):
    """Import the agent object from apps/<name>-agent/src/agent.py."""
    # apps.ingest_agent.src.agent -> apps/ingest-agent/src/agent.py
    parts = module_path.split(".")
    parts[1] = parts[1].replace("_", "-")
    file_path = "/".join(parts) + ".py"

    spec = importlib.util.spec_from_file_location(module_path, file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, agent_name)


def get_mcp_wheel_path() -> str:
    """Find the freshly-built claimit_mcp wheel for extra_packages.

    CI runs 'uv build --wheel' in packages/shared/mcp/ before this
    script. The wheel must be present for the Agent Engine container
    to resolve `from claimit_mcp import ...` when cloudpickle.loads()
    rehydrates the agent at process start.

    Per adk-python#2947 and discuss.google.dev/250649, pre-built .whl
    + extra_packages is the recommended pattern for multi-agent system
    deployment where remote unpickling needs workspace-local modules.
    """
    pattern = "packages/shared/mcp/dist/claimit_mcp-*-py3-none-any.whl"
    candidates = sorted(glob.glob(pattern))
    if not candidates:
        raise FileNotFoundError(
            f"claimit_mcp wheel not found at {pattern}. "
            "CI must run 'uv build --wheel' in packages/shared/mcp/ "
            "before this script."
        )
    return candidates[-1]  # latest version (alphabetic sort works for semver)


def find_existing_agent(client, display_name: str):
    """Find a deployed AgentEngine by display_name. Returns AgentEngine or None.

    Verified via Cloud Shell: api_resource.display_name carries the value passed
    in config.display_name at create time.
    """
    for existing in client.agent_engines.list():
        if existing.api_resource and existing.api_resource.display_name == display_name:
            return existing
    return None


def deploy_one(
    client,
    agent_name: str,
    module_path: str,
    staging_bucket: str,
    dry_run: bool = False,
) -> DeployResult:
    """Create or update one agent. Idempotent — matches by display_name."""
    print(f"\n--- {agent_name} ---")

    raw_agent = import_agent(module_path, agent_name)
    print(f"  Loaded: {raw_agent.name} (model={raw_agent.model})")

    # Wrap in AdkApp per docs. Verified: passing raw Agent works via fallback
    # but explicit AdkApp is the canonical pattern.
    adk_app = AdkApp(agent=raw_agent)

    # MCP toolset (mongodb-mcp-server stdio child process) reads this env var
    # to connect. McpToolset env=None in the factory + SecretRef here = URI
    # not baked into pickle; Agent Engine runtime fetches latest from Secret
    # Manager at process start.
    #
    # env_vars is the dict form `{env_var_name: SecretRef | str}` — verified
    # at runtime: the list-of-SecretEnvVar form (which the type hints suggest)
    # is rejected by the SDK serializer; the dict form is what actually works.
    env_vars = {
        "MDB_MCP_CONNECTION_STRING": {
            "secret": "mongodb-uri",
            "version": "latest",
        },
    }

    config = {
        "staging_bucket": staging_bucket,
        "requirements": ADK_REQUIREMENTS,
        "display_name": agent_name,
        "agent_framework": AGENT_FRAMEWORK,
        "env_vars": env_vars,
        # Workspace-local claimit_mcp packaged as wheel + a shell hook that
        # pip-installs it during Reasoning Engine container build. Server
        # extracts extra_packages tarball, then chmod+x and runs every script
        # listed in build_options.installation_scripts. The script runs BEFORE
        # cloudpickle.loads(agent.pkl), so 'from claimit_mcp import ...' in
        # apps/*-agent/src/agent.py resolves at unpickle time.
        #
        # Path constraints (per vertexai SDK validate_installation_scripts):
        #   - Script path must start with literal "installation_scripts/" prefix
        #   - Script path must appear in BOTH extra_packages and
        #     build_options.installation_scripts
        #   - Wheel path is outside installation_scripts/ subdir, so the
        #     reverse check (extra_pkg under subdir but not declared) is fine.
        "extra_packages": [
            get_mcp_wheel_path(),
            "installation_scripts/install_claimit_mcp.sh",
        ],
        "build_options": {
            "installation_scripts": [
                "installation_scripts/install_claimit_mcp.sh",
            ],
        },
    }

    existing = find_existing_agent(client, agent_name)

    if dry_run:
        action = "would-update" if existing else "would-create"
        print(f"  DRY RUN: {action}")
        rn = existing.api_resource.name if existing else "(none)"
        return DeployResult(agent_name, rn, action)

    if existing:
        rn = existing.api_resource.name
        print(f"  Found existing: {rn}")
        # Verified: update() uses name= (not resource_name=) and agent= (not agent_engine=)
        remote = client.agent_engines.update(
            name=rn,
            agent=adk_app,
            config=config,
        )
        action = "updated"
    else:
        print("  Creating new agent...")
        # Verified: create() uses agent= (agent_engine= deprecated, raises
        # DeprecationWarning)
        remote = client.agent_engines.create(
            agent=adk_app,
            config=config,
        )
        action = "created"

    rn = remote.api_resource.name
    print(f"  ✓ {action}: {rn}")
    return DeployResult(agent_name, rn, action)


def write_secret(sm_client, project: str, secret_id: str, value: str) -> None:
    """Add a version to an existing Secret Manager secret.

    Retries on NotFound to absorb the race with deploy-prod.yml's
    terraform-apply job (which creates the secret container). 6 attempts
    x 30s = up to 3 minutes total wait.
    """
    parent = f"projects/{project}/secrets/{secret_id}"
    payload = {"data": value.encode("utf-8")}
    last_err: Exception | None = None
    for attempt in range(6):
        try:
            sm_client.add_secret_version(parent=parent, payload=payload)
            print(f"  ✓ Secret Manager: {secret_id} updated")
            return
        except gcp_exc.NotFound as e:
            last_err = e
            if attempt < 5:
                print(
                    f"  ! Secret {secret_id} not found yet "
                    f"(attempt {attempt + 1}/6), waiting 30s..."
                )
                time.sleep(30)
    raise RuntimeError(
        f"Secret {secret_id} not found after 6 attempts x 30s. "
        f"Has deploy-prod.yml terraform-apply run yet? Last error: {last_err}"
    )


async def verify_one_async(client, sm_client, project: str, agent_name: str) -> bool:
    """Read resource_name from Secret Manager, send a prompt, assert non-empty content."""
    print(f"\n--- Verifying {agent_name} ---")
    secret_id = f"claimit-{agent_name.replace('_', '-')}-id"
    secret_name = f"projects/{project}/secrets/{secret_id}/versions/latest"

    try:
        response = sm_client.access_secret_version(name=secret_name)
        resource_name = response.payload.data.decode("utf-8")
    except Exception as e:
        print(f"  ✗ Could not read secret {secret_id}: {e}")
        return False

    print(f"  Resource: {resource_name}")

    try:
        got = client.agent_engines.get(name=resource_name)
    except Exception as e:
        print(f"  ✗ Could not get agent: {e}")
        return False

    # Verified event shape (success):
    #   {"content": {"parts": [{"text": "..."}], "role": "model"},
    #    "finish_reason": "STOP", ...}
    # Verified event shape (error):
    #   {"code": 404, "message": "..."}
    try:
        events = []
        async for event in got.async_stream_query(
            user_id=VERIFY_USER_ID,
            message=VERIFY_PROMPT,
        ):
            events.append(event)
            if isinstance(event, dict) and event.get("code"):
                print(f"  ✗ Error event: {event}")
                return False

        if not events:
            print("  ✗ No events received")
            return False

        # Find any event with non-empty text content
        for event in events:
            try:
                text = event["content"]["parts"][0]["text"]
                if text and text.strip():
                    print(f"  ✓ Got response: {text[:80]!r}")
                    return True
            except (KeyError, IndexError, TypeError):
                continue

        print(f"  ✗ No event with non-empty text content. Events: {events}")
        return False
    except Exception as e:
        print(f"  ✗ Query failed: {type(e).__name__}: {e}")
        return False


def verify_all(client, sm_client, project: str) -> list[str]:
    """Run verify for all 4 agents. Returns list of failed agent names."""
    print("\n=== Verification ===")
    failures = []
    for agent_name, _ in AGENT_MODULES:
        ok = asyncio.run(verify_one_async(client, sm_client, project, agent_name))
        if not ok:
            failures.append(agent_name)
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print plan, do not call mutating APIs",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Skip deploy, only verify existing agents",
    )
    args = parser.parse_args()

    if args.dry_run and args.verify_only:
        print("Error: --dry-run and --verify-only are mutually exclusive")
        return 2

    project = get_project_id()
    location = get_location()
    staging_bucket = get_staging_bucket(project)
    mode = "verify-only" if args.verify_only else ("dry-run" if args.dry_run else "deploy")

    print("=== ADK Agent Deploy ===")
    print(f"Project:        {project}")
    print(f"Location:       {location}")
    print(f"Staging bucket: {staging_bucket}")
    print(f"Mode:           {mode}")

    client = vertexai.Client(project=project, location=location)
    sm_client = secretmanager.SecretManagerServiceClient()

    if not args.verify_only:
        results: list[DeployResult] = []
        for agent_name, module_path in AGENT_MODULES:
            try:
                result = deploy_one(
                    client,
                    agent_name,
                    module_path,
                    staging_bucket,
                    dry_run=args.dry_run,
                )
                results.append(result)
                if not args.dry_run:
                    secret_id = f"claimit-{agent_name.replace('_', '-')}-id"
                    write_secret(sm_client, project, secret_id, result.resource_name)
            except Exception as e:
                print(f"  ✗ FAILED: {type(e).__name__}: {e}")
                return 1

        print("\n=== Deploy Summary ===")
        for r in results:
            print(f"  {r.agent_name}: {r.action}")
            print(f"    {r.resource_name}")

    if args.dry_run:
        return 0

    failures = verify_all(client, sm_client, project)
    if failures:
        print(f"\n✗ Verification failed for: {', '.join(failures)}")
        return 1

    print("\n✓ All 4 agents deployed and verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
