"""Unit tests for mode_a.py.

These tests exercise the agent factory and system prompt — the spec-
required AC. handle_message() is not exercised here because it requires
a live ADK Runner + Gemini backend; integration testing of that path
belongs in a separate suite that can hit a real model.
"""

from __future__ import annotations

import pytest
from src.mode_a import MODE_A_SYSTEM_PROMPT, create_mode_a_agent

# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def test_create_mode_a_agent_has_correct_name() -> None:
    agent = create_mode_a_agent()
    assert agent.name == "assistant_agent_mode_a"


def test_create_mode_a_agent_has_correct_model() -> None:
    agent = create_mode_a_agent()
    assert agent.model == "gemini-2.5-flash"


def test_create_mode_a_agent_returns_fresh_instance_each_call() -> None:
    """Two calls produce two distinct Agent objects — no module-level caching."""
    a = create_mode_a_agent()
    b = create_mode_a_agent()
    assert a is not b


def test_create_mode_a_agent_wires_two_tool_slots() -> None:
    """Deploy-path agent: 1 MongoDB MCP toolset + 1 FunctionTool
    (search_policies_fulltext, Elastic Agent Builder MCP policy search).

    Does NOT include search_user_purchases — that would expose user_id to the
    model. handle_message() wires a closure-scoped replacement for that tool
    on the local-invocation path.
    """
    agent = create_mode_a_agent()
    assert agent.tools is not None
    assert len(agent.tools) == 2


# ---------------------------------------------------------------------------
# System prompt content checks
# ---------------------------------------------------------------------------


def test_system_prompt_contains_read_only() -> None:
    """Read-only constraint is the most important safety property of Mode A."""
    assert "READ-ONLY" in MODE_A_SYSTEM_PROMPT


def test_system_prompt_contains_key_capabilities() -> None:
    """Mentions the three core data domains so the model knows its scope."""
    assert "purchases" in MODE_A_SYSTEM_PROMPT
    assert "claims" in MODE_A_SYSTEM_PROMPT
    assert "policies" in MODE_A_SYSTEM_PROMPT


@pytest.mark.parametrize(
    "anti_pattern",
    [
        "send claims",
        "send emails",
        "take actions",
        "modify",
    ],
)
def test_system_prompt_forbids_mutating_language(anti_pattern: str) -> None:
    """Prompt explicitly tells the model NOT to claim it can do these things —
    so the literal phrase must appear somewhere in the prompt's constraints."""
    assert anti_pattern in MODE_A_SYSTEM_PROMPT


def test_system_prompt_sets_usd_formatting_expectation() -> None:
    """USD formatting is the only currency the platform supports today; the
    prompt should make this explicit so the model doesn't echo back EUR/GBP."""
    assert "USD" in MODE_A_SYSTEM_PROMPT


def test_system_prompt_assistant_persona_is_named() -> None:
    """The persona should self-identify as the ClaimIt Assistant."""
    assert "ClaimIt Assistant" in MODE_A_SYSTEM_PROMPT
