"""Unit tests for mode_b.py — Mode B agent factory + system prompt.

These tests exercise the agent factory shape and the system-prompt content
that defines the safe boundaries of Mode B. `handle_message()` itself is
not exercised here because it spins up a live ADK Runner + Gemini call;
that path needs an integration suite that can hit a real model.
"""

from __future__ import annotations

import pytest
from src.mode_b import MODE_B_SYSTEM_PROMPT, create_mode_b_agent

_USER_ID = "11111111-1111-4111-8111-111111111111"
_CLAIM_ID = "22222222-2222-4222-8222-222222222222"


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------


def test_create_mode_b_agent_has_correct_name() -> None:
    agent = create_mode_b_agent(user_id=_USER_ID, claim_id=_CLAIM_ID)
    assert agent.name == "assistant_agent_mode_b"


def test_create_mode_b_agent_has_correct_model() -> None:
    agent = create_mode_b_agent(user_id=_USER_ID, claim_id=_CLAIM_ID)
    assert agent.model == "gemini-2.5-flash"


def test_create_mode_b_agent_returns_fresh_instance_each_call() -> None:
    """Two calls produce two distinct Agent objects — caching would let
    claim_id leak between conversations (each thread must own its own
    closure-scoped tools)."""
    a = create_mode_b_agent(user_id=_USER_ID, claim_id=_CLAIM_ID)
    b = create_mode_b_agent(user_id=_USER_ID, claim_id=_CLAIM_ID)
    assert a is not b


def test_create_mode_b_agent_wires_four_tools() -> None:
    """Exactly four FunctionTool slots: get_claim_context,
    update_send_override, request_redraft, get_reasoning_trace."""
    agent = create_mode_b_agent(user_id=_USER_ID, claim_id=_CLAIM_ID)
    assert agent.tools is not None
    assert len(agent.tools) == 4


def test_create_mode_b_agent_tool_names_match_spec() -> None:
    """The model sees these names — they must match the spec so the
    test queries from the ticket ("make it friendlier" etc.) route
    correctly."""
    agent = create_mode_b_agent(user_id=_USER_ID, claim_id=_CLAIM_ID)
    names = {getattr(t, "name", None) for t in agent.tools or []}
    assert names == {
        "get_claim_context",
        "update_send_override",
        "request_redraft",
        "get_reasoning_trace",
    }


# ---------------------------------------------------------------------------
# System prompt content checks
# ---------------------------------------------------------------------------


def test_system_prompt_identifies_claim_focused_mode() -> None:
    """The persona must self-identify so the model knows its scope."""
    assert "claim-focused" in MODE_B_SYSTEM_PROMPT
    assert "ClaimIt Assistant" in MODE_B_SYSTEM_PROMPT


@pytest.mark.parametrize(
    "tool_name",
    [
        "get_claim_context",
        "update_send_override",
        "request_redraft",
        "get_reasoning_trace",
    ],
)
def test_system_prompt_names_every_tool(tool_name: str) -> None:
    """Each tool is explicitly listed so the model knows when to call it."""
    assert tool_name in MODE_B_SYSTEM_PROMPT


def test_system_prompt_forbids_cross_claim_access() -> None:
    """The single-claim scope is the most important safety property of Mode B."""
    assert "single claim" in MODE_B_SYSTEM_PROMPT
    assert "cannot look up other claims" in MODE_B_SYSTEM_PROMPT


def test_system_prompt_states_ids_are_session_bound() -> None:
    """The model must not ask the user for claim_id or user_id."""
    assert "do not ask the user" in MODE_B_SYSTEM_PROMPT.lower()


def test_system_prompt_sets_usd_formatting_expectation() -> None:
    assert "USD" in MODE_B_SYSTEM_PROMPT


@pytest.mark.parametrize(
    "trigger_phrase",
    [
        "make it friendlier",
        "cancel auto-send",
        "why did you choose this template",
    ],
)
def test_system_prompt_anchors_ac_queries(trigger_phrase: str) -> None:
    """The three AC test queries must be discoverable in the prompt so the
    model can route them deterministically to the right tool."""
    assert trigger_phrase in MODE_B_SYSTEM_PROMPT
