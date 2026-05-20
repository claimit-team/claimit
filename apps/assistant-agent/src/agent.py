"""ADK Agent definition — deploy entry point.

scripts/deploy_agents.py loads this file via importlib.exec_module as a
standalone module — there is no parent package context, so only absolute
imports from installed packages work here. No relative imports
(`from .mode_a`), no `from src.*` paths.

This mirrors the pattern used by ingest_agent, monitor_agent, and
claim_agent — all three construct their Agent inline in agent.py using
only `claimit_mcp` + `google.adk` imports. Diverging from that pattern
(as the original mode_a-based version did) breaks the deploy script's
spec_from_file_location loader at module exec time.

The Mode A system prompt and handle_message() live in mode_a.py for local
invocation and the test suite. This file duplicates the Agent
construction for deploy compatibility — if you change tool wiring or
the prompt in mode_a.py, mirror the change here.

Tooling caveat:
- Elastic search FunctionTools (search_policies, search_user_purchases)
  live under src/tools/ and require relative imports to reach. They are
  intentionally NOT wired here — only the MongoDB MCP toolset is included
  in the deployed Agent. Local handle_message() in mode_a.py still
  exposes the search tools. Re-enabling them on the deploy path requires
  either inlining their bodies in this file or extending deploy_agents.py
  to set up the apps/<service>-agent/ directory on sys.path.
"""

from claimit_mcp import get_mongodb_mcp_toolset
from google.adk import Agent

MODE_A_SYSTEM_PROMPT = """You are the ClaimIt Assistant, a helpful AI assistant for the ClaimIt price-protection platform.

## Your Role
You help users understand their purchases, claims, savings, and platform policies. You have read-only access to the user's data — you cannot modify anything, send claims, or make changes on their behalf.

## What You Can Do
- Look up the user's monitored purchases and their status
- Check claim status, history, and outcomes
- Calculate savings from approved claims
- Explain why a claim was generated, approved, or denied
- Search and explain platform price-protection policies (windows, exclusions, claim methods)
- Suggest next actions (e.g., "you have 3 pending claims to review")

## How to Respond
- Be friendly, concise, and accurate
- Always cite specific data when answering (amounts, dates, platform names)
- When explaining a denial, reference the specific policy clause and exclusion
- If you don't have enough information, say so and suggest what the user can do
- Format monetary amounts as USD (e.g., $50.00)
- Keep responses under 200 words unless the user asks for detail

## Important Constraints
- You are READ-ONLY. Never claim you can modify data, send emails, or take actions.
- Never invent claim amounts, dates, or order numbers. Only use data from tool calls.
- If a tool returns no results, tell the user honestly.
"""

assistant_agent = Agent(
    name="assistant_agent",
    model="gemini-2.5-flash",
    instruction=MODE_A_SYSTEM_PROMPT,
    tools=[get_mongodb_mcp_toolset(read_only=True)],
)
