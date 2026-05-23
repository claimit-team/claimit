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
from google.cloud import run_v2, secretmanager
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
# motor: ticket 5.10 Plan B — assistant_agent's agent.py now imports
# `claimit_mongodb_models.MongoDBClient` which depends on motor. The
# claimit_mongodb_models wheel is installed --no-deps (see
# installation_scripts/install_claimit_mcp.sh), so motor must be pulled
# in via ADK_REQUIREMENTS instead.
ADK_REQUIREMENTS = [
    "google-cloud-aiplatform[agent_engines,adk]",
    "cloudpickle",
    "pydantic",
    "motor>=3.6.0",
]
AGENT_FRAMEWORK = "google-adk"
VERIFY_PROMPT = "Say hello"
VERIFY_USER_ID = "deploy-agents-verify-bot"

# Ticket 5.10: per-agent MongoDB MCP transport routing. The factory in
# `claimit_mcp.get_mongodb_mcp_toolset` picks Streamable-HTTP transport
# when MDB_MCP_URL is set in the environment, stdio otherwise. For each
# agent we resolve the right Cloud Run service URL (readonly vs
# readwrite) and inject it as MDB_MCP_URL. The keys here are the agent
# name with the "_agent" suffix stripped (per AGENT_MODULES); the
# values are True iff the agent should target the read-only service.
AGENT_READONLY_MAP = {
    "assistant": True,
    "ingest": False,
    "monitor": False,
    "claim": False,
}
MONGODB_MCP_SERVICE_READONLY = "claimit-mongodb-mcp-readonly"
MONGODB_MCP_SERVICE_READWRITE = "claimit-mongodb-mcp-readwrite"


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
    agent_obj = getattr(module, agent_name)
    print(f"  [DEBUG] Agent object type: {type(agent_obj).__name__}")
    print(f"  [DEBUG] Agent name: {agent_obj.name}")
    print(f"  [DEBUG] Agent model: {agent_obj.model}")
    print(
        f"  [DEBUG] Agent tools: "
        f"{[t.__name__ if callable(t) else str(t)[:80] for t in (agent_obj.tools or [])]}"
    )
    print(f"  [DEBUG] Agent sub_agents: {[a.name for a in (agent_obj.sub_agents or [])]}")
    return agent_obj


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
    import zipfile

    whl = candidates[-1]
    print(f"  [DEBUG] Wheel path: {whl}")
    print(f"  [DEBUG] Wheel size: {os.path.getsize(whl)} bytes")
    try:
        with zipfile.ZipFile(whl) as zf:
            print(f"  [DEBUG] Wheel contents: {zf.namelist()}")
    except Exception as ze:
        print(f"  [DEBUG] Wheel inspect failed: {ze}")
    return candidates[-1]  # latest version (alphabetic sort works for semver)


def get_models_wheel_path() -> str:
    """Find the freshly-built claimit_mongodb_models wheel for extra_packages.

    Ticket 5.10 Plan B: assistant_agent's agent.py now imports
    `claimit_mongodb_models.MongoDBClient` directly. The wheel is built
    by CI (deploy-agents.yml) via `uv build --wheel` in
    packages/shared/mongodb/ and must be present so the Reasoning Engine
    container can pip-install it via installation_scripts/install_claimit_mcp.sh
    before cloudpickle.loads() resolves the import on agent restore.
    """
    pattern = "packages/shared/mongodb/dist/claimit_mongodb_models-*-py3-none-any.whl"
    candidates = sorted(glob.glob(pattern))
    if not candidates:
        raise FileNotFoundError(
            f"claimit_mongodb_models wheel not found at {pattern}. "
            "CI must run 'uv build --wheel' in packages/shared/mongodb/ "
            "before this script."
        )
    whl = candidates[-1]
    print(f"  [DEBUG] Models wheel path: {whl}")
    print(f"  [DEBUG] Models wheel size: {os.path.getsize(whl)} bytes")
    return whl


