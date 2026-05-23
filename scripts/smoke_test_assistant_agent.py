"""Local full-path smoke test for assistant_agent.

Mimics the Deploy Agents verify phase WITHOUT a real Vertex AI deploy:
1.  Load agent.py via spec_from_file_location (same loader as deploy_agents.py)
2.  Cloudpickle round-trip
2.5 Resolve restored function's type hints (catches the post-cloudpickle
    NameError that Run #26 hit — `name 'Any' is not defined`). This is
    the step Step 3 does NOT cover, because Step 3 inspects the FRESHLY
    loaded function whose __globals__ still contain `Any`. Only the
    restored function has the truncated globals dict.
3.  Inspect tool function signatures of the fresh module (eval_str=True)
4.  Call the inner helper with a stub user_id (no live Mongo needed —
    invalid uuid hits the error branch)
5.  Verify ADK can derive a declaration from each FunctionTool

Usage:
    PYTHONIOENCODING=utf-8 python scripts/smoke_test_assistant_agent.py

Exit 0 on full success, 1 on any failure.

Each Deploy Agents cycle costs ~22 minutes; this smoke test runs in <5s
and catches the class of bugs (NameError on annotation eval, missing
imports, tool signature inspection failures) that survive cloudpickle
but break at Agent Engine verify time.
"""

from __future__ import annotations

import asyncio
import importlib.util
import inspect
import os
import sys
import traceback
import typing
from pathlib import Path


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def step(name: str) -> None:
    print(f"\n=== {name} ===")


def _iter_tool_funcs(agent):
    """Yield (tool, func) for each tool that exposes its callable."""
    for tool in agent.tools:
        func = getattr(tool, "func", None) or getattr(tool, "_func", None)
        if func is not None:
            yield tool, func


