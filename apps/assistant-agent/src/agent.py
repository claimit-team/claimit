"""Stub Google ADK agent for the assistant service. Real tools wired in later tickets."""

from claimit_mcp import get_mongodb_mcp_toolset
from google.adk import Agent

# Sub-agents will be wired in when real logic is added.
assistant_agent = Agent(
    name="assistant_agent",
    model="gemini-2.0-flash",
    instruction=(
        "You are the ClaimIt Assistant. You help users track their purchases, monitor "
        "prices, and manage refund claims. You coordinate with specialized sub-agents "
        "for ingestion, monitoring, and claim generation. Respond with 'Hello from "
        "Assistant' for now."
    ),
    tools=[get_mongodb_mcp_toolset(read_only=True)],  # read-only: conversational queries
)
