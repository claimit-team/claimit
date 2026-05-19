"""ADK Agent definition for the Assistant Agent.

This module is the deploy entry point — scripts/deploy_agents.py imports
`assistant_agent` from here and pushes it to Vertex AI Agent Engines.
The agent variable name MUST stay `assistant_agent` to match the
AGENT_MODULES tuple in scripts/deploy_agents.py.

Currently wires Mode A (general support). Mode B (claim-focused) will be
added in a follow-up ticket; the routing between modes lives in api-gateway
(message prefix today; could move to a parent dispatcher agent later).
"""

from .mode_a import create_mode_a_agent

assistant_agent = create_mode_a_agent()