def main() -> int:
    repo_root = Path(__file__).parent.parent.resolve()
    os.chdir(repo_root)

    # Stub env so module-level imports / factory calls don't blow up
    # on missing infra config. We never actually connect to anything.
    os.environ.setdefault("MDB_MCP_URL", "https://example.run.app")
    os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/test")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "claimit-beta")

    # --- Step 1: spec_from_file_location (mirror deploy_agents.py loader) ---
    step("Step 1: Load agent.py with spec_from_file_location")
    agent_path = repo_root / "apps" / "assistant-agent" / "src" / "agent.py"
    if not agent_path.exists():
        fail(f"agent.py not found at {agent_path}")

    try:
        spec = importlib.util.spec_from_file_location("agent", str(agent_path))
        if spec is None or spec.loader is None:
            fail("spec_from_file_location returned None")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        print("OK Loaded agent.py")
    except Exception as e:
        traceback.print_exc()
        fail(f"agent.py load failed: {e}")

    if not hasattr(mod, "assistant_agent"):
        fail("agent.py has no 'assistant_agent' attribute")

    agent = mod.assistant_agent
    print(f"OK assistant_agent: {agent.__class__.__name__}")
    print(f"  name: {agent.name}")
    print(f"  model: {agent.model}")
    print(f"  tools: {[t.__class__.__name__ for t in agent.tools]}")

    # --- Step 2: Cloudpickle round-trip ---
    step("Step 2: Cloudpickle round-trip")
    import cloudpickle

    try:
        pkl = cloudpickle.dumps(agent)
        print(f"OK Pickle size: {len(pkl)} bytes")
        restored = cloudpickle.loads(pkl)
        print(f"OK Restored: {restored.__class__.__name__}")
    except Exception as e:
        traceback.print_exc()
        fail(f"Cloudpickle failed: {e}")

    # --- Step 2.5: Resolve restored functions' annotations (the Run #26 bug) ---
    step("Step 2.5: typing.get_type_hints on RESTORED tool functions")
    # ADK calls typing.get_type_hints() against func.__globals__ at LLM
    # tool-registration time inside the Agent Engine container. Under
    # `from __future__ import annotations`, annotations are strings;
    # cloudpickle ships only the bytecode-referenced globals; symbols
    # used only in annotations (like `Any`) get stripped, and the
    # restored function then NameErrors. Reproduce that exact resolution
    # here to fail FAST locally instead of after a 22-minute deploy.
    restored_tools_found = 0
    for _tool, func in _iter_tool_funcs(restored):
        restored_tools_found += 1
        try:
            hints = typing.get_type_hints(func)
        except NameError as e:
            traceback.print_exc()
            fail(
                f"typing.get_type_hints(restored {func.__name__}) raised NameError: {e}. "
                "This is the Run #26 failure mode — annotation symbol lost in cloudpickle. "
                "Drop `from __future__ import annotations` in agent.py or pin the symbol "
                "into the function bytecode."
            )
        except Exception as e:
            traceback.print_exc()
            fail(f"typing.get_type_hints(restored {func.__name__}) failed: {e}")
        print(f"OK restored {func.__name__} hints resolved: {list(hints.keys())}")
    if restored_tools_found == 0:
        print(
            "WARN no restored tool funcs found via func/_func attr — "
            "Step 2.5 became a no-op; investigate ADK FunctionTool layout"
        )

    # --- Step 3: Tool function signature on the fresh module ---
    step("Step 3: Inspect tool function signatures (fresh module, eval_str=True)")
    for _tool, func in _iter_tool_funcs(agent):
        try:
            sig = inspect.signature(func)
            print(f"OK {func.__name__} signature: {sig}")
            type_hints = inspect.get_annotations(func, eval_str=True)
            print(f"OK {func.__name__} annotations resolved: {list(type_hints.keys())}")
        except NameError as e:
            traceback.print_exc()
            fail(f"NameError in fresh {func.__name__} signature: {e}")
        except Exception as e:
            traceback.print_exc()
            fail(f"Signature inspection failed for {func.__name__}: {e}")

    # --- Step 4: Call the inner helper with an invalid uuid (error path) ---
    step("Step 4: _fetch_purchases_for_user with invalid uuid")
    if hasattr(mod, "_fetch_purchases_for_user"):
        try:
            result = asyncio.run(mod._fetch_purchases_for_user(user_id="not-a-uuid", limit=10))
            print(f"OK Helper returned: {result}")
            if not isinstance(result, list):
                fail(f"Expected list, got {type(result).__name__}")
            if not result:
                fail("Expected non-empty error result for invalid uuid")
            if result[0].get("error") != "invalid_user_id":
                fail(f"Expected invalid_user_id error, got {result[0]!r}")
        except Exception as e:
            traceback.print_exc()
            fail(f"Helper call failed: {e}")
    else:
        print(
            "WARN _fetch_purchases_for_user not at module top-level — "
            "skipping Step 4 (the LLM-facing tool needs a ToolContext we "
            "can't easily stub here; the e2e test covers that path)"
        )

    # --- Step 5: ADK FunctionTool registration check ---
    step("Step 5: ADK FunctionTool declaration check")
    for tool in agent.tools:
        declared = None
        used_attr = None
        for attr in (
            "declaration",
            "function_declaration",
            "_declaration",
            "_function_declaration",
        ):
            value = getattr(tool, attr, None)
            if value is not None:
                declared = value
                used_attr = attr
                break
        if declared is None:
            for method_name in ("get_declaration", "_get_declaration"):
                method = getattr(tool, method_name, None)
                if callable(method):
                    try:
                        declared = method()
                        used_attr = f"{method_name}()"
                        break
                    except Exception as e:
                        print(f"WARN {method_name}() raised: {type(e).__name__}: {e}")
        if declared is not None:
            print(f"OK Tool exposes declaration via {used_attr}: {type(declared).__name__}")
            # Extra check: tool_context should NOT appear in the
            # LLM-facing parameters (ADK strips it). Best-effort probe
            # — different ADK declaration types layout parameters
            # differently.
            params_obj = getattr(declared, "parameters", None)
            if params_obj is not None:
                props = getattr(params_obj, "properties", None) or {}
                if "tool_context" in props:
                    fail(
                        "ADK declaration leaked 'tool_context' to the LLM — "
                        "tool would receive a hallucinated value rather than "
                        "the session-injected one"
                    )
                print(f"OK declaration parameters: {sorted(props.keys())}")
        else:
            print(
                f"WARN Could not find declaration on {tool.__class__.__name__} "
                "via known attrs/methods — ADK API may have changed"
            )

    print("\n" + "=" * 50)
    print("OK ALL STEPS PASSED — agent.py is ready for deploy")
    return 0


if __name__ == "__main__":
    sys.exit(main())