def get_mongodb_uri_for_agent_engine() -> str:
    """Read the Atlas connection string from Secret Manager for agent runtime.

    Ticket 5.10 Plan B: assistant_agent connects to MongoDB directly
    from the Agent Engine container instead of going through the
    Cloud Run MCP service. The MONGODB_URI must therefore be present
    in the deployed agent's env_vars.

    SecretRef dict format in env_vars crashes Agent Engine container
    startup silently (verified during 1.29 — see comment at deploy_one
    around env_vars setup), so we resolve the secret value at deploy
    time and inject it as a plain string. The Secret Manager secret
    name "mongodb-uri" is wired in infra/terraform/main.tf (line ~94)
    and is the same secret Cloud Run services already consume.
    """
    project = get_project_id()
    secret_name = f"projects/{project}/secrets/mongodb-uri/versions/latest"
    sm_client = secretmanager.SecretManagerServiceClient()
    response = sm_client.access_secret_version(name=secret_name)
    return response.payload.data.decode("utf-8")


def get_mongodb_mcp_url(agent_name: str) -> str:
    """Resolve the Cloud Run service URL for the MongoDB MCP server this
    agent should target (readonly vs readwrite per AGENT_READONLY_MAP).

    Ticket 5.10: the readonly service hosts mongodb-mcp-server with
    `--readOnly` so the upstream skips registering create/update/delete
    tools — protects the assistant agent's LLM-controlled tool surface
    from prompt-injection write attempts. The readwrite service has
    the full tool set.

    Returns the bare service URI (no /mcp suffix); the factory in
    `claimit_mcp.get_mongodb_mcp_toolset` appends the MCP endpoint
    path. The bare URL is also the OIDC audience the runtime SA must
    target, so this is the right value to pass straight to
    MDB_MCP_URL.

    Raises RuntimeError when the service doesn't exist yet
    (terraform-apply must run before this script — same ordering
    constraint as the existing mongodb-uri Secret Manager lookup the
    block above replaces).
    """
    key = agent_name.removesuffix("_agent")
    if key not in AGENT_READONLY_MAP:
        raise RuntimeError(f"Unknown agent '{agent_name}' — add it to AGENT_READONLY_MAP.")
    read_only = AGENT_READONLY_MAP[key]
    service_name = MONGODB_MCP_SERVICE_READONLY if read_only else MONGODB_MCP_SERVICE_READWRITE
    project = get_project_id()
    location = get_location()
    full_name = f"projects/{project}/locations/{location}/services/{service_name}"
    try:
        run_client = run_v2.ServicesClient()
        service = run_client.get_service(name=full_name)
    except gcp_exc.NotFound as e:
        raise RuntimeError(
            f"Cloud Run service '{service_name}' not found in "
            f"{project}/{location}. Run terraform apply (see "
            "infra/terraform/mongodb_mcp.tf) before deploying agents."
        ) from e
    except Exception as e:
        raise RuntimeError(f"Cannot resolve MDB_MCP_URL for {agent_name}: {e}") from e
    return service.uri


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

    # Set MDB_MCP_URL in the BUILD environment before importing the agent
    # module. The `claimit_mcp.get_mongodb_mcp_toolset` factory dispatches
    # on `os.environ["MDB_MCP_URL"]` at call time (lazy), but
    # apps/*-agent/src/agent.py calls the factory at module-import time
    # (`tools=[get_mongodb_mcp_toolset(...)]`). That returned `McpToolset`
    # holds its `connection_params` as a concrete attribute, which then
    # gets baked into the cloudpickle at line 253 — there is no second
    # factory call inside the deployed engine to re-read the runtime env.
    # So the env var has to be present BEFORE import, or the pickle locks
    # in `StdioConnectionParams(command="npx", ...)` and the deployed
    # agent fails with `[Errno 2] No such file or directory: 'npx'` on
    # every request (Agent Engine has no Node.js). The downstream
    # env_vars["MDB_MCP_URL"] injection at line ~292 is retained as
    # defense-in-depth — harmless if the pickle already has the URL
    # baked in, useful if a future refactor moves to lazy resolution.
    if not dry_run:
        os.environ["MDB_MCP_URL"] = get_mongodb_mcp_url(agent_name)

    raw_agent = import_agent(module_path, agent_name)
    print(f"  Loaded: {raw_agent.name} (model={raw_agent.model})")

    # Wrap in AdkApp per docs. Verified: passing raw Agent works via fallback
    # but explicit AdkApp is the canonical pattern.
    adk_app = AdkApp(agent=raw_agent)
    print(f"  [DEBUG] AdkApp created: {type(adk_app).__name__}")
    # Test that cloudpickle can serialize — same check SDK does
    try:
        import cloudpickle

        pkl_bytes = cloudpickle.dumps(adk_app)
        print(f"  [DEBUG] cloudpickle.dumps OK ({len(pkl_bytes)} bytes)")
        # Test roundtrip
        restored = cloudpickle.loads(pkl_bytes)
        print(f"  [DEBUG] cloudpickle.loads OK: {type(restored).__name__}")
    except Exception as pkl_err:
        print(f"  [DEBUG] cloudpickle FAILED: {type(pkl_err).__name__}: {pkl_err}")
        raise RuntimeError(
            f"Serialization smoke test failed for {agent_name}; aborting deploy."
        ) from pkl_err

    # Ticket 5.10: route the agent at the right MongoDB MCP Cloud Run
    # service (readonly for the assistant, readwrite for ingest /
    # monitor / claim). The factory in `claimit_mcp.get_mongodb_mcp_
    # toolset` picks Streamable-HTTP transport when MDB_MCP_URL is set,
    # falling back to stdio (local-dev) when unset — Agent Engine
    # always gets HTTP because we set the env here.
    #
    # The MongoDB connection string (MDB_MCP_CONNECTION_STRING) is no
    # longer mounted on the agent — it lives in Secret Manager bound
    # to each Cloud Run MCP service via `secret_env_map`. The agent
    # only needs the service URL.
    #
    # env_vars is the dict form `{env_var_name: SecretRef | str}` —
    # verified at runtime: the list-of-SecretEnvVar form (which the
    # type hints suggest) is rejected by the SDK serializer; the dict
    # form is what actually works. Secret ref dict format breaks
    # Agent Engine container startup (silent crash, no stderr). Plain
    # string env_vars work (test5 passed in 1.29 verification).
    #
    # Dry-run guard: skip the Cloud Run service lookup on `--dry-run`
    # so the script works without `terraform apply` having materialized
    # the MCP services. The factory then sees no MDB_MCP_URL and stays
    # on its local stdio path, which is the right fall-through for a
    # plan-only invocation (no real Agent Engine create happens in
    # dry-run — the deploy_one return is just a "would-create" /
    # "would-update" planning marker).
    env_vars: dict[str, str] = {}
    if not dry_run:
        env_vars["MDB_MCP_URL"] = get_mongodb_mcp_url(agent_name)
        # Ticket 5.10 Plan B: assistant_agent talks to MongoDB directly
        # (bypasses the Cloud Run MCP service). It needs MONGODB_URI in
        # the Agent Engine runtime env so claimit_mongodb_models.MongoDBClient
        # can connect on first tool call. Other agents still go through
        # MCP and don't read MONGODB_URI — scope the injection to avoid
        # leaking the secret value into agents that don't use it.
        if agent_name == "assistant_agent":
            env_vars["MONGODB_URI"] = get_mongodb_uri_for_agent_engine()

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
            get_models_wheel_path(),
            "installation_scripts/install_claimit_mcp.sh",
        ],
        "build_options": {
            "installation_scripts": [
                "installation_scripts/install_claimit_mcp.sh",
            ],
        },
    }

    # ── Diagnostic logging ──────────────────────────────────
    print("  [DEBUG] Config keys:", list(config.keys()))
    print(f"  [DEBUG] requirements: {config['requirements']}")
    print(f"  [DEBUG] agent_framework: {config.get('agent_framework')}")
    print(f"  [DEBUG] env_vars keys: {list(config.get('env_vars', {}).keys())}")

    # extra_packages: verify files exist and show sizes
    for ep in config.get("extra_packages", []):
        if os.path.exists(ep):
            size = os.path.getsize(ep)
            print(f"  [DEBUG] extra_package: {ep} (exists, {size} bytes)")
        else:
            print(f"  [DEBUG] extra_package: {ep} (*** MISSING ***)")

    # build_options
    bo = config.get("build_options", {})
    print(f"  [DEBUG] build_options: {bo}")
    for script in bo.get("installation_scripts", []):
        if os.path.exists(script):
            mode = oct(os.stat(script).st_mode)[-3:]
            print(f"  [DEBUG] install_script: {script} (exists, mode={mode})")
            with open(script) as f:
                content = f.read()
            print(f"  [DEBUG] install_script length: {len(content)} chars")
            preview_lines = content.strip().split("\n")[:5]
            print("  [DEBUG] install_script preview (first 5 lines):")
            for line in preview_lines:
                print(f"  [DEBUG]   | {line}")
        else:
            print(f"  [DEBUG] install_script: {script} (*** MISSING ***)")

    # staging bucket
    print(f"  [DEBUG] staging_bucket: {config.get('staging_bucket')}")
    print("  [DEBUG] ── end diagnostic ──")
    # ────────────────────────────────────────────────────────

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
    print(f"  [DEBUG] RE resource_name: {rn}")
    print(f"  [DEBUG] RE state: {getattr(remote.api_resource, 'state', 'unknown')}")
    print(f"  [DEBUG] RE display_name: {getattr(remote.api_resource, 'display_name', 'unknown')}")
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
    # Environment diagnostics
    print(f"[DEBUG] Python: {sys.version}")
    print(f"[DEBUG] vertexai: {vertexai.__version__}")
    try:
        import google.cloud.aiplatform

        print(f"[DEBUG] google-cloud-aiplatform: {google.cloud.aiplatform.__version__}")
    except Exception:
        print("[DEBUG] google-cloud-aiplatform: (version unknown)")
    try:
        import google.adk

        print(f"[DEBUG] google-adk: {google.adk.__version__}")
    except Exception:
        print("[DEBUG] google-adk: (version unknown)")
    print(f"[DEBUG] cwd: {os.getcwd()}")
    # CI environment
    print(f"[DEBUG] GITHUB_SHA: {os.environ.get('GITHUB_SHA', 'local')}")
    print(f"[DEBUG] GITHUB_REF: {os.environ.get('GITHUB_REF', 'local')}")
    print(f"[DEBUG] GITHUB_RUN_ID: {os.environ.get('GITHUB_RUN_ID', 'local')}")
    # GCP auth
    print(
        f"[DEBUG] GOOGLE_APPLICATION_CREDENTIALS set: "
        f"{bool(os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'))}"
    )
    print(f"[DEBUG] ADK_STAGING_BUCKET: {os.environ.get('ADK_STAGING_BUCKET', '(default)')}")
    # List files that will be packaged
    print("[DEBUG] Files for extra_packages:")
    for f in glob.glob("packages/shared/mcp/dist/*.whl"):
        print(f"  [DEBUG]   {f} ({os.path.getsize(f)} bytes)")
    for f in glob.glob("packages/shared/mongodb/dist/*.whl"):
        print(f"  [DEBUG]   {f} ({os.path.getsize(f)} bytes)")
    for f in glob.glob("installation_scripts/*.sh"):
        print(f"  [DEBUG]   {f} ({os.path.getsize(f)} bytes, mode={oct(os.stat(f).st_mode)[-3:]})")

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
                # Auto-fetch Cloud Logging for the failed RE
                import re as _re

                match = _re.search(r"reasoningEngines/(\d+)", str(e))
                if match:
                    re_id = match.group(1)
                    print(f"  [DEBUG] Fetching Cloud Logging for RE {re_id}...")
                    try:
                        log_result = subprocess.run(
                            [
                                "gcloud",
                                "logging",
                                "read",
                                f"resource.labels.reasoning_engine_id={re_id}",
                                f"--project={project}",
                                "--limit=500",
                                "--format=json",
                                "--order=asc",
                            ],
                            capture_output=True,
                            text=True,
                            timeout=60,
                        )
                        if log_result.stdout:
                            import json as _json

                            entries = _json.loads(log_result.stdout)
                            print(f"  [DEBUG] Cloud Logging: {len(entries)} entries")
                            for idx, entry in enumerate(entries):
                                tp = entry.get("textPayload", "")
                                sev = entry.get("severity", "")
                                ln = entry.get("logName", "").split("/")[-1]
                                if any(
                                    kw in tp.lower()
                                    for kw in [
                                        "claimit_mcp",
                                        "error",
                                        "failed",
                                        "install",
                                        "module",
                                        "import",
                                        "venv",
                                        "pip",
                                        "successfully",
                                        "step 16",
                                        "step 17",
                                        "step 19",
                                        "step 28",
                                        "entrypoint",
                                        "stderr",
                                        "stdout",
                                    ]
                                ):
                                    print(f"  [LOG {idx:03d}] [{sev}] [{ln}] {tp[:400]}")
                        else:
                            print("  [DEBUG] Cloud Logging returned no output")
                            if log_result.stderr:
                                print(f"  [DEBUG] stderr: {log_result.stderr[:300]}")
                    except Exception as log_err:
                        print(f"  [DEBUG] Could not fetch logs: {log_err}")
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
